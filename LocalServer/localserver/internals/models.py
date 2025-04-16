import uuid

from sqlmodel import Field, Relationship, SQLModel


class JWTToken(SQLModel):
    """A model representing a JWT token."""

    access_token: str
    token_type: str


class DecodedJWTToken(SQLModel):
    """A model representing a decoded JWT token."""

    id: str
    is_refresh_token: bool


class Role(SQLModel, table=True):
    """A model representing user roles in the system."""

    __tablename__: str = "roles"  # type: ignore

    id: int | None = Field(default=None, primary_key=True, index=True)
    description: str = Field(
        unique=True,
        description="Local Administrator, Principal, or Canteen Manager",
    )

    users: list["User"] = Relationship(back_populates="role")


class User(SQLModel, table=True):
    """A model representing a user in the system."""

    __tablename__: str = "users"  # type: ignore

    id: str = Field(
        default_factory=lambda: str(uuid.uuid4()),
        primary_key=True,
        index=True,
        description="The unique identifier for the user.",
    )

    username: str = Field(unique=True, description="The username of the user.")
    nameFirst: str | None = Field(
        default=None, description="The first name of the user."
    )
    nameMiddle: str | None = Field(
        default=None, description="The middle name of the user."
    )
    nameLast: str | None = Field(default=None, description="The last name of the user.")
    avatarUrl: str | None = Field(
        default=None,
        description="A link to the user's avatar within the file storage server.",
    )
    roleId: int = Field(
        description="The user's role in the system.", foreign_key="roles.id"
    )
    password: str = Field(
        description="The hashed password of the user.",
    )
    deactivated: bool = Field(
        default=False,
        description="Whether the user account is deactivated.",
    )

    role: Role = Relationship(back_populates="users")


class UserPublic(SQLModel):
    """A model representing a user without sensitive information."""

    id: str
    username: str
    nameFirst: str | None
    nameMiddle: str | None
    nameLast: str | None
    avatarUrl: str | None
    roleId: int
    deactivated: bool


class UserLoginRequest(SQLModel):
    """A model for requesting user logins."""

    username: str
    roleId: int
    password: str
