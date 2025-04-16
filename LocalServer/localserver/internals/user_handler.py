from fastapi import HTTPException, status
from sqlmodel import Session, select

from localserver.internals.auth_handler import crypt_ctx
from localserver.internals.logger import LoggerFactory
from localserver.internals.models import User, UserLoginRequest

logger = LoggerFactory().get_logger(__name__)


def validate_username(username: str) -> bool:
    """Check if the username is valid.

    Args:
        username: The username to validate.

    Returns:
        True if the username is valid, False otherwise.
    """

    return (
        all(c.isalnum() or c in ("_", "-") for c in username)
        and len(username) > 3
        and len(username) < 22
    )


def validate_password(password: str) -> bool:
    """Make sure that the password is a valid password.

    Args:
        password: The password to validate.

    Returns:
        True if the password is valid, False otherwise.
    """

    # Password requirements:
    # - Minimum length of 8 characters
    # - At least one digit
    # - At least one lowercase letter
    # - At least one uppercase letter
    return (
        len(password) >= 8
        and any(c.isdigit() for c in password)
        and any(c.islower() for c in password)
        and any(c.isupper() for c in password)
    )


def create_user(
    new_user: UserLoginRequest,
    session: Session,
) -> User:
    """Create a new user in the database.

    Args:
        new_user: The new user's information.
        session: The database session to use.

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

    if not validate_username(new_user.username):
        logger.warning(
            "Failed to create user: %s (invalid username)", new_user.username
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid username",
        )

    if not validate_password(new_user.password):
        logger.warning(
            "Failed to create user: %s (invalid password format)", new_user.username
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid password format",
        )

    # user = User(**new_user.model_dump())
    user = User(
        username=new_user.username,
        password=crypt_ctx.hash(new_user.password),
        roleId=new_user.roleId,
    )
    session.add(user)
    session.commit()
    session.refresh(user)

    logger.info("User `%s` created.", new_user.username)
    return user
