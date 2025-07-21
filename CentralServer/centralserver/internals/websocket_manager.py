"""WebSocket connection manager for real-time communication."""

import asyncio
import json
from datetime import datetime
from typing import Any, Dict, List, Optional, Set

from fastapi import WebSocket, WebSocketDisconnect

from centralserver.internals.auth_handler import verify_access_token
from centralserver.internals.logger import LoggerFactory
from centralserver.internals.models.token import DecodedJWTToken

logger = LoggerFactory().get_logger(__name__)


class WebSocketJSONEncoder(json.JSONEncoder):
    """Custom JSON encoder for WebSocket messages that handles datetime objects."""

    def default(self, o: Any) -> Any:
        if isinstance(o, datetime):
            return o.isoformat()
        return super().default(o)


class WebSocketConnectionManager:
    """Manages WebSocket connections for real-time updates."""

    def __init__(self):
        # Store active connections by user ID
        self.user_connections: Dict[str, Set[WebSocket]] = {}
        # Store connection metadata
        self.connection_metadata: Dict[WebSocket, Dict[str, Any]] = {}
        self._lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket, user_id: str) -> bool:
        """
        Accept a WebSocket connection and associate it with a user.

        Args:
            websocket: The WebSocket connection
            user_id: The ID of the authenticated user

        Returns:
            True if connection was successful, False otherwise
        """
        try:
            await websocket.accept()

            async with self._lock:
                # Initialize user connections set if not exists
                if user_id not in self.user_connections:
                    self.user_connections[user_id] = set()

                # Add connection to user's set
                self.user_connections[user_id].add(websocket)

                # Store connection metadata
                self.connection_metadata[websocket] = {
                    "user_id": user_id,
                    "connected_at": asyncio.get_event_loop().time(),
                }

            logger.info(
                "WebSocket connected for user %s. Total connections: %d",
                user_id,
                len(self.user_connections[user_id]),
            )
            return True

        except Exception as e:
            logger.error("Failed to connect WebSocket for user %s: %s", user_id, e)
            return False

    async def disconnect(self, websocket: WebSocket) -> None:
        """
        Disconnect a WebSocket and clean up associated data.

        Args:
            websocket: The WebSocket connection to disconnect
        """
        async with self._lock:
            # Get connection metadata
            metadata = self.connection_metadata.get(websocket)
            if not metadata:
                return

            user_id = metadata["user_id"]

            # Remove from user connections
            if user_id in self.user_connections:
                self.user_connections[user_id].discard(websocket)

                # Clean up empty user connection sets
                if not self.user_connections[user_id]:
                    del self.user_connections[user_id]

            # Remove connection metadata
            if websocket in self.connection_metadata:
                del self.connection_metadata[websocket]

            logger.info("WebSocket disconnected for user %s", user_id)

    async def send_to_user(self, user_id: str, message: Dict[str, Any]) -> int:
        """
        Send a message to all connections for a specific user.

        Args:
            user_id: The ID of the user to send the message to
            message: The message to send

        Returns:
            Number of connections the message was sent to
        """
        if user_id not in self.user_connections:
            logger.debug("No active connections for user %s", user_id)
            return 0

        connections = list(self.user_connections[user_id])
        sent_count = 0
        failed_connections: list[WebSocket] = []

        for websocket in connections:
            try:
                await websocket.send_text(json.dumps(message, cls=WebSocketJSONEncoder))
                sent_count += 1
            except Exception as e:
                logger.warning(
                    "Failed to send message to WebSocket for user %s: %s", user_id, e
                )
                failed_connections.append(websocket)

        # Clean up failed connections
        if failed_connections:
            async with self._lock:
                for websocket in failed_connections:
                    await self.disconnect(websocket)

        return sent_count

    async def broadcast_to_users(
        self, user_ids: List[str], message: Dict[str, Any]
    ) -> int:
        """
        Broadcast a message to multiple users.

        Args:
            user_ids: List of user IDs to send the message to
            message: The message to send

        Returns:
            Total number of connections the message was sent to
        """
        total_sent = 0
        for user_id in user_ids:
            sent_count = await self.send_to_user(user_id, message)
            total_sent += sent_count

        return total_sent

    async def broadcast_to_all(self, message: Dict[str, Any]) -> int:
        """
        Broadcast a message to all connected users.

        Args:
            message: The message to send

        Returns:
            Total number of connections the message was sent to
        """
        user_ids = list(self.user_connections.keys())
        return await self.broadcast_to_users(user_ids, message)

    def get_user_connection_count(self, user_id: str) -> int:
        """
        Get the number of active connections for a user.

        Args:
            user_id: The ID of the user

        Returns:
            Number of active connections for the user
        """
        return len(self.user_connections.get(user_id, set()))

    def get_total_connections(self) -> int:
        """
        Get the total number of active connections.

        Returns:
            Total number of active connections
        """
        return sum(len(connections) for connections in self.user_connections.values())

    async def send_user_update(
        self, user_id: str, update_type: str, data: Optional[Dict[str, Any]] = None
    ) -> int:
        """
        Send a user-specific update notification.

        Args:
            user_id: The ID of the user to notify
            update_type: The type of update (e.g., 'profile_updated', 'avatar_changed')
            data: Optional additional data to include

        Returns:
            Number of connections the message was sent to
        """
        message: dict[str, Any] = {
            "type": "user_update",
            "update_type": update_type,
            "user_id": user_id,
            "data": data or {},
            "timestamp": asyncio.get_event_loop().time(),
        }

        return await self.send_to_user(user_id, message)


