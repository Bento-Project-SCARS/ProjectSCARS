import json
import os
from pathlib import Path
from typing import Any

from centralserver import info
from centralserver.internals.adapters.config import (
    DatabaseAdapterConfig,
    GarageObjectStoreAdapterConfig,
    GoogleOAuthAdapterConfig,
    LocalObjectStoreAdapterConfig,
    MinIOObjectStoreAdapterConfig,
    MySQLDatabaseConfig,
    ObjectStoreAdapterConfig,
    PostgreSQLDatabaseConfig,
    SQLiteDatabaseConfig,
)
from centralserver.internals.models.oauth import OAuthConfigs


class Debug:
    """The debugging configuration."""

    __exportable_fields = ["enabled", "logenv_optout", "show_sql", "hot_reload"]

    def __init__(
        self,
        enabled: bool | None = None,
        logenv_optout: bool | None = None,
        show_sql: bool | None = None,
        hot_reload: bool | None = None,
    ):
        """Create a configuration object for debugging.

        Args:
            enabled: If True, enable debugging mode.
            logenv_optout: If True, disable logging environment variables.
            show_sql: If True, print executed SQL statements.
            hot_reload: If True, enable hot reloading of the server.
        """

        self.enabled: bool = enabled or False
        self.logenv_optout: bool = logenv_optout or False
        self.show_sql: bool = show_sql or False
        self.hot_reload: bool = hot_reload or False

    def export(self) -> dict[str, Any]:
        """Export the debugging configuration as a dictionary."""

        return {
            field: getattr(self, field)
            for field in Debug.__exportable_fields
            if hasattr(self, field)
        }


class Connection:
    """The connection configuration."""

    __exportable_fields = ["host", "port", "base_url", "gemini_api_key"]

    def __init__(
        self,
        host: str | None = None,
        port: int | None = None,
        base_url: str | None = None,
        gemini_api_key: str | None = None,
    ):
        """Create a configuration object for the connection.

        Args:
            host: Where to listen for incoming connections.
            port: Which port to listen on for incoming connections.
            base_url: The base URL of the web client.
            host: Where to listen for incoming connections.
            port: Which port to listen on for incoming connections.
            base_url: The base URL of the web client.
            gemini_api_key: The API key for Google Gemini API. (Optional)
        """

        self.host: str = host or "localhost"
        self.port: int = port or 8081
        self.base_url: str = base_url or "http://localhost:8080"
        self.gemini_api_key: str | None = gemini_api_key

    def export(self) -> dict[str, Any]:
        """Export the connection configuration as a dictionary."""

        return {
            field: getattr(self, field)
            for field in Connection.__exportable_fields
            if hasattr(self, field)
        }


class Logging:
    """The logging configuration."""

    __exportable_fields = [
        "file_logging_enabled",
        "filepath",
        "max_bytes",
        "backup_count",
        "encoding",
        "log_format",
        "date_format",
    ]

    def __init__(
        self,
        file_logging_enabled: bool | None = None,
        filepath: str | None = None,
        max_bytes: int | None = None,
        backup_count: int | None = None,
        encoding: str | None = None,
        log_format: str | None = None,
        date_format: str | None = None,
    ):
        """Create a configuration object for logging.

        Args:
            file_logging_enabled: Whether to enable logging to file. (Default: True)
            filepath: The file path for the log file.
            max_bytes: The maximum size of the log file before it is rotated.
            backup_count: The maximum number of backup files to keep.
            encoding: The encoding of the log file.
            log_format: The format of the log messages.
            date_format: The format of the date in the log messages.
        """

        self.file_logging_enabled: bool = (
            file_logging_enabled if file_logging_enabled is not None else True
        )
        self.filepath: str = filepath or os.path.join(
            os.getcwd(), "logs", "centralserver-{0}.log"
        )
        self.max_bytes: int = max_bytes or 10485760  # 10 MB
        self.backup_count: int = backup_count or 5
        self.encoding: str = encoding or "utf-8"
        self.log_format: str = (
            log_format or "%(asctime)s:%(name)s:%(levelname)s:%(message)s"
        )
        self.date_format: str = date_format or "%d-%m-%y_%H-%M-%S"

    def export(self) -> dict[str, Any]:
        """Export the logging configuration as a dictionary."""

        return {
            field: getattr(self, field)
            for field in Logging.__exportable_fields
            if hasattr(self, field)
        }


