import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import NoResultFound
from sqlmodel import Session, select

from centralserver.internals.auth_handler import (
    get_user,
    verify_access_token,
    verify_user_permission,
)
from centralserver.internals.db_handler import get_db_session
from centralserver.internals.logger import LoggerFactory
from centralserver.internals.models.reports.monthly_report import (
    MonthlyReport,
    ReportStatus,
)
from centralserver.internals.models.reports.status_change_request import (
    StatusChangeRequest,
    RoleBasedTransitions,
)
from centralserver.internals.models.reports.report_status_manager import (
    ReportStatusManager,
)
from centralserver.internals.models.token import DecodedJWTToken

logger = LoggerFactory().get_logger(__name__)
router = APIRouter(prefix="/monthly")
logged_in_dep = Annotated[DecodedJWTToken, Depends(verify_access_token)]


@router.get("/{school_id}")
async def get_all_school_monthly_reports(
    token: logged_in_dep,
    session: Annotated[Session, Depends(get_db_session)],
    school_id: int,
    limit: int = 10,
    offset: int = 0,
) -> list[MonthlyReport]:
    """Get all monthly reports of a school.

    Args:
        token: The decoded JWT token of the logged-in user.
        session: The database session.
        school_id: The ID of the school to get reports for.
        limit: The maximum number of reports to return.
        offset: The offset for pagination.

    Returns:
        A list of monthly reports for the specified school that the user can view based on their role.
    """

    user = await get_user(token.id, session, by_id=True)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found.",
        )

    required_permission = (
        "reports:local:read" if user.schoolId == school_id else "reports:global:read"
    )
    if not await verify_user_permission(required_permission, session, token):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to view monthly reports.",
        )

    # Get the statuses that this user role can view
    viewable_statuses = ReportStatusManager.get_viewable_reports_filter(user)

    logger.debug(
        "user `%s` (role %s) requesting monthly reports of school %s. Viewable statuses: %s",
        token.id,
        user.roleId,
        school_id,
        [status.value for status in viewable_statuses],
    )

    # Get all reports first, then filter by viewable statuses
    all_reports = session.exec(
        select(MonthlyReport)
        .where(MonthlyReport.submittedBySchool == school_id)
        .offset(offset)
        .limit(limit)
    ).all()

    # Filter reports by viewable statuses
    if viewable_statuses:
        monthly_reports = [
            report for report in all_reports if report.reportStatus in viewable_statuses
        ]
    else:
        # If user has no viewable statuses, return empty list
        monthly_reports = []

    return monthly_reports


@router.get("/{school_id}/{year}/{month}")
async def get_school_monthly_report(
    token: logged_in_dep,
    session: Annotated[Session, Depends(get_db_session)],
    school_id: int,
    year: int,
    month: int,
) -> MonthlyReport | None:
    """Get monthly reports of a school for a specific month.

    Args:
        token: The decoded JWT token of the logged-in user.
        session: The database session.
        school_id: The ID of the school to get reports for.
        year: The year of the report.
        month: The month of the report.

    Returns:
        The monthly report for the specified school, year, and month, or None if not found
        or if the user doesn't have permission to view it based on their role.
    """

    user = await get_user(token.id, session, by_id=True)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found.",
        )

    required_permission = (
        "reports:local:read" if user.schoolId == school_id else "reports:global:read"
    )
    if not await verify_user_permission(required_permission, session, token):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to view monthly reports.",
        )

    logger.debug(
        "user `%s` requesting monthly reports of school %s for %s-%s.",
        token.id,
        school_id,
        year,
        month,
    )

    try:
        selected_monthly_report = session.exec(
            select(MonthlyReport).where(
                MonthlyReport.id == datetime.date(year=year, month=month, day=1),
                MonthlyReport.submittedBySchool == school_id,
            )
        ).one()

        # Check if user can view this specific report based on its status
        if not ReportStatusManager.check_view_permission(user, selected_monthly_report):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"You do not have permission to view reports with '{selected_monthly_report.reportStatus.value}' status.",
            )

        return selected_monthly_report

    except NoResultFound as e:
        logger.warning(
            "Monthly report not found for school %s for %s-%s",
            school_id,
            year,
            month,
        )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Monthly report not found.",
        ) from e


@router.patch("/{school_id}/{year}/{month}")
async def create_school_monthly_report(
    token: logged_in_dep,
    session: Annotated[Session, Depends(get_db_session)],
    school_id: int,
    year: int,
    month: int,
    noted_by: str | None = None,
) -> MonthlyReport:
    """Create or update a monthly report of a school for a specific month.

    Args:
        token: The decoded JWT token of the logged-in user.
        session: The database session.
        school_id: The ID of the school to create or update the report for.
        year: The year of the report.
        month: The month of the report.
        noted_by: The user who noted the report (optional).

    Returns:
        The created or updated monthly report.
    """

    user = await get_user(token.id, session, by_id=True)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found.",
        )

    # Check if user can create reports based on role
    if not ReportStatusManager.check_create_permission(user):
        role_description = RoleBasedTransitions.get_role_description(user.roleId)
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"As a {role_description}, you do not have permission to create reports. Only Canteen Managers can create reports.",
        )

    # Additional permission check for school access
    required_permission = (
        "reports:local:write" if user.schoolId == school_id else "reports:global:write"
    )
    logger.debug("Required permission for user %s: %s", token.id, required_permission)

    if not await verify_user_permission(required_permission, session, token):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to create monthly reports for this school.",
        )

    logger.debug(
        "user `%s` creating or updating monthly report of school %s for %s-%s.",
        token.id,
        school_id,
        year,
        month,
    )
    selected_monthly_report = session.exec(
        select(MonthlyReport).where(
            MonthlyReport.id == datetime.date(year=year, month=month, day=1),
            MonthlyReport.submittedBySchool == school_id,
        )
    ).one_or_none()

    if selected_monthly_report is None:
        selected_monthly_report = MonthlyReport(
            id=datetime.date(year=year, month=month, day=1),
            name=f"Monthly Report for {datetime.date(year=year, month=month, day=1).strftime('%B %Y')}",
            submittedBySchool=school_id,
            reportStatus=ReportStatus.DRAFT,
            preparedBy=user.id,
            notedBy=noted_by,
        )
    else:
        # Check if the existing report can be edited
        if selected_monthly_report.reportStatus not in [
            ReportStatus.DRAFT,
            ReportStatus.REJECTED,
        ]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot edit report with status '{selected_monthly_report.reportStatus.value}'. Reports can only be edited when they are in 'draft' or 'rejected' status.",
            )

        # Update the existing report
        if noted_by is not None:
            selected_monthly_report.notedBy = noted_by
        selected_monthly_report.lastModified = datetime.datetime.now(
            datetime.timezone.utc
        )

    session.add(selected_monthly_report)
    session.commit()
    session.refresh(selected_monthly_report)
    return selected_monthly_report


