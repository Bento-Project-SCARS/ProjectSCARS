import datetime

from fastapi import BackgroundTasks, HTTPException, UploadFile, status
from sqlalchemy.exc import NoResultFound
from sqlmodel import Session, select

from centralserver.info import Program
from centralserver.internals.adapters.object_store import (
    BucketNames,
    get_object_store_handler,
    validate_and_process_image,
    validate_and_process_signature,
)
from centralserver.internals.auth_handler import crypt_ctx, verify_user_permission
from centralserver.internals.config_handler import app_config
from centralserver.internals.logger import LoggerFactory
from centralserver.internals.models.notification import NotificationType
from centralserver.internals.models.object_store import BucketObject
from centralserver.internals.models.role import Role
from centralserver.internals.models.school import School
from centralserver.internals.models.token import DecodedJWTToken
from centralserver.internals.models.user import (
    User,
    UserCreate,
    UserDelete,
    UserPublic,
    UserUpdate,
)
from centralserver.internals.notification_handler import push_notification
from centralserver.internals.permissions import DEFAULT_ROLES
from centralserver.internals.school_handler import clear_assigned_noted_by_for_user
from centralserver.internals.websocket_manager import websocket_manager


# Helper function for background notifications that creates its own session
async def send_welcome_notification(user_id: str, user_name: str):
    """Send welcome notification to a user with a new database session."""
    try:
        # Import here to avoid circular import
        from centralserver.internals.db_handler import get_db_session

        # Create a new session for this background task
        with next(get_db_session()) as session:
            await push_notification(
                owner_id=user_id,
                title="Please add an email address",
                content=f"Welcome to {user_name}! Please add an email address to your account to receive important notifications.",
                important=True,
                notification_type=NotificationType.MAIL,
                session=session,
            )
    except Exception as e:
        logger.error("Failed to send welcome notification to user %s: %s", user_id, e)


async def send_email_update_notification(user_id: str):
    """Send email update notification to a user with a new database session."""
    try:
        # Import here to avoid circular import
        from centralserver.internals.db_handler import get_db_session

        # Create a new session for this background task
        with next(get_db_session()) as session:
            await push_notification(
                owner_id=user_id,
                title="Email address updated",
                content="Your email address has been updated. Please verify it to receive notifications.",
                important=True,
                notification_type=NotificationType.MAIL,
                session=session,
            )
    except Exception as e:
        logger.error(
            "Failed to send email update notification to user %s: %s", user_id, e
        )


# Import for WebSocket notifications (avoid circular import by importing here)
def get_websocket_manager():
    """Get the WebSocket manager instance to avoid circular imports."""
    return websocket_manager


logger = LoggerFactory().get_logger(__name__)


async def validate_username(username: str) -> bool:
    """Check if the username is valid.

    Args:
        username: The username to validate.

    Returns:
        True if the username is valid, False otherwise.
    """

    return (
        all(c.isalnum() or c in ("_", "-") for c in username)
        and len(username) >= 3
        and len(username) <= 22
    )


async def validate_password(password: str) -> tuple[bool, str | None]:
    """Make sure that the password is a valid password.

    Args:
        password: The password to validate.

    Returns:
        A tuple containing a boolean whether the password is valid or not,
        and an optional error message when the password is invalid.
    """

    if len(password) < 8:
        return (False, "Password must be at least 8 characters long.")

    if not any(c.isdigit() for c in password):
        return (False, "Password must contain at least one digit.")

    if not any(c.islower() for c in password):
        return (False, "Password must contain at least one lowercase letter.")

    if not any(c.isupper() for c in password):
        return (False, "Password must contain at least one uppercase letter.")

    return (True, None)


