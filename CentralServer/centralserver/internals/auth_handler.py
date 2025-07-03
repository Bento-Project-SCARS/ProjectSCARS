import datetime
import uuid
from typing import Annotated, Any

import httpx
from fastapi import BackgroundTasks, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwe, jwt
from jose.exceptions import JWEError
from passlib.context import CryptContext
from sqlmodel import Session, select

from centralserver import info
from centralserver.internals import permissions
from centralserver.internals.adapters.oauth import (
    GoogleOAuthAdapter,
    FacebookOAuthAdapter,
    MicrosoftOAuthAdapter,
)
from centralserver.internals.config_handler import app_config
from centralserver.internals.logger import LoggerFactory
from centralserver.internals.mail_handler import get_template, send_mail
from centralserver.internals.models.role import Role
from centralserver.internals.models.token import DecodedJWTToken, JWTToken
from centralserver.internals.models.user import User

logger = LoggerFactory().get_logger(__name__)
crypt_ctx = CryptContext(schemes=["argon2"], deprecated="auto", argon2__type="ID")
oauth2_bearer = OAuth2PasswordBearer(tokenUrl="/v1/auth/login")


async def get_user(user_id: str, session: Session, by_id: bool = True) -> User | None:
    """Get a user from the database.

    Args:
        user_id: The ID of the user.
        session: The database session to use.
        by_id: If False, treat <user_id> as a username.

    Returns:
        The user object if found, None otherwise.
    """

    logger.debug(
        "Getting user with ID: %s" if by_id else "Getting user with username: %s",
        user_id,
    )
    return (
        session.exec(select(User).where(User.id == user_id)).first()
        if by_id
        else session.exec(select(User).where(User.username == user_id)).first()
    )


async def get_role(role_id: int, session: Session) -> Role | None:
    """Get a role by ID.

    Args:
        role_id: The ID of the role.
        session: The database session to use.

    Returns:
        The Role object.
    """

    logger.debug("Getting role with ID: %s", role_id)
    return session.get(Role, role_id)


async def get_user_role(
    user_id: str, session: Session, by_id: bool = True
) -> Role | None:
    """Get the role of a user.

    Args:
        user_id: The ID of the user.
        session: The database session to use.
        by_id: If False, treat <user_id> as a username.

    Returns:
        The ID of the role of the user.
    """

    logger.debug(
        (
            "Getting role for user with ID: %s"
            if by_id
            else "Getting role for user with username: %s"
        ),
        user_id,
    )
    return session.exec(
        select(Role).where(
            Role.id
            == session.exec(select(User.roleId).where(User.id == user_id)).first()
        )
        if by_id
        else select(Role).where(
            Role.id
            == session.exec(select(User.roleId).where(User.username == user_id)).first()
        )
    ).first()


