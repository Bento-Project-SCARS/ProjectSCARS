import os
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Any, override

##### Database Adapter Configurations #####


class DatabaseAdapterConfig(ABC):
    """Superclass for database adapter configurations."""

    @property
    @abstractmethod
    def info(self) -> dict[str, Any]:
        """Get the database adapter information."""

    @property
    @abstractmethod
    def sqlalchemy_uri(self) -> str:
        """Get the database URI for SQLAlchemy."""

    @property
    @abstractmethod
    def connect_args(self) -> dict[str, Any]:
        """Get the connection arguments for SQLAlchemy."""

    @abstractmethod
    def export(self) -> dict[str, Any]:
        """Export the configuration to a dictionary."""


class SQLiteDatabaseConfig(DatabaseAdapterConfig):
    """The SQLite database configuration."""

    def __init__(
        self,
        filepath: str | Path | None = None,
        connect_args: dict[str, Any] | None = None,
    ):
        """Configuration for a SQLite database engine.

        Args:
            filepath: The location of the SQLite database file.
            connect_args: The connection arguments to use.
        """

        default_connect_args: dict[str, Any] = {"check_same_thread": False}

        self.filepath: Path = Path(
            filepath or os.path.join(os.getcwd(), "centralserver.db")
        )

        self._connect_args = {**default_connect_args, **(connect_args or {})}

    @property
    @override
    def info(self) -> dict[str, Any]:
        return {
            "name": "SQLite",
            "filepath": str(self.filepath),
            "connect_args": self._connect_args,
            "sqlalchemy_uri": self.sqlalchemy_uri,
        }

    @property
    @override
    def sqlalchemy_uri(self) -> str:
        """Get the database URI for SQLAlchemy."""

        return f"sqlite:///{self.filepath.absolute()}"

    @property
    @override
    def connect_args(self) -> dict[str, Any]:
        return self._connect_args

    @override
    def export(self) -> dict[str, Any]:
        return {
            "filepath": str(self.filepath),
            "connect_args": self._connect_args,
        }


class MySQLDatabaseConfig(DatabaseAdapterConfig):
    """The MySQL database configuration."""

    def __init__(
        self,
        username: str | None = None,
        password: str | None = None,
        host: str | None = None,
        port: int | None = None,
        database: str | None = None,
        connect_args: dict[str, Any] | None = None,
    ):
        """Create a configuration object for the database.

        Args:
            username: The database username.
            password: The database password.
            host: The hostname of the database server.
            port: The port number of the database server.
            database: The database name.
            connect_args: The connection arguments to use.
        """

        default_connect_args: dict[str, Any] = {}

        self.username: str = username or "ProjectSCARS_DatabaseAdmin"
        self.password: str = password or "ProjectSCARS_mysql143"
        self.host: str = host or "localhost"
        self.port: int = port or 3306
        self.database: str = database or "ProjectSCARS_CentralServer"
        self._connect_args = {**default_connect_args, **(connect_args or {})}

    @property
    @override
    def info(self) -> dict[str, Any]:
        """Get the name of the database adapter."""
        return {
            "name": "MySQL",
            "username": self.username,
            "password_set": self.password != "",
            "host": self.host,
            "port": self.port,
            "database": self.database,
            "connect_args": self._connect_args,
            "sqlalchemy_uri": self.sqlalchemy_uri,
        }

    @property
    @override
    def sqlalchemy_uri(self) -> str:
        """Get the database URI for SQLAlchemy."""
        return "mysql+pymysql://{username}:{password}@{host}:{port}/{database}".format(  # pylint: disable=C0209
            username=self.username,
            password=self.password,
            host=self.host,
            port=self.port,
            database=self.database,
        )

    @property
    @override
    def connect_args(self) -> dict[str, Any]:
        return self._connect_args

    @override
    def export(self) -> dict[str, Any]:
        return {
            "username": self.username,
            "password": self.password,
            "host": self.host,
            "port": self.port,
            "database": self.database,
            "connect_args": self._connect_args,
        }


class PostgreSQLDatabaseConfig(DatabaseAdapterConfig):
    """The PostgreSQL database configuration."""

    def __init__(
        self,
        username: str | None = None,
        password: str | None = None,
        host: str | None = None,
        port: int | None = None,
        database: str | None = None,
        connect_args: dict[str, Any] | None = None,
    ):
        """Create a configuration object for the database.

        Args:
            username: The database username.
            password: The database password.
            host: The hostname of the database server.
            port: The port number of the database server.
            database: The database name.
            connect_args: The connection arguments to use.
        """

        default_connect_args: dict[str, Any] = {}

        self.username: str = username or "ProjectSCARS_DatabaseAdmin"
        self.password: str = password or "ProjectSCARS_postgres143"
        self.host: str = host or "localhost"
        self.port: int = port or 5432
        self.database: str = database or "ProjectSCARS_CentralServer"
        self._connect_args = {**default_connect_args, **(connect_args or {})}

    @property
    @override
    def info(self) -> dict[str, Any]:
        """Get the name of the database adapter."""
        return {
            "name": "PostgreSQL",
            "username": self.username,
            "password_set": self.password != "",
            "host": self.host,
            "port": self.port,
            "database": self.database,
            "connect_args": self._connect_args,
            "sqlalchemy_uri": self.sqlalchemy_uri,
        }

    @property
    @override
    def sqlalchemy_uri(self) -> str:
        """Get the database URI for SQLAlchemy."""

        proto = "postgresql+psycopg"
        return f"{proto}://{self.username}:{self.password}@{self.host}:{self.port}/{self.database}"

    @property
    @override
    def connect_args(self) -> dict[str, Any]:
        return self._connect_args

    @override
    def export(self) -> dict[str, Any]:
        return {
            "username": self.username,
            "password": self.password,
            "host": self.host,
            "port": self.port,
            "database": self.database,
            "connect_args": self._connect_args,
        }


