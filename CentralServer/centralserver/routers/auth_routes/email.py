import datetime
import uuid
from typing import Annotated, Literal

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from pydantic import EmailStr
from sqlmodel import Session, select

from centralserver import info
from centralserver.internals.auth_handler import (
    verify_access_token,
    verify_user_permission,
)
from centralserver.internals.config_handler import app_config
from centralserver.internals.db_handler import get_db_session
from centralserver.internals.exceptions import EmailTemplateNotFoundError
from centralserver.internals.logger import LoggerFactory
from centralserver.internals.mail_handler import get_template, send_mail
from centralserver.internals.models.notification import NotificationType
from centralserver.internals.models.token import (
    DecodedJWTToken,
)
from centralserver.internals.models.user import (
    User,
    UserPasswordResetRequest,
)
from centralserver.internals.notification_handler import push_notification
from centralserver.internals.user_handler import (
    crypt_ctx,
    validate_password,
)

logger = LoggerFactory().get_logger(__name__)
router = APIRouter(prefix="/email")
logged_in_dep = Annotated[DecodedJWTToken, Depends(verify_access_token)]


@router.post("/request")
async def request_verification_email(
    token: logged_in_dep,
    session: Annotated[Session, Depends(get_db_session)],
    background_tasks: BackgroundTasks,
) -> dict[str, str]:
    """Send a verification email to a user.

    Args:
        token: The decoded JWT token of the logged-in user.
        session: The database session.

    Returns:
        A message indicating the success of the operation.

    Raises:
        HTTPException: If the token is invalid or expired.
    """

    logger.info("Verifying email with token: %s", token)
    user = session.get(User, token.id)

    if not user:
        logger.warning("User not found for email verification: %s", token.id)
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found.",
        )

    if user.deactivated:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is deactivated.",
        )

    if not user.email:
        logger.warning(
            "User %s does not have an email address set.",
            user.username,
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The user does not have an email address set.",
        )

    session.commit()
    session.refresh(user)

    # Generate a verification token and set its expiration time
    user.verificationToken = str(uuid.uuid4())
    user.verificationTokenExpires = datetime.datetime.now(
        datetime.timezone.utc
    ) + datetime.timedelta(
        # NOTE: Reusing recovery token expiration time for email verification
        minutes=app_config.authentication.recovery_token_expire_minutes
    )
    session.commit()
    session.refresh(user)
    recovery_link = f"{app_config.connection.base_url}/account/profile?emailVerificationToken={user.verificationToken}"
    logger.debug(
        "Generated verification link for user %s: %s", user.username, recovery_link
    )
    logger.info("Email verified successfully for user: %s", user.username)
    try:
        background_tasks.add_task(
            send_mail,
            to_address=user.email,
            subject=f"{info.Program.name} | Email Verification Request",
            text=get_template(
                "email_verification.txt",
                name=user.nameFirst or user.username,
                app_name=info.Program.name,
                verification_link=recovery_link,
                expiration_time=app_config.authentication.recovery_token_expire_minutes,
            ),
            html=get_template(
                "email_verification.html",
                name=user.nameFirst or user.username,
                app_name=info.Program.name,
                verification_link=recovery_link,
                expiration_time=app_config.authentication.recovery_token_expire_minutes,
            ),
        )

    except EmailTemplateNotFoundError as e:
        logger.error("Template for email verification not found.")
        logger.debug("User's email verification link: %s", recovery_link)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to send verification email. Please contact support.",
        ) from e

    return {"message": "Email verification sent successfully."}


