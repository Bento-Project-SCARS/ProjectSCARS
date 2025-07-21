import json
import time
import uuid

from fastapi import HTTPException, UploadFile, status
from sqlmodel import Session, select

from centralserver.internals.adapters.object_store import (
    BucketNames,
    get_object_store_handler,
    validate_attachment_file,
)
from centralserver.internals.config_handler import app_config
from centralserver.internals.logger import LoggerFactory
from centralserver.internals.models.reports.attachments import (
    AttachmentUploadResponse,
    ReportAttachment,
)

logger = LoggerFactory().get_logger(__name__)


async def upload_report_attachment(
    file: UploadFile, session: Session, description: str | None = None
) -> AttachmentUploadResponse:
    """Upload a report attachment to object storage.

    Args:
        file: The uploaded file.
        session: Database session.
        description: Optional description for the attachment.

    Returns:
        AttachmentUploadResponse with file details.

    Raises:
        HTTPException: If file upload fails.
    """
    if not file.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No filename provided.",
        )

    if not file.content_type:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No content type provided.",
        )

    try:
        # Read and validate the file
        file_content = await file.read()
        processed_file = await validate_attachment_file(file_content, file.filename)

        # Get object store manager
        object_store_manager = await get_object_store_handler(app_config.object_store)

        # Generate a unique filename using timestamp
        unique_filename = f"{uuid.uuid4()}-{time.strftime('%Y%m%d%H%M%S')}"

        # Upload to object storage
        bucket_object = await object_store_manager.put(
            BucketNames.ATTACHMENTS, unique_filename, processed_file
        )

        # Create database record (let SQLModel auto-generate the ID)
        attachment = ReportAttachment(
            filename=file.filename,
            file_urn=bucket_object.fn,
            file_type=file.content_type,
            file_size=len(processed_file),
            description=description,
        )

        session.add(attachment)
        session.commit()
        session.refresh(attachment)

        logger.info("Report attachment uploaded: %s", attachment.file_urn)

        return AttachmentUploadResponse(
            file_urn=attachment.file_urn,
            filename=attachment.filename,
            file_size=attachment.file_size,
            file_type=attachment.file_type,
        )

    except Exception as e:
        logger.error("Failed to upload report attachment: %s", str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to upload attachment: {str(e)}",
        ) from e


async def get_report_attachment(
    file_urn: str, session: Session
) -> tuple[bytes, str, str]:
    """Get a report attachment from object storage.

    Args:
        file_urn: The URN of the file to retrieve.
        session: Database session.

    Returns:
        Tuple of (file_content, filename, content_type).

    Raises:
        HTTPException: If file not found or retrieval fails.
    """
    # Get attachment from database
    statement = select(ReportAttachment).where(ReportAttachment.file_urn == file_urn)
    attachment = session.exec(statement).first()

    if not attachment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Attachment not found.",
        )

    try:
        # Get object store manager
        object_store_manager = await get_object_store_handler(app_config.object_store)

        # Get file from object storage
        bucket_object = await object_store_manager.get(
            BucketNames.ATTACHMENTS, file_urn
        )

        if not bucket_object:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="File not found in storage.",
            )

        return bucket_object.obj, attachment.filename, attachment.file_type

    except Exception as e:
        logger.error("Failed to retrieve report attachment: %s", str(e))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve attachment: {str(e)}",
        ) from e


async def get_report_attachment_metadata(
    file_urn: str, session: Session
) -> dict[str, str | int]:
    """Get metadata for a report attachment.

    Args:
        file_urn: The URN of the file to get metadata for.
        session: Database session.

    Returns:
        Dictionary with attachment metadata.

    Raises:
        HTTPException: If attachment not found.
    """
    # Get attachment from database
    statement = select(ReportAttachment).where(ReportAttachment.file_urn == file_urn)
    attachment = session.exec(statement).first()

    if not attachment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Attachment not found.",
        )

    return {
        "file_urn": str(attachment.file_urn),
        "filename": str(attachment.filename),
        "file_size": int(attachment.file_size),
        "file_type": str(attachment.file_type),
    }


def add_attachment_to_urns(current_urns: str | None, new_urn: str) -> str:
    """Add a new attachment URN to the existing list.

    Args:
        current_urns: Current JSON string of URNs.
        new_urn: New URN to add.

    Returns:
        Updated JSON string of URNs.
    """
    if current_urns:
        try:
            urns_list: list[str] = json.loads(current_urns)
        except json.JSONDecodeError:
            urns_list = []
    else:
        urns_list = []

    if new_urn not in urns_list:
        urns_list.append(new_urn)

    return json.dumps(urns_list)


def remove_attachment_from_urns(
    current_urns: str | None, urn_to_remove: str
) -> str | None:
    """Remove an attachment URN from the existing list.

    Args:
        current_urns: Current JSON string of URNs.
        urn_to_remove: URN to remove.

    Returns:
        Updated JSON string of URNs, or None if list is empty.
    """
    if not current_urns:
        return None

    try:
        urns_list: list[str] = json.loads(current_urns)
    except json.JSONDecodeError:
        return None

    if urn_to_remove in urns_list:
        urns_list.remove(urn_to_remove)

    return json.dumps(urns_list) if urns_list else None


def get_attachment_urns_list(urns_json: str | None) -> list[str]:
    """Convert JSON string of URNs to a list.

    Args:
        urns_json: JSON string of URNs.

    Returns:
        List of URNs.
    """
    if not urns_json:
        return []

    try:
        return json.loads(urns_json)
    except json.JSONDecodeError:
        return []


async def delete_report_attachment(file_urn: str, session: Session) -> None:
    """Delete a report attachment from both database and object storage.

    Args:
        file_urn: The URN of the file to delete.
        session: Database session.

    Raises:
        HTTPException: If file not found or deletion fails.
    """
    # Get attachment from database
    statement = select(ReportAttachment).where(ReportAttachment.file_urn == file_urn)
    attachment = session.exec(statement).first()

    if not attachment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Attachment not found.",
        )

    try:
        # Get object store manager
        object_store_manager = await get_object_store_handler(app_config.object_store)

        # Delete from object storage
        await object_store_manager.delete(BucketNames.ATTACHMENTS, file_urn)

        # Delete from database
        session.delete(attachment)
        session.commit()

        logger.info("Report attachment deleted: %s", file_urn)

    except Exception as e:
        logger.error("Failed to delete report attachment: %s", str(e))
        session.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete attachment: {str(e)}",
        ) from e
