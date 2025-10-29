from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from openai import OpenAI
import os
from typing import List, Optional
import uvicorn
import logging
from datetime import datetime
import asyncio
import httpx
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger
from pathlib import Path
import httpx
import logging

# Настройка логирования
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = FastAPI()

# CORS настройки
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Инициализация OpenAI клиента
try:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        logger.error("OPENAI_API_KEY not found in environment variables!")
        raise ValueError("OPENAI_API_KEY is required")
    
    client = OpenAI(api_key=api_key)
    logger.info("OpenAI client initialized successfully")
except Exception as e:
    logger.error(f"Failed to initialize OpenAI client: {str(e)}")
    raise


# Глобальное хранилище для статистики
stats_cache = {
    "token_created": 0,
    "trading_volume": 0,
    "active_users": 0,
    "last_updated": None
}

class PromptRequest(BaseModel):
    user_prompt: str
    chat_type: str

class ImageResponse(BaseModel):
    images: List[dict]
    type: str

class StatsResponse(BaseModel):
    token_created: int
    trading_volume: float
    active_users: int
    last_updated: Optional[str]

# Системные промпты для разных типов изображений
DESIGN_PROMPTS = {
    "logo": """Generate a high-quality logo image based on the user's description.
User request: {user_prompt}""",

    "banner": """Generate a wide banner image (16:9 aspect ratio) based on the user's description.
User request: {user_prompt}"""
}

WEBSITE_PROMPTS = {
    "website": """Generate a website mockup design based on the user's description.
User request: {user_prompt}"""
}


logger = logging.getLogger(__name__)

DUNE_API_KEY = os.getenv("DUNE_API_KEY")
DUNE_API_BASE = "https://api.dune.com/api/v1"
DUNE_API_KEY = os.getenv("DUNE_API_KEY", "OgXaMFh3tApLxHXilZG0h3MLj3SusD6T")

# Три разных запроса
DUNE_QUERIES = {
    "trading_volume": 5095400,  # Volume today
    "active_users": 5095346,    # Active users
    "token_created": 4881156    # Launched today
}

from pathlib import Path
import json

async def fetch_dune_query(query_id: int) -> dict:
    """Получение данных одного запроса Dune"""
    url = f"{DUNE_API_BASE}/query/{query_id}/results"
    headers = {"X-Dune-API-Key": DUNE_API_KEY}

    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.get(url, headers=headers)
        response.raise_for_status()
        data = response.json()
        return data


async def fetch_dune_stats():
    """Запрашивает все три метрики с Dune и возвращает последние значения"""
    results = {}
    output_dir = Path("dune_results")
    output_dir.mkdir(exist_ok=True)

    logger.info("=== Fetching latest Dune analytics data ===")

    for name, qid in DUNE_QUERIES.items():
        try:
            data = await fetch_dune_query(qid)
            results[name] = data


        except Exception as e:
            logger.error(f"Error fetching {name}: {e}")
            results[name] = None

    # === Извлечение последних данных ===
    token_created = 0
    trading_volume = 0.0
    active_users = 0

    try:
        # Tokens launched
        if results.get("token_created"):
            rows = results["token_created"].get("result", {}).get("rows", [])
            if rows:
                token_created = int(rows[0].get("token_count", 0))

        # Trading volume
        if results.get("trading_volume"):
            rows = results["trading_volume"].get("result", {}).get("rows", [])
            if rows:
                trading_volume = float(rows[0].get("Daily_Trading_Volume", 0))

        # Active users
        if results.get("active_users"):
            rows = results["active_users"].get("result", {}).get("rows", [])
            if rows:
                active_users = int(rows[0].get("DAU", 0))


    except Exception as e:
        logger.error(f"Error parsing Dune data: {e}", exc_info=True)

    # Возвращаем итоговые данные
    stats = {
        "token_created": token_created,
        "trading_volume": trading_volume,
        "active_users": active_users,
    }

    logger.info(f"Latest Dune stats: {stats}")
    return stats


