from datetime import timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security.oauth2 import OAuth2PasswordRequestForm
from sqlmodel import Session

from centralserver.internals.auth_handler import (
    authenticate_user,
    create_access_token,
    verify_access_token,
    verify_user_permission,
)
from centralserver.internals.config_handler import app_config
from centralserver.internals.db_handler import get_db_session
from centralserver.internals.logger import LoggerFactory
from centralserver.internals.models import (
    DecodedJWTToken,
    JWTToken,
    User,
    UserLoginRequest,
    UserPublic,
)
from centralserver.internals.rate_limiter import limiter
from centralserver.internals.user_handler import create_user

logger = LoggerFactory().get_logger(__name__)

router = APIRouter(
    prefix="/v1/auth",
    tags=["authentication"],
    # dependencies=[Depends(get_db_session)],
)

logged_in_dep = Annotated[DecodedJWTToken, Depends(verify_access_token)]


@router.post("/create", status_code=status.HTTP_201_CREATED, response_model=UserPublic)
@limiter.limit(  # pyright: ignore[reportUntypedFunctionDecorator,reportUnknownMemberType]
    "5/minute"
)
async def create_new_user(
    new_user: UserLoginRequest,
    token: logged_in_dep,
    session: Annotated[Session, Depends(get_db_session)],
    request: Request,
) -> UserPublic:
    """Create a new user in the database.

    Args:
        new_user: The new user's information.
        token: The decoded JWT token of the logged-in user.
        session: The database session.

    Returns:
        A newly created user object.
    """

    if not await verify_user_permission("users:global:create", session, token):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to create a user.",
        )

    logger.info("Creating new user: %s", new_user.username)
    logger.debug("Created by user: %s", token.id)
    user = UserPublic.model_validate(create_user(new_user, session))
    logger.debug("Returning new user information: %s", user)
    return user


@router.post("/token", response_model=JWTToken)
@limiter.limit(  # pyright: ignore[reportUntypedFunctionDecorator,reportUnknownMemberType]
    "1/second"
)
async def request_access_token(
    data: Annotated[OAuth2PasswordRequestForm, Depends()],
    session: Annotated[Session, Depends(get_db_session)],
    request: Request,
) -> JWTToken:
    """Get an access token for a user.

    Args:
        data: The data from the OAuth2 password request form.
        session: The database session.

    Returns:
        A JWT token object containing the access token and token type.

    Raises:
        HTTPException: If the user cannot be authenticated.
    """

    logger.info("Requesting access token for user: %s", data.username)
    user: User | None = authenticate_user(data.username, data.password, session)

    if not user:
        logger.warning(
            "Failed to authenticate user: %s (Invalid credentials)", data.username
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )

    return JWTToken(
        access_token=create_access_token(
            user.id,
            timedelta(minutes=app_config.authentication.access_token_expire_minutes),
        ),
        token_type="bearer",
    )
