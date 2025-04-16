from typing import Literal

from fastapi import APIRouter

router = APIRouter(prefix="/v1")


@router.get("/healthcheck")
async def root() -> dict[Literal["message"], Literal["Healthy"]]:
    """Always returns a 200 OK response with a message."""

    return {"message": "Healthy"}