##### Object Store Adapter Configurations #####


class ObjectStoreAdapterConfig(ABC):
    """Superclass for object store configurations."""

    def __init__(
        self,
        max_file_size: int | None = None,
        min_image_size: int | None = None,
        allowed_image_types: set[str] | None = None,
    ):
        """Adapter configuration for object store."""

        self.max_file_size: int = max_file_size or 2097152  # Default to 2 MB
        self.min_image_size: int = min_image_size or 256  # Minimum image size in pixels
        self.allowed_image_types: set[str] = allowed_image_types or {
            "png",
            "jpeg",
            "jpg",
            "webp",
        }

    @property
    @abstractmethod
    def info(self) -> dict[str, Any]:
        """Get the object store adapter information"""

    @abstractmethod
    def export(self) -> dict[str, Any]:
        """Export the configuration to a dictionary."""


class LocalObjectStoreAdapterConfig(ObjectStoreAdapterConfig):
    """Adapter configuration for local object store."""

    def __init__(
        self,
        max_file_size: int | None = None,
        min_image_size: int | None = None,
        allowed_image_types: set[str] | None = None,
        filepath: str | None = None,
    ) -> None:
        super().__init__(
            max_file_size=max_file_size,
            min_image_size=min_image_size,
            allowed_image_types=allowed_image_types,
        )
        self.filepath: Path = Path(filepath or os.path.join(os.getcwd(), "data"))

    @property
    @override
    def info(self) -> dict[str, Any]:
        """Get the object store adapter information."""

        return {
            "name": "Local",
            "filepath": str(self.filepath),
        }

    @override
    def export(self) -> dict[str, Any]:
        return {
            "max_file_size": self.max_file_size,
            "min_image_size": self.min_image_size,
            "allowed_image_types": list(self.allowed_image_types),
            "filepath": str(self.filepath),
        }


class MinIOObjectStoreAdapterConfig(ObjectStoreAdapterConfig):
    """Adapter configuration for MinIO."""

    def __init__(
        self,
        max_file_size: int | None = None,
        min_image_size: int | None = None,
        allowed_image_types: set[str] | None = None,
        access_key: str | None = None,
        secret_key: str | None = None,
        endpoint: str | None = None,
        secure: bool | None = None,
    ):
        """Configuration for MinIO object store adapter.

        Args:
            access_key: The access key for MinIO. (required)
            secret_key: The secret key for MinIO. (required)
            endpoint: The URL of the MinIO server. (default: localhost:9000)
            secure: Use secure (TLS) connection. (default: False)
        """

        super().__init__(
            max_file_size=max_file_size,
            min_image_size=min_image_size,
            allowed_image_types=allowed_image_types,
        )

        if access_key is None or secret_key is None:
            raise ValueError("The access key and secret key are required.")

        self.access_key: str = access_key
        self.secret_key: str = secret_key
        self.endpoint: str = endpoint or "localhost:9000"
        self.secure: bool = secure or False

    @property
    @override
    def info(self) -> dict[str, Any]:
        return {
            "name": "MinIO",
            "access_key_set": self.access_key != "",
            "secret_key_set": self.secret_key != "",
            "endpoint": self.endpoint,
            "secure": self.secure,
        }

    @override
    def export(self) -> dict[str, Any]:
        return {
            "max_file_size": self.max_file_size,
            "min_image_size": self.min_image_size,
            "allowed_image_types": list(self.allowed_image_types),
            "access_key": self.access_key,
            "secret_key": self.secret_key,
            "endpoint": self.endpoint,
            "secure": self.secure,
        }


