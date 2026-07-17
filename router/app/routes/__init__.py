from fastapi import APIRouter

from app.routes.clips import router as clips_router
from app.routes.projects import router as projects_router
from app.routes.social import router as social_router

api_router = APIRouter(prefix="/api")
api_router.include_router(projects_router)
api_router.include_router(clips_router)
api_router.include_router(social_router)