@router.post("/verify")
async def verify_email(
    token: str,
    session: Annotated[Session, Depends(get_db_session)],
) -> dict[str, str]:
    """Verify a user's email address using a verification token.

    Args:
        token: The verification token.
        session: The database session.

    Returns:
        A message indicating the success of the operation.

    Raises:
        HTTPException: If the token is invalid or expired.
    """

    logger.info("Verifying email with token: %s", token)
    user = session.exec(select(User).where(User.verificationToken == token)).first()

    if not user or not user.verificationToken or not user.verificationTokenExpires:
        logger.warning("Invalid or missing verification token: %s", token)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or missing verification token.",
        )

    if user.deactivated:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is deactivated.",
        )

    if user.verificationTokenExpires.replace(
        tzinfo=datetime.timezone.utc
    ) < datetime.datetime.now(datetime.timezone.utc):
        logger.warning("Expired verification token: %s", token)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Expired verification token.",
        )

    user.emailVerified = True
    user.verificationToken = None
    user.verificationTokenExpires = None
    session.commit()
    session.refresh(user)
    await push_notification(
        owner_id=user.id,
        title="Email address verified!",
        content=f"Your email address ({user.email}) has been successfully verified.",
        notification_type=NotificationType.MAIL,
        session=session,
    )
    logger.info("Email verified successfully for user: %s", user.username)

    return {"message": "Email verified successfully."}


@router.post("/recovery/request")
async def request_password_recovery(
    username: str,
    email: EmailStr,
    session: Annotated[Session, Depends(get_db_session)],
    background_tasks: BackgroundTasks,
) -> dict[Literal["message"], str]:
    """Request a password recovery for a user.

    Args:
        username: The username of the user.
        email: The email address of the user.
        session: The database session.
    """

    logger.info("Requesting password recovery for user: %s", username)
    user = session.exec(select(User).where(User.username == username)).first()

    if not user:
        logger.warning("User not found for password recovery: %s", username)
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found.",
        )

    if not user.email:
        logger.warning(
            "User %s does not have an email address set for password recovery.",
            username,
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The user does not have an email address set for password recovery.",
        )

    if user.email != email:
        logger.warning(
            "Email mismatch for user %s: provided %s, expected %s",
            username,
            email,
            user.email,
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email does not match the user's email address.",
        )

    if user.emailVerified is False:
        logger.warning(
            "User %s has not verified their email address, cannot proceed with password recovery.",
            username,
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User's email address is not verified.",
        )

    # Generate a recovery token and set its expiration time
    user.recoveryToken = str(uuid.uuid4())
    user.recoveryTokenExpires = datetime.datetime.now(
        datetime.timezone.utc
    ) + datetime.timedelta(
        minutes=app_config.authentication.recovery_token_expire_minutes
    )
    session.commit()
    session.refresh(user)
    recovery_link = (
        f"{app_config.connection.base_url}/resetPassword?token={user.recoveryToken}"
    )
    logger.debug("Generated recovery link for user %s: %s", username, recovery_link)

    try:
        background_tasks.add_task(
            send_mail,
            to_address=user.email,
            subject=f"{info.Program.name} | Password Recovery Request",
            text=get_template(
                "password_recovery.txt",
                name=user.nameFirst or user.username,
                app_name=info.Program.name,
                recovery_link=recovery_link,
                expiration_time=app_config.authentication.recovery_token_expire_minutes,
            ),
            html=get_template(
                "password_recovery.html",
                name=user.nameFirst or user.username,
                app_name=info.Program.name,
                recovery_link=recovery_link,
                expiration_time=app_config.authentication.recovery_token_expire_minutes,
            ),
        )

    except EmailTemplateNotFoundError:
        logger.error("Template for password recovery email not found.")
        logger.debug("User's password recovery link: %s", recovery_link)

    return {"message": "ok"}


