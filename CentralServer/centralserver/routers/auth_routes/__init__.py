import datetime
import random
import string
import uuid
from typing import Annotated

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Body,
    Depends,
    HTTPException,
    Request,
    Response,
    status,
)
from fastapi.security.oauth2 import OAuth2PasswordRequestForm
from sqlmodel import Session, select

from centralserver import info
from centralserver.internals.auth_handler import (
    authenticate_user,
    create_access_token,
    verify_access_token,
    verify_user_permission,
)
from centralserver.internals.config_handler import app_config
from centralserver.internals.db_handler import get_db_session
from centralserver.internals.logger import LoggerFactory
from centralserver.internals.mail_handler import get_template, send_mail
from centralserver.internals.models.role import Role
from centralserver.internals.models.token import DecodedJWTToken, JWTToken
from centralserver.internals.models.user import User, UserCreate, UserInvite, UserPublic
from centralserver.internals.user_handler import create_user, validate_password
from centralserver.routers.auth_routes.email import router as email_router
from centralserver.routers.auth_routes.multifactor import router as multifactor_router
from centralserver.routers.auth_routes.oauth import google_oauth_adapter
from centralserver.routers.auth_routes.oauth import router as oauth_router

logger = LoggerFactory().get_logger(__name__)
router = APIRouter(
    prefix="/v1/auth",
    tags=["Authentication"],
    # dependencies=[Depends(get_db_session)],
)
logged_in_dep = Annotated[DecodedJWTToken, Depends(verify_access_token)]

router.include_router(email_router, tags=["Email Authentication"])
router.include_router(oauth_router, tags=["Open Authentication"])
router.include_router(multifactor_router, tags=["Multi-Factor Authentication"])


@router.post("/create", response_model=UserPublic)
async def create_new_user(
    new_user: UserCreate,
    token: logged_in_dep,
    session: Annotated[Session, Depends(get_db_session)],
) -> Response:
    """Create a new user in the database.

    Args:
        new_user: The new user's information.
        token: The decoded JWT token of the logged-in user.
        session: The database session.

    Returns:
        A newly created user object.
    """

    if not await verify_user_permission("users:create", session, token):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to create a user.",
        )

    user = session.get(User, token.id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="User not found."
        )

    user_role = session.get(Role, new_user.roleId)
    if not user_role:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid role ID provided.",
        )

    if new_user.roleId < user.roleId:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to create a user with this role.",
        )

    logger.info("Creating new user: %s", new_user.username)
    logger.debug("Created by user: %s", token.id)
    user = UserPublic.model_validate(await create_user(new_user, session))
    logger.debug("Returning new user information: %s", user)
    return Response(
        content=user.model_dump_json(),
        status_code=status.HTTP_201_CREATED,
        media_type="application/json",
    )


@router.post("/login")
async def request_access_token(
    data: Annotated[OAuth2PasswordRequestForm, Depends()],
    session: Annotated[Session, Depends(get_db_session)],
    request: Request,
    background_tasks: BackgroundTasks,
    remember_me: bool = False,
) -> JWTToken | dict[str, str]:
    """Get an access token for a user, and optionally a refresh token if 'Remember Me' is enabled.

    Args:
        data: The data from the OAuth2 password request form.
        session: The database session.
        request: The HTTP request object.
        background_tasks: Background tasks to run after the request is processed.
        remember_me: Whether to remember the user on this device.

    Returns:
        A dictionary containing the access token, and optionally the refresh token.

    Raises:
        HTTPException: If the user cannot be authenticated.
    """

    logger.info("Requesting access token for user: %s", data.username)
    user: User | tuple[int, str] = await authenticate_user(
        username=data.username,
        plaintext_password=data.password,
        login_ip=request.client.host if request.client else None,
        session=session,
        background_tasks=background_tasks,
    )

    if isinstance(user, tuple):
        logger.warning(
            "Failed to authenticate user %s: %s (%s)", data.username, user[1], user[0]
        )
        raise HTTPException(
            status_code=user[0],
            detail=user[1],
        )

    if user.otpSecret and user.otpVerified:
        otp_nonce = str(uuid.uuid4())
        user.otpNonce = otp_nonce
        user.otpNonceExpires = datetime.datetime.now(
            datetime.timezone.utc
        ) + datetime.timedelta(
            minutes=app_config.authentication.otp_nonce_expire_minutes
        )
        logger.info("MFA OTP is enabled for user %s. Returning nonce", user.username)
        resp = {
            "message": "MFA OTP is enabled. Please provide your OTP to continue.",
            "otp_nonce": otp_nonce,
        }

    else:
        user.lastLoggedInTime = datetime.datetime.now(datetime.timezone.utc)
        user.lastLoggedInIp = request.client.host if request.client else None
        access_token = await create_access_token(
            user.id,
            datetime.timedelta(
                minutes=app_config.authentication.access_token_expire_minutes
            ),
            False,
        )
        refresh_token = (
            await create_access_token(
                user.id,
                datetime.timedelta(
                    minutes=app_config.authentication.refresh_token_expire_minutes
                ),
                True,
            )
            if remember_me
            else None
        )

        resp = JWTToken(
            uid=uuid.uuid4(),
            access_token=access_token,
            refresh_token=refresh_token,
            token_type="bearer",
        )

    session.commit()
    session.refresh(user)
    return resp


