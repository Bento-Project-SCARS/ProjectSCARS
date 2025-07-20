from typing import Generator

from fastapi import BackgroundTasks
from sqlmodel import Session, SQLModel, create_engine, select

from centralserver import info
from centralserver.internals import models, permissions
from centralserver.internals.config_handler import app_config
from centralserver.internals.logger import LoggerFactory
from centralserver.internals.user_handler import create_user

logger = LoggerFactory().get_logger(__name__)
engine = create_engine(
    app_config.database.sqlalchemy_uri,
    connect_args=app_config.database.connect_args,
    echo=app_config.debug.show_sql,
)


def get_db_session() -> Generator[Session, None, None]:
    """Get a new database session.

    Yields:
        A new SQLModel session.
    """

    logger.debug("Creating a new database session")
    with Session(engine) as session:
        yield session


async def populate_db() -> bool:
    """Populate the database with tables."""

    populated = False
    logger.warning("Creating database tables")
    SQLModel.metadata.create_all(bind=engine)

    # Create records for user roles
    with next(get_db_session()) as session:
        if not session.exec(select(models.role.Role)).all():
            logger.warning("Creating default roles")
            logger.debug("Roles: %s", permissions.DEFAULT_ROLES)
            session.add_all(
                [
                    models.role.Role(
                        id=role.id,
                        description=role.description,
                        modifiable=role.modifiable,
                    )
                    for role in permissions.DEFAULT_ROLES
                ]
            )
            session.commit()
            populated = True

    # Create default superintendent user
    with next(get_db_session()) as session:
        if not session.exec(select(models.user.User)).first():
            logger.warning("Creating default user")
            await create_user(
                models.user.UserCreate(
                    username=info.Database.default_user,
                    roleId=1,
                    password=info.Database.default_password,
                ),
                session,
                BackgroundTasks(),
                send_notification=False,
            )
            populated = True

    return populated