async def authenticate_user(
    username: str,
    plaintext_password: str,
    login_ip: str | None,
    session: Session,
    background_tasks: BackgroundTasks,
) -> User | tuple[int, str]:
    """Find the user in the database and verify their password.
    This function will not authenticate deactivated and locked out users.

    Args:
        username: The username of the user to authenticate.
        plaintext_password: The plaintext password to verify.
        login_ip: The IP address of the user attempting to log in.
        session: The database session to use.

    Returns:
        A User object if the user is found and the password is
        correct. If the user is not found or the password is incorrect,
        returns a tuple with an HTTP status code and an error message.
    """

    logger.debug("Attempting to authenticate user `%s`", username)
    found_user: User | None = await get_user(username, session, False)

    if not found_user:
        logger.debug("Authentication failed: %s (user not found)", username)
        return (status.HTTP_401_UNAUTHORIZED, "User not found.")

    if found_user.deactivated:
        logger.debug("User %s is deactivated", username)
        return (status.HTTP_403_FORBIDDEN, "User is deactivated.")

    # Check if the user is locked out.
    if (
        found_user.failedLoginAttempts
        >= app_config.security.failed_login_lockout_attempts
    ):
        if not found_user.lastFailedLoginTime:
            logger.warning(
                "User %s is locked out but has no failed login time.",
                username,
            )
            found_user.lastFailedLoginTime = datetime.datetime.now(
                datetime.timezone.utc
            )
            locked_out_until = found_user.lastFailedLoginTime + datetime.timedelta(
                app_config.security.failed_login_lockout_minutes
            )
            session.commit()
            session.refresh(found_user)
            return (
                status.HTTP_429_TOO_MANY_REQUESTS,
                f"User is locked out until {locked_out_until} due to too many failed login attempts.",  # pylint: disable=C0301
            )

        # Check if the lockout period has expired.
        if found_user.lastFailedLoginTime.replace(
            tzinfo=datetime.timezone.utc
        ) + datetime.timedelta(
            minutes=app_config.security.failed_login_lockout_minutes
        ) > datetime.datetime.now(
            datetime.timezone.utc
        ):
            logger.info(
                "Authentication failed: %s (user locked out due to too many failed attempts)",
                username,
            )
            logger.debug(
                "User %s is locked out until %s",
                username,
                found_user.lastFailedLoginTime,
            )
            locked_out_until = found_user.lastFailedLoginTime + datetime.timedelta(
                minutes=app_config.security.failed_login_lockout_minutes
            )
            return (
                status.HTTP_429_TOO_MANY_REQUESTS,
                f"User is locked out until {locked_out_until} due to too many failed login attempts.",  # pylint: disable=C0301
            )

        else:
            logger.info(
                "User %s is no longer locked out, resetting failed login attempts",
                username,
            )
            found_user.failedLoginAttempts = 0
            found_user.lastFailedLoginTime = None
            found_user.lastFailedLoginIp = None
            session.commit()
            session.refresh(found_user)

    if not crypt_ctx.verify(plaintext_password, found_user.password):
        logger.debug("Authentication failed: %s (invalid password)", username)
        logger.debug(
            "User %s has %d failed login attempts",
            username,
            found_user.failedLoginAttempts,
        )
        found_user.failedLoginAttempts += 1
        found_user.lastFailedLoginTime = datetime.datetime.now(datetime.timezone.utc)
        found_user.lastFailedLoginIp = login_ip
        session.commit()
        session.refresh(found_user)

        if found_user.email:
            if (
                found_user.failedLoginAttempts
                == app_config.security.failed_login_notify_attempts
            ):
                background_tasks.add_task(
                    send_mail,
                    to_address=found_user.email,
                    subject=f"{info.Program.name} | Someone is trying to access your account",
                    text=get_template(
                        "unusual_login.txt",
                        name=found_user.nameFirst or found_user.username,
                        app_name=info.Program.name,
                        failed_login_attempts=found_user.failedLoginAttempts,
                        last_failed_login_time=found_user.lastFailedLoginTime.strftime(
                            "%d %B %Y %I:%M:%S %p"
                        ),
                        last_failed_login_ip=found_user.lastFailedLoginIp or "Unknown",
                    ),
                    html=get_template(
                        "unusual_login.html",
                        name=found_user.nameFirst or found_user.username,
                        app_name=info.Program.name,
                        failed_login_attempts=found_user.failedLoginAttempts,
                        last_failed_login_time=found_user.lastFailedLoginTime.strftime(
                            "%d %B %Y %I:%M:%S %p"
                        ),
                        last_failed_login_ip=found_user.lastFailedLoginIp or "Unknown",
                    ),
                )

        tries_remaining = (
            app_config.security.failed_login_lockout_attempts
            - found_user.failedLoginAttempts
        )
        return (
            status.HTTP_401_UNAUTHORIZED,
            f"Invalid credentials. {tries_remaining} attempts remaining before lockout.",
        )

    found_user.failedLoginAttempts = 0
    found_user.lastFailedLoginTime = None
    found_user.lastFailedLoginIp = None
    session.commit()
    session.refresh(found_user)
    logger.debug("Authentication successful: %s", username)
    logger.debug("Returning user information for user id: %s", found_user.id)
    return found_user