@router.post("/refresh", response_model=JWTToken)
async def refresh_access_token(
    refresh_token: Annotated[str, Body(embed=True)],
    session: Annotated[Session, Depends(get_db_session)],
):
    """Refresh the access token for the user.

    This endpoint is used to refresh the access token when it has expired.
    It requires a valid refresh token to be provided in the request.

    Args:
        refresh_token: The refresh token to validate.
        session: The database session.

    Returns:
        A new JWTToken containing the refreshed access token and optionally a new refresh token.
    """
    try:
        # Verify the refresh token
        decoded_token = await verify_access_token(refresh_token)

        # Check if the user still exists
        user = session.get(User, decoded_token.id)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User not found.",
            )

        # Generate new access token
        new_access_token = await create_access_token(
            user.id,
            datetime.timedelta(
                minutes=app_config.authentication.access_token_expire_minutes
            ),
            False,
        )

        return JWTToken(
            uid=uuid.uuid4(),
            access_token=new_access_token,
            refresh_token=refresh_token,
            token_type="bearer",
        )

    except HTTPException as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token.",
        ) from e


@router.post("/invite", response_model=UserPublic)
async def invite_user(
    new_user: UserInvite,
    token: logged_in_dep,
    session: Annotated[Session, Depends(get_db_session)],
    background_tasks: BackgroundTasks,
) -> UserPublic:
    """Invite a new user to the system.

    Args:
        new_user: The new user's information.
        token: The decoded JWT token of the logged-in user.
        session: The database session.

    Returns:
        A newly created user object.
    """

    if not await verify_user_permission("users:create", session, token):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to invite a user.",
        )

    user = session.get(User, token.id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="User not found."
        )

    user_role = session.get(Role, new_user.roleId)
    if not user_role:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid role ID provided.",
        )

    if new_user.roleId < user.roleId:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to invite a user with this role.",
        )

    logger.info("Inviting new user: %s", new_user.email)
    logger.debug("Invited by user: %s", token.id)

    # Generate a random password for the new user
    genpass = "".join(random.choices(string.ascii_letters + string.digits, k=12))
    while not (await validate_password(genpass))[0]:
        # Regenerate the password if it does not meet the requirements
        genpass = "".join(random.choices(string.ascii_letters + string.digits, k=12))

    try:
        logger.debug("Creating new user with generated password")
        created_user = await create_user(
            UserCreate(
                username=new_user.username,
                roleId=new_user.roleId,
                password=genpass,
            ),
            session,
        )

        logger.debug("Updating user information with the new user data")
        created_user.nameFirst = new_user.nameFirst
        created_user.nameMiddle = new_user.nameMiddle
        created_user.nameLast = new_user.nameLast
        created_user.position = new_user.position
        created_user.schoolId = new_user.schoolId
        created_user.email = new_user.email

        logger.debug("Committing the new user to the database")
        session.add(created_user)
        session.commit()
        session.refresh(created_user)

        logger.debug("User created successfully: %s", created_user.username)
        invited_user = UserPublic.model_validate(created_user)

        logger.debug("Sending invitation email to the new user")
        background_tasks.add_task(
            send_mail,
            to_address=new_user.email,
            subject=f"Invitation to {info.Program.name}",
            text=get_template(
                "invite.txt",
                app_name=info.Program.name,
                name=invited_user.nameFirst or invited_user.username,
                username=invited_user.username,
                password=genpass,
                base_url=app_config.connection.base_url,
            ),
            html=get_template(
                "invite.html",
                app_name=info.Program.name,
                name=invited_user.nameFirst or invited_user.username,
                username=invited_user.username,
                password=genpass,
                base_url=app_config.connection.base_url,
            ),
        )

        logger.debug("Returning invited user information: %s", invited_user.id)
        return invited_user

    except (ValueError, AttributeError) as e:
        logger.error("Failed to update user information: %s", e)
        logger.debug("Rolling back the session due to error")
        session.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to create user. Please check the provided information.",
        ) from e


@router.get("/roles", response_model=list[Role])
async def get_all_roles(
    token: logged_in_dep,
    session: Annotated[Session, Depends(get_db_session)],
) -> list[Role]:
    """Get all roles in the database.

    Args:
        token: The decoded JWT token of the logged-in user.
        session: The database session.

    Returns:
        A list of all roles in the database.
    """

    if not await verify_user_permission("roles:global:read", session, token):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to view all roles.",
        )

    # NOTE: Should we include the permissions of each role in the response?
    return [role for role in session.exec(select(Role)).all()]


@router.get("/config/oauth", response_model=dict[str, bool])
async def get_oauth_config() -> dict[str, bool]:
    """Get the OAuth configuration status."""

    return {
        "google": google_oauth_adapter is not None,
        # TODO: The OAuth adapters below are not yet implemented. See adapters/oauth.py
        # "microsoft": app_config.authentication.oauth.microsoft is not None,
        # "facebook": app_config.authentication.oauth.facebook is not None,
        "microsoft": False,
        "facebook": False,
    }
