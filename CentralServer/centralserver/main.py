from fastapi import FastAPI, HTTPException, Request, status
from fastapi.exception_handlers import http_exception_handler
from fastapi.middleware.cors import CORSMiddleware

from centralserver import info
from centralserver.internals.config_handler import app_config
from centralserver.internals.db_handler import populate_db
from centralserver.internals.logger import LoggerFactory, log_app_info
from centralserver.routers import auth_routes, misc_routes, reports_routes, users_routes

logger = LoggerFactory(
    log_level="DEBUG" if app_config.debug.enabled else "WARN"
).get_logger(__name__)

log_app_info(logger)
_ = populate_db()


app = FastAPI(
    debug=app_config.debug.enabled,
    title=info.Program.name,
    version=".".join(map(str, info.Program.version)),
    root_path="/api",
)

app.include_router(auth_routes.router)
app.include_router(users_routes.router)
app.include_router(reports_routes.router)
app.include_router(misc_routes.router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=app_config.security.allow_origins,
    allow_credentials=app_config.security.allow_credentials,
    allow_methods=app_config.security.allow_methods,
    allow_headers=app_config.security.allow_headers,
)


@app.exception_handler(status.HTTP_401_UNAUTHORIZED)
async def unauthorized_error(request: Request, exc: HTTPException):
    """Return a 401 error response."""

    logger.warning("Unauthorized: %s", exc)
    logger.debug("Request URL: %s", request.url)
    logger.debug("Request Headers: %s", request.headers)
    logger.debug("Request Cookies: %s", request.cookies)

    return await http_exception_handler(request, exc)


@app.exception_handler(status.HTTP_403_FORBIDDEN)
async def forbidden_error(request: Request, exc: HTTPException):
    """Return a 403 error response."""

    logger.warning("Forbidden: %s", exc)
    logger.debug("Request URL: %s", request.url)
    logger.debug("Request Headers: %s", request.headers)
    logger.debug("Request Cookies: %s", request.cookies)

    return await http_exception_handler(request, exc)


@app.exception_handler(status.HTTP_404_NOT_FOUND)
async def not_found_error(request: Request, exc: HTTPException):
    """Return a 404 error response."""

    logger.warning("Not Found: %s", exc)
    logger.debug("Request URL: %s", request.url)
    logger.debug("Request Headers: %s", request.headers)
    logger.debug("Request Cookies: %s", request.cookies)

    return await http_exception_handler(request, exc)


@app.exception_handler(status.HTTP_500_INTERNAL_SERVER_ERROR)
async def internal_server_error(request: Request, exc: HTTPException):
    """Return a 500 error response."""

    logger.critical("Internal Server Error: %s", exc, exc_info=True)
    logger.debug("Request URL: %s", request.url)
    logger.debug("Request Headers: %s", request.headers)
    logger.debug("Request Cookies: %s", request.cookies)

    return await http_exception_handler(request, exc)