class Authentication:
    """The authentication configuration."""

    __exportable_fields = [
        "signing_secret_key",
        "refresh_signing_secret_key",
        "encryption_secret_key",
        "signing_algorithm",
        "encryption_algorithm",
        "encrypt_jwt",
        "encoding",
        "access_token_expire_minutes",
        "refresh_token_expire_minutes",
        "recovery_token_expire_minutes",
        "otp_nonce_expire_minutes",
    ]

    def __init__(
        self,
        signing_secret_key: str | None = None,
        refresh_signing_secret_key: str | None = None,
        encryption_secret_key: str | None = None,
        signing_algorithm: str | None = None,
        encryption_algorithm: str | None = None,
        encrypt_jwt: bool | None = None,
        encoding: str | None = None,
        access_token_expire_minutes: int | None = None,
        refresh_token_expire_minutes: int | None = None,
        recovery_token_expire_minutes: int | None = None,
        otp_nonce_expire_minutes: int | None = None,
        oauth: OAuthConfigs | None = None,
    ):
        """Create a configuration object for authentication.

        Args:
            signing_secret_key: The secret key used for signing. (Required)
            refresh_signing_secret_key: The secret key used for signing refresh tokens. (Required)
            encryption_secret_key: The secret key used for encryption. (Required)
            signing_algorithm: The algorithm to use for hashing.
            encryption_algorithm: The algorithm to use for encrypting.
            encrypt_jwt: Whether to encrypt JWT tokens. (Default: True)
            encoding: The encoding to use when decoding encrypted data.
            access_token_expire_minutes: How long the access token is valid in minutes.
            refresh_token_expire_minutes: How long the refresh token is valid in minutes.
            recovery_token_expire_minutes: How long the recovery token is valid in minutes.
            otp_nonce_expire_minutes: How long the OTP nonce is valid in minutes.
            oauth: OAuth configurations, if any. (Default: None)
        """

        if (
            signing_secret_key is None
            or refresh_signing_secret_key is None
            or encryption_secret_key is None
        ):
            raise ValueError(
                "Signing or encryption secret key is empty in configuration file."
            )

        if signing_secret_key == "UPDATE_THIS_VALUE" or len(signing_secret_key) != 64:
            raise ValueError(
                "Signing secret key is not valid. Please update the configuration file."
            )

        if (
            refresh_signing_secret_key == "UPDATE_THIS_VALUE"
            or len(refresh_signing_secret_key) != 64
        ):
            raise ValueError(
                "Refresh signing secret key is not valid. Please update the configuration file."
            )

        if (
            encryption_secret_key == "UPDATE_THIS_VALUE"
            or len(encryption_secret_key) != 32
        ):
            raise ValueError(
                "Encryption secret key is not valid. Please update the configuration file."
            )

        if oauth is None:
            raise ValueError(
                "OAuth configurations are required in the authentication configuration."
            )

        self.signing_secret_key: str = signing_secret_key
        self.refresh_signing_secret_key: str = refresh_signing_secret_key
        self.encryption_secret_key: str = encryption_secret_key
        self.signing_algorithm: str = signing_algorithm or "HS256"
        self.encryption_algorithm: str = encryption_algorithm or "A256GCM"
        self.encrypt_jwt: bool = encrypt_jwt if encrypt_jwt is not None else True
        self.encoding: str = encoding or "utf-8"
        self.access_token_expire_minutes: int = access_token_expire_minutes or 30
        self.refresh_token_expire_minutes: int = refresh_token_expire_minutes or 10080
        self.recovery_token_expire_minutes: int = recovery_token_expire_minutes or 15
        self.otp_nonce_expire_minutes: int = otp_nonce_expire_minutes or 5
        self.oauth: OAuthConfigs = oauth

    def export(self) -> dict[str, Any]:
        """Export the authentication configuration as a dictionary."""

        export = {
            field: getattr(self, field)
            for field in Authentication.__exportable_fields
            if hasattr(self, field)
        }
        export["oauth"] = {
            "google": self.oauth.google.export() if self.oauth.google else None,
            "microsoft": (
                self.oauth.microsoft.export() if self.oauth.microsoft else None
            ),
            "facebook": self.oauth.facebook.export() if self.oauth.facebook else None,
        }

        return export


