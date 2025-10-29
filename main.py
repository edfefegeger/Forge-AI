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

# Dune API Configuration
DUNE_API_KEY = "OgXaMFh3tApLxHXilZG0h3MLj3SusD6T"
DUNE_QUERY_ID = "4421743"  # ID из вашей ссылки
DUNE_API_BASE = "https://api.dune.com/api/v1"

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
import json
from pathlib import Path
import httpx
import logging

logger = logging.getLogger(__name__)

DUNE_API_KEY = os.getenv("DUNE_API_KEY")
DUNE_API_BASE = "https://api.dune.com/api/v1"
DUNE_QUERY_ID = "4421743"

async def fetch_dune_stats():
    """Получение и агрегация статистики из Dune Analytics"""
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            results_url = f"{DUNE_API_BASE}/query/{DUNE_QUERY_ID}/results"
            headers = {"X-Dune-API-Key": DUNE_API_KEY}
            response = await client.get(results_url, headers=headers)
            response.raise_for_status()

            data = response.json()

            # 💾 Сохраняем полный ответ Dune API
            output_path = Path("dune_raw.json")
            with output_path.open("w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)

            logger.info(f"Full Dune API response saved to {output_path.resolve()}")

            # --- 🔍 Извлечение данных ---
            rows = data.get("result", {}).get("rows", [])
            if not rows:
                logger.warning("No rows found in Dune response")
                return {"token_created": 0, "trading_volume": 0, "active_users": 0}

            # --- 🔢 Агрегация ---
            total_volume = sum(float(r.get("freq", 0)) for r in rows)
            unique_groups = set(r.get("gr") for r in rows if r.get("gr"))
            unique_bins = set(r.get("log_bin") for r in rows if r.get("log_bin") is not None)

            stats = {
                "token_created": len(unique_bins),
                "trading_volume": total_volume,
                "active_users": len(unique_groups),
            }

            logger.info(f"Aggregated stats: {stats}")
            return stats

    except Exception as e:
        logger.error(f"Error fetching Dune stats: {e}", exc_info=True)
        return {"token_created": 0, "trading_volume": 0, "active_users": 0}


async def update_stats_cache():
    """Обновление кэша статистики"""
    logger.info("=== Updating stats cache ===")
    
    stats = await fetch_dune_stats()
    
    stats_cache["token_created"] = stats["token_created"]
    stats_cache["trading_volume"] = stats["trading_volume"]
    stats_cache["active_users"] = stats["active_users"]
    stats_cache["last_updated"] = datetime.now().isoformat()
    
    logger.info(f"Stats updated: {stats_cache}")
    logger.info("=" * 30)

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
        "query_id": DUNE_QUERY_ID,
        "api_base": DUNE_API_BASE,
        "full_url": f"{DUNE_API_BASE}/query/{DUNE_QUERY_ID}/results"
    }
    
    # Пробуем сделать запрос
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            url = f"{DUNE_API_BASE}/query/{DUNE_QUERY_ID}/results"
            headers = {
                "X-Dune-API-Key": DUNE_API_KEY,
                "Content-Type": "application/json"
            }
            
            response = await client.get(url, headers=headers)
            
            debug_info["request_status"] = response.status_code
            debug_info["request_success"] = response.status_code == 200
            
            if response.status_code == 200:
                data = response.json()
                debug_info["response_keys"] = list(data.keys())
                
                if "result" in data:
                    debug_info["result_keys"] = list(data["result"].keys())
                    if "rows" in data["result"]:
                        rows = data["result"]["rows"]
                        debug_info["rows_count"] = len(rows)
                        if rows:
                            debug_info["first_row_keys"] = list(rows[0].keys())
                            debug_info["first_row_sample"] = rows[0]
            else:
                debug_info["error_response"] = response.text
                
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
        trigger=IntervalTrigger(hours=1),
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