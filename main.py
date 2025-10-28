from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from openai import OpenAI
import os
from typing import List
import uvicorn
import logging
from datetime import datetime
import asyncio

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

class PromptRequest(BaseModel):
    user_prompt: str
    chat_type: str  # "design" или "website"

class ImageResponse(BaseModel):
    images: List[dict]
    type: str

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


async def generate_single_image(prompt: str, size: str, prompt_type: str, request_id: str, max_retries: int = 3):
    """Генерация одного изображения с повторными попытками"""
    for attempt in range(max_retries):
        try:
            logger.info(f"[{request_id}] Attempt {attempt + 1}/{max_retries} for {prompt_type}...")
            
            # Добавляем небольшую задержку между запросами
            if attempt > 0:
                delay = 2 ** attempt  # Экспоненциальная задержка
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
            
            # Продолжаем следующую попытку
            continue

@app.get("/")
async def root():
    logger.info("Root endpoint called")
    return {"message": "FORGE AI Image Generator API", "status": "running"}

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
            
            # Генерируем 2 изображения: лого и баннер
            for idx, (prompt_type, base_prompt) in enumerate(DESIGN_PROMPTS.items(), 1):
                logger.info(f"[{request_id}] === Generating image {idx}/2 - Type: {prompt_type} ===")
                
                full_prompt = base_prompt.format(user_prompt=request.user_prompt)
                
                # Размер для лого и баннера
                size = "1024x1024"
                
                try:
                    image_data = await generate_single_image(
                        prompt=full_prompt,
                        size=size,
                        prompt_type=prompt_type,
                        request_id=request_id
                    )
                    images.append(image_data)
                    
                    # Задержка между генерациями чтобы избежать rate limit
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
        logger.error(f"[{request_id}] Error type: {type(e).__name__}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

@app.get("/health")
async def health():
    logger.info("Health check endpoint called")
    
    # Проверяем наличие API ключа
    api_key_status = "present" if os.getenv("OPENAI_API_KEY") else "missing"
    
    health_info = {
        "status": "ok",
        "timestamp": datetime.now().isoformat(),
        "openai_api_key": api_key_status
    }
    
    logger.info(f"Health check result: {health_info}")
    return health_info

@app.on_event("startup")
async def startup_event():
    logger.info("=" * 50)
    logger.info("🚀 FORGE AI Image Generator Server Starting")
    logger.info("=" * 50)
    logger.info(f"OpenAI API Key: {'✓ Present' if os.getenv('OPENAI_API_KEY') else '✗ Missing'}")
    logger.info("Design mode generates: Logo + Banner")
    logger.info("Website mode generates: Website mockup only")
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