async def create_user(
    new_user: UserCreate,
    session: Session,
    background_tasks: BackgroundTasks,
    commit: bool = True,
    send_notification: bool = True,
    email_verified: bool = False,
) -> User:
    """Create a new user in the database.

    Args:
        new_user: The new user's information.
        session: The database session to use.
        background_tasks: The background tasks to use for sending notifications.
        commit: Whether to commit the changes to the database.
        send_notification: Whether to send a notification to the user.
        email_verified: Whether the email should be marked as verified (for invited users).

    Returns:
        A new user object.

    Raises:
        HTTPException: Thrown when the user already exists or the username is invalid.
    """

    if session.exec(select(User).where(User.username == new_user.username)).first():
        logger.warning(
            "Failed to create user: %s (username already exists)", new_user.username
        )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Username already exists",
        )

    if not await validate_username(new_user.username):
        logger.warning(
            "Failed to create user: %s (invalid username)", new_user.username
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid username",
        )

    password_is_valid, password_err = await validate_password(new_user.password)
    if not password_is_valid:
        logger.warning(
            "Failed to create user: %s (%s)", new_user.username, password_err
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid password format ({password_err})",
        )

    # user = User(**new_user.model_dump())
    user = User(
        username=new_user.username,
        password=crypt_ctx.hash(new_user.password),
        roleId=new_user.roleId,
        email=new_user.email,
        nameFirst=new_user.nameFirst,
        nameMiddle=new_user.nameMiddle,
        nameLast=new_user.nameLast,
        position=new_user.position,
        schoolId=new_user.schoolId,
        emailVerified=email_verified
        or new_user.email is None,  # Auto-verify if explicitly set or if no email
    )
    session.add(user)
    if commit:
        session.commit()

    session.refresh(user)
    # Only send notification about missing email if email is not provided and send_notification is True
    # Don't send notifications for users that have email pre-filled (they can verify it separately)
    if send_notification and not user.email:
        # Create a separate task for notification without passing the session
        # to avoid connection pool exhaustion
        background_tasks.add_task(
            send_welcome_notification,
            user_id=user.id,
            user_name=Program.name,
        )

    logger.info("User `%s` created.", new_user.username)

    # Send WebSocket notification about new user creation in a separate task
    if commit:  # Only send notification if we're committing the transaction

        async def send_websocket_notification():
            try:
                await websocket_manager.broadcast_to_all(
                    {
                        "type": "user_management",
                        "management_type": "user_created",
                        "user_id": str(user.id),
                        "data": {"user": UserPublic.model_validate(user).model_dump()},
                        "timestamp": int(datetime.datetime.now().timestamp()),
                    }
                )
            except Exception as e:
                logger.warning(
                    "Failed to send WebSocket notification for user creation: %s", e
                )

        # Use asyncio to run the WebSocket notification without blocking
        import asyncio

        asyncio.create_task(send_websocket_notification())

    return user


async def update_user_avatar(
    target_user: str, img: UploadFile | None, session: Session
) -> UserPublic:
    """Update the user's avatar in the database.

    Args:
        target_user: The user to update.
        img: The new avatar image.
        session: The database session to use.

    Returns:
        The updated user object.
    """

    selected_user = session.get(User, target_user)

    if not selected_user:  # Check if user exists
        logger.warning("Failed to update user: %s (user not found)", target_user)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User not found",
        )

    object_store_manager = await get_object_store_handler(app_config.object_store)
    if img is None:
        logger.debug("Deleting avatar for user: %s", target_user)
        if selected_user.avatarUrn is None:
            logger.warning("No avatar to delete for user: %s", target_user)
            raise ValueError("No avatar to delete.")

        await object_store_manager.delete(BucketNames.AVATARS, selected_user.avatarUrn)
        selected_user.avatarUrn = None

    else:
        processed_img = await validate_and_process_image(await img.read())
        if selected_user.avatarUrn is not None:
            logger.debug("Deleting old avatar for user: %s", target_user)
            await object_store_manager.delete(
                BucketNames.AVATARS, selected_user.avatarUrn
            )

        logger.debug("Updating avatar for user: %s", target_user)
        bucket_object = await object_store_manager.put(
            BucketNames.AVATARS, selected_user.id, processed_img
        )

        selected_user.avatarUrn = bucket_object.fn

    selected_user.lastModified = datetime.datetime.now(datetime.timezone.utc)

    session.commit()
    session.refresh(selected_user)

    # Send WebSocket notification for avatar update in a separate task
    async def send_websocket_notification():
        try:
            wm = get_websocket_manager()
            await wm.send_user_update(
                user_id=selected_user.id,
                update_type="avatar_updated",
                data={
                    "avatarUrn": selected_user.avatarUrn,
                    "lastModified": selected_user.lastModified.isoformat(),
                },
            )
        except Exception as e:
            logger.warning(
                "Failed to send WebSocket notification for avatar update: %s", e
            )

    # Use asyncio to run the WebSocket notification without blocking
    import asyncio

    asyncio.create_task(send_websocket_notification())

    logger.info("User info for `%s` updated.", selected_user.username)
    return UserPublic.model_validate(selected_user)