class GarageObjectStoreAdapterConfig(ObjectStoreAdapterConfig):
    """Adapter configuration for Garage."""

    def __init__(
        self,
        max_file_size: int | None = None,
        min_image_size: int | None = None,
        allowed_image_types: set[str] | None = None,
        access_key: str | None = None,
        secret_key: str | None = None,
        endpoint: str | None = None,
        secure: bool | None = None,
    ):
        """Configuration for Garage object store adapter.

        Args:
            access_key: The access key for Garage. (required)
            secret_key: The secret key for Garage. (required)
            endpoint: The URL of the Garage server. (default: localhost:3900)
            secure: Use secure (TLS) connection. (default: False)
        """

        super().__init__(
            max_file_size=max_file_size,
            min_image_size=min_image_size,
            allowed_image_types=allowed_image_types,
        )

        if access_key is None or secret_key is None:
            raise ValueError("The access key and secret key are required.")

        self.access_key: str = access_key
        self.secret_key: str = secret_key
        self.endpoint: str = endpoint or "localhost:3900"
        self.secure: bool = secure or False

    @property
    @override
    def info(self) -> dict[str, Any]:
        return {
            "name": "Garage",
            "access_key_set": self.access_key != "",
            "secret_key_set": self.secret_key != "",
            "endpoint": self.endpoint,
            "secure": self.secure,
        }

    @override
    def export(self) -> dict[str, Any]:
        return {
            "max_file_size": self.max_file_size,
            "min_image_size": self.min_image_size,
            "allowed_image_types": list(self.allowed_image_types),
            "access_key": self.access_key,
            "secret_key": self.secret_key,
            "endpoint": self.endpoint,
            "secure": self.secure,
        }


###### OAuth Adapter Configurations #####


class OAuthAdapterConfig(ABC):
    """Superclass for OAuth adapter configurations."""

    @property
    @abstractmethod
    def info(self) -> dict[str, Any]:
        """Get the OAuth adapter information."""

    @abstractmethod
    def export(self) -> dict[str, Any]:
        """Export the configuration to a dictionary."""


class GoogleOAuthAdapterConfig(OAuthAdapterConfig):
    """Configuration for Google OAuth adapter."""

    def __init__(
        self,
        client_id: str | None = None,
        client_secret: str | None = None,
        redirect_uri: str | None = None,
    ):
        """Initialize the Google OAuth adapter configuration.

        Args:
            client_id: The client ID for Google OAuth.
            client_secret: The client secret for Google OAuth.
            redirect_uri: The redirect URI for Google OAuth.
        """

        if client_id is None or client_secret is None or redirect_uri is None:
            raise ValueError(
                "The client ID, client secret, and redirect URI are required."
            )

        self.client_id = client_id
        self.client_secret = client_secret
        self.redirect_uri = redirect_uri

    @property
    def info(self) -> dict[str, Any]:
        return {
            "name": "Google",
            "client_id": self.client_id,
            "client_secret_set": self.client_secret != "",
            "redirect_uri": self.redirect_uri,
        }

    def export(self) -> dict[str, Any]:
        """Export the configuration to a dictionary."""

        return {
            "client_id": self.client_id,
            "client_secret": self.client_secret,
            "redirect_uri": self.redirect_uri,
        }


class FacebookOAuthAdapterConfig(OAuthAdapterConfig):
    """Configuration for Facebook OAuth adapter."""

    def __init__(
        self,
        client_id: str | None = None,
        client_secret: str | None = None,
        redirect_uri: str | None = None,
    ):
        """Initialize the Facebook OAuth adapter configuration.

        Args:
            client_id: The client ID for Facebook OAuth.
            client_secret: The client secret for Facebook OAuth.
            redirect_uri: The redirect URI for Facebook OAuth.
        """

        if client_id is None or client_secret is None or redirect_uri is None:
            raise ValueError(
                "The client ID, client secret, and redirect URI are required."
            )

        self.client_id = client_id
        self.client_secret = client_secret
        self.redirect_uri = redirect_uri

    @property
    def info(self) -> dict[str, Any]:
        return {
            "name": "Facebook",
            "client_id": self.client_id,
            "client_secret_set": self.client_secret != "",
            "redirect_uri": self.redirect_uri,
        }

    def export(self) -> dict[str, Any]:
        """Export the configuration to a dictionary."""

        return {
            "client_id": self.client_id,
            "client_secret": self.client_secret,
            "redirect_uri": self.redirect_uri,
        }


class MicrosoftOAuthAdapterConfig(OAuthAdapterConfig):
    """Configuration for Microsoft OAuth adapter."""

    def __init__(
        self,
        client_id: str | None = None,
        client_secret: str | None = None,
        redirect_uri: str | None = None,
        tenant: str | None = None,
    ):
        """Initialize the Microsoft OAuth adapter configuration.

        Args:
            client_id: The client ID for Microsoft OAuth.
            client_secret: The client secret for Microsoft OAuth.
            redirect_uri: The redirect URI for Microsoft OAuth.
            tenant: The tenant ID for Microsoft OAuth (default: 'common').
        """

        if client_id is None or client_secret is None or redirect_uri is None:
            raise ValueError(
                "The client ID, client secret, and redirect URI are required."
            )

        self.client_id = client_id
        self.client_secret = client_secret
        self.redirect_uri = redirect_uri
        self.tenant = tenant or "common"

    @property
    def info(self) -> dict[str, Any]:
        return {
            "name": "Microsoft",
            "client_id": self.client_id,
            "client_secret_set": self.client_secret != "",
            "redirect_uri": self.redirect_uri,
            "tenant": self.tenant,
        }

    def export(self) -> dict[str, Any]:
        """Export the configuration to a dictionary."""

        return {
            "client_id": self.client_id,
            "client_secret": self.client_secret,
            "redirect_uri": self.redirect_uri,
            "tenant": self.tenant,
        }