class Security:
    """The security configuration."""

    __exportable_fields = [
        "allow_origins",
        "allow_credentials",
        "allow_methods",
        "allow_headers",
        "failed_login_notify_attempts",
        "failed_login_lockout_attempts",
        "failed_login_lockout_minutes",
    ]

    def __init__(
        self,
        allow_origins: list[str] | None = None,
        allow_credentials: bool | None = None,
        allow_methods: list[str] | None = None,
        allow_headers: list[str] | None = None,
        failed_login_notify_attempts: int | None = None,
        failed_login_lockout_attempts: int | None = None,
        failed_login_lockout_minutes: int | None = None,
    ):
        """The security configuration.

        Args:
            allow_origins: Which origins are allowed to access the API.
            allow_credentials: Whether to allow credentials to be sent.
            allow_methods: Which methods are allowed.
            allow_headers: Which headers are allowed.
            failed_login_notify_attempts: Number of failed login attempts before
                                           notifying the user.
            failed_login_lockout_attempts: Number of failed login attempts
                                           before locking the user out.
            failed_login_lockout_minutes: Duration for which the user is locked
                                           out after too many failed login attempts.
        """

        self.allow_origins: list[str] = allow_origins or ["*"]
        self.allow_credentials: bool = allow_credentials or True
        self.allow_methods: list[str] = allow_methods or ["*"]
        self.allow_headers: list[str] = allow_headers or ["*"]
        self.failed_login_notify_attempts: int = failed_login_notify_attempts or 3
        self.failed_login_lockout_attempts: int = failed_login_lockout_attempts or 5
        self.failed_login_lockout_minutes: int = failed_login_lockout_minutes or 15

    def export(self) -> dict[str, Any]:
        """Export the security configuration as a dictionary."""

        return {
            field: getattr(self, field)
            for field in Security.__exportable_fields
            if hasattr(self, field)
        }


class Mailing:
    """The mailing configuration."""

    __exportable_fields = [
        "enabled",
        "server",
        "port",
        "from_address",
        "username",
        "password",
        "templates_dir",
        "templates_encoding",
    ]

    def __init__(
        self,
        enabled: bool | None = None,
        server: str | None = None,
        port: int | None = None,
        from_address: str | None = None,
        username: str | None = None,
        password: str | None = None,
        templates_dir: str | None = None,
        templates_encoding: str | None = None,
    ) -> None:
        """The mailing configuration.

        Args:
            enabled: Whether mailing is enabled. (Default: False)
            server: The SMTP server to use for sending emails.
            port: The port of the SMTP server.
            from_address: The email address to use as the sender.
            username: The username for the SMTP server.
            password: The password for the SMTP server.
            templates_dir: The directory containing email templates. (Default: "./templates/mail/")
            templates_encoding: The encoding of the email templates. (Default: "utf-8")
        """

        if enabled and (not server or not from_address or not username or not password):
            raise ValueError("Mailing is enabled, but required values are not set.")

        self.enabled: bool = enabled or False
        self.server: str = server  # type: ignore
        self.port: int = port or 587
        self.from_address: str = from_address  # type: ignore
        self.username: str = username  # type: ignore
        self.password: str = password  # type: ignore
        self.templates_dir: str = templates_dir or os.path.join(
            os.getcwd(), "templates", "mail"
        )
        self.templates_encoding: str = templates_encoding or "utf-8"

    def export(self) -> dict[str, Any]:
        """Export the mailing configuration as a dictionary."""

        return {
            field: getattr(self, field)
            for field in Mailing.__exportable_fields
            if hasattr(self, field)
        }


