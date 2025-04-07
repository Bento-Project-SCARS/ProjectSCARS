import json
import os
from pathlib import Path

from centralserver import info


class Debug:
    """The debugging configuration."""

    def __init__(self, enabled: bool | None = None, use_test_db: bool | None = None):
        """Create a configuration object for debugging.

        Args:
            enabled: If True, enable debugging mode.
            use_test_db: If True, use the test SQLite database instead of the production database.
        """

        self.enabled: bool = enabled or False
        self.use_test_db: bool = use_test_db or False


class Logging:
    """The logging configuration."""

    def __init__(
        self,
        filepath: str | None = None,
        max_bytes: int | None = None,
        backup_count: int | None = None,
        encoding: str | None = None,
        log_format: str | None = None,
        date_format: str | None = None,
    ):
        """Create a configuration object for logging.

        Args:
            filepath: The file path for the log file.
            max_bytes: The maximum size of the log file before it is rotated.
            backup_count: The maximum number of backup files to keep.
            encoding: The encoding of the log file.
            log_format: The format of the log messages.
            date_format: The format of the date in the log messages.
        """

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


class Database:
    """The database configuration."""

    def __init__(
        self,
        db_type: str | None = None,
        db_driver: str | None = None,
        username: str | None = None,
        password: str | None = None,
        host: str | None = None,
        port: int | None = None,
        database: str | None = None,
    ):
        """Create a configuration object for the database.

        Args:
            db_type: The type of the database.
            db_driver: The drive to use.
            username: The database username.
            password: The database password.
            host: The hostname of the database server.
            port: The port number of the database server.
            database: The database name.
        """

        self.db_type: str = db_type or "mysql"
        self.db_driver: str = db_driver or "pymysql"
        self.username: str = username or "root"
        self.password: str = password or ""
        self.host: str = host or "localhost"
        self.port: int = port or 3306
        self.database: str = database or "projectscars"

    @property
    def sqlalchemy_uri(self) -> str:
        """Get the database URI for SQLAlchemy."""
        return (
            "{type}+{driver}://{username}:{password}@{host}:{port}/{database}".format(
                type=self.db_type,
                driver=self.db_driver,
                username=self.username,
                password=self.password,
                host=self.host,
                port=self.port,
                database=self.database,
            )
        )


class TestDatabase:
    """The test database configuration."""

    def __init__(
        self,
        filepath: str | None = None,
    ):
        """Create a configuration object for the test database.

        Args:
            filepath: The location of the SQLite database file.
        """

        self.filepath: str = filepath or os.path.join(
            os.getcwd(), "tests", "data", "test.db"
        )

    @property
    def sqlalchemy_uri(self) -> str:
        """Get the database URI for SQLAlchemy."""

        return f"sqlite:///{self.filepath}"


class Authentication:
    """The authentication configuration."""

    def __init__(
        self,
        signing_secret_key: str | None = None,
        refresh_signing_secret_key: str | None = None,
        encryption_secret_key: str | None = None,
        signing_algorithm: str | None = None,
        encryption_algorithm: str | None = None,
        encoding: str | None = None,
        access_token_expire_minutes: int | None = None,
        refresh_token_expire_minutes: int | None = None,
    ):
        """Create a configuration object for authentication.

        Args:
            signing_secret_key: The secret key used for signing. (Required)
            refresh_signing_secret_key: The secret key used for signing refresh tokens. (Required)
            encryption_secret_key: The secret key used for encryption. (Required)
            signing_algorithm: The algorithm to use for hashing.
            encryption_algorithm: The algorithm to use for encrypting.
            encoding: The encoding to use when decoding encrypted data.
            access_token_expire_minutes: How long the access token is valid in minutes.
            refresh_token_expire_minutes: How long the refresh token is valid in minutes.
        """

        if (
            signing_secret_key is None
            or refresh_signing_secret_key is None
            or encryption_secret_key is None
        ):
            raise ValueError(
                "Signing or encryption secret key is empty in configuration file."
            )

        self.signing_secret_key: str = signing_secret_key
        self.refresh_signing_secret_key: str = refresh_signing_secret_key
        self.encryption_secret_key: str = encryption_secret_key
        self.signing_algorithm: str = signing_algorithm or "HS256"
        self.encryption_algorithm: str = encryption_algorithm or "A256GCM"
        self.encoding: str = encoding or "utf-8"
        self.access_token_expire_minutes: int = access_token_expire_minutes or 30
        self.refresh_token_expire_minutes: int = refresh_token_expire_minutes or 10080


