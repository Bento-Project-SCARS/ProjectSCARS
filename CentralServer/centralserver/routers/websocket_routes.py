"""WebSocket routes for real-time communication."""

from fastapi import APIRouter, WebSocket

from centralserver.internals.logger import LoggerFactory
from centralserver.internals.websocket_manager import handle_websocket_connection

logger = LoggerFactory().get_logger(__name__)

router = APIRouter(
    prefix="/v1/ws",
    tags=["websockets"],
)


@router.websocket("/user-updates")
async def websocket_user_updates_endpoint(websocket: WebSocket):
    """
    WebSocket endpoint for real-time user updates.

    Clients can connect to this endpoint to receive real-time notifications
    about user profile changes, avatar updates, and other user-related events.

    Authentication is required via token query parameter or Authorization header.

    Args:
        websocket: The WebSocket connection
    """
    logger.debug("New WebSocket connection attempt for user updates")
    await handle_websocket_connection(websocket)