# Global WebSocket manager instance
websocket_manager = WebSocketConnectionManager()


async def authenticate_websocket(websocket: WebSocket) -> Optional[DecodedJWTToken]:
    """
    Authenticate a WebSocket connection using query parameters or headers.

    Args:
        websocket: The WebSocket connection

    Returns:
        Decoded JWT token if authentication is successful, None otherwise
    """
    try:
        # Try to get token from query parameters first
        token = websocket.query_params.get("token")

        # If not in query params, try Authorization header
        if not token:
            auth_header = websocket.headers.get("authorization")
            if auth_header and auth_header.startswith("Bearer "):
                token = auth_header[7:]  # Remove "Bearer " prefix

        if not token:
            logger.warning("No authentication token provided in WebSocket connection")
            return None

        # Verify the token
        decoded_token = await verify_access_token(token)
        return decoded_token

    except Exception as e:
        logger.error("WebSocket authentication failed: %s", e)
        return None


async def handle_websocket_connection(websocket: WebSocket) -> None:
    """
    Handle a WebSocket connection lifecycle.

    Args:
        websocket: The WebSocket connection to handle
    """
    # Authenticate the connection
    token = await authenticate_websocket(websocket)
    if not token:
        await websocket.close(code=4001, reason="Authentication failed")
        return

    # Connect to the manager
    connected = await websocket_manager.connect(websocket, token.id)
    if not connected:
        await websocket.close(code=4000, reason="Connection failed")
        return

    try:
        # Send initial connection confirmation
        await websocket.send_text(
            json.dumps(
                {
                    "type": "connection_established",
                    "user_id": token.id,
                    "timestamp": asyncio.get_event_loop().time(),
                },
                cls=WebSocketJSONEncoder,
            )
        )

        # Keep connection alive and handle incoming messages
        while True:
            try:
                # Receive message from client
                message = await websocket.receive_text()

                # Parse the message
                try:
                    data = json.loads(message)
                    message_type = data.get("type")

                    if message_type == "ping":
                        # Respond to ping with pong
                        await websocket.send_text(
                            json.dumps(
                                {
                                    "type": "pong",
                                    "timestamp": asyncio.get_event_loop().time(),
                                },
                                cls=WebSocketJSONEncoder,
                            )
                        )
                    else:
                        logger.debug(
                            "Received unsupported WebSocket message type: %s",
                            message_type,
                        )

                except json.JSONDecodeError:
                    logger.warning("Received invalid JSON from WebSocket client")

            except WebSocketDisconnect:
                logger.info("WebSocket client disconnected normally")
                break
            except Exception as e:
                logger.error("Error handling WebSocket message: %s", e)
                break

    finally:
        # Clean up connection
        await websocket_manager.disconnect(websocket)
