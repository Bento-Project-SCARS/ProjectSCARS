import logging
from logging.handlers import RotatingFileHandler
from time import strftime

from localserver import info
from localserver.internals.config_handler import app_config


class LoggerFactory:
    """A factory class for creating loggers with a specific configuration."""

    def __init__(
        self,
        log_level: int | str | None = None,
    ):
        """Create a new LoggerFactory object.

        Args:
            log_level: Override the log level with the provided value.
        """

        self.log_level = (
            log_level
            if log_level is not None
            else "DEBUG" if app_config.debug.enabled else "WARN"
        )

    def get_logger(self, name: str) -> logging.Logger:
        """Get a logger with the provided name.

        Args:
            name: The name of the logger.

        Returns:
            The logger object.
        """

        logger = logging.getLogger(name)
        if type(self.log_level) is int:
            logger.setLevel(self.log_level)
        elif type(self.log_level) is str:
            logger.setLevel(self.log_level.upper())
        else:
            raise ValueError("Invalid log level type. Must be int or str.")

        # Add a handler if one does not already exist.
        if not logger.handlers:
            # handlers
            stream_handler = logging.StreamHandler()
            file_handler = RotatingFileHandler(
                app_config.logging.filepath.format(strftime("%Y-%m-%d_%H-%M-%S")),
                maxBytes=app_config.logging.max_bytes,
                backupCount=app_config.logging.backup_count,
                encoding=app_config.logging.encoding,
            )

            # formatters
            formatter = logging.Formatter(
                fmt=app_config.logging.log_format,
                datefmt=app_config.logging.date_format,
            )

            # add formatters to handlers
            stream_handler.setFormatter(formatter)
            file_handler.setFormatter(formatter)

            # add handlers to logger
            logger.addHandler(stream_handler)
            logger.addHandler(file_handler)

        return logger


def log_app_info(logger: logging.Logger):
    """Log everything about the app.

    Args:
        logger: The logger to use.
    """

    logger.info(f"{info.Program.name=}")
    logger.info(f"info.Program.version={'.'.join(map(str, info.Program.version))}")
    logger.debug(f"{info.Configuration.default_filepath=}")
    logger.debug(f"{info.Configuration.default_encoding=}")

    logger.debug(f"{app_config.debug.enabled=}")

    logger.debug(f"{app_config.logging.filepath=}")
    logger.debug(f"{app_config.logging.max_bytes=}")
    logger.debug(f"{app_config.logging.backup_count=}")
    logger.debug(f"{app_config.logging.encoding=}")
    logger.debug(f"{app_config.logging.log_format=}")
    logger.debug(f"{app_config.logging.date_format=}")

    logger.debug(f"{app_config.database.filepath=}")
    logger.debug(f"{app_config.database.sqlalchemy_uri=}")

    # Hide the secret key in the logs
    logger.debug(
        f"app_config.authentication.signing_secret_key={'*' * 8}{app_config.authentication.signing_secret_key[-4:]}"
        if app_config.authentication.signing_secret_key
        else "app_config.authentication.signing_secret_key=None"
    )
    logger.debug(
        f"app_config.authentication.refresh_signing_secret_key={'*' * 8}{app_config.authentication.refresh_signing_secret_key[-4:]}"
        if app_config.authentication.refresh_signing_secret_key
        else "app_config.authentication.refresh_signing_secret_key=None"
    )
    logger.debug(
        f"app_config.authentication.encryption_secret_key={'*' * 8}{app_config.authentication.encryption_secret_key[-4:]}"
        if app_config.authentication.encryption_secret_key
        else "app_config.authentication.encryption_secret_key=None"
    )
    logger.debug(f"{app_config.authentication.signing_algorithm=}")
    logger.debug(f"{app_config.authentication.encryption_algorithm=}")
    logger.debug(f"{app_config.authentication.access_token_expire_minutes=}")
    logger.debug(f"{app_config.authentication.refresh_token_expire_minutes=}")
    logger.debug(f"{app_config.security.allow_origins=}")
    logger.debug(f"{app_config.security.allow_credentials=}")
    logger.debug(f"{app_config.security.allow_methods=}")
    logger.debug(f"{app_config.security.allow_headers=}")