async def update_user_signature(
    target_user: str, img: UploadFile | None, session: Session
) -> UserPublic:
    """Update the user's e-signature in the database.

    Args:
        target_user: The user to update.
        img: The new e-signature image.
        session: The database session to use.

    Returns:
        The updated user object.
    """

    selected_user = session.get(User, target_user)

    if not selected_user:  # Check if user exists
        logger.warning("Failed to update user: %s (user not found)", target_user)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User not found",
        )

    object_store_manager = await get_object_store_handler(app_config.object_store)
    if img is None:
        logger.debug("Deleting e-signature for user: %s", target_user)
        if selected_user.signatureUrn is None:
            logger.warning("No e-signature to delete for user: %s", target_user)
            raise ValueError("No e-signature to delete.")

        try:
            await object_store_manager.delete(
                BucketNames.ESIGNATURES, selected_user.signatureUrn
            )

        except Exception as e:
            logger.error(
                "Failed to delete e-signature for user %s: %s (ignored)",
                target_user,
                str(e),
            )

        selected_user.signatureUrn = None

    else:
        processed_img = await validate_and_process_signature(await img.read())
        if selected_user.signatureUrn is not None:
            logger.debug("Deleting old e-signature for user: %s", target_user)
            try:
                await object_store_manager.delete(
                    BucketNames.ESIGNATURES, selected_user.signatureUrn
                )

            except Exception as e:
                logger.error(
                    "Failed to delete old e-signature for user %s: %s (ignored)",
                    target_user,
                    str(e),
                )

        logger.debug("Updating e-signature for user: %s", target_user)
        bucket_object = await object_store_manager.put(
            BucketNames.ESIGNATURES, selected_user.id, processed_img
        )

        selected_user.signatureUrn = bucket_object.fn

    selected_user.lastModified = datetime.datetime.now(datetime.timezone.utc)

    session.commit()
    session.refresh(selected_user)

    # Send WebSocket notification for signature update in a separate task
    async def send_websocket_notification():
        try:
            wm = get_websocket_manager()
            await wm.send_user_update(
                user_id=selected_user.id,
                update_type="signature_updated",
                data={
                    "signatureUrn": selected_user.signatureUrn,
                    "lastModified": selected_user.lastModified.isoformat(),
                },
            )
        except Exception as e:
            logger.warning(
                "Failed to send WebSocket notification for signature update: %s", e
            )

    # Use asyncio to run the WebSocket notification without blocking
    import asyncio

    asyncio.create_task(send_websocket_notification())

    logger.info("User info for `%s` updated.", selected_user.username)
    return UserPublic.model_validate(selected_user)