async def create_access_token(
    user_id: str, expiration_td: datetime.timedelta, refresh: bool = False
) -> str:
    """Create a JWE access token for the user, valid for +<expiration_td>.

    Args:
        user_id: The ID of the user.
        expiration_td: The time delta for the token expiration.
        refresh: If True, the token is a refresh token.

    Returns:
        The encrypted JWT access token.
    """

    logger.debug("Creating access token for user `%s`...", user_id)
    token_data: dict[str, Any] = {
        "sub": user_id,
        "is_refresh": refresh,
        "exp": datetime.datetime.now(datetime.timezone.utc) + expiration_td,
    }

    access_token = jwt.encode(
        claims=token_data,
        key=app_config.authentication.signing_secret_key,
        algorithm=app_config.authentication.signing_algorithm,
    )

    if app_config.authentication.encrypt_jwt:
        logger.debug("Encrypting access token...")
        access_token = jwe.encrypt(
            plaintext=access_token,
            key=app_config.authentication.encryption_secret_key.encode(
                app_config.authentication.encoding
            ),
            algorithm=app_config.authentication.encryption_algorithm,
        ).decode("utf-8")

    # logger.debug("Access token: %s", access_token)
    return access_token


async def verify_access_token(
    token: Annotated[str, Depends(oauth2_bearer)],
) -> DecodedJWTToken:
    """Get the current user from the JWE token.

    Args:
        token: The JWE token.

    Returns:
        The decoded JWE token payload.

    Raises:
        HTTPException: Raised when the token is invalid or expired.
    """

    try:
        if app_config.authentication.encrypt_jwt:
            logger.debug("Decrypting access token...")
            decoded_jwe = jwe.decrypt(
                token,
                app_config.authentication.encryption_secret_key.encode(
                    app_config.authentication.encoding
                ),
            )
            if decoded_jwe is None:
                logger.warning("Failed to decrypt JWE")
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Failed to validate user.",
                )
            token_to_decode = decoded_jwe.decode(app_config.authentication.encoding)
        else:
            token_to_decode = token

        logger.debug("Decoding access token...")
        payload = jwt.decode(
            token_to_decode,
            app_config.authentication.signing_secret_key,
            algorithms=[app_config.authentication.signing_algorithm],
        )

        # Check if token is expired
        if payload.get("exp") is None:
            logger.warning("JWT is missing expiration date")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Failed to validate user.",
            )

        if datetime.datetime.fromtimestamp(
            payload["exp"], datetime.timezone.utc
        ) < datetime.datetime.now(datetime.timezone.utc):
            logger.warning("JWT is expired")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Failed to validate user.",
            )

        user_id: str | None = payload.get("sub", None)
        is_refresh_token: bool | None = payload.get("is_refresh", None)

        if user_id is None or is_refresh_token is None:
            logger.warning("JWT is missing content")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Failed to validate user.",
            )

        return DecodedJWTToken(id=user_id, is_refresh_token=is_refresh_token)

    except (JWTError, JWEError) as e:
        logger.warning("Failed to decode JWE/JWT: %s", e)
        logger.debug("Traceback:", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Failed to validate user.",
        ) from e


async def verify_user_permission(
    required_role: str,
    session: Session,
    token: Annotated[DecodedJWTToken, Depends(oauth2_bearer)],
) -> bool:
    """Check if the user has the required permissions based on their role.

    Args:
        required_role: A permissions.ROLE_PERMISSIONS value.
        session: The database session to use.
        token: The user's access token.

    Returns:
        Returns True if the user has the required permissions, False otherwise.
    """

    logger.debug("Required permission: %s", required_role)
    if token.is_refresh_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid JWT token",
        )

    user_role = await get_user_role(token.id, session)
    if user_role is None:
        logger.warning("User role not found for user ID: %s", token.id)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Failed to validate user permission.",
        )

    if user_role.id in permissions.ROLE_PERMISSIONS:
        logger.debug("Checking permissions for user role: %s", user_role.id)
        return required_role in permissions.ROLE_PERMISSIONS[user_role.id]

    logger.error("The role %s is not defined in ROLE_PERMISSIONS", user_role.id)
    return False


