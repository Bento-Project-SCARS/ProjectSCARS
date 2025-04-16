from datetime import datetime, timedelta, timezone
from typing import Annotated, Any

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwe, jwt
from jose.exceptions import JWEError
from passlib.context import CryptContext
from sqlmodel import Session, select

from localserver.internals import permissions
from localserver.internals.config_handler import app_config
from localserver.internals.logger import LoggerFactory
from localserver.internals.models import DecodedJWTToken, Role, User

logger = LoggerFactory().get_logger(__name__)
crypt_ctx = CryptContext(schemes=["argon2"], deprecated="auto", argon2__type="ID")
oauth2_bearer = OAuth2PasswordBearer(tokenUrl="/v1/auth/token")


def get_user(user_id: str, session: Session, by_id: bool = True) -> User | None:
    """Get a user from the database.

    Args:
        user_id: The ID of the user.
        session: The database session to use.
        by_id: If False, treat <user_id> as a username.

    Returns:
        The user object if found, None otherwise.
    """

    return (
        session.exec(select(User).where(User.id == user_id)).first()
        if by_id
        else session.exec(select(User).where(User.username == user_id)).first()
    )


def get_role(user_id: str, session: Session, by_id: bool = True) -> Role | None:
    """Get the role of a user.

    Args:
        user_id: The ID of the user.
        session: The database session to use.
        by_id: If False, treat <user_id> as a username.

    Returns:
        The ID of the role of the user.
    """

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


def authenticate_user(
    username: str, plaintext_password: str, session: Session
) -> User | None:
    """Find the user in the database and verify their password.

    Args:
        username: The username of the user to authenticate.
        plaintext_password: The plaintext password to verify.
        session: The database session to use.

    Returns:
        A User object if the user is found and the password is
        correct, None otherwise.
    """

    logger.debug("Attempting to authenticate user `%s`", username)
    found_user: User | None = get_user(username, session, False)

    if not found_user:
        logger.debug("Authentication failed: %s (user not found)", username)
        return None

    if not crypt_ctx.verify(plaintext_password, found_user.password):
        logger.debug("Authentication failed: %s (invalid password)", username)
        return None

    logger.debug("Authentication successful: %s", username)
    logger.debug("Returning user information for user id: %s", found_user.id)
    return found_user


def create_access_token(
    user_id: str, expiration_td: timedelta, refresh: bool = False
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
        "exp": datetime.now(timezone.utc) + expiration_td,
    }

    access_token = jwe.encrypt(
        plaintext=jwt.encode(
            claims=token_data,
            key=app_config.authentication.signing_secret_key,
            algorithm=app_config.authentication.signing_algorithm,
        ),
        key=app_config.authentication.encryption_secret_key.encode(
            app_config.authentication.encoding
        ),
        algorithm=app_config.authentication.encryption_algorithm,
    ).decode("utf-8")

    # logger.debug("Access token: %s", access_token)
    return access_token


async def verify_access_token(
    token: Annotated[str, Depends(oauth2_bearer)],
) -> DecodedJWTToken | None:
    """Get the current user from the JWE token.

    Args:
        token: The JWE token.

    Returns:
        The decoded JWE token payload.

    Raises:
        HTTPException: Raised when the token is invalid or expired.
    """

    try:
        logger.debug("Decrypting access token...")
        # logger.debug("Token: %s", token)
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

        logger.debug("Decoding access token...")
        payload = jwt.decode(
            decoded_jwe.decode(app_config.authentication.encoding),
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

        if datetime.fromtimestamp(payload["exp"], timezone.utc) < datetime.now(
            timezone.utc
        ):
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
        )


async def verify_user_permission(
    required_role: str,
    session: Session,
    token: Annotated[DecodedJWTToken, Depends(verify_access_token)],
) -> bool:
    """Check if the user has the required permissions based on their role.

    Args:
        required_role: A permissions.ROLE_PERMISSIONS value.
        session: The database session to use.
        token: The user's access token.

    Returns:
        Returns True if the user has the required permissions, False otherwise.
    """

    user_role = get_role(token.id, session)
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
