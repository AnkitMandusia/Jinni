from fastapi import APIRouter

from app.modules.base import REGISTRY

router = APIRouter(prefix="/modules", tags=["modules"])


@router.get("")
async def list_modules():
    """Public: which services exist and whether they are live. Apps use this to decide which tiles to show."""
    return {"modules": [{"module_type": m.module_type, "title": m.title, "status": m.status, "description": m.description} for m in REGISTRY]}
