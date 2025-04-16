import os
from pathlib import Path
from typing import Final


class Program:
    """General program information."""

    name: Final[str] = "Project SCARS Local Server"
    version: Final[tuple[int, int, int]] = (0, 3, 0)


class Database:
    """Default user credentials in the database."""

    default_user: Final[str] = "scars_localadmin"
    default_password: Final[str] = "SCARS_LocalAdmin0"


class Configuration:
    """Default configuration file information."""

    default_filepath: Final[Path] = Path(os.getcwd(), "config.json")
    default_encoding: Final[str] = "utf-8"
