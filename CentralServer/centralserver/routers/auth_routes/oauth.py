from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlmodel import Session

from centralserver.internals.adapters.oauth import (
    GoogleOAuthAdapter,
    FacebookOAuthAdapter,
    MicrosoftOAuthAdapter,
)
from centralserver.internals.auth_handler import (
    oauth_google_authenticate,
    oauth_google_link,
    oauth_facebook_authenticate,
    oauth_facebook_link,
    oauth_microsoft_authenticate,
    oauth_microsoft_link,
    verify_access_token,
)
from centralserver.internals.config_handler import app_config
from centralserver.internals.db_handler import get_db_session
from centralserver.internals.logger import LoggerFactory
from centralserver.internals.models.token import DecodedJWTToken, JWTToken
from centralserver.internals.models.user import User

logger = LoggerFactory().get_logger(__name__)
router = APIRouter(prefix="/oauth")
logged_in_dep = Annotated[DecodedJWTToken, Depends(verify_access_token)]
google_oauth_adapter = (
    GoogleOAuthAdapter(app_config.authentication.oauth.google)
    if app_config.authentication.oauth.google is not None
    else None
)
facebook_oauth_adapter = (
    FacebookOAuthAdapter(app_config.authentication.oauth.facebook)
    if app_config.authentication.oauth.facebook is not None
    else None
)
microsoft_oauth_adapter = (
    MicrosoftOAuthAdapter(app_config.authentication.oauth.microsoft)
    if app_config.authentication.oauth.microsoft is not None
    else None
)


@router.get("/google/login")
async def google_oauth_login():
    """Handle Google OAuth login."""
    if google_oauth_adapter is None:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Google OAuth is not configured.",
        )

    return await google_oauth_adapter.get_authorization_url()


@router.get("/google/callback")
async def google_oauth_callback(
    code: str,
    session: Annotated[Session, Depends(get_db_session)],
    request: Request,
):
    """Handle Google OAuth callback."""

    if google_oauth_adapter is None:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Google OAuth is not configured.",
        )

    result = await oauth_google_authenticate(
        code=code,
        google_oauth_adapter=google_oauth_adapter,
        session=session,
        request=request,
    )

    if result[0] != status.HTTP_200_OK:
        logger.error("Google OAuth authentication failed: %s", result[1])
        raise HTTPException(
            status_code=result[0],
            detail=result[1],
        )

    if isinstance(result[1], JWTToken):
        return result[1]

    raise HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail="Unexpected response from Google OAuth authentication.",
    )


@router.get("/google/link")
async def oauth_link_google(
    code: str,
    token: logged_in_dep,
    session: Annotated[Session, Depends(get_db_session)],
) -> dict[str, str]:
    """Link a Google account for OAuth."""

    if google_oauth_adapter is None:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Google OAuth is not configured.",
        )

    if await oauth_google_link(
        code=code,
        user_id=token.id,
        google_oauth_adapter=google_oauth_adapter,
        session=session,
    ):
        logger.info("Google OAuth linking successful for user: %s", token.id)
        return {"message": "Google account linked successfully."}

    logger.error("Google OAuth linking failed for user: %s", token.id)
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Failed to link Google account. Please try again.",
    )


@router.get("/google/unlink")
async def oauth_unlink_google(
    token: logged_in_dep,
    session: Annotated[Session, Depends(get_db_session)],
) -> dict[str, str]:
    """Unlink a Google account from the user's profile."""

    if google_oauth_adapter is None:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Google OAuth is not configured.",
        )

    user = session.get(User, token.id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found.",
        )

    user.oauthLinkedGoogleId = None
    session.commit()
    session.refresh(user)

    logger.info("Google OAuth unlinked successfully for user: %s", token.id)
    return {"message": "Google account unlinked successfully."}


@router.get("/microsoft/login")
async def microsoft_oauth_login():
    """Handle Microsoft OAuth login."""
    if microsoft_oauth_adapter is None:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Microsoft OAuth is not configured.",
        )

    return await microsoft_oauth_adapter.get_authorization_url()


