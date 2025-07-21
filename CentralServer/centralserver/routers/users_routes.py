import datetime
from io import BytesIO
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from fastapi.responses import StreamingResponse
from minio.error import S3Error
from sqlmodel import Session, func, select

from centralserver.internals.auth_handler import (
    crypt_ctx,
    get_user,
    verify_access_token,
    verify_user_permission,
)
from centralserver.internals.db_handler import get_db_session
from centralserver.internals.logger import LoggerFactory
from centralserver.internals.models.token import DecodedJWTToken
from centralserver.internals.models.user import (
    User,
    UserDelete,
    UserPasswordChange,
    UserPublic,
    UserSimple,
    UserUpdate,
)
from centralserver.internals.permissions import ROLE_PERMISSIONS
from centralserver.internals.user_handler import (
    get_user_avatar,
    get_user_signature,
    remove_user_info,
    update_user_avatar,
    update_user_info,
    update_user_signature,
    validate_password,
)
from centralserver.internals.websocket_manager import websocket_manager

logger = LoggerFactory().get_logger(__name__)

router = APIRouter(
    prefix="/v1/users",
    tags=["users"],
    # dependencies=[Depends(get_db_session)],
)

logged_in_dep = Annotated[DecodedJWTToken, Depends(verify_access_token)]


@router.get("/quantity", response_model=int)
async def get_users_quantity_endpoint(
    token: logged_in_dep,
    session: Annotated[Session, Depends(get_db_session)],
) -> int:
    """Get the total number of users in the system.

    Args:
        token: The access token of the logged-in user.
        session: The session to the database.

    Returns:
        The total number of users.
    """

    if not await verify_user_permission("users:global:read", session, token):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to view users list.",
        )

    logger.debug("user %s fetching users quantity", token.id)
    return session.exec(
        select(func.count()).select_from(User)  # pylint: disable=not-callable
    ).one()


@router.get("/me", response_model=tuple[UserPublic, list[str]])
async def get_user_profile_endpoint(
    token: logged_in_dep,
    session: Annotated[Session, Depends(get_db_session)],
) -> tuple[UserPublic, list[str]]:
    """Get the logged-in user's profile information.

    Args:
        token: The access token of the logged-in user.
        session: The session to the database.

    Returns:
        The user's profile information together with their permissions.
    """

    if not await verify_user_permission("users:self:read", session, token):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to view your profile.",
        )

    logger.debug("Fetching user profile for user ID: %s", token.id)
    user = session.get(User, token.id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found.",
        )

    return (UserPublic.model_validate(user), ROLE_PERMISSIONS[user.roleId])


@router.get("/all", response_model=list[UserPublic])
async def get_all_users_endpoint(
    token: logged_in_dep,
    session: Annotated[Session, Depends(get_db_session)],
    limit: int = 25,
    offset: int = 0,
    show_all: bool = False,
) -> list[UserPublic]:
    """Get all users and their information.

    Args:
        token: The access token of the logged-in user.
        session: The session to the database.
        limit: The maximum number of users to return (default is 25).
        offset: The number of users to skip (default is 0).
        show_all: If True, include deactivated users.

    Returns:
        A list of users and their information.
    """

    if not await verify_user_permission("users:global:read", session, token):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to view users list.",
        )

    logger.debug("user %s fetching all user info", token.id)
    if show_all:
        return [
            UserPublic.model_validate(user)
            for user in session.exec(select(User).limit(limit).offset(offset)).all()
        ]

    return [
        UserPublic.model_validate(user)
        for user in session.exec(
            select(User)
            .where(User.deactivated == False)  # pylint: disable=C0121
            .limit(limit)
            .offset(offset)
        ).all()
    ]


@router.get("/", response_model=UserPublic)
async def get_user_endpoint(
    user_id: str,
    token: logged_in_dep,
    session: Annotated[Session, Depends(get_db_session)],
) -> UserPublic:
    """Get the information of a specific user.

    Args:
        user_id: The ID of the user to fetch.
        token: The access token of the logged-in user.
        session: The session to the database.

    Returns:
        The user's information.
    """

    if not await verify_user_permission("users:global:read", session, token):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to view users' information.",
        )

    logger.debug("user %s fetching user info of %s", token.id, user_id)
    selected_user = session.get(User, user_id)
    if not selected_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User not found.",
        )

    return UserPublic.model_validate(selected_user)


@router.get("/avatar", response_class=StreamingResponse)
async def get_user_avatar_endpoint(
    fn: str,
    token: logged_in_dep,
    session: Annotated[Session, Depends(get_db_session)],
) -> StreamingResponse:
    """Get the user's profile picture.

    Args:
        fn: The name of the user's avatar.
        token: The access token of the logged-in user.
        session: The session to the database.

    Returns:
        The user's avatar image.
    """

    user = await get_user(token.id, session=session, by_id=True)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found."
        )

    if not await verify_user_permission(
        "users:self:read" if user.avatarUrn == fn else "users:global:read",
        session,
        token,
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "You do not have permission to view your profile."
                if user.avatarUrn == fn
                else "You do not have permission to view other users' information."
            ),
        )

    try:
        bucket_object = await get_user_avatar(fn)
        if bucket_object is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Avatar not found.",
            )

    except S3Error as e:
        logger.error("Error fetching user avatar: %s", e)
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Avatar not found.",
        ) from e

    return StreamingResponse(BytesIO(bucket_object.obj), media_type="image/*")


