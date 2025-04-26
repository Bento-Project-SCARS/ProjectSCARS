import json
from typing import Final

from centralserver.internals import config_handler
from centralserver.internals.adapters import config

DEFAULT_VALUE: Final[str] = "UPDATE_THIS_VALUE"
VALID_SIGNING_KEY: Final[str] = (
    "b5eeca9520e2ada4ad96e1981d5c8f5515685201bfc2a19ad1fbee12ef8ba5d2"
)
VALID_REFRESH_SIGNING_KEY: Final[str] = (
    "cc20b62bb11859aa2b4140fc1641f11659bdbe8860faa8c9629be006d165a26a"
)
VALID_ENCRYPTION_KEY: Final[str] = "74969957b5a005133b3f1ab7dbbcedcf"


def test_config_authentication_all_keys_unpopulated() -> None:
    """Check the behavior of Authentication() when all secret keys are unpopulated."""

    try:
        _ = config_handler.Authentication(
            signing_secret_key=DEFAULT_VALUE,
            refresh_signing_secret_key=DEFAULT_VALUE,
            encryption_secret_key=DEFAULT_VALUE,
        )

    except ValueError:
        pass  # Expected

    else:
        raise AssertionError("Expected ValueError, but no exception was raised.")


def test_config_authentication_signing_key_unpopulated() -> None:
    """Check the behavior of Authentication() when signing secret key is unpopulated."""

    try:
        _ = config_handler.Authentication(
            signing_secret_key=DEFAULT_VALUE,
            refresh_signing_secret_key=VALID_REFRESH_SIGNING_KEY,
            encryption_secret_key=VALID_ENCRYPTION_KEY,
        )

    except ValueError:
        pass  # Expected

    else:
        raise AssertionError("Expected ValueError, but no exception was raised.")


def test_config_authentication_refresh_signing_key_unpopulated() -> None:
    """Check the behavior of Authentication() when refresh signing secret key is unpopulated."""

    try:
        _ = config_handler.Authentication(
            signing_secret_key=VALID_SIGNING_KEY,
            refresh_signing_secret_key=DEFAULT_VALUE,
            encryption_secret_key=VALID_ENCRYPTION_KEY,
        )

    except ValueError:
        pass  # Expected

    else:
        raise AssertionError("Expected ValueError, but no exception was raised.")


def test_config_authentication_encryption_key_unpopulated() -> None:
    """Check the behavior of Authentication() when encryption secret key is unpopulated."""

    try:
        _ = config_handler.Authentication(
            signing_secret_key=VALID_SIGNING_KEY,
            refresh_signing_secret_key=VALID_REFRESH_SIGNING_KEY,
            encryption_secret_key=DEFAULT_VALUE,
        )

    except ValueError:
        pass  # Expected

    else:
        raise AssertionError("Expected ValueError, but no exception was raised.")


def test_config_authentication_signing_key_none() -> None:
    """Check the behavior of Authentication() when signing secret key is empty."""

    try:
        _ = config_handler.Authentication(
            refresh_signing_secret_key=VALID_REFRESH_SIGNING_KEY,
            encryption_secret_key=VALID_ENCRYPTION_KEY,
        )

    except ValueError:
        pass  # Expected

    else:
        raise AssertionError("Expected ValueError, but no exception was raised.")


def test_config_authentication_refresh_signing_key_none() -> None:
    """Check the behavior of Authentication() when refresh signing secret key is empty."""

    try:
        _ = config_handler.Authentication(
            signing_secret_key=VALID_SIGNING_KEY,
            encryption_secret_key=VALID_ENCRYPTION_KEY,
        )

    except ValueError:
        pass  # Expected

    else:
        raise AssertionError("Expected ValueError, but no exception was raised.")


def test_config_authentication_encryption_key_none() -> None:
    """Check the behavior of Authentication() when encryption secret key is empty."""

    try:
        _ = config_handler.Authentication(
            signing_secret_key=VALID_SIGNING_KEY,
            refresh_signing_secret_key=VALID_REFRESH_SIGNING_KEY,
        )

    except ValueError:
        pass  # Expected

    else:
        raise AssertionError("Expected ValueError, but no exception was raised.")


def test_config_authentication_signing_key_invalid() -> None:
    """Check the behavior of Authentication() when signing secret key is invalid."""

    keys = [
        VALID_SIGNING_KEY[:-1],
        VALID_SIGNING_KEY + "1",
    ]

    for key in keys:
        try:
            _ = config_handler.Authentication(
                signing_secret_key=key,
                refresh_signing_secret_key=VALID_REFRESH_SIGNING_KEY,
                encryption_secret_key=VALID_ENCRYPTION_KEY,
            )

        except ValueError:
            pass  # Expected

        else:
            raise AssertionError("Expected ValueError, but no exception was raised.")


def test_config_authentication_refresh_signing_key_invalid() -> None:
    """Check the behavior of Authentication() when refresh signing secret key is invalid."""

    keys = [
        VALID_REFRESH_SIGNING_KEY[:-1],
        VALID_REFRESH_SIGNING_KEY + "1",
    ]

    for key in keys:
        try:
            _ = config_handler.Authentication(
                signing_secret_key=VALID_SIGNING_KEY,
                refresh_signing_secret_key=key,
                encryption_secret_key=VALID_ENCRYPTION_KEY,
            )

        except ValueError:
            pass  # Expected

        else:
            raise AssertionError("Expected ValueError, but no exception was raised.")


