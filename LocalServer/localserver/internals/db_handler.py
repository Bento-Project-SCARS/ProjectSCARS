from typing import Generator

from sqlmodel import Session, SQLModel, create_engine, select

from localserver import info
from localserver.internals import permissions
from localserver.internals.config_handler import app_config
from localserver.internals.logger import LoggerFactory
from localserver.internals.models import Role, User, UserLoginRequest
from localserver.internals.user_handler import create_user

logger = LoggerFactory().get_logger(__name__)
engine = create_engine(
    app_config.database.sqlalchemy_uri,
    connect_args={"check_same_thread": False},
)


def get_db_session() -> Generator[Session, None, None]:
    """Get a new database session.

    Yields:
        A new SQLModel session.
    """

    logger.debug("Creating a new database session")
    with Session(engine) as session:
        yield session


def populate_db() -> bool:
    """Populate the database with tables."""

    populated: bool = False
    logger.warning("Creating database tables")
    SQLModel.metadata.create_all(bind=engine)

    # Create records for user roles
    with next(get_db_session()) as session:
        if not session.exec(select(Role)).all():
            logger.warning("Creating default roles")
            logger.debug("Roles: %s", permissions.ROLES)
            session.add_all(permissions.ROLES)
            session.commit()
            populated = True

        else:
            logger.debug("roles are already populated, skipping...")

        # Create default local admin user
        if not session.exec(select(User)).first():
            logger.warning("Creating default user")
            create_user(
                UserLoginRequest(
                    username=info.Database.default_user,
                    roleId=1,
                    password=info.Database.default_password,
                ),
                session,
            )
            populated = True

        else:
            logger.debug("there is already a user, skipping...")

    return populated
