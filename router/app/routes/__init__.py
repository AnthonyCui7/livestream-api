from fastapi import APIRouter

api_router = APIRouter(prefix="/api")

# Feature routers get included here as they're built, e.g.:
#   from app.routes.jobs import router as jobs_router
#   api_router.include_router(jobs_router)