@router.delete("/{school_id}/{year}/{month}")
async def delete_school_monthly_report(
    token: logged_in_dep,
    session: Annotated[Session, Depends(get_db_session)],
    school_id: int,
    year: int,
    month: int,
) -> None:
    """Delete a monthly report for a school for a specific month."""

    user = await get_user(token.id, session, by_id=True)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found.",
        )

    required_permission = (
        "reports:local:write" if user.schoolId == school_id else "reports:global:write"
    )
    if not await verify_user_permission(required_permission, session, token):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to delete monthly reports.",
        )

    logger.debug(
        "user `%s` deleting monthly report of school %s for %s-%s.",
        token.id,
        school_id,
        year,
        month,
    )
    selected_monthly_report = session.exec(
        select(MonthlyReport).where(
            MonthlyReport.id == datetime.date(year=year, month=month, day=1),
            MonthlyReport.submittedBySchool == school_id,
        )
    ).one_or_none()
    if selected_monthly_report is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Monthly report not found.",
        )

    session.delete(selected_monthly_report)
    session.commit()


@router.patch("/{school_id}/{year}/{month}/status")
async def change_monthly_report_status(
    token: logged_in_dep,
    session: Annotated[Session, Depends(get_db_session)],
    school_id: int,
    year: int,
    month: int,
    status_change: StatusChangeRequest,
) -> MonthlyReport:
    """Change the status of a monthly report based on user role and permissions.

    Args:
        token: The decoded JWT token of the logged-in user.
        session: The database session.
        school_id: The ID of the school the report belongs to.
        year: The year of the report.
        month: The month of the report.
        status_change: The status change request containing new status and optional comments.

    Returns:
        The updated monthly report.

    Raises:
        HTTPException: If user doesn't have permission, report not found, or invalid transition.
    """

    user = await get_user(token.id, session, by_id=True)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found.",
        )

    # Check basic permission to read reports
    required_permission = (
        "reports:local:read" if user.schoolId == school_id else "reports:global:read"
    )
    if not await verify_user_permission(required_permission, session, token):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to access this report.",
        )

    logger.debug(
        "user `%s` (role %s) attempting to change status of monthly report for school %s, %s-%s to %s",
        token.id,
        user.roleId,
        school_id,
        year,
        month,
        status_change.new_status.value,
    )  # Get the report
    try:
        report = session.exec(
            select(MonthlyReport).where(
                MonthlyReport.id == datetime.date(year=year, month=month, day=1),
                MonthlyReport.submittedBySchool == school_id,
            )
        ).one()
    except NoResultFound as e:
        logger.warning(
            "Monthly report not found for school %s for %s-%s",
            school_id,
            year,
            month,
        )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Monthly report not found.",
        ) from e

    # Use the generic status manager to change the status
    return ReportStatusManager.change_report_status(
        session=session,
        user=user,
        report=report,
        status_change=status_change,
        report_type="monthly",
        school_id=school_id,
        year=year,
        month=month,
    )


@router.get("/{school_id}/{year}/{month}/valid-transitions")
async def get_valid_status_transitions(
    token: logged_in_dep,
    session: Annotated[Session, Depends(get_db_session)],
    school_id: int,
    year: int,
    month: int,
) -> dict[str, str | list[str]]:
    """Get the valid status transitions for a monthly report based on user role.

    Args:
        token: The decoded JWT token of the logged-in user.
        session: The database session.
        school_id: The ID of the school the report belongs to.
        year: The year of the report.
        month: The month of the report.

    Returns:
        A dictionary containing the current status and valid transitions.
    """

    user = await get_user(token.id, session, by_id=True)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found.",
        )

    # Check basic permission to read reports
    required_permission = (
        "reports:local:read" if user.schoolId == school_id else "reports:global:read"
    )
    if not await verify_user_permission(required_permission, session, token):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to access this report.",
        )

    # Get the report
    try:
        report = session.exec(
            select(MonthlyReport).where(
                MonthlyReport.id == datetime.date(year=year, month=month, day=1),
                MonthlyReport.submittedBySchool == school_id,
            )
        ).one()
    except NoResultFound as e:
        logger.warning(
            "Monthly report not found for school %s for %s-%s",
            school_id,
            year,
            month,
        )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Monthly report not found.",
        ) from e  # Get valid transitions for this user role and current status
    return ReportStatusManager.get_valid_transitions_response(user, report)