async def oauth_google_link(
    code: str,
    user_id: str,
    google_oauth_adapter: GoogleOAuthAdapter,
    session: Session,
) -> bool:
    """Link a Google account to a user.

    Args:
        code: The authorization code received from Google.
        user_id: The ID of the user to link the Google account to.
        google_oauth_adapter: The Google OAuth adapter instance.
        session: The database session to use.

    Returns:
        True if the Google account was linked successfully, False otherwise.
    """

    token_url = "https://accounts.google.com/o/oauth2/token"
    data: dict[str, str] = {
        "code": code,
        "client_id": google_oauth_adapter.config.client_id,
        "client_secret": google_oauth_adapter.config.client_secret,
        "redirect_uri": google_oauth_adapter.config.redirect_uri,
        "grant_type": "authorization_code",
    }
    response = httpx.post(token_url, data=data)
    if response.status_code != 200:
        logger.error(
            "Failed to exchange authorization code for access token: %s", response.text
        )
        return False

    access_token = response.json().get("access_token")
    user_info = httpx.get(
        "https://www.googleapis.com/oauth2/v1/userinfo",
        headers={"Authorization": f"Bearer {access_token}"},
    )
    if user_info.status_code != 200:
        logger.error(
            "Failed to retrieve user information from Google: %s", user_info.text
        )
        return False

    user_data = user_info.json()
    user = session.exec(select(User).where(User.id == user_id)).one_or_none()
    if user is None:
        logger.error("User with ID %s not found", user_id)
        return False

    user.oauthLinkedGoogleId = user_data.get("id", None)
    session.add(user)
    session.commit()
    session.refresh(user)

    logger.info("User %s linked their Google account successfully", user.username)
    return True


async def oauth_google_authenticate(
    code: str,
    google_oauth_adapter: GoogleOAuthAdapter,
    session: Session,
    request: Request,
) -> tuple[int, JWTToken | str]:
    token_url = "https://accounts.google.com/o/oauth2/token"
    data: dict[str, str] = {
        "code": code,
        "client_id": google_oauth_adapter.config.client_id,
        "client_secret": google_oauth_adapter.config.client_secret,
        "redirect_uri": google_oauth_adapter.config.redirect_uri,
        "grant_type": "authorization_code",
    }
    response = httpx.post(token_url, data=data)
    if response.status_code != 200:
        logger.error(
            "Failed to exchange authorization code for access token: %s", response.text
        )
        return (
            status.HTTP_400_BAD_REQUEST,
            "Failed to exchange authorization code for access token.",
        )

    access_token = response.json().get("access_token")
    user_info = httpx.get(
        "https://www.googleapis.com/oauth2/v1/userinfo",
        headers={"Authorization": f"Bearer {access_token}"},
    )
    if user_info.status_code != 200:
        logger.error(
            "Failed to retrieve user information from Google: %s", user_info.text
        )
        return (
            status.HTTP_400_BAD_REQUEST,
            "Failed to retrieve user information from Google.",
        )

    user_data = user_info.json()
    user = session.exec(
        select(User).where(User.oauthLinkedGoogleId == user_data.get("id", None))
    ).one_or_none()
    if user is None:
        return (
            status.HTTP_404_NOT_FOUND,
            "User not found. Please login first and link your Google account.",
        )

    user.lastLoggedInTime = datetime.datetime.now(datetime.timezone.utc)
    user.lastLoggedInIp = request.client.host if request.client else None

    return (
        status.HTTP_200_OK,
        JWTToken(
            uid=uuid.uuid4(),
            access_token=await create_access_token(
                user.id,
                datetime.timedelta(
                    minutes=app_config.authentication.access_token_expire_minutes
                ),
                False,
            ),
            refresh_token=await create_access_token(
                user.id,
                datetime.timedelta(
                    minutes=app_config.authentication.refresh_token_expire_minutes
                ),
                True,
            ),
            token_type="bearer",
        ),
    )