class Security:
    def __init__(
        self,
        allow_origins: list[str] | None = None,
        allow_credentials: bool | None = None,
        allow_methods: list[str] | None = None,
        allow_headers: list[str] | None = None,
    ):
        """The security configuration.

        Args:
            allow_origins: Which origins are allowed to access the API.
            allow_credentials: Whether to allow credentials to be sent.
            allow_methods: Which methods are allowed.
            allow_headers: Which headers are allowed.
        """

        self.allow_origins: list[str] = allow_origins or ["*"]
        self.allow_credentials: bool = allow_credentials or True
        self.allow_methods: list[str] = allow_methods or ["*"]
        self.allow_headers: list[str] = allow_headers or ["*"]


class AppConfig:
    """The main configuration object for the application."""

    def __init__(
        self,
        debug: Debug | None = None,
        logging: Logging | None = None,
        database: Database | None = None,
        test_database: TestDatabase | None = None,
        authentication: Authentication | None = None,
        security: Security | None = None,
    ):
        """Create a configuration object for the application.

        Args:
            debug: Debugging configuration.
            logging: Logging configuration.
            database: Database configuration.
            test_database: Test database configuration.
            authentication: Authentication configuration.
            security: Security configuration.
        """

        self.debug: Debug = debug or Debug()
        self.logging: Logging = logging or Logging()
        self.database: Database = database or Database()
        self.test_database: TestDatabase = test_database or TestDatabase()
        self.authentication: Authentication = authentication or Authentication()
        self.security: Security = security or Security()


def read_config_file(
    fp: str | Path,
    enc: str = info.Configuration.default_encoding,
) -> AppConfig:
    """Update the application's configuration from a JSON file.

    Args:
        fp: The file path to the JSON configuration file.
        enc: The encoding of the file.

    Returns:
        A new AppConfig object with the updated configuration.
    """

    with open(fp, "r", encoding=enc) as f:
        config = json.load(f)

        debug_config = config.get("debug", {})
        logging_config = config.get("logging", {})
        database_config = config.get("database", {})
        test_database_config = config.get("test_database", {})
        authentication_config = config.get("authentication", {})
        security_config = config.get("security", {})

        return AppConfig(
            debug=Debug(
                enabled=debug_config.get("enabled", None),
                use_test_db=debug_config.get("use_test_db", None),
            ),
            logging=Logging(
                filepath=logging_config.get("filepath", None),
                max_bytes=logging_config.get("max_bytes", None),
                backup_count=logging_config.get("backup_count", None),
                encoding=logging_config.get("encoding", None),
                log_format=logging_config.get("log_format", None),
                date_format=logging_config.get("date_format", None),
            ),
            database=Database(
                db_type=database_config.get("db_type", None),
                db_driver=database_config.get("db_driver", None),
                username=database_config.get("username", None),
                password=database_config.get("password", None),
                host=database_config.get("host", None),
                port=database_config.get("port", None),
                database=database_config.get("database", None),
            ),
            test_database=TestDatabase(
                filepath=test_database_config.get("filepath", None),
            ),
            authentication=Authentication(
                signing_secret_key=authentication_config.get(
                    "signing_secret_key", None
                ),
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
                encoding=authentication_config.get("encoding", None),
                access_token_expire_minutes=authentication_config.get(
                    "access_token_expire_minutes", None
                ),
                refresh_token_expire_minutes=authentication_config.get(
                    "refresh_token_expire_minutes", None
                ),
            ),
            security=Security(
                allow_origins=security_config.get("allow_origins", None),
                allow_credentials=security_config.get("allow_credentials", None),
                allow_methods=security_config.get("allow_methods", None),
                allow_headers=security_config.get("allow_headers", None),
            ),
        )


# The global configuration object for the application.
app_config = read_config_file(
    os.getenv("CENTRAL_SERVER_CONFIG_FILE", info.Configuration.default_filepath)
)