async def update_user_info(
    target_user: UserUpdate, token: DecodedJWTToken, session: Session
) -> UserPublic:
    """Update the user's information in the database.

    Args:
        target_user: The user to update with new info.
        token: The decoded JWT token of the user making the request.
        session: The database session to use.
    """

    email_changed = False
    user_was_deactivated = False
    selected_user = session.get(User, target_user.id)

    if not selected_user:  # Check if user exists
        logger.warning("Failed to update user: %s (user not found)", target_user.id)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User not found",
        )

    loggedin_user = session.get(User, token.id)
    if loggedin_user is None:
        logger.warning("Failed to update user: %s (user not found)", target_user.id)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User not found",
        )

    updating_self = selected_user.id == token.id
    if target_user.username:  # Update username if provided
        if not await verify_user_permission(
            (
                "users:self:modify:username"
                if updating_self
                else "users:global:modify:username"
            ),
            session=session,
            token=token,
        ):
            logger.warning(
                "Failed to update user: %s (permission denied: username)",
                target_user.id,
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Permission denied: Cannot modify username.",
            )

        logger.debug("Updating username for user: %s", target_user.id)
        # Check username availability
        if target_user.username != selected_user.username:
            try:
                _ = session.exec(
                    select(User).where(User.username == target_user.username)
                ).one()
                logger.warning(
                    "Failed to update user: %s (username already exists)",
                    target_user.id,
                )
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Username already exists",
                )

            except NoResultFound:
                logger.debug("Username %s is available.", target_user.username)

        # Check username validity
        if not await validate_username(target_user.username):
            logger.warning(
                "Failed to update user: %s (invalid username)", target_user.username
            )
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid username",
            )

        # Set new username
        selected_user.username = target_user.username

    if target_user.email:  # Update email if provided
        if not await verify_user_permission(
            (
                "users:self:modify:email"
                if updating_self
                else "users:global:modify:email"
            ),
            session=session,
            token=token,
        ):
            logger.warning(
                "Failed to update user: %s (permission denied: email)", target_user.id
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Permission denied: Cannot modify email.",
            )
        logger.debug("Updating email for user: %s", target_user.id)
        if selected_user.email == target_user.email:
            logger.debug(
                "Email for user %s is already set to %s",
                target_user.id,
                target_user.email,
            )

        else:
            selected_user.email = target_user.email
            selected_user.emailVerified = False  # Reset email verification status
            email_changed = True

    if target_user.nameFirst:  # Update first name if provided
        if not await verify_user_permission(
            ("users:self:modify:name" if updating_self else "users:global:modify:name"),
            session=session,
            token=token,
        ):
            logger.warning(
                "Failed to update user: %s (permission denied: name)", target_user.id
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Permission denied: Cannot modify name.",
            )
        logger.debug("Updating first name for user: %s", target_user.id)
        selected_user.nameFirst = target_user.nameFirst

    if target_user.nameMiddle:  # Update middle name if provided
        if not await verify_user_permission(
            ("users:self:modify:name" if updating_self else "users:global:modify:name"),
            session=session,
            token=token,
        ):
            logger.warning(
                "Failed to update user: %s (permission denied: name)", target_user.id
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Permission denied: Cannot modify name.",
            )
        logger.debug("Updating middle name for user: %s", target_user.id)
        selected_user.nameMiddle = target_user.nameMiddle

    if target_user.nameLast:  # Update last name if provided
        if not await verify_user_permission(
            ("users:self:modify:name" if updating_self else "users:global:modify:name"),
            session=session,
            token=token,
        ):
            logger.warning(
                "Failed to update user: %s (permission denied: name)", target_user.id
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Permission denied: Cannot modify name.",
            )
        logger.debug("Updating last name for user: %s", target_user.id)
        selected_user.nameLast = target_user.nameLast

    if target_user.position:  # Update position if provided
        if not await verify_user_permission(
            (
                "users:self:modify:position"
                if updating_self
                else "users:global:modify:position"
            ),
            session=session,
            token=token,
        ):
            logger.warning(
                "Failed to update user: %s (permission denied: position)",
                target_user.id,
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Permission denied: Cannot modify position.",
            )

        logger.debug("Updating position for user: %s", target_user.id)
        selected_user.position = target_user.position

    if target_user.password:  # Update password if provided
        if not await verify_user_permission(
            (
                "users:self:modify:password"
                if updating_self
                else "users:global:modify:password"
            ),
            session=session,
            token=token,
        ):
            logger.warning(
                "Failed to update user: %s (permission denied: password)",
                target_user.id,
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Permission denied: Cannot modify password.",
            )
        logger.debug("Updating password for user: %s", target_user.id)
        # Validate password
        password_is_valid, password_err = await validate_password(target_user.password)
        if not password_is_valid:
            logger.warning(
                "Failed to update user: %s (%s)", target_user.username, password_err
            )
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid password format ({password_err})",
            )

        # Set new password
        selected_user.password = crypt_ctx.hash(target_user.password)

    # Handle schoolId updates - check if the field was explicitly provided in the request
    if "schoolId" in target_user.model_fields_set:
        # Only check permissions and validate if the school is actually changing
        if selected_user.schoolId != target_user.schoolId:
            if not await verify_user_permission(
                (
                    "users:self:modify:school"
                    if updating_self
                    else "users:global:modify:school"
                ),
                session=session,
                token=token,
            ):
                logger.warning(
                    "Failed to update user: %s (permission denied: school)",
                    target_user.id,
                )
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Permission denied: Cannot modify school.",
                )

            # If schoolId is not None, check if the school exists
            if target_user.schoolId is not None:
                if not session.get(School, target_user.schoolId):
                    logger.warning(
                        "Failed to update user: %s (school not found)", target_user.id
                    )
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="School not found",
                    )

            # Clear any assignedNotedBy references since the school is changing
            logger.debug(
                "User %s school assignment changing from %s to %s, clearing assignedNotedBy references",
                target_user.id,
                selected_user.schoolId,
                target_user.schoolId,
            )
            await clear_assigned_noted_by_for_user(target_user.id, session)

            logger.debug(
                "Setting school ID for user: %s to %s",
                target_user.id,
                target_user.schoolId,
            )
            selected_user.schoolId = target_user.schoolId
        else:
            logger.debug(
                "School ID for user %s is not changing (remains %s), skipping update",
                target_user.id,
                selected_user.schoolId,
            )

    if target_user.roleId is not None:  # Update role ID if provided
        if not await verify_user_permission(
            ("users:self:modify:role" if updating_self else "users:global:modify:role"),
            session=session,
            token=token,
        ):
            logger.warning(
                "Failed to update user: %s (permission denied: role)", target_user.id
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Permission denied: Cannot modify role.",
            )

        # Check if the role exists
        if not session.get(Role, target_user.roleId):
            logger.warning("Failed to update user: %s (role not found)", target_user.id)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Role not found",
            )

        logger.debug(
            "Setting role ID for user: %s to %s", target_user.id, target_user.roleId
        )
        if selected_user.roleId == DEFAULT_ROLES[0].id:
            logger.warning(
                "%s is trying to change the role of another website admin (%s)",
                token.id,
                selected_user.id,
            )
            # Make sure that there is at least one superintedent user in the database
            # superintendent_quantity = len(
            #     session.exec(select(User).where(User.roleId == 1)).all()
            # )
            # if superintendent_quantity == 1:
            admin_count = len(
                session.exec(
                    select(User).where(User.roleId == DEFAULT_ROLES[0].id)
                ).all()
            )
            if admin_count <= 1:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Cannot change the role of the last admin user.",
                )

        # Prevent logged-in user from changing roles to a higher level than theirs
        if loggedin_user.roleId > target_user.roleId:
            logger.warning(
                "Failed to update user: %s (permission denied: role change)",
                target_user.id,
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Permission denied: Cannot change role to a higher level.",
            )

        # Check if logged-in user is trying to downgrade a higher-level user
        if (
            selected_user.roleId < loggedin_user.roleId
            and target_user.roleId > selected_user.roleId
        ):
            logger.warning(
                "Failed to update user: %s (permission denied: role change)",
                target_user.id,
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Permission denied: Cannot change role to a lower level.",
            )

        selected_user.roleId = target_user.roleId

    if target_user.deactivated is not None:
        if not await verify_user_permission(
            ("users:self:deactivate" if updating_self else "users:global:deactivate"),
            session=session,
            token=token,
        ):
            logger.warning(
                "Failed to update user: %s (permission denied: deactivated status)",
                target_user.id,
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Permission denied: Cannot modify deactivated status.",
            )

        if selected_user.roleId == DEFAULT_ROLES[0].id:
            # Make sure that there is at least one superintendent user in the database
            # if len(session.exec(select(User.id).where(User.roleId == DEFAULT_ROLES[0].id)).all()) <= 1:
            admin_count = len(
                session.exec(
                    select(User).where(User.roleId == DEFAULT_ROLES[0].id)
                ).all()
            )
            if admin_count <= 1:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Cannot set deactivated status of the last admin user.",
                )

        if selected_user.roleId < loggedin_user.roleId:
            logger.warning(
                "Failed to update user: %s (permission denied: deactivated status)",
                target_user.id,
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Permission denied: Cannot change deactivated status of a higher-level user.",
            )

        logger.debug("Updating deactivated status for user: %s", target_user.id)
        old_deactivated_status = selected_user.deactivated
        selected_user.deactivated = target_user.deactivated

        # Check if user was just deactivated (changed from False/None to True)
        user_was_deactivated = (not old_deactivated_status) and target_user.deactivated

    if (  # Update onboarding status if provided
        target_user.finishedTutorials is not None
    ):
        if len(target_user.finishedTutorials) > 50:
            logger.warning(
                "Failed to update user: %s (too many tutorials)", target_user.id
            )
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Too many tutorials finished.",
            )

        logger.debug(
            "Updating onboarding status for user: %s (%s)",
            target_user.id,
            len(target_user.finishedTutorials),
        )
        selected_user.finishedTutorials = target_user.finishedTutorials

    if target_user.forceUpdateInfo is not None:
        if not await verify_user_permission(
            "users:self:forceupdate" if updating_self else "users:global:forceupdate",
            session=session,
            token=token,
        ):
            logger.warning(
                "Failed to update user: %s (permission denied: force update)",
                target_user.id,
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Permission denied: Cannot force update.",
            )

        logger.debug("Setting force update info for user: %s", target_user.id)
        selected_user.forceUpdateInfo = target_user.forceUpdateInfo

    selected_user.lastModified = datetime.datetime.now(datetime.timezone.utc)

    session.commit()
    session.refresh(selected_user)

    # Send WebSocket notification for general user update
    if not user_was_deactivated:  # Don't send if deactivation notification will be sent
        try:
            await websocket_manager.broadcast_to_all(
                {
                    "type": "user_management",
                    "management_type": "user_updated",
                    "user_id": str(selected_user.id),
                    "data": {
                        "user": UserPublic.model_validate(selected_user).model_dump()
                    },
                    "timestamp": int(datetime.datetime.now().timestamp()),
                }
            )
            logger.info(
                "Sent WebSocket user update notification for user: %s", selected_user.id
            )
        except Exception as e:
            logger.warning(
                "Failed to send WebSocket notification for user update: %s", e
            )

    # Send WebSocket notification for user deactivation (must be sent before profile update)
    if user_was_deactivated:
        try:
            await websocket_manager.broadcast_to_all(
                {
                    "type": "user_management",
                    "management_type": "user_deactivated",
                    "user_id": str(selected_user.id),
                    "data": {
                        "user": UserPublic.model_validate(selected_user).model_dump()
                    },
                    "timestamp": int(datetime.datetime.now().timestamp()),
                }
            )
            logger.info(
                "Sent WebSocket deactivation notification for user: %s",
                selected_user.id,
            )
        except Exception as e:
            logger.warning(
                "Failed to send WebSocket notification for user deactivation: %s", e
            )

    # Send notification if user was updated by someone else
    # if not updating_self:
    #     await push_notification(
    #         owner_id=selected_user.id,
    #         title="Profile Updated",
    #         content="Your profile information has been updated by a higher-up. You may need to refresh your session to see the changes.",
    #         important=True,
    #         notification_type=NotificationType.INFO,
    #         session=session,
    #     )

    if email_changed:
        # Use a background task to avoid session sharing issues
        try:
            await send_email_update_notification(selected_user.id)
        except Exception as e:
            logger.warning("Failed to send email update notification: %s", e)

    # Send WebSocket notification for profile update
    try:
        wm = get_websocket_manager()
        await wm.send_user_update(
            user_id=selected_user.id,
            update_type="profile_updated",
            data={
                "username": selected_user.username,
                "nameFirst": selected_user.nameFirst,
                "nameMiddle": selected_user.nameMiddle,
                "nameLast": selected_user.nameLast,
                "email": selected_user.email,
                "position": selected_user.position,
                "schoolId": selected_user.schoolId,
                "roleId": selected_user.roleId,
                "lastModified": selected_user.lastModified.isoformat(),
                "emailChanged": email_changed,
            },
        )
    except Exception as e:
        logger.warning(
            "Failed to send WebSocket notification for profile update: %s", e
        )

    logger.info("User info for `%s` updated.", selected_user.username)
    return UserPublic.model_validate(selected_user)


