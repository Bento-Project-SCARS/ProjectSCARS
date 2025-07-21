from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlmodel import Session, func, select

from centralserver.info import AnnouncementRecipients
from centralserver.internals.auth_handler import (
    verify_access_token,
    verify_user_permission,
)
from centralserver.internals.db_handler import get_db_session
from centralserver.internals.exceptions import NotificationNotFoundError
from centralserver.internals.logger import LoggerFactory
from centralserver.internals.models.notification import (
    Notification,
    NotificationArchiveRequest,
    NotificationType,
)
from centralserver.internals.models.token import DecodedJWTToken
from centralserver.internals.models.user import User
from centralserver.internals.notification_handler import (
    archive_notification as internals_archive_notification,
)
from centralserver.internals.notification_handler import (
    get_notification as internals_get_notification,
)
from centralserver.internals.notification_handler import (
    get_user_notifications as internals_get_user_notifications,
)
from centralserver.internals.notification_handler import (
    push_notification,
)
from centralserver.internals.websocket_manager import websocket_manager


# Helper function for background announcement notifications
async def send_announcement_notification(
    user_id: str,
    title: str,
    content: str,
    important: bool,
    notification_type: NotificationType,
):
    """Send announcement notification with a new database session."""
    try:
        # Create a new session for this background task
        with next(get_db_session()) as session:
            await push_notification(
                owner_id=user_id,
                title=title,
                content=content,
                important=important,
                notification_type=notification_type,
                session=session,
            )
    except Exception as e:
        logger.error(
            "Failed to send announcement notification to user %s: %s", user_id, e
        )


logger = LoggerFactory().get_logger(__name__)

router = APIRouter(
    prefix="/v1/notifications",
    tags=["notifications"],
    # dependencies=[Depends(get_db_session)],
)

logged_in_dep = Annotated[DecodedJWTToken, Depends(verify_access_token)]


@router.get("/quantity", response_model=int)
async def get_notification_quantity(
    token: logged_in_dep,
    session: Annotated[Session, Depends(get_db_session)],
    show_archived: bool = False,
) -> int:
    """Get the total number of notifications for the logged-in user.
    Args:
        token: The decoded JWT token of the logged-in user.
        session: The database session.
        show_archived: Whether to include archived notifications in the count.

    Returns:
        int: The total number of notifications.
    """

    logger.info("User %s is fetching notification quantity.", token.id)

    if not await verify_user_permission("notifications:self:view", session, token):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to view your own notifications.",
        )

    logger.debug("user %s fetching notifications quantity", token.id)
    return (
        session.exec(
            select(func.count()).where(  # pylint: disable=not-callable
                Notification.ownerId == token.id
            )
        ).one()
        if show_archived
        else session.exec(
            select(func.count()).where(  # pylint: disable=not-callable
                (Notification.ownerId == token.id)
                & (Notification.archived == False)  # pylint: disable=C0121
            )
        ).one()
    )


@router.get("/", response_model=Notification)
async def get_notification(
    notification_id: str,
    token: logged_in_dep,
    session: Annotated[Session, Depends(get_db_session)],
) -> Notification:
    """Get a specific notification by its ID.

    Args:
        notification_id: The ID of the notification to retrieve.
        token: The decoded JWT token of the logged-in user.
        session: The database session.

    Returns:
        The requested notification object.
    """
    logger.info("User %s is fetching notification %s.", token.id, notification_id)

    try:
        notification = await internals_get_notification(
            notification_id=notification_id, session=session
        )
    except NotificationNotFoundError as e:
        logger.warning(
            "Notification %s not found for user %s.", notification_id, token.id
        )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notification not found.",
        ) from e

    # Check permissions based on ownership
    permission = (
        "notifications:self:view"
        if notification.ownerId == token.id
        else "notifications:global:view"
    )

    if not await verify_user_permission(permission, session, token):
        detail = (
            "You do not have permission to view your own notifications."
            if notification.ownerId == token.id
            else "You do not have permission to view this notification."
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=detail,
        )

    logger.debug(
        "User %s successfully retrieved notification %s.", token.id, notification_id
    )
    return notification


