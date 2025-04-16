from typing import Generator

from sqlmodel import Session, SQLModel, create_engine, select

from centralserver import info
from centralserver.internals import permissions
from centralserver.internals.config_handler import app_config
from centralserver.internals.logger import LoggerFactory
from centralserver.internals.models import Role, User, UserLoginRequest
from centralserver.internals.user_handler import create_user

logger = LoggerFactory().get_logger(__name__)
engine = create_engine(
    (
        app_config.test_database.sqlalchemy_uri
        if app_config.debug.use_test_db
        else app_config.database.sqlalchemy_uri
    ),
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

    populated = False
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

    # Create default superintendent user
    with next(get_db_session()) as session:
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

    return populated