async def remove_user_info(
    target_user: UserDelete,
    session: Session,
) -> None:
    """Remove fields of a user in the database.

    Args:
        target_user: The fields to remove from the user.
        session: The database session to use.

    Raises:
        HTTPException: Thrown when the user does not exist or cannot be removed.
    """

    selected_user = session.get(User, target_user.id)
    if not selected_user:  # Check if user exists
        logger.warning(
            "Failed to remove user info: %s (user not found)", target_user.id
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User not found",
        )

    if target_user.email:
        selected_user.email = None
        selected_user.emailVerified = False

    if target_user.nameFirst:
        selected_user.nameFirst = None

    if target_user.nameMiddle:
        selected_user.nameMiddle = None

    if target_user.nameLast:
        selected_user.nameLast = None

    if target_user.position:
        selected_user.position = None

    if target_user.schoolId:
        # Clear any assignedNotedBy references before removing the user from the school
        logger.debug(
            "User %s is being removed from school %s, clearing assignedNotedBy references",
            selected_user.id,
            selected_user.schoolId,
        )
        await clear_assigned_noted_by_for_user(selected_user.id, session)
        selected_user.schoolId = None

    session.commit()
    session.refresh(selected_user)
    logger.info("Selected fields for user `%s` removed.", selected_user.username)


async def get_user_avatar(fn: str) -> BucketObject | None:
    handler = await get_object_store_handler(app_config.object_store)
    return await handler.get(BucketNames.AVATARS, fn)


async def get_user_signature(fn: str) -> BucketObject | None:
    handler = await get_object_store_handler(app_config.object_store)
    return await handler.get(BucketNames.ESIGNATURES, fn)