async def update_stats_cache():
    """Обновление глобального кэша статистики"""
    logger.info("=== Updating Dune stats cache ===")
    stats = await fetch_dune_stats()

    stats_cache["token_created"] = stats["token_created"]
    stats_cache["trading_volume"] = stats["trading_volume"]
    stats_cache["active_users"] = stats["active_users"]
    stats_cache["last_updated"] = datetime.now().isoformat()



    logger.info(f"✓ Stats cache updated: {stats_cache}")

@app.get("/")
async def root():
    logger.info("Root endpoint called")
    return {"message": "FORGE AI Image Generator API", "status": "running"}

@app.get("/stats", response_model=StatsResponse)
async def get_stats():
    """Получение текущей статистики"""
    logger.info("Stats endpoint called")
    
    return StatsResponse(
        token_created=stats_cache["token_created"],
        trading_volume=stats_cache["trading_volume"],
        active_users=stats_cache["active_users"],
        last_updated=stats_cache["last_updated"]
    )

@app.post("/stats/refresh")
async def refresh_stats():
    """Принудительное обновление статистики"""
    logger.info("Manual stats refresh requested")
    await update_stats_cache()
    return {"status": "updated", "data": stats_cache}
@app.get("/stats/debug")
async def debug_dune_api():
    """Отладочный эндпоинт для проверки Dune API"""
    logger.info("Debug endpoint called")

    debug_info = {
        "dune_api_key_set": bool(DUNE_API_KEY),
        "dune_api_key_length": len(DUNE_API_KEY) if DUNE_API_KEY else 0,
        "dune_api_key_preview": DUNE_API_KEY[:10] + "..." if DUNE_API_KEY else "None",
        "api_base": DUNE_API_BASE,
        "queries": list(DUNE_QUERIES.keys()),
        "results": {}
    }

    try:
        async with httpx.AsyncClient(timeout=30.0) as client_http:
            for name, qid in DUNE_QUERIES.items():
                url = f"{DUNE_API_BASE}/query/{qid}/results"
                headers = {"X-Dune-API-Key": DUNE_API_KEY}
                response = await client_http.get(url, headers=headers)
                debug_info["results"][name] = {
                    "status": response.status_code,
                    "success": response.status_code == 200,
                    "first_row": None
                }
                if response.status_code == 200:
                    data = response.json()
                    rows = data.get("result", {}).get("rows", [])
                    if rows:
                        debug_info["results"][name]["first_row"] = rows[0]
    except Exception as e:
        debug_info["exception"] = str(e)
        debug_info["exception_type"] = type(e).__name__

    return debug_info


async def generate_single_image(prompt: str, size: str, prompt_type: str, request_id: str, max_retries: int = 3):
    """Генерация одного изображения с повторными попытками"""
    for attempt in range(max_retries):
        try:
            logger.info(f"[{request_id}] Attempt {attempt + 1}/{max_retries} for {prompt_type}...")
            
            if attempt > 0:
                delay = 2 ** attempt
                logger.info(f"[{request_id}] Waiting {delay}s before retry...")
                await asyncio.sleep(delay)
            
            response = client.images.generate(
                model="dall-e-3",
                prompt=prompt,
                size=size,
                quality="standard",
                n=1,
            )
            
            image_url = response.data[0].url
            logger.info(f"[{request_id}] ✓ {prompt_type} generated successfully on attempt {attempt + 1}")
            
            return {
                "url": image_url,
                "type": prompt_type
            }
            
        except Exception as e:
            logger.warning(f"[{request_id}] Attempt {attempt + 1} failed for {prompt_type}: {str(e)}")
            
            if attempt == max_retries - 1:
                logger.error(f"[{request_id}] All {max_retries} attempts failed for {prompt_type}")
                raise
            
            continue