def test_config_authentication_encryption_key_invalid() -> None:
    """Check the behavior of Authentication() when encryption secret key is invalid."""

    keys = [
        VALID_ENCRYPTION_KEY[:-1],
        VALID_ENCRYPTION_KEY + "1",
    ]

    for key in keys:
        try:
            _ = config_handler.Authentication(
                signing_secret_key=VALID_SIGNING_KEY,
                refresh_signing_secret_key=VALID_REFRESH_SIGNING_KEY,
                encryption_secret_key=key,
            )

        except ValueError:
            pass  # Expected

        else:
            raise AssertionError("Expected ValueError, but no exception was raised.")


def test_config_authentication_all_keys_valid() -> None:
    """Check the behavior of Authentication() when all secret keys are valid."""

    _ = config_handler.Authentication(
        signing_secret_key=VALID_SIGNING_KEY,
        refresh_signing_secret_key=VALID_REFRESH_SIGNING_KEY,
        encryption_secret_key=VALID_ENCRYPTION_KEY,
    )


def test_configreader_sqlite_local():
    with open("./config.pytest.json", "r") as f:
        confdata = json.load(f)

    confdata["database"]["type"] = "sqlite"
    confdata["database"]["config"] = {}  # Use default config
    confdata["object_store"]["type"] = "local"
    confdata["object_store"]["config"] = {}  # Use default config

    appconfig = config_handler.read_config(confdata)
    assert isinstance(appconfig.database, config.SQLiteDatabaseConfig)
    assert isinstance(appconfig.object_store, config.LocalObjectStoreAdapterConfig)


def test_configreader_sqlite_minio():
    with open("./config.pytest.json", "r") as f:
        confdata = json.load(f)

    confdata["database"]["type"] = "sqlite"
    confdata["database"]["config"] = {}  # Use default config
    confdata["object_store"]["type"] = "minio"
    confdata["object_store"]["config"] = {
        "access_key": "bf51e071508becb67bf2263c9f60403f",
        "secret_key": "533af9863ea0252a5607bb397dbc3fc1",
    }

    appconfig = config_handler.read_config(confdata)
    assert isinstance(appconfig.database, config.SQLiteDatabaseConfig)
    assert isinstance(appconfig.object_store, config.MinIOObjectStoreAdapterConfig)


def test_configreader_mysql_local():
    with open("./config.pytest.json", "r") as f:
        confdata = json.load(f)

    confdata["database"]["type"] = "mysql"
    confdata["database"]["config"] = {}  # Use default config
    confdata["object_store"]["type"] = "local"
    confdata["object_store"]["config"] = {}  # Use default config

    appconfig = config_handler.read_config(confdata)
    assert isinstance(appconfig.database, config.MySQLDatabaseConfig)
    assert isinstance(appconfig.object_store, config.LocalObjectStoreAdapterConfig)


def test_configreader_mysql_minio():
    with open("./config.pytest.json", "r") as f:
        confdata = json.load(f)

    confdata["database"]["type"] = "mysql"
    confdata["database"]["config"] = {}  # Use default config
    confdata["object_store"]["type"] = "minio"
    confdata["object_store"]["config"] = {
        "access_key": "bf51e071508becb67bf2263c9f60403f",
        "secret_key": "533af9863ea0252a5607bb397dbc3fc1",
    }

    appconfig = config_handler.read_config(confdata)
    assert isinstance(appconfig.database, config.MySQLDatabaseConfig)
    assert isinstance(appconfig.object_store, config.MinIOObjectStoreAdapterConfig)


def test_configreader_no_objectstore():
    with open("./config.pytest.json", "r") as f:
        confdata = json.load(f)

    confdata["object_store"]["type"] = None  # Will use default object store

    appconfig = config_handler.read_config(confdata)
    assert isinstance(appconfig.database, config.SQLiteDatabaseConfig)
    assert isinstance(appconfig.object_store, config.LocalObjectStoreAdapterConfig)


def test_configreader_no_database():
    with open("./config.pytest.json", "r") as f:
        confdata = json.load(f)

    confdata["database"]["type"] = None  # Will use default database

    appconfig = config_handler.read_config(confdata)
    assert isinstance(appconfig.database, config.SQLiteDatabaseConfig)
    assert isinstance(appconfig.object_store, config.LocalObjectStoreAdapterConfig)


def test_configreader_invalid_database():
    with open("./config.pytest.json", "r") as f:
        confdata = json.load(f)

    confdata["database"]["type"] = "invalid database type"

    try:
        _ = config_handler.read_config(confdata)

    except ValueError as e:
        assert str(e) == "Unsupported invalid database type database type."
        return

    raise AssertionError("Expected ValueError, but no exception was raised.")


def test_configreader_invalid_objectstore():
    with open("./config.pytest.json", "r") as f:
        confdata = json.load(f)

    confdata["object_store"]["type"] = "invalid object store type"

    try:
        _ = config_handler.read_config(confdata)

    except ValueError as e:
        assert str(e) == "Unsupported invalid object store type object store type."
        return

    raise AssertionError("Expected ValueError, but no exception was raised.")