@router.post("/", response_model=Notification)
async def archive_notification(
    n: NotificationArchiveRequest,
    token: logged_in_dep,
    session: Annotated[Session, Depends(get_db_session)],
    unarchive: bool = False,
) -> Notification:
    """Set a notification as archived (or unarchived).

    Args:
        n: The ID of the notification to archive.
        token: The decoded JWT token of the logged-in user.
        session: The database session.
        unarchive: If True, the notification will be unarchived instead of archived.

    Returns:
        Notification: The archived notification object.
    """

    logger.info(
        (
            "User %s is unarchiving notification %s."
            if unarchive
            else "User %s is archiving notification %s."
        ),
        token.id,
        n.notification_id,
    )
    try:
        selected_notification = await internals_get_notification(
            notification_id=n.notification_id, session=session
        )

    except NotificationNotFoundError as e:
        logger.warning(
            (
                "Notification %s not found for unarchiving by user %s."
                if unarchive
                else "Notification %s not found for archiving by user %s."
            ),
            n.notification_id,
            token.id,
        )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notification not found.",
        ) from e

    if not await verify_user_permission(
        (
            "notifications:self:archive"
            if selected_notification.ownerId == token.id
            else "notifications:global:archive"
        ),
        session,
        token,
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "You do not have permission to unarchive this notification."
                if unarchive
                else "You do not have permission to archive this notification."
            ),
        )

    try:
        archived_notification = await internals_archive_notification(
            notification_id=n.notification_id, session=session, unarchive=unarchive
        )
        logger.info(
            (
                "Notification %s unarchived successfully by user %s."
                if unarchive
                else "Notification %s archived successfully by user %s."
            ),
            n.notification_id,
            token.id,
        )

        # Send WebSocket notification to the user about the archive/unarchive action
        try:
            await websocket_manager.send_to_user(
                str(archived_notification.ownerId),
                {
                    "type": (
                        "notification_unarchived"
                        if unarchive
                        else "notification_archived"
                    ),
                    "data": {
                        "notification_id": str(archived_notification.id),
                        "notification": archived_notification.model_dump(),
                    },
                },
            )
        except Exception as e:
            logger.warning(
                "Failed to send WebSocket notification for archive/unarchive: %s", e
            )

        return archived_notification

    except NotificationNotFoundError as e:
        logger.warning(
            (
                "Notification %s not found for unarchiving by user %s."
                if unarchive
                else "Notification %s not found for archiving by user %s."
            ),
            n.notification_id,
            token.id,
        )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notification not found.",
        ) from e


@router.get("/me")
async def get_user_notifications(
    token: logged_in_dep,
    session: Annotated[Session, Depends(get_db_session)],
    unarchived_only: bool = False,
    important_only: bool = False,
    offset: int = 0,
    limit: int = 100,
) -> list[Notification]:
    """
    Get all notifications for the logged-in user.

    Args:
        token: The decoded JWT token of the logged-in user.
        session: The database session.
        unarchived_only: If True, only fetch unarchived notifications.
        important_only: If True, only fetch important notifications.

    Returns:
        A list of notification titles.
    """

    logger.info("User %s is fetching their own notifications.", token.id)
    if not await verify_user_permission("notifications:self:view", session, token):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to view your own notifications.",
        )

    notifications = await internals_get_user_notifications(
        user_id=token.id,
        session=session,
        unarchived_only=unarchived_only,
        important_only=important_only,
        offset=offset,
        limit=limit,
    )
    logger.debug("Found %d notifications for user %s.", len(notifications), token.id)
    return notifications


@router.post("/announce")
async def announce_notification(
    token: logged_in_dep,
    session: Annotated[Session, Depends(get_db_session)],
    background_tasks: BackgroundTasks,
    title: str,
    content: str,
    recipient_types: AnnouncementRecipients,
    important: bool = False,
    recipient_ids: list[str] | None = None,
    recipient_role_id: int | None = None,
    recipient_school_id: int | None = None,
    notification_type: NotificationType = NotificationType.INFO,
) -> dict[str, str]:
    """
    Announce a notification to users based on recipient criteria.

    Args:
        token: The decoded JWT token of the logged-in user.
        session: The database session.
        background_tasks: Background tasks to handle notification processing.
        title: The title of the notification.
        content: The content of the notification.
        recipient_types: The types of recipients for the notification.
        important: Whether the notification is marked as important.
        recipient_ids: Optional list of specific user IDs to notify.
        recipient_role_id: Role ID when sending to users with a specific role.
        recipient_school_id: School ID when sending to users in a specific school.
        notification_type: The type of the notification (e.g., INFO, WARNING, ERROR).

    Returns:
        A dictionary with a success message.
    """

    logger.info("User %s is announcing a notification.", token.id)

    if not await verify_user_permission("notifications:announce", session, token):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to create announcements.",
        )

    target: list[User] = []
    if recipient_types == AnnouncementRecipients.ALL:
        target.extend(session.exec(select(User)).all())

    elif recipient_types == AnnouncementRecipients.ROLE:
        if recipient_role_id is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Role ID is required when sending to a specific role.",
            )
        target.extend(
            session.exec(select(User).where(User.roleId == recipient_role_id)).all()
        )

    elif recipient_types == AnnouncementRecipients.SCHOOL:
        if recipient_school_id is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="School ID is required when sending to a specific school.",
            )
        target.extend(
            session.exec(select(User).where(User.schoolId == recipient_school_id)).all()
        )

    elif recipient_types == AnnouncementRecipients.USERS:
        if recipient_ids is None or len(recipient_ids) == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="User IDs are required when sending to specific users.",
            )
        for user_id in recipient_ids:
            user = session.exec(select(User).where(User.id == user_id)).first()
            if user:
                target.append(user)

    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid recipient type specified.",
        )

    logger.debug("Targeting %d users for notification announcement.", len(target))
    for user in target:
        background_tasks.add_task(
            send_announcement_notification,
            user_id=user.id,
            title=title,
            content=content,
            important=important,
            notification_type=notification_type,
        )

    logger.info("Notification announced successfully by user %s.", token.id)
    return {"message": f"Notification announced to {len(target)} users successfully."}