class AppConfig:
    """The main configuration object for the application."""

    def __init__(
        self,
        fp: str | Path,
        enc: str,
        debug: Debug | None = None,
        connection: Connection | None = None,
        logging: Logging | None = None,
        database: DatabaseAdapterConfig | None = None,
        object_store: ObjectStoreAdapterConfig | None = None,
        authentication: Authentication | None = None,
        security: Security | None = None,
        mailing: Mailing | None = None,
    ):
        """Create a configuration object for the application.

        Args:
            fp: The file path to the configuration file.
            enc: The encoding of the configuration file.
            debug: Debugging configuration.
            connection: Connection configuration.
            logging: Logging configuration.
            database: Database configuration.
            object_store: Object store configuration.
            test_database: Test database configuration.
            authentication: Authentication configuration.
            security: Security configuration.
            mailing: Mailing configuration.
        """

        self.__filepath: str | Path = fp
        self.__enc: str = enc
        self.run_internal: bool = False  # Indicates if app is running using __main__
        self.debug: Debug = debug or Debug()
        self.connection: Connection = connection or Connection()
        self.logging: Logging = logging or Logging()
        # By default, use SQLite for the database.
        self.database: DatabaseAdapterConfig = database or SQLiteDatabaseConfig()
        # By default, store files locally.
        self.object_store: ObjectStoreAdapterConfig = (
            object_store or LocalObjectStoreAdapterConfig()
        )
        self.authentication: Authentication = authentication or Authentication()
        self.security: Security = security or Security()
        self.mailing: Mailing = mailing or Mailing()

    @property
    def filepath(self) -> str | Path:
        """Get the file path to the configuration file."""

        return self.__filepath

    @property
    def encoding(self) -> str:
        """Get the encoding of the configuration file."""

        return self.__enc

    @property
    def values(self) -> dict[str, Any]:
        return {
            "debug": self.debug.export(),
            "connection": self.connection.export(),
            "logging": self.logging.export(),
            "database": self.database.export() if self.database else None,
            "object_store": self.object_store.export() if self.object_store else None,
            "authentication": self.authentication.export(),
            "security": self.security.export(),
            "mailing": self.mailing.export(),
        }

    def save(self) -> None:
        """Save the current configuration to the file.

        Args:
            enc: The encoding to use when saving the file.
        """

        with open(self.filepath, "w", encoding=self.__enc) as f:
            json.dump(self.values, f, indent=4)