@app.post("/generate-images", response_model=ImageResponse)
async def generate_images(request: PromptRequest):
    request_id = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
    logger.info(f"[{request_id}] New image generation request received")
    logger.info(f"[{request_id}] Chat type: {request.chat_type}")
    logger.info(f"[{request_id}] User prompt: {request.user_prompt}")
    
    try:
        images = []
        
        if request.chat_type == "design":
            logger.info(f"[{request_id}] Processing DESIGN mode - generating 2 images (logo, banner)")
            
            for idx, (prompt_type, base_prompt) in enumerate(DESIGN_PROMPTS.items(), 1):
                logger.info(f"[{request_id}] === Generating image {idx}/2 - Type: {prompt_type} ===")
                
                full_prompt = base_prompt.format(user_prompt=request.user_prompt)
                size = "1024x1024"
                
                try:
                    image_data = await generate_single_image(
                        prompt=full_prompt,
                        size=size,
                        prompt_type=prompt_type,
                        request_id=request_id
                    )
                    images.append(image_data)
                    
                    if idx < 2:
                        logger.info(f"[{request_id}] Waiting 2s before next generation...")
                        await asyncio.sleep(2)
                    
                except Exception as e:
                    logger.error(f"[{request_id}] ✗ Failed to generate {prompt_type}: {str(e)}")
                    raise HTTPException(
                        status_code=500,
                        detail=f"Failed to generate {prompt_type}: {str(e)}"
                    )
        
        elif request.chat_type == "website":
            logger.info(f"[{request_id}] Processing WEBSITE mode - generating 1 image")
            
            full_prompt = WEBSITE_PROMPTS["website"].format(user_prompt=request.user_prompt)
            
            try:
                image_data = await generate_single_image(
                    prompt=full_prompt,
                    size="1792x1024",
                    prompt_type="website",
                    request_id=request_id
                )
                images.append(image_data)
                
            except Exception as e:
                logger.error(f"[{request_id}] ✗ Failed to generate website mockup: {str(e)}")
                raise HTTPException(
                    status_code=500,
                    detail=f"Failed to generate website: {str(e)}"
                )
        
        else:
            logger.error(f"[{request_id}] Invalid chat_type: {request.chat_type}")
            raise HTTPException(status_code=400, detail=f"Invalid chat_type: {request.chat_type}")
        
        logger.info(f"[{request_id}] ✓✓✓ All images generated successfully. Total: {len(images)}")
        
        return ImageResponse(images=images, type=request.chat_type)
    
    except HTTPException as he:
        logger.error(f"[{request_id}] HTTP Exception: {str(he)}")
        raise
    
    except Exception as e:
        logger.error(f"[{request_id}] ✗✗✗ Unexpected error: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

@app.get("/health")
async def health():
    logger.info("Health check endpoint called")
    
    api_key_status = "present" if os.getenv("OPENAI_API_KEY") else "missing"
    dune_key_status = "present" if DUNE_API_KEY else "missing"
    
    health_info = {
        "status": "ok",
        "timestamp": datetime.now().isoformat(),
        "openai_api_key": api_key_status,
        "dune_api_key": dune_key_status,
        "stats_last_updated": stats_cache["last_updated"]
    }
    
    logger.info(f"Health check result: {health_info}")
    return health_info

@app.on_event("startup")
async def startup_event():
    logger.info("=" * 50)
    logger.info("🚀 FORGE AI Image Generator Server Starting")
    logger.info("=" * 50)
    logger.info(f"OpenAI API Key: {'✓ Present' if os.getenv('OPENAI_API_KEY') else '✗ Missing'}")
    logger.info(f"Dune API Key: {'✓ Present' if DUNE_API_KEY else '✗ Missing (using mock data)'}")
    logger.info("Design mode generates: Logo + Banner")
    logger.info("Website mode generates: Website mockup only")
    
    # Первоначальное обновление статистики
    logger.info("Fetching initial stats...")
    await update_stats_cache()
    
    # Настройка планировщика для обновления каждый час
    scheduler = AsyncIOScheduler()
    scheduler.add_job(
        update_stats_cache,
        trigger=IntervalTrigger(hours=20),
        id='update_stats',
        name='Update Dune Analytics stats every hour',
        replace_existing=True
    )
    scheduler.start()
    logger.info("✓ Stats scheduler started (updates every hour)")
    
    logger.info("Server ready to accept requests")
    logger.info("=" * 50)

@app.on_event("shutdown")
async def shutdown_event():
    logger.info("=" * 50)
    logger.info("🛑 FORGE AI Image Generator Server Shutting Down")
    logger.info("=" * 50)

if __name__ == "__main__":
    logger.info("Starting uvicorn server...")
    uvicorn.run(
        app, 
        host="0.0.0.0", 
        port=8000,
        log_level="info"
    )