async def oauth_facebook_link(
    code: str,
    user_id: str,
    facebook_oauth_adapter: FacebookOAuthAdapter,
    session: Session,
) -> bool:
    """Link a Facebook account to a user.

    Args:
        code: The authorization code received from Facebook.
        user_id: The ID of the user to link the Facebook account to.
        facebook_oauth_adapter: The Facebook OAuth adapter instance.
        session: The database session to use.

    Returns:
        True if the Facebook account was linked successfully, False otherwise.
    """

    token_url = "https://graph.facebook.com/v21.0/oauth/access_token"
    data: dict[str, str] = {
        "code": code,
        "client_id": facebook_oauth_adapter.config.client_id,
        "client_secret": facebook_oauth_adapter.config.client_secret,
        "redirect_uri": facebook_oauth_adapter.config.redirect_uri,
    }
    response = httpx.post(token_url, data=data)
    if response.status_code != 200:
        logger.error(
            "Failed to exchange authorization code for access token: %s", response.text
        )
        return False

    access_token = response.json().get("access_token")
    user_info = httpx.get(
        f"https://graph.facebook.com/me?fields=id,name,email&access_token={access_token}",
    )
    if user_info.status_code != 200:
        logger.error(
            "Failed to retrieve user information from Facebook: %s", user_info.text
        )
        return False

    user_data = user_info.json()
    user = session.exec(select(User).where(User.id == user_id)).one_or_none()
    if user is None:
        logger.error("User with ID %s not found", user_id)
        return False

    user.oauthLinkedFacebookId = user_data.get("id", None)
    session.add(user)
    session.commit()
    session.refresh(user)

    logger.info("User %s linked their Facebook account successfully", user.username)
    return True


async def oauth_facebook_authenticate(
    code: str,
    facebook_oauth_adapter: FacebookOAuthAdapter,
    session: Session,
    request: Request,
) -> tuple[int, JWTToken | str]:
    token_url = "https://graph.facebook.com/v21.0/oauth/access_token"
    data: dict[str, str] = {
        "code": code,
        "client_id": facebook_oauth_adapter.config.client_id,
        "client_secret": facebook_oauth_adapter.config.client_secret,
        "redirect_uri": facebook_oauth_adapter.config.redirect_uri,
    }
    response = httpx.post(token_url, data=data)
    if response.status_code != 200:
        logger.error(
            "Failed to exchange authorization code for access token: %s", response.text
        )
        return (
            status.HTTP_400_BAD_REQUEST,
            "Failed to exchange authorization code for access token.",
        )

    access_token = response.json().get("access_token")
    user_info = httpx.get(
        f"https://graph.facebook.com/me?fields=id,name,email&access_token={access_token}",
    )
    if user_info.status_code != 200:
        logger.error(
            "Failed to retrieve user information from Facebook: %s", user_info.text
        )
        return (
            status.HTTP_400_BAD_REQUEST,
            "Failed to retrieve user information from Facebook.",
        )

    user_data = user_info.json()
    user = session.exec(
        select(User).where(User.oauthLinkedFacebookId == user_data.get("id", None))
    ).one_or_none()
    if user is None:
        return (
            status.HTTP_404_NOT_FOUND,
            "User not found. Please login first and link your Facebook account.",
        )

    user.lastLoggedInTime = datetime.datetime.now(datetime.timezone.utc)
    user.lastLoggedInIp = request.client.host if request.client else None

    return (
        status.HTTP_200_OK,
        JWTToken(
            uid=uuid.uuid4(),
            access_token=await create_access_token(
                user.id,
                datetime.timedelta(
                    minutes=app_config.authentication.access_token_expire_minutes
                ),
                False,
            ),
            refresh_token=await create_access_token(
                user.id,
                datetime.timedelta(
                    minutes=app_config.authentication.refresh_token_expire_minutes
                ),
                True,
            ),
            token_type="bearer",
        ),
    )