@router.get("/microsoft/callback")
async def microsoft_oauth_callback(
    code: str,
    session: Annotated[Session, Depends(get_db_session)],
    request: Request,
):
    """Handle Microsoft OAuth callback."""

    if microsoft_oauth_adapter is None:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Microsoft OAuth is not configured.",
        )

    result = await oauth_microsoft_authenticate(
        code=code,
        microsoft_oauth_adapter=microsoft_oauth_adapter,
        session=session,
        request=request,
    )

    if result[0] != status.HTTP_200_OK:
        logger.error("Microsoft OAuth authentication failed: %s", result[1])
        raise HTTPException(
            status_code=result[0],
            detail=result[1],
        )

    if isinstance(result[1], JWTToken):
        return result[1]

    raise HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail="Unexpected response from Microsoft OAuth authentication.",
    )


@router.get("/microsoft/link")
async def oauth_link_microsoft(
    code: str,
    token: logged_in_dep,
    session: Annotated[Session, Depends(get_db_session)],
) -> dict[str, str]:
    """Link a Microsoft account for OAuth."""

    if microsoft_oauth_adapter is None:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Microsoft OAuth is not configured.",
        )

    if await oauth_microsoft_link(
        code=code,
        user_id=token.id,
        microsoft_oauth_adapter=microsoft_oauth_adapter,
        session=session,
    ):
        logger.info("Microsoft OAuth linking successful for user: %s", token.id)
        return {"message": "Microsoft account linked successfully."}

    logger.error("Microsoft OAuth linking failed for user: %s", token.id)
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Failed to link Microsoft account. Please try again.",
    )


@router.get("/microsoft/unlink")
async def oauth_unlink_microsoft(
    token: logged_in_dep,
    session: Annotated[Session, Depends(get_db_session)],
) -> dict[str, str]:
    """Unlink a Microsoft account from the user's profile."""

    if microsoft_oauth_adapter is None:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Microsoft OAuth is not configured.",
        )

    user = session.get(User, token.id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found.",
        )

    user.oauthLinkedMicrosoftId = None
    session.commit()
    session.refresh(user)

    logger.info("Microsoft OAuth unlinked successfully for user: %s", token.id)
    return {"message": "Microsoft account unlinked successfully."}


@router.get("/facebook/login")
async def facebook_oauth_login():
    """Handle Facebook OAuth login."""
    if facebook_oauth_adapter is None:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Facebook OAuth is not configured.",
        )

    return await facebook_oauth_adapter.get_authorization_url()


@router.get("/facebook/callback")
async def facebook_oauth_callback(
    code: str,
    session: Annotated[Session, Depends(get_db_session)],
    request: Request,
):
    """Handle Facebook OAuth callback."""

    if facebook_oauth_adapter is None:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Facebook OAuth is not configured.",
        )

    result = await oauth_facebook_authenticate(
        code=code,
        facebook_oauth_adapter=facebook_oauth_adapter,
        session=session,
        request=request,
    )

    if result[0] != status.HTTP_200_OK:
        logger.error("Facebook OAuth authentication failed: %s", result[1])
        raise HTTPException(
            status_code=result[0],
            detail=result[1],
        )

    if isinstance(result[1], JWTToken):
        return result[1]

    raise HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail="Unexpected response from Facebook OAuth authentication.",
    )


@router.get("/facebook/link")
async def oauth_link_facebook(
    code: str,
    token: logged_in_dep,
    session: Annotated[Session, Depends(get_db_session)],
) -> dict[str, str]:
    """Link a Facebook account for OAuth."""

    if facebook_oauth_adapter is None:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Facebook OAuth is not configured.",
        )

    if await oauth_facebook_link(
        code=code,
        user_id=token.id,
        facebook_oauth_adapter=facebook_oauth_adapter,
        session=session,
    ):
        logger.info("Facebook OAuth linking successful for user: %s", token.id)
        return {"message": "Facebook account linked successfully."}

    logger.error("Facebook OAuth linking failed for user: %s", token.id)
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Failed to link Facebook account. Please try again.",
    )


@router.get("/facebook/unlink")
async def oauth_unlink_facebook(
    token: logged_in_dep,
    session: Annotated[Session, Depends(get_db_session)],
) -> dict[str, str]:
    """Unlink a Facebook account from the user's profile."""

    if facebook_oauth_adapter is None:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="Facebook OAuth is not configured.",
        )

    user = session.get(User, token.id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found.",
        )

    user.oauthLinkedFacebookId = None
    session.commit()
    session.refresh(user)

    logger.info("Facebook OAuth unlinked successfully for user: %s", token.id)
    return {"message": "Facebook account unlinked successfully."}