@router.post("/recovery/reset")
async def reset_password(
    data: UserPasswordResetRequest,
    session: Annotated[Session, Depends(get_db_session)],
) -> dict[str, str]:
    """Reset a user's password using a recovery token.

    Args:
        token: The recovery token.
        new_password: The new password for the user.
        session: The database session.

    Returns:
        A message indicating the success of the operation.
    """

    logger.info("Resetting password for token: %s", data.recovery_token)
    user = session.exec(
        select(User).where(User.recoveryToken == data.recovery_token)
    ).first()

    if not user or not user.recoveryToken or not user.recoveryTokenExpires:
        logger.warning(
            "Invalid or missing recovery token or user: %s", data.recovery_token
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or missing recovery token or user.",
        )

    if user.deactivated:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is deactivated.",
        )

    password_is_valid, password_err = await validate_password(data.new_password)
    if not password_is_valid:
        logger.warning(
            "Failed to reset password for user: %s (%s)", user.username, password_err
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid password format ({password_err})",
        )

    logger.debug(
        "%s < %s",
        user.recoveryTokenExpires.replace(tzinfo=datetime.timezone.utc),
        datetime.datetime.now(datetime.timezone.utc),
    )
    if user.recoveryTokenExpires.replace(
        tzinfo=datetime.timezone.utc
    ) < datetime.datetime.now(datetime.timezone.utc):
        logger.warning("Invalid or expired recovery token: %s", data.recovery_token)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Expired recovery token.",
        )

    user.password = crypt_ctx.hash(data.new_password)
    user.recoveryToken = None
    user.recoveryTokenExpires = None
    session.commit()
    session.refresh(user)
    logger.info("Password reset successful for user: %s", user.username)
    return {"message": "Password reset successful."}


@router.post("/request/admin")
async def request_verification_email_admin(
    user_id: str,
    token: logged_in_dep,
    session: Annotated[Session, Depends(get_db_session)],
    background_tasks: BackgroundTasks,
) -> dict[str, str]:
    """Send a verification email to a specific user (admin only).

    Args:
        user_id: The ID of the user to send verification email to.
        token: The decoded JWT token of the logged-in admin user.
        session: The database session.
        background_tasks: Background tasks handler.

    Returns:
        A message indicating the success of the operation.

    Raises:
        HTTPException: If the user is not found or other errors occur.
    """

    # Check permissions
    if not await verify_user_permission("users:global:modify:email", session, token):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to send verification emails for other users.",
        )

    logger.info(
        "Admin %s requesting verification email for user: %s", token.id, user_id
    )
    target_user = session.get(User, user_id)

    if not target_user:
        logger.warning("Target user not found for email verification: %s", user_id)
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Target user not found.",
        )

    if target_user.deactivated:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Target user account is deactivated.",
        )

    if not target_user.email:
        logger.warning(
            "Target user %s does not have an email address set.",
            target_user.username,
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The target user does not have an email address set.",
        )

    # Generate a verification token and set its expiration time
    target_user.verificationToken = str(uuid.uuid4())
    target_user.verificationTokenExpires = datetime.datetime.now(
        datetime.timezone.utc
    ) + datetime.timedelta(
        minutes=app_config.authentication.recovery_token_expire_minutes
    )
    session.commit()
    session.refresh(target_user)

    verification_link = f"{app_config.connection.base_url}/account/profile?emailVerificationToken={target_user.verificationToken}"
    logger.debug(
        "Generated verification link for user %s: %s",
        target_user.username,
        verification_link,
    )

    try:
        background_tasks.add_task(
            send_mail,
            to_address=target_user.email,
            subject=f"{info.Program.name} | Email Verification Request",
            text=get_template(
                "email_verification.txt",
                name=target_user.nameFirst or target_user.username,
                app_name=info.Program.name,
                verification_link=verification_link,
                expiration_time=app_config.authentication.recovery_token_expire_minutes,
            ),
            html=get_template(
                "email_verification.html",
                name=target_user.nameFirst or target_user.username,
                app_name=info.Program.name,
                verification_link=verification_link,
                expiration_time=app_config.authentication.recovery_token_expire_minutes,
            ),
        )

    except EmailTemplateNotFoundError as e:
        logger.error("Template for email verification not found.")
        logger.debug("Target user's email verification link: %s", verification_link)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to send verification email. Please contact support.",
        ) from e

    logger.info(
        "Verification email sent successfully to user: %s", target_user.username
    )
    return {"message": "Email verification sent successfully to target user."}
