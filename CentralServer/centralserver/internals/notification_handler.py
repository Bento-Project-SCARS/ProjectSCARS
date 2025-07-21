from sqlmodel import Session, select

from centralserver.internals.exceptions import NotificationNotFoundError
from centralserver.internals.logger import LoggerFactory
from centralserver.internals.models.notification import Notification, NotificationType
from centralserver.internals.websocket_manager import websocket_manager

logger = LoggerFactory().get_logger(__name__)


async def get_user_notifications(
    user_id: str,
    session: Session,
    unarchived_only: bool = True,
    important_only: bool = False,
    offset: int = 0,
    limit: int = 100,
) -> list[Notification]:
    """Retrieve all notifications for a specific user.

    Args:
        user_id: The ID of the user whose notifications are to be retrieved.
        session: The SQLAlchemy session to use for the query.
        unarchived_only: If True, only retrieve unarchived notifications.
        important_only: If True, only retrieve important notifications.

    Returns:
        A list of notifications for the specified user.
    """

    logger.debug(
        "Unarchived only: %s, Important only: %s",
        unarchived_only,
        important_only,
    )
    if important_only:
        if unarchived_only:
            return list(
                session.exec(
                    select(Notification)
                    .where(Notification.ownerId == user_id)
                    .where(Notification.archived == False)  # pylint: disable=C0121
                    .where(Notification.important)
                    .offset(offset)
                    .limit(limit)
                ).all()
            )

        return list(
            session.exec(
                select(Notification)
                .where(Notification.ownerId == user_id)
                .where(Notification.important)
                .offset(offset)
                .limit(limit)
            ).all()
        )

    if unarchived_only:
        return list(
            session.exec(
                select(Notification)
                .where(Notification.ownerId == user_id)
                .where(Notification.archived == False)  # pylint: disable=C0121
                .offset(offset)
                .limit(limit)
            ).all()
        )
    return list(
        session.exec(
            select(Notification)
            .where(Notification.ownerId == user_id)
            .offset(offset)
            .limit(limit)
        ).all()
    )


async def get_notification(notification_id: str, session: Session) -> Notification:
    """Retrieve a specific notification by its ID.

    Args:
        notification_id: The ID of the notification to retrieve.
        session: The SQLAlchemy session to use for the query.

    Returns:
        The notification object if found, otherwise None.
    """

    notification = session.get(Notification, notification_id)
    if notification is None:
        raise NotificationNotFoundError(
            f"Notification with ID {notification_id} not found."
        )

    return notification


async def push_notification(
    owner_id: str,
    title: str,
    content: str,
    session: Session,
    important: bool = False,
    notification_type: NotificationType = NotificationType.INFO,
):
    """Create and store a new notification in the database.

    Args:
        owner_id: The ID of the user who will own the notification.
        title: The title of the notification.
        content: The content of the notification.
        session: The SQLAlchemy session to use for the operation.
        important: Whether the notification is important (default is False).
        type: The type of the notification.

    Returns:
        The created notification object.
    """

    notification = Notification(
        ownerId=owner_id,
        title=title,
        content=content,
        important=important,
        type=notification_type,
    )
    session.add(notification)
    session.commit()
    session.refresh(notification)

    # Send WebSocket notification to the user about the new notification
    # Do this after committing to avoid holding the session during WebSocket operations
    try:
        await websocket_manager.send_to_user(
            str(owner_id),
            {
                "type": "new_notification",
                "data": {"notification": notification.model_dump()},
            },
        )
        logger.debug(
            "New notification created and sent via WebSocket for user %s", owner_id
        )
    except Exception as e:
        # Don't fail the notification creation if WebSocket fails
        logger.warning(
            "Failed to send WebSocket notification for user %s: %s", owner_id, e
        )

    return notification


async def archive_notification(
    notification_id: str,
    session: Session,
    unarchive: bool = False,
) -> Notification:
    """Set a notification as archived (or unarchived).

    Args:
        notification_id: The ID of the notification to delete.
        session: The SQLAlchemy session to use for the operation.
        unarchive: If True, the notification will be unarchived instead of archived.

    Returns:
        The deleted notification object if found, otherwise None.
    """

    notification = await get_notification(notification_id, session)
    notification.archived = False if unarchive else True
    session.add(notification)
    session.commit()
    session.refresh(notification)
    return notification
