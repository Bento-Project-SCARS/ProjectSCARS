#!/usr/bin/env python3

"""secret.py

Generate a secret key for the application and write
it to a specified json file (`config.json` by default).
"""

import argparse
import json
import secrets
import sys
from pathlib import Path

PLACEHOLDER_VALUE = "UPDATE_THIS_VALUE"
SECRET_KEYS: dict[str, tuple[str, int]] = {
    "sign": ("signing_secret_key", 32),
    "refresh": ("refresh_signing_secret_key", 32),
    "encrypt": ("encryption_secret_key", 16),
}


def main() -> int:
    """Main function to generate a secret key and write it to a JSON file."""

    parser = argparse.ArgumentParser(description="Generate a secret key.")

    parser.add_argument(
        "type",
        help=f"The type of secret key to generate: {','.join(SECRET_KEYS.keys())}.",
    )

    parser.add_argument(
        "-c",
        "--config",
        type=str,
        default="config.json",
        required=False,
        help="Path to the config file (default: config.json)",
    )

    args = parser.parse_args()
    config_path = Path(args.config)
    secret_key = SECRET_KEYS.get(args.type, None)

    if secret_key is None:
        print(
            f"Please specify the type of secret key. ({','.join(SECRET_KEYS.keys())})"
        )
        return 1

    if not config_path.exists():
        print("Path does not exist.")
        return 2

    try:
        with open(config_path, "r") as f:
            config = json.load(f)

    except json.JSONDecodeError:
        print(f"Error: {config_path} is not a valid JSON file.")
        return 3

    try:
        if (
            config["authentication"][secret_key[0]] != PLACEHOLDER_VALUE
            and len(config["authentication"][secret_key[0]]) >= secret_key[1]
        ):
            if (
                input(
                    f"Secret key already exists in {config_path}. Do you want to overwrite it? (y/n): "
                ).lower()
                != "y"
            ):
                print("Operation cancelled by user.")
                return 0

        config["authentication"][secret_key[0]] = secrets.token_hex(secret_key[1])
        with open(config_path, "w") as f:
            json.dump(config, f, indent=4)

        print(f"Secret key for {config_path} has been updated.")

    except KeyError:
        print(
            f"Error: {config_path} does not contain 'authentication.{secret_key[0]}'."
        )
        return 4

    except Exception as e:
        print(f"An unexpected error occurred: {e}")
        return 5

    return 0


if __name__ == "__main__":
    sys.exit(main())