@router.patch("/", response_model=UserPublic)
async def update_user_endpoint(
    updated_user_info: UserUpdate,
    token: logged_in_dep,
    session: Annotated[Session, Depends(get_db_session)],
) -> UserPublic:
    """Update a user's profile information.

    Args:
        token: The access token of the logged-in user.
        session: The session to the database.
    """

    updating_self = updated_user_info.id == token.id
    if not await verify_user_permission(
        ("users:self:modify" if updating_self else "users:global:modify"),
        session,
        token,
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "You do not have permission to update your profile."
                if updating_self
                else "You do not have permission to update other user profiles."
            ),
        )

    logger.debug(
        "user %s is updating user profile of %s...", token.id, updated_user_info.id
    )
    return await update_user_info(
        target_user=updated_user_info, token=token, session=session
    )


@router.get("/signature", response_class=StreamingResponse)
async def get_user_signature_endpoint(
    fn: str,
    token: logged_in_dep,
    session: Annotated[Session, Depends(get_db_session)],
) -> StreamingResponse:
    """Get the user's e-signature.

    Args:
        fn: The name of the user's e-signature.
        token: The access token of the logged-in user.
        session: The session to the database.

    Returns:
        The user's e-signature.
    """

    user = await get_user(token.id, session=session, by_id=True)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found."
        )

    if not await verify_user_permission(
        "users:self:read" if user.signatureUrn == fn else "users:global:read",
        session,
        token,
    ) and not await verify_user_permission(
        "users:global:simple",
        session,
        token,
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "You do not have permission to view your profile."
                if user.signatureUrn == fn
                else "You do not have permission to view other users' information."
            ),
        )

    try:
        bucket_object = await get_user_signature(fn)
        if bucket_object is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Signature not found.",
            )

    except S3Error as e:
        logger.error("Error fetching user signature: %s", e)
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Signature not found.",
        ) from e

    return StreamingResponse(BytesIO(bucket_object.obj), media_type="image/*")


@router.delete("/")
async def delete_user_info_endpoint(
    user_info: UserDelete,
    token: logged_in_dep,
    session: Annotated[Session, Depends(get_db_session)],
) -> None:
    """Delete a user's profile information.

    Args:
        user_info: The user information to delete.
        token: The access token of the logged-in user.
        session: The session to the database.
    """

    updating_self = user_info.id == token.id
    if not await verify_user_permission(
        "users:self:modify" if updating_self else "users:global:modify", session, token
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to modify user profiles.",
        )

    logger.debug(
        "user %s is removing fields of user profile %s...", token.id, user_info.id
    )
    await remove_user_info(user_info, session)


@router.patch("/avatar", response_model=UserPublic)
async def update_user_avatar_endpoint(
    user_id: str,
    img: UploadFile,
    token: logged_in_dep,
    session: Annotated[Session, Depends(get_db_session)],
) -> UserPublic:
    """Update a user's avatar.

    Args:
        user_id: The ID of the user to update.
        img: The new avatar image.
        token: The access token of the logged-in user.
        session: The session to the database.

    Returns:
        The updated user information.
    """

    updating_self = user_id == token.id
    if not await verify_user_permission(
        "users:self:modify" if updating_self else "users:global:modify",
        session,
        token,
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "You do not have permission to update your profile."
                if updating_self
                else "You do not have permission to update other user profiles."
            ),
        )

    logger.debug("user %s is updating user profile of %s...", token.id, user_id)
    return await update_user_avatar(user_id, img, session)


@router.delete("/avatar")
async def delete_user_avatar_endpoint(
    user_id: str,
    token: logged_in_dep,
    session: Annotated[Session, Depends(get_db_session)],
):
    """Delete a user's avatar.

    Args:
        user_id: The ID of the user to update.
        token: The access token of the logged-in user.
        session: The session to the database.
    """

    updating_self = user_id == token.id
    if not await verify_user_permission(
        "users:self:modify" if updating_self else "users:global:modify",
        session,
        token,
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "You do not have permission to update your profile."
                if updating_self
                else "You do not have permission to update user profiles."
            ),
        )

    logger.debug("user %s is deleting user avatar of %s...", token.id, user_id)
    try:
        return await update_user_avatar(user_id, None, session)

    except ValueError as e:
        logger.warning("Error deleting user avatar: %s", e)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User does not have an avatar set.",
        ) from e


@router.patch("/signature", response_model=UserPublic)
async def update_user_signature_endpoint(
    user_id: str,
    img: UploadFile,
    token: logged_in_dep,
    session: Annotated[Session, Depends(get_db_session)],
) -> UserPublic:
    """Update a user's e-signature.

    Args:
        user_id: The ID of the user to update.
        img: The new e-signature image.
        token: The access token of the logged-in user.
        session: The session to the database.

    Returns:
        The updated user information.
    """

    updating_self = user_id == token.id
    if not await verify_user_permission(
        "users:self:modify" if updating_self else "users:global:modify",
        session,
        token,
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "You do not have permission to update your profile."
                if updating_self
                else "You do not have permission to update other user profiles."
            ),
        )

    logger.debug("user %s is updating user profile of %s...", token.id, user_id)
    return await update_user_signature(user_id, img, session)