def read_config(
    fp: str | Path,
    enc: str,
    config: dict[str, Any],
    host: str | None = None,
    port: int | None = None,
    hot_reload: bool | None = None,
) -> AppConfig:
    """Update the application's configuration from a JSON file.

    Args:
        fp: The file path to the JSON configuration file.
        enc: The encoding of the file.
        config: The configuration file contents.
        host: The host to listen on for incoming connections. (Optional)
        port: The port to listen on for incoming connections. (Optional)
        hot_reload: Enables hot reloading of the server. (Optional)

    Returns:
        A new AppConfig object.
    """

    debug_config = config.get("debug", {})
    connection_config = config.get("connection", {})
    logging_config = config.get("logging", {})
    authentication_config = config.get("authentication", {})
    security_config = config.get("security", {})
    mailing_config = config.get("mailing", {})

    # Determine database type and create the appropriate config object
    database: dict[str, Any] = config.get("database", {})
    database_type: None | str = database.get("type", None)
    database_config: dict[str, Any] = database.get("config", {})
    final_db_config: DatabaseAdapterConfig | None = None
    match database_type:
        case "sqlite":
            final_db_config = SQLiteDatabaseConfig(
                filepath=database_config.get("filepath", None),
                connect_args=database_config.get("connect_args", None),
            )

        case "mysql":
            final_db_config = MySQLDatabaseConfig(
                username=database_config.get("username", None),
                password=database_config.get("password", None),
                host=database_config.get("host", None),
                port=database_config.get("port", None),
                database=database_config.get("database", None),
                connect_args=database_config.get("connect_args", None),
            )

        case "postgres":
            final_db_config = PostgreSQLDatabaseConfig(
                username=database_config.get("username", None),
                password=database_config.get("password", None),
                host=database_config.get("host", None),
                port=database_config.get("port", None),
                database=database_config.get("database", None),
                connect_args=database_config.get("connect_args", None),
            )

        case None:  # Skip if no database is specified
            pass

        case _:  # Error if the database type is not supported
            raise ValueError(f"Unsupported {database_type} database type.")

    # Determine object store type and create the appropriate config object
    object_store: dict[str, Any] = config.get("object_store", {})
    object_store_type: None | str = object_store.get("type", None)
    object_store_config: dict[str, Any] = object_store.get("config", {})
    final_object_store_config: ObjectStoreAdapterConfig | None = None
    match object_store_type:
        case "local":
            final_object_store_config = LocalObjectStoreAdapterConfig(
                max_file_size=object_store_config.get("max_file_size", None),
                min_image_size=object_store_config.get("min_image_size", None),
                allowed_image_types=object_store_config.get(
                    "allowed_image_types", None
                ),
                filepath=object_store_config.get("filepath", None),
            )

        case "minio":
            final_object_store_config = MinIOObjectStoreAdapterConfig(
                max_file_size=object_store_config.get("max_file_size", None),
                min_image_size=object_store_config.get("min_image_size", None),
                allowed_image_types=object_store_config.get(
                    "allowed_image_types", None
                ),
                access_key=object_store_config.get("access_key", None),
                secret_key=object_store_config.get("secret_key", None),
                endpoint=object_store_config.get("endpoint", None),
                secure=object_store_config.get("secure", None),
            )

        case "garage":
            final_object_store_config = GarageObjectStoreAdapterConfig(
                max_file_size=object_store_config.get("max_file_size", None),
                min_image_size=object_store_config.get("min_image_size", None),
                allowed_image_types=object_store_config.get(
                    "allowed_image_types", None
                ),
                access_key=object_store_config.get("access_key", None),
                secret_key=object_store_config.get("secret_key", None),
                endpoint=object_store_config.get("endpoint", None),
                secure=object_store_config.get("secure", None),
            )

        case None:  # Skip if no object store is specified
            pass

        case _:  # Error if the object store type is not supported
            raise ValueError(f"Unsupported {object_store_type} object store type.")

    oauth_config: dict[str, dict[str, str]] | None = authentication_config.get(
        "oauth", None
    )
    oauth_google_config: dict[str, str] | None = (
        oauth_config.get("google", None) if oauth_config else None
    )
    oauth_google_configs = (
        GoogleOAuthAdapterConfig(
            client_id=oauth_google_config.get("client_id", None),
            client_secret=oauth_google_config.get("client_secret", None),
            redirect_uri=oauth_google_config.get("redirect_uri", None),
        )
        if oauth_google_config
        else None
    )
    oauth_configs = OAuthConfigs(
        google=oauth_google_configs,
    )

    return AppConfig(
        fp,
        enc,
        debug=Debug(
            enabled=debug_config.get("enabled", None),
            logenv_optout=debug_config.get("logenv_optout", None),
            show_sql=debug_config.get("show_sql", None),
            hot_reload=hot_reload or debug_config.get("hot_reload", None),
        ),
        connection=Connection(
            host=host or connection_config.get("host", None),
            port=port or connection_config.get("port", None),
            base_url=connection_config.get("base_url", None),
            gemini_api_key=connection_config.get("gemini_api_key", None),
        ),
        logging=Logging(
            file_logging_enabled=logging_config.get("file_logging_enabled", None),
            filepath=logging_config.get("filepath", None),
            max_bytes=logging_config.get("max_bytes", None),
            backup_count=logging_config.get("backup_count", None),
            encoding=logging_config.get("encoding", None),
            log_format=logging_config.get("log_format", None),
            date_format=logging_config.get("date_format", None),
        ),
        database=final_db_config,
        object_store=final_object_store_config,
        authentication=Authentication(
            signing_secret_key=authentication_config.get("signing_secret_key", None),
            refresh_signing_secret_key=authentication_config.get(
                "refresh_signing_secret_key", None
            ),
            encryption_secret_key=authentication_config.get(
                "encryption_secret_key", None
            ),
            signing_algorithm=authentication_config.get("signing_algorithm", None),
            encryption_algorithm=authentication_config.get(
                "encryption_algorithm", None
            ),
            encrypt_jwt=authentication_config.get("encrypt_jwt", None),
            encoding=authentication_config.get("encoding", None),
            access_token_expire_minutes=authentication_config.get(
                "access_token_expire_minutes", None
            ),
            refresh_token_expire_minutes=authentication_config.get(
                "refresh_token_expire_minutes", None
            ),
            recovery_token_expire_minutes=authentication_config.get(
                "recovery_token_expire_minutes", None
            ),
            otp_nonce_expire_minutes=authentication_config.get(
                "otp_nonce_expire_minutes", None
            ),
            oauth=oauth_configs,
        ),
        security=Security(
            allow_origins=security_config.get("allow_origins", None),
            allow_credentials=security_config.get("allow_credentials", None),
            allow_methods=security_config.get("allow_methods", None),
            allow_headers=security_config.get("allow_headers", None),
            failed_login_lockout_attempts=security_config.get(
                "failed_login_lockout_attempts", None
            ),
            failed_login_notify_attempts=security_config.get(
                "failed_login_notify_attempts", None
            ),
            failed_login_lockout_minutes=security_config.get(
                "failed_login_lockout_minutes", None
            ),
        ),
        mailing=Mailing(
            enabled=mailing_config.get("enabled", None),
            server=mailing_config.get("server", None),
            port=mailing_config.get("port", None),
            from_address=mailing_config.get("from_address", None),
            username=mailing_config.get("username", None),
            password=mailing_config.get("password", None),
            templates_dir=mailing_config.get("templates_dir", None),
            templates_encoding=mailing_config.get("templates_encoding", None),
        ),
    )


