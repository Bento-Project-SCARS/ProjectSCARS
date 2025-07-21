import datetime
import uuid

from fastapi import HTTPException, UploadFile, status
from sqlmodel import Session, select

from centralserver.internals.adapters.object_store import (
    BucketNames,
    get_object_store_handler,
)
from centralserver.internals.config_handler import app_config
from centralserver.internals.logger import LoggerFactory
from centralserver.internals.models.object_store import BucketObject
from centralserver.internals.models.school import School, SchoolCreate
from centralserver.internals.websocket_manager import websocket_manager

logger = LoggerFactory().get_logger(__name__)


async def create_school(new_school: SchoolCreate, session: Session) -> School:
    """Create a new school in the database."""

    school = School(
        name=new_school.name,
        address=new_school.address,
        phone=new_school.phone,
        email=new_school.email,
        website=new_school.website,
        assignedNotedBy=new_school.assignedNotedBy,
    )
    session.add(school)
    session.commit()
    session.refresh(school)

    # Send WebSocket notification about new school creation
    try:
        await websocket_manager.broadcast_to_all(
            {
                "type": "school_management",
                "management_type": "school_created",
                "school_id": str(school.id),
                "data": {"school": school.model_dump()},
                "timestamp": int(datetime.datetime.now().timestamp()),
            }
        )
        logger.info(
            "Sent WebSocket school creation notification for school: %s", school.id
        )
    except Exception as e:
        logger.warning(
            "Failed to send WebSocket notification for school creation: %s", e
        )

    return school


async def clear_assigned_noted_by_for_user(user_id: str, session: Session) -> None:
    """Clear assignedNotedBy field from all schools where this user is assigned."""

    # Find all schools where this user is assigned as the approver
    statement = select(School).where(School.assignedNotedBy == user_id)
    schools_to_update = session.exec(statement).all()

    # Clear the assignedNotedBy field for each school
    for school in schools_to_update:
        logger.info(
            "Clearing assignedNotedBy for school '%s' (ID: %s) - user %s no longer in school",
            school.name,
            school.id,
            user_id,
        )
        school.assignedNotedBy = None
        school.lastModified = datetime.datetime.now(datetime.timezone.utc)
        session.add(school)

    if schools_to_update:
        session.commit()
        logger.info(
            "Cleared assignedNotedBy from %d schools for user %s",
            len(schools_to_update),
            user_id,
        )


async def get_school_logo(fn: str) -> BucketObject | None:
    """Fetch the school logo file from the object store."""

    handler = await get_object_store_handler(app_config.object_store)
    return await handler.get(BucketNames.SCHOOL_LOGOS, fn)


async def update_school_logo(
    school_id: int,
    img: UploadFile | None,
    session: Session,
) -> School:
    """Update the school's logo in the object store and database."""

    school = session.get(School, school_id)
    if not school:
        logger.error("School with id %s not found.", school_id)
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="School not found.",
        )

    handler = await get_object_store_handler(app_config.object_store)
    if img is None:
        logger.debug("Deleting logo for school_id: %s", school_id)
        if school.logoUrn is None:
            logger.warning("No logo to delete for school_id: %s", school_id)
            raise HTTPException(status_code=400, detail="No logo to delete.")

        try:
            await handler.delete(BucketNames.SCHOOL_LOGOS, school.logoUrn)

        except Exception as e:
            logger.error(
                "Failed to delete logo for school_id %s: %s (ignored)",
                school_id,
                str(e),
            )

        school.logoUrn = None

    else:
        if school.logoUrn is not None:
            logger.debug("Deleting old logo for school_id: %s", school_id)
            try:
                await handler.delete(BucketNames.SCHOOL_LOGOS, school.logoUrn)

            except Exception as e:
                logger.error(
                    "Failed to delete old logo for school_id %s: %s (ignored)",
                    school_id,
                    str(e),
                )

        logger.debug("Updating logo for school_id: %s", school_id)
        new_fn = uuid.uuid4().hex
        await handler.put(BucketNames.SCHOOL_LOGOS, new_fn, await img.read())
        school.logoUrn = new_fn

    school.lastModified = datetime.datetime.now(datetime.timezone.utc)

    session.add(school)
    session.commit()
    session.refresh(school)
    logger.info("School logo updated for school_id=%s", school_id)
    return school