async def oauth_microsoft_link(
    code: str,
    user_id: str,
    microsoft_oauth_adapter: MicrosoftOAuthAdapter,
    session: Session,
) -> bool:
    """Link a Microsoft account to a user.

    Args:
        code: The authorization code received from Microsoft.
        user_id: The ID of the user to link the Microsoft account to.
        microsoft_oauth_adapter: The Microsoft OAuth adapter instance.
        session: The database session to use.

    Returns:
        True if the Microsoft account was linked successfully, False otherwise.
    """

    token_url = f"https://login.microsoftonline.com/{microsoft_oauth_adapter.config.tenant}/oauth2/v2.0/token"
    data: dict[str, str] = {
        "code": code,
        "client_id": microsoft_oauth_adapter.config.client_id,
        "client_secret": microsoft_oauth_adapter.config.client_secret,
        "redirect_uri": microsoft_oauth_adapter.config.redirect_uri,
        "grant_type": "authorization_code",
    }
    response = httpx.post(token_url, data=data)
    if response.status_code != 200:
        logger.error(
            "Failed to exchange authorization code for access token: %s", response.text
        )
        return False

    access_token = response.json().get("access_token")
    user_info = httpx.get(
        "https://graph.microsoft.com/v1.0/me",
        headers={"Authorization": f"Bearer {access_token}"},
    )
    if user_info.status_code != 200:
        logger.error(
            "Failed to retrieve user information from Microsoft: %s", user_info.text
        )
        return False

    user_data = user_info.json()
    user = session.exec(select(User).where(User.id == user_id)).one_or_none()
    if user is None:
        logger.error("User with ID %s not found", user_id)
        return False

    user.oauthLinkedMicrosoftId = user_data.get("id", None)
    session.add(user)
    session.commit()
    session.refresh(user)

    logger.info("User %s linked their Microsoft account successfully", user.username)
    return True


async def oauth_microsoft_authenticate(
    code: str,
    microsoft_oauth_adapter: MicrosoftOAuthAdapter,
    session: Session,
    request: Request,
) -> tuple[int, JWTToken | str]:
    token_url = f"https://login.microsoftonline.com/{microsoft_oauth_adapter.config.tenant}/oauth2/v2.0/token"
    data: dict[str, str] = {
        "code": code,
        "client_id": microsoft_oauth_adapter.config.client_id,
        "client_secret": microsoft_oauth_adapter.config.client_secret,
        "redirect_uri": microsoft_oauth_adapter.config.redirect_uri,
        "grant_type": "authorization_code",
    }
    response = httpx.post(token_url, data=data)
    if response.status_code != 200:
        logger.error(
            "Failed to exchange authorization code for access token: %s", response.text
        )
        return (
            status.HTTP_400_BAD_REQUEST,
            "Failed to exchange authorization code for access token.",
        )

    access_token = response.json().get("access_token")
    user_info = httpx.get(
        "https://graph.microsoft.com/v1.0/me",
        headers={"Authorization": f"Bearer {access_token}"},
    )
    if user_info.status_code != 200:
        logger.error(
            "Failed to retrieve user information from Microsoft: %s", user_info.text
        )
        return (
            status.HTTP_400_BAD_REQUEST,
            "Failed to retrieve user information from Microsoft.",
        )

    user_data = user_info.json()
    user = session.exec(
        select(User).where(User.oauthLinkedMicrosoftId == user_data.get("id", None))
    ).one_or_none()
    if user is None:
        return (
            status.HTTP_404_NOT_FOUND,
            "User not found. Please login first and link your Microsoft account.",
        )

    user.lastLoggedInTime = datetime.datetime.now(datetime.timezone.utc)
    user.lastLoggedInIp = request.client.host if request.client else None

    return (
        status.HTTP_200_OK,
        JWTToken(
            uid=uuid.uuid4(),
            access_token=await create_access_token(
                user.id,
                datetime.timedelta(
                    minutes=app_config.authentication.access_token_expire_minutes
                ),
                False,
            ),
            refresh_token=await create_access_token(
                user.id,
                datetime.timedelta(
                    minutes=app_config.authentication.refresh_token_expire_minutes
                ),
                True,
            ),
            token_type="bearer",
        ),
    )