def __read_config_file(
    fp: str | Path,
    enc: str = info.Configuration.default_encoding,
    host: str | None = None,
    port: int | None = None,
    hot_reload: bool | None = None,
) -> AppConfig:
    """Update the application's configuration from a JSON file.

    Args:
        fp: The file path to the JSON configuration file.
        enc: The encoding of the file.
        host: The host to listen on for incoming connections. (Optional)
        port: The port to listen on for incoming connections. (Optional)
        hot_reload: Enables hot reloading of the server.

    Returns:
        A new AppConfig object with the updated configuration.
    """

    with open(fp, "r", encoding=enc) as f:
        return read_config(
            fp, enc, json.load(f), host=host, port=port, hot_reload=hot_reload
        )


# The global configuration object for the application.
__port = os.getenv("CENTRAL_SERVER_PORT", None)
if __port is not None:
    __port = int(__port)

app_config = __read_config_file(
    os.getenv("CENTRAL_SERVER_CONFIG_FILE", str(info.Configuration.default_filepath)),
    os.getenv("CENTRAL_SERVER_CONFIG_ENCODING", info.Configuration.default_encoding),
    os.getenv("CENTRAL_SERVER_HOST", None),
    __port,
    os.getenv("CENTRAL_SERVER_HOT_RELOAD", "false").lower() == "true",
)
