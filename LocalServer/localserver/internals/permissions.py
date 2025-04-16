from typing import Final

from localserver.internals.models import Role

ROLES: Final[tuple[Role, ...]] = (
    Role(id=1, description="Local Administrator"),
    Role(id=2, description="Principal"),
    Role(id=3, description="Canteen Manager"),
)

PERMISSIONS: Final[dict[str, str]] = {
    "users:create": "Create new users of any role.",
    "users:modify": "Modify any user's information.",
    "users:read": "View all users' information.",
}

ROLE_PERMISSIONS: Final[dict[int, list[str]]] = {
    1: [  # Local Administrator
        "users:create",
        "users:modify",
        "users:read",
    ],
    2: [],  # Principal
    3: [],  # Canteen Manager
}