@router.delete("/signature")
async def delete_user_signature_endpoint(
    user_id: str,
    token: logged_in_dep,
    session: Annotated[Session, Depends(get_db_session)],
):
    """Delete a user's e-signature.

    Args:
        user_id: The ID of the user to update.
        token: The access token of the logged-in user.
        session: The session to the database.
    """

    updating_self = user_id == token.id
    if not await verify_user_permission(
        "users:self:modify" if updating_self else "users:global:modify", session, token
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "You do not have permission to update your profile."
                if updating_self
                else "You do not have permission to update other user profiles."
            ),
        )

    logger.debug("user %s is deleting user e-signature of %s...", token.id, user_id)
    try:
        return await update_user_signature(user_id, None, session)

    except ValueError as e:
        logger.warning("Error deleting user e-signature: %s", e)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User does not have an e-signature set.",
        ) from e


@router.get("/simple", response_model=list[UserSimple])
async def get_users_simple_endpoint(
    token: logged_in_dep,
    session: Annotated[Session, Depends(get_db_session)],
    school_id: int | None = None,
) -> list[UserSimple]:
    """Get simplified user information for use in reports and signature selection.

    Returns only essential fields: first name, middle name, last name, user ID,
    signatureUrn, avatarUrn, and position. If school_id is provided, only returns
    users from that school. Otherwise, returns users from the same school as the
    requesting user.

    Args:
        token: The access token of the logged-in user.
        session: The session to the database.
        school_id: Optional school ID to filter users. If not provided, uses the
                  requesting user's school.

    Returns:
        A list of simplified user information.
    """

    if not await verify_user_permission("users:global:simple", session, token):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to view users list.",
        )

    # Get the requesting user to determine their school if no school_id provided
    requesting_user = session.get(User, token.id)
    if not requesting_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Requesting user not found.",
        )

    # Use provided school_id or fall back to requesting user's school
    target_school_id = school_id if school_id is not None else requesting_user.schoolId

    logger.debug(
        "user %s fetching simplified user info for school %s",
        token.id,
        target_school_id,
    )

    # Build query based on whether we're filtering by school
    query = select(User).where(User.deactivated == False)  # pylint: disable=C0121

    if target_school_id is not None:
        query = query.where(User.schoolId == target_school_id)

    users = session.exec(query).all()

    return [UserSimple.model_validate(user) for user in users]


@router.get("/me/last-modified")
async def get_user_last_modified_endpoint(
    token: logged_in_dep,
    session: Annotated[Session, Depends(get_db_session)],
) -> dict[str, str]:
    """Get the last modified timestamp of the logged-in user's profile.

    Args:
        token: The access token of the logged-in user.
        session: The session to the database.

    Returns:
        A dictionary containing the last modified timestamp.
    """

    if not await verify_user_permission("users:self:read", session, token):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to view your profile.",
        )

    logger.debug("Fetching user last modified timestamp for user ID: %s", token.id)
    user = session.get(User, token.id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found.",
        )

    return {"lastModified": user.lastModified.isoformat()}


@router.patch("/me/password")
async def change_user_password_endpoint(
    password_change: UserPasswordChange,
    token: logged_in_dep,
    session: Annotated[Session, Depends(get_db_session)],
) -> dict[str, str]:
    """Change the logged-in user's password with current password validation.

    Args:
        password_change: The password change request with current and new passwords.
        token: The access token of the logged-in user.
        session: The session to the database.

    Returns:
        A success message.
    """

    if not await verify_user_permission("users:self:modify:password", session, token):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to change your password.",
        )

    logger.debug("Changing password for user ID: %s", token.id)
    user = session.get(User, token.id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found.",
        )

    # Verify current password
    if not crypt_ctx.verify(password_change.current_password, user.password):
        logger.warning(
            "Failed password change for user %s: invalid current password", token.id
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect.",
        )

    # Validate new password
    password_is_valid, password_err = await validate_password(
        password_change.new_password
    )
    if not password_is_valid:
        logger.warning("Failed password change for user %s: %s", token.id, password_err)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid new password: {password_err}",
        )

    # Update password
    user.password = crypt_ctx.hash(password_change.new_password)
    user.lastModified = datetime.datetime.now(datetime.timezone.utc)

    session.commit()
    session.refresh(user)

    # Send WebSocket notification for password change
    try:

        await websocket_manager.send_user_update(
            user_id=user.id,
            update_type="password_changed",
            data={"lastModified": user.lastModified.isoformat()},
        )
    except Exception as e:
        logger.warning(
            "Failed to send WebSocket notification for password change: %s", e
        )

    logger.info("Password changed successfully for user %s", user.username)
    return {"message": "Password changed successfully"}
