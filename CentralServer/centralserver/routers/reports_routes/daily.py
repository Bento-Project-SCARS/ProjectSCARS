# pylint: disable=C0302
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
from centralserver.internals.models.reports.daily_financial_report import (
    DailyEntryData,
    DailyFinancialReport,
    DailyFinancialReportEntry,
)
from centralserver.internals.models.reports.monthly_report import (
    MonthlyReport,
    ReportStatus,
)
from centralserver.internals.models.reports.status_change_request import (
    StatusChangeRequest,
)
from centralserver.internals.models.reports.report_status_manager import (
    ReportStatusManager,
)
from centralserver.internals.models.token import DecodedJWTToken

logger = LoggerFactory().get_logger(__name__)
router = APIRouter(prefix="/daily")
logged_in_dep = Annotated[DecodedJWTToken, Depends(verify_access_token)]


@router.get("/{school_id}/{year}/{month}")
async def get_school_daily_report(
    token: logged_in_dep,
    session: Annotated[Session, Depends(get_db_session)],
    school_id: int,
    year: int,
    month: int,
) -> DailyFinancialReport:
    """Get daily reports of a school for a specific month.

    Args:
        token: The decoded JWT token of the logged-in user.
        session: The database session.
        school_id: The ID of the school to get reports for.
        year: The year of the report.
        month: The month of the report.

    Returns:
        The daily financial report for the specified school, year, and month, or None if not found.
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
    logger.debug("Required permission for user %s: %s", token.id, required_permission)
    if not await verify_user_permission(required_permission, session, token):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to view daily reports.",
        )

    logger.debug(
        "user `%s` requesting daily reports of school %s for %s-%s.",
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
        if selected_monthly_report.daily_financial_report is not None:
            return selected_monthly_report.daily_financial_report

        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Daily financial report not found.",
        )

    except NoResultFound as e:
        logger.warning(
            "Daily financial report not found for school %s for %s-%s",
            school_id,
            year,
            month,
        )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Daily financial report not found.",
        ) from e


@router.get("/{school_id}/{year}/{month}/entries")
async def get_school_daily_report_entries(
    token: logged_in_dep,
    session: Annotated[Session, Depends(get_db_session)],
    school_id: int,
    year: int,
    month: int,
) -> list[DailyFinancialReportEntry]:
    """Get all daily report entries for a school for a specific month.

    Args:
        token: The decoded JWT token of the logged-in user.
        session: The database session.
        school_id: The ID of the school to get reports for.
        year: The year of the report.
        month: The month of the report.

    Returns:
        A list of daily financial report entries for the specified school, year, and month.
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
            detail="You do not have permission to view daily report entries.",
        )

    logger.debug(
        "user `%s` requesting daily report entries of school %s for %s-%s.",
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

    except NoResultFound as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Monthly report not found.",
        ) from e

    daily_report = selected_monthly_report.daily_financial_report
    if daily_report is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Daily financial report not found.",
        )

    return list(daily_report.entries)


@router.patch("/{school_id}/{year}/{month}")
async def create_school_daily_report(
    token: logged_in_dep,
    session: Annotated[Session, Depends(get_db_session)],
    school_id: int,
    year: int,
    month: int,
    noted_by: str | None = None,
) -> DailyFinancialReport:
    """Create or update a daily report of a school for a specific month.

    Args:
        token: The decoded JWT token of the logged-in user.
        session: The database session.
        school_id: The ID of the school to create or update the report for.
        year: The year of the report.
        month: The month of the report.
        noted_by: The user who noted the report (optional).

    Returns:
        The created or updated daily financial report.
    """

    user = await get_user(token.id, session, by_id=True)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found.",
        )

    required_permission = (
        "reports:local:write" if user.schoolId == school_id else "reports:global:write"
    )
    logger.debug("Required permission for user %s: %s", token.id, required_permission)
    if not await verify_user_permission(required_permission, session, token):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to create daily reports.",
        )

    logger.debug(
        "user `%s` creating or updating daily report of school %s for %s-%s.",
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
            name=f"Daily Report for {datetime.date(year=year, month=month, day=1).strftime('%B %Y')}",
            submittedBySchool=school_id,
            reportStatus=ReportStatus.DRAFT,
            preparedBy=user.id,
            notedBy=noted_by,
        )
        session.add(selected_monthly_report)

    # Check if daily report already exists
    existing_daily_report = session.exec(
        select(DailyFinancialReport).where(
            DailyFinancialReport.parent == selected_monthly_report.id
        )
    ).one_or_none()

    if existing_daily_report:
        # Update existing daily report
        existing_daily_report.notedBy = noted_by
        session.add(existing_daily_report)
        session.commit()
        session.refresh(existing_daily_report)
        return existing_daily_report
    else:
        # Create new daily report
        new_daily_report = DailyFinancialReport(
            parent=selected_monthly_report.id,
            reportStatus=ReportStatus.DRAFT,
            preparedBy=user.id,
            notedBy=noted_by,
        )
        session.add(new_daily_report)
        session.commit()
        session.refresh(new_daily_report)
        return new_daily_report


@router.patch("/{school_id}/{year}/{month}/entries/{day}")
async def update_school_daily_report_entry_legacy(
    token: logged_in_dep,
    session: Annotated[Session, Depends(get_db_session)],
    school_id: int,
    year: int,
    month: int,
    day: int,
    sales: float,
    purchases: float,
) -> DailyFinancialReport:
    """Update daily report entries for a school for a specific month (legacy endpoint).

    This is the legacy endpoint that returns the full report. Use PUT /{school_id}/{year}/{month}/entries/{day} instead.

    Args:
        token: The decoded JWT token of the logged-in user.
        session: The database session.
        school_id: The ID of the school to update the report for.
        year: The year of the report.
        month: The month of the report.
        day: The day of the report entry to update.
        sales: The total sales for the day.
        purchases: The total purchases for the day.

    Returns:
        The updated daily financial report.
    """

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
            detail="You do not have permission to update daily report entries.",
        )

    logger.debug(
        "user `%s` updating daily report entries of school %s for %s-%s for day %s with sales %s and purchases %s.",
        token.id,
        school_id,
        year,
        month,
        day,
        sales,
        purchases,
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

    daily_report = session.exec(
        select(DailyFinancialReport).where(
            DailyFinancialReport.parent == selected_monthly_report.id
        )
    ).one_or_none()
    if daily_report is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Daily financial report not found.",
        )

    entry = session.exec(
        select(DailyFinancialReportEntry).where(
            DailyFinancialReportEntry.parent == daily_report.parent,
            DailyFinancialReportEntry.day == day,
        )
    ).one_or_none()
    if entry is None:
        entry = DailyFinancialReportEntry(
            parent=daily_report.parent,
            day=day,
            sales=sales,
            purchases=purchases,
        )
        session.add(entry)
    else:
        entry.sales = sales
        entry.purchases = purchases

    session.commit()
    session.refresh(entry)
    session.refresh(daily_report)
    session.refresh(selected_monthly_report)
    return daily_report


@router.delete("/{school_id}/{year}/{month}")
async def delete_school_daily_report(
    token: logged_in_dep,
    session: Annotated[Session, Depends(get_db_session)],
    school_id: int,
    year: int,
    month: int,
) -> None:
    """Delete a daily report for a school for a specific month."""

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
            detail="You do not have permission to delete daily reports.",
        )

    logger.debug(
        "user `%s` deleting daily report of school %s for %s-%s.",
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

    daily_report = session.exec(
        select(DailyFinancialReport).where(
            DailyFinancialReport.parent == selected_monthly_report.id
        )
    ).one_or_none()
    if daily_report is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Daily financial report not found.",
        )

    session.delete(daily_report)
    session.commit()

    return None


@router.get("/{school_id}")
async def get_school_daily_financial_reports(
    token: logged_in_dep,
    session: Annotated[Session, Depends(get_db_session)],
    school_id: int,
    offset: int = 0,
    limit: int = 10,
) -> list[DailyFinancialReport]:
    """Get daily financial reports of a specific school.

    Args:
        token: The decoded JWT token of the logged-in user.
        session: The database session.
        school_id: The ID of the school to get reports for.
        offset: The offset for pagination.
        limit: The maximum number of reports to return.

    Returns:
        A list of daily financial reports for the specified school.
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
            detail="You do not have permission to view daily financial reports.",
        )

    logger.debug(
        "user `%s` requesting daily financial reports of school %s with offset %s and limit %s.",
        token.id,
        school_id,
        offset,
        limit,
    )
    return list(
        session.exec(
            select(DailyFinancialReport)
            .where(DailyFinancialReport.parent_report.submittedBySchool == school_id)
            .offset(offset)
            .limit(limit)
        ).all()
    )


@router.get("/{school_id}/{year}/{month}/full")
async def get_school_daily_financial_report_with_entries(
    token: logged_in_dep,
    session: Annotated[Session, Depends(get_db_session)],
    school_id: int,
    year: int,
    month: int,
) -> tuple[DailyFinancialReport, list[DailyFinancialReportEntry]]:
    """Get daily financial report with all entries for a school for a specific month.

    Args:
        token: The decoded JWT token of the logged-in user.
        session: The database session.
        school_id: The ID of the school to get the report for.
        year: The year of the report.
        month: The month of the report.

    Returns:
        A tuple containing the daily financial report and its entries for the specified school, year, and month.
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
            detail="You do not have permission to view daily financial reports.",
        )

    logger.debug(
        "user `%s` requesting daily financial report of school %s for %s-%s.",
        token.id,
        school_id,
        year,
        month,
    )
    report = session.exec(
        select(DailyFinancialReport).where(
            DailyFinancialReport.parent == datetime.date(year=year, month=month, day=1),
            DailyFinancialReport.parent_report.submittedBySchool == school_id,
        )
    ).one_or_none()
    if report is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Daily financial report not found.",
        )

    return (report, list(report.entries))


@router.put("/{school_id}/{year}/{month}")
async def create_school_daily_financial_report(
    token: logged_in_dep,
    session: Annotated[Session, Depends(get_db_session)],
    school_id: int,
    year: int,
    month: int,
) -> DailyFinancialReport:
    """Create a daily financial report for a school for a specific month."""

    user = await get_user(token.id, session, by_id=True)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found.",
        )

    required_permission = (
        "reports:local:write" if user.schoolId == school_id else "reports:global:write"
    )
    logger.debug("Required permission for user %s: %s", token.id, required_permission)

    if not await verify_user_permission(required_permission, session, token):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to create daily financial reports.",
        )

    logger.debug(
        "user `%s` creating daily financial report of school %s for %s-%s.",
        token.id,
        school_id,
        year,
        month,
    )

    report = session.exec(
        select(DailyFinancialReport).where(
            DailyFinancialReport.parent == datetime.date(year=year, month=month, day=1),
            DailyFinancialReport.parent_report.submittedBySchool == school_id,
        )
    ).one_or_none()

    if report is not None:
        logger.debug(
            "Daily financial report for %s-%s already exists.",
            year,
            month,
        )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Daily financial report for this month already exists.",
        )

    monthly_report = session.exec(
        select(MonthlyReport).where(
            MonthlyReport.id == datetime.date(year=year, month=month, day=1),
            MonthlyReport.submittedBySchool == school_id,
        )
    ).one_or_none()

    if monthly_report is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Monthly report not found.",
        )

    report = DailyFinancialReport(
        parent=datetime.date(year=year, month=month, day=1),
        preparedBy=user.id,
        notedBy=user.id,
        parent_report=monthly_report,
    )

    session.add(report)
    session.commit()
    session.refresh(report)

    return report


@router.post("/{school_id}/{year}/{month}/entries")
async def create_daily_sales_and_purchases_entry(
    token: logged_in_dep,
    session: Annotated[Session, Depends(get_db_session)],
    school_id: int,
    year: int,
    month: int,
    day: int,
    sales: float,
    purchases: float,
) -> DailyFinancialReportEntry:
    """Create a new daily sales and purchases entry for a specific day.

    Args:
        token: The decoded JWT token of the logged-in user.
        session: The database session.
        school_id: The ID of the school to create the entry for.
        year: The year of the report.
        month: The month of the report.
        day: The day of the month (1-31).
        sales: The total sales for the day.
        purchases: The total purchases for the day.

    Returns:
        The created daily financial report entry.
    """

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
            detail="You do not have permission to create daily report entries.",
        )

    # Validate day is within valid range for the month
    if day < 1 or day > 31:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Day must be between 1 and 31.",
        )

    # Validate sales and purchases are non-negative
    if sales < 0 or purchases < 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Sales and purchases must be non-negative.",
        )

    logger.debug(
        "user `%s` creating daily entry for school %s on %s-%s-%s with sales %s and purchases %s.",
        token.id,
        school_id,
        year,
        month,
        day,
        sales,
        purchases,
    )

    # Check if the monthly report exists, create if not
    monthly_report = session.exec(
        select(MonthlyReport).where(
            MonthlyReport.id == datetime.date(year=year, month=month, day=1),
            MonthlyReport.submittedBySchool == school_id,
        )
    ).one_or_none()

    if monthly_report is None:
        monthly_report = MonthlyReport(
            id=datetime.date(year=year, month=month, day=1),
            name=f"Daily Report for {datetime.date(year=year, month=month, day=1).strftime('%B %Y')}",
            submittedBySchool=school_id,
            reportStatus=ReportStatus.DRAFT,
            preparedBy=user.id,
            notedBy=user.id,
        )
        session.add(monthly_report)

    # Check if the daily financial report exists, create if not
    daily_report = session.exec(
        select(DailyFinancialReport).where(
            DailyFinancialReport.parent == datetime.date(year=year, month=month, day=1),
        )
    ).one_or_none()

    if daily_report is None:
        daily_report = DailyFinancialReport(
            parent=datetime.date(year=year, month=month, day=1),
            reportStatus=ReportStatus.DRAFT,
            preparedBy=user.id,
            notedBy=user.id,
        )
        session.add(daily_report)

    # Check if entry already exists for this day
    existing_entry = session.exec(
        select(DailyFinancialReportEntry).where(
            DailyFinancialReportEntry.parent
            == datetime.date(year=year, month=month, day=1),
            DailyFinancialReportEntry.day == day,
        )
    ).one_or_none()

    if existing_entry is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Entry for day {day} already exists. Use PUT to update it.",
        )

    # Create new entry
    new_entry = DailyFinancialReportEntry(
        parent=datetime.date(year=year, month=month, day=1),
        day=day,
        sales=sales,
        purchases=purchases,
    )

    session.add(new_entry)
    session.commit()
    session.refresh(new_entry)

    return new_entry


@router.put("/{school_id}/{year}/{month}/entries/{day}")
async def update_daily_sales_and_purchases_entry(
    token: logged_in_dep,
    session: Annotated[Session, Depends(get_db_session)],
    school_id: int,
    year: int,
    month: int,
    day: int,
    sales: float,
    purchases: float,
) -> DailyFinancialReportEntry:
    """Update an existing daily sales and purchases entry for a specific day.

    Args:
        token: The decoded JWT token of the logged-in user.
        session: The database session.
        school_id: The ID of the school to update the entry for.
        year: The year of the report.
        month: The month of the report.
        day: The day of the month (1-31).
        sales: The total sales for the day.
        purchases: The total purchases for the day.

    Returns:
        The updated daily financial report entry.
    """

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
            detail="You do not have permission to update daily report entries.",
        )

    # Validate day is within valid range for the month
    if day < 1 or day > 31:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Day must be between 1 and 31.",
        )

    # Validate sales and purchases are non-negative
    if sales < 0 or purchases < 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Sales and purchases must be non-negative.",
        )

    logger.debug(
        "user `%s` updating daily entry for school %s on %s-%s-%s with sales %s and purchases %s.",
        token.id,
        school_id,
        year,
        month,
        day,
        sales,
        purchases,
    )

    # Verify the monthly report exists and belongs to the school
    monthly_report = session.exec(
        select(MonthlyReport).where(
            MonthlyReport.id == datetime.date(year=year, month=month, day=1),
            MonthlyReport.submittedBySchool == school_id,
        )
    ).one_or_none()

    if monthly_report is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Monthly report not found.",
        )

    # Verify the daily financial report exists
    daily_report = session.exec(
        select(DailyFinancialReport).where(
            DailyFinancialReport.parent == datetime.date(year=year, month=month, day=1),
        )
    ).one_or_none()

    if daily_report is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Daily financial report not found.",
        )

    # Check if the report is still in draft status
    if daily_report.reportStatus != ReportStatus.DRAFT:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot update entries in a submitted report.",
        )

    # Find the existing entry
    entry = session.exec(
        select(DailyFinancialReportEntry).where(
            DailyFinancialReportEntry.parent
            == datetime.date(year=year, month=month, day=1),
            DailyFinancialReportEntry.day == day,
        )
    ).one_or_none()

    if entry is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Entry for day {day} not found. Use POST to create it.",
        )

    # Update the entry
    entry.sales = sales
    entry.purchases = purchases

    session.commit()
    session.refresh(entry)

    return entry


@router.delete("/{school_id}/{year}/{month}/entries/{day}")
async def delete_daily_sales_and_purchases_entry(
    token: logged_in_dep,
    session: Annotated[Session, Depends(get_db_session)],
    school_id: int,
    year: int,
    month: int,
    day: int,
) -> dict[str, str]:
    """Delete a daily sales and purchases entry for a specific day.

    Args:
        token: The decoded JWT token of the logged-in user.
        session: The database session.
        school_id: The ID of the school to delete the entry for.
        year: The year of the report.
        month: The month of the report.
        day: The day of the month (1-31).

    Returns:
        A success message.
    """

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
            detail="You do not have permission to delete daily report entries.",
        )

    # Validate day is within valid range for the month
    if day < 1 or day > 31:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Day must be between 1 and 31.",
        )

    logger.debug(
        "user `%s` deleting daily entry for school %s on %s-%s-%s.",
        token.id,
        school_id,
        year,
        month,
        day,
    )

    # Verify the monthly report exists and belongs to the school
    monthly_report = session.exec(
        select(MonthlyReport).where(
            MonthlyReport.id == datetime.date(year=year, month=month, day=1),
            MonthlyReport.submittedBySchool == school_id,
        )
    ).one_or_none()

    if monthly_report is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Monthly report not found.",
        )

    # Verify the daily financial report exists
    daily_report = session.exec(
        select(DailyFinancialReport).where(
            DailyFinancialReport.parent == datetime.date(year=year, month=month, day=1),
        )
    ).one_or_none()

    if daily_report is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Daily financial report not found.",
        )

    # Check if the report is still in draft status
    if daily_report.reportStatus != ReportStatus.DRAFT:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot delete entries from a submitted report.",
        )

    # Find the existing entry
    entry = session.exec(
        select(DailyFinancialReportEntry).where(
            DailyFinancialReportEntry.parent
            == datetime.date(year=year, month=month, day=1),
            DailyFinancialReportEntry.day == day,
        )
    ).one_or_none()

    if entry is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Entry for day {day} not found.",
        )

    # Delete the entry
    session.delete(entry)
    session.commit()

    return {"message": f"Entry for day {day} deleted successfully."}


@router.post("/{school_id}/{year}/{month}/entries/bulk")
async def create_bulk_daily_sales_and_purchases_entries(
    token: logged_in_dep,
    session: Annotated[Session, Depends(get_db_session)],
    school_id: int,
    year: int,
    month: int,
    entries: list[DailyEntryData],
) -> list[DailyFinancialReportEntry]:
    """Create multiple daily sales and purchases entries at once.

    Args:
        token: The decoded JWT token of the logged-in user.
        session: The database session.
        school_id: The ID of the school to create entries for.
        year: The year of the report.
        month: The month of the report.
        entries: List of entries with 'day', 'sales', and 'purchases' fields.

    Returns:
        List of created daily financial report entries.
    """

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
            detail="You do not have permission to create daily report entries.",
        )

    if not entries:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No entries provided.",
        )

    # Pydantic validation handles input validation automatically

    logger.debug(
        "user `%s` creating bulk daily entries for school %s for %s-%s.",
        token.id,
        school_id,
        year,
        month,
    )

    # Check if the monthly report exists, create if not
    monthly_report = session.exec(
        select(MonthlyReport).where(
            MonthlyReport.id == datetime.date(year=year, month=month, day=1),
            MonthlyReport.submittedBySchool == school_id,
        )
    ).one_or_none()

    if monthly_report is None:
        monthly_report = MonthlyReport(
            id=datetime.date(year=year, month=month, day=1),
            name=f"Daily Report for {datetime.date(year=year, month=month, day=1).strftime('%B %Y')}",
            submittedBySchool=school_id,
            reportStatus=ReportStatus.DRAFT,
            preparedBy=user.id,
            notedBy=user.id,
        )
        session.add(monthly_report)

    # Check if the daily financial report exists, create if not
    daily_report = session.exec(
        select(DailyFinancialReport).where(
            DailyFinancialReport.parent == datetime.date(year=year, month=month, day=1),
        )
    ).one_or_none()

    if daily_report is None:
        daily_report = DailyFinancialReport(
            parent=datetime.date(year=year, month=month, day=1),
            reportStatus=ReportStatus.DRAFT,
            preparedBy=user.id,
            notedBy=user.id,
        )
        session.add(daily_report)

    # Check for existing entries
    existing_days = session.exec(
        select(DailyFinancialReportEntry.day).where(
            DailyFinancialReportEntry.parent
            == datetime.date(year=year, month=month, day=1),
        )
    ).all()
    existing_days_set = set(existing_days)

    # Create new entries
    created_entries: list[DailyFinancialReportEntry] = []
    for entry_data in entries:
        day = entry_data.day
        if day in existing_days_set:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Entry for day {day} already exists.",
            )

        new_entry = DailyFinancialReportEntry(
            parent=datetime.date(year=year, month=month, day=1),
            day=day,
            sales=entry_data.sales,
            purchases=entry_data.purchases,
        )
        session.add(new_entry)
        created_entries.append(new_entry)

    session.commit()

    # Refresh all created entries
    for entry in created_entries:
        session.refresh(entry)

    return created_entries


@router.get("/{school_id}/{year}/{month}/summary")
async def get_daily_sales_and_purchases_summary(
    token: logged_in_dep,
    session: Annotated[Session, Depends(get_db_session)],
    school_id: int,
    year: int,
    month: int,
) -> dict[str, float | int | dict[str, float | int] | None]:
    """Get a summary of daily sales and purchases for a specific month.

    Args:
        token: The decoded JWT token of the logged-in user.
        session: The database session.
        school_id: The ID of the school to get the summary for.
        year: The year of the report.
        month: The month of the report.

    Returns:
        Summary statistics including totals, averages, and entry count.
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
            detail="You do not have permission to view daily report summaries.",
        )

    logger.debug(
        "user `%s` requesting daily sales summary for school %s for %s-%s.",
        token.id,
        school_id,
        year,
        month,
    )

    # Verify the monthly report exists
    monthly_report = session.exec(
        select(MonthlyReport).where(
            MonthlyReport.id == datetime.date(year=year, month=month, day=1),
            MonthlyReport.submittedBySchool == school_id,
        )
    ).one_or_none()

    if monthly_report is None:
        # No monthly report exists, return empty summary
        return {
            "total_sales": 0.0,
            "total_purchases": 0.0,
            "net_income": 0.0,
            "average_daily_sales": 0.0,
            "average_daily_purchases": 0.0,
            "average_daily_net_income": 0.0,
            "days_with_entries": 0,
            "highest_sales_day": None,
            "highest_purchases_day": None,
            "highest_net_income_day": None,
        }

    # Get all entries for the month
    entries = session.exec(
        select(DailyFinancialReportEntry).where(
            DailyFinancialReportEntry.parent
            == datetime.date(year=year, month=month, day=1),
        )
    ).all()

    if not entries:
        return {
            "total_sales": 0.0,
            "total_purchases": 0.0,
            "net_income": 0.0,
            "average_daily_sales": 0.0,
            "average_daily_purchases": 0.0,
            "average_daily_net_income": 0.0,
            "days_with_entries": 0,
            "highest_sales_day": None,
            "highest_purchases_day": None,
            "highest_net_income_day": None,
        }

    total_sales = sum(entry.sales for entry in entries)
    total_purchases = sum(entry.purchases for entry in entries)
    net_income = total_sales - total_purchases

    entry_count = len(entries)
    avg_sales = total_sales / entry_count if entry_count > 0 else 0
    avg_purchases = total_purchases / entry_count if entry_count > 0 else 0
    avg_net_income = net_income / entry_count if entry_count > 0 else 0

    # Find days with highest values
    highest_sales_entry = max(entries, key=lambda e: e.sales)
    highest_purchases_entry = max(entries, key=lambda e: e.purchases)
    highest_net_income_entry = max(entries, key=lambda e: e.sales - e.purchases)

    return {
        "total_sales": round(total_sales, 2),
        "total_purchases": round(total_purchases, 2),
        "net_income": round(net_income, 2),
        "average_daily_sales": round(avg_sales, 2),
        "average_daily_purchases": round(avg_purchases, 2),
        "average_daily_net_income": round(avg_net_income, 2),
        "days_with_entries": entry_count,
        "highest_sales_day": {
            "day": highest_sales_entry.day,
            "sales": highest_sales_entry.sales,
        },
        "highest_purchases_day": {
            "day": highest_purchases_entry.day,
            "purchases": highest_purchases_entry.purchases,
        },
        "highest_net_income_day": {
            "day": highest_net_income_entry.day,
            "net_income": round(
                highest_net_income_entry.sales - highest_net_income_entry.purchases, 2
            ),
        },
    }


@router.get("/{school_id}/{year}/{month}/summary/filtered")
async def get_daily_sales_and_purchases_summary_filtered(
    token: logged_in_dep,
    session: Annotated[Session, Depends(get_db_session)],
    school_id: int,
    year: int,
    month: int,
    include_drafts: bool = False,
    include_reviews: bool = True,
    include_approved: bool = True,
    include_rejected: bool = True,
    include_received: bool = True,
    include_archived: bool = True,
) -> dict[str, float | int | dict[str, float | int] | str | None]:
    """Get a summary of daily sales and purchases for a specific month with status filtering.

    Args:
        token: The decoded JWT token of the logged-in user.
        session: The database session.
        school_id: The ID of the school to get the summary for.
        year: The year of the report.
        month: The month of the report.
        include_drafts: Whether to include draft reports.
        include_reviews: Whether to include reports under review.
        include_approved: Whether to include approved reports.
        include_rejected: Whether to include rejected reports.
        include_received: Whether to include received reports.
        include_archived: Whether to include archived reports.

    Returns:
        Summary statistics including totals, averages, and entry count from filtered reports.
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
            detail="You do not have permission to view daily report summaries.",
        )

    # Apply role-based filtering for admin users
    if user.roleId in [2, 3]:  # Superintendent or Administrator
        # Admin users should only see approved reports
        include_drafts = False
        include_reviews = False
        include_approved = True
        include_rejected = False

    logger.debug(
        "user `%s` (role %s) requesting filtered daily sales summary for school %s for %s-%s. "
        "Filters: drafts=%s, reviews=%s, approved=%s, rejected=%s, received=%s, archived=%s",
        token.id,
        user.roleId,
        school_id,
        year,
        month,
        include_drafts,
        include_reviews,
        include_approved,
        include_rejected,
        include_received,
        include_archived,
    )

    # Build list of allowed statuses based on filters
    allowed_statuses: list[ReportStatus] = []
    if include_drafts:
        allowed_statuses.append(ReportStatus.DRAFT)
    if include_reviews:
        allowed_statuses.append(ReportStatus.REVIEW)
    if include_approved:
        allowed_statuses.append(ReportStatus.APPROVED)
    if include_rejected:
        allowed_statuses.append(ReportStatus.REJECTED)
    if include_received:
        allowed_statuses.append(ReportStatus.RECEIVED)
    if include_archived:
        allowed_statuses.append(ReportStatus.ARCHIVED)

    if not allowed_statuses:
        # No statuses allowed, return empty summary
        return {
            "total_sales": 0.0,
            "total_purchases": 0.0,
            "net_income": 0.0,
            "average_daily_sales": 0.0,
            "average_daily_purchases": 0.0,
            "average_daily_net_income": 0.0,
            "days_with_entries": 0,
            "highest_sales_day": None,
            "highest_purchases_day": None,
            "highest_net_income_day": None,
            "filtered_by": {
                "include_drafts": include_drafts,
                "include_reviews": include_reviews,
                "include_approved": include_approved,
                "include_rejected": include_rejected,
                "include_received": include_received,
                "include_archived": include_archived,
            },
        }

    # Get the monthly report and check its status
    monthly_report = session.exec(
        select(MonthlyReport).where(
            MonthlyReport.id == datetime.date(year=year, month=month, day=1),
            MonthlyReport.submittedBySchool == school_id,
        )
    ).one_or_none()

    if monthly_report is None:
        # No monthly report exists, return empty summary
        return {
            "total_sales": 0.0,
            "total_purchases": 0.0,
            "net_income": 0.0,
            "average_daily_sales": 0.0,
            "average_daily_purchases": 0.0,
            "average_daily_net_income": 0.0,
            "days_with_entries": 0,
            "highest_sales_day": None,
            "highest_purchases_day": None,
            "highest_net_income_day": None,
            "filtered_by": {
                "include_drafts": include_drafts,
                "include_reviews": include_reviews,
                "include_approved": include_approved,
                "include_rejected": include_rejected,
                "include_received": include_received,
                "include_archived": include_archived,
            },
        }

    # Check if the monthly report's status is in the allowed statuses
    if monthly_report.reportStatus not in allowed_statuses:
        # Monthly report status is filtered out, return empty summary
        return {
            "total_sales": 0.0,
            "total_purchases": 0.0,
            "net_income": 0.0,
            "average_daily_sales": 0.0,
            "average_daily_purchases": 0.0,
            "average_daily_net_income": 0.0,
            "days_with_entries": 0,
            "highest_sales_day": None,
            "highest_purchases_day": None,
            "highest_net_income_day": None,
            "filtered_by": {
                "include_drafts": include_drafts,
                "include_reviews": include_reviews,
                "include_approved": include_approved,
                "include_rejected": include_rejected,
                "include_received": include_received,
                "include_archived": include_archived,
            },
            "monthly_report_status": monthly_report.reportStatus.value,
        }

    # Get all entries for the month (since the monthly report passed the filter)
    entries = session.exec(
        select(DailyFinancialReportEntry).where(
            DailyFinancialReportEntry.parent
            == datetime.date(year=year, month=month, day=1),
        )
    ).all()

    if not entries:
        return {
            "total_sales": 0.0,
            "total_purchases": 0.0,
            "net_income": 0.0,
            "average_daily_sales": 0.0,
            "average_daily_purchases": 0.0,
            "average_daily_net_income": 0.0,
            "days_with_entries": 0,
            "highest_sales_day": None,
            "highest_purchases_day": None,
            "highest_net_income_day": None,
            "filtered_by": {
                "include_drafts": include_drafts,
                "include_reviews": include_reviews,
                "include_approved": include_approved,
                "include_rejected": include_rejected,
                "include_received": include_received,
                "include_archived": include_archived,
            },
            "monthly_report_status": monthly_report.reportStatus.value,
        }

    total_sales = sum(entry.sales for entry in entries)
    total_purchases = sum(entry.purchases for entry in entries)
    net_income = total_sales - total_purchases

    entry_count = len(entries)
    avg_sales = total_sales / entry_count if entry_count > 0 else 0
    avg_purchases = total_purchases / entry_count if entry_count > 0 else 0
    avg_net_income = net_income / entry_count if entry_count > 0 else 0

    # Find days with highest values
    highest_sales_entry = max(entries, key=lambda e: e.sales)
    highest_purchases_entry = max(entries, key=lambda e: e.purchases)
    highest_net_income_entry = max(entries, key=lambda e: e.sales - e.purchases)

    return {
        "total_sales": round(total_sales, 2),
        "total_purchases": round(total_purchases, 2),
        "net_income": round(net_income, 2),
        "average_daily_sales": round(avg_sales, 2),
        "average_daily_purchases": round(avg_purchases, 2),
        "average_daily_net_income": round(avg_net_income, 2),
        "days_with_entries": entry_count,
        "highest_sales_day": {
            "day": highest_sales_entry.day,
            "sales": highest_sales_entry.sales,
        },
        "highest_purchases_day": {
            "day": highest_purchases_entry.day,
            "purchases": highest_purchases_entry.purchases,
        },
        "highest_net_income_day": {
            "day": highest_net_income_entry.day,
            "net_income": round(
                highest_net_income_entry.sales - highest_net_income_entry.purchases, 2
            ),
        },
        "filtered_by": {
            "include_drafts": include_drafts,
            "include_reviews": include_reviews,
            "include_approved": include_approved,
            "include_rejected": include_rejected,
            "include_received": include_received,
            "include_archived": include_archived,
        },
        "monthly_report_status": monthly_report.reportStatus.value,
    }


@router.get("/{school_id}/{year}/{month}/entries/{day}")
async def get_daily_sales_and_purchases_entry(
    token: logged_in_dep,
    session: Annotated[Session, Depends(get_db_session)],
    school_id: int,
    year: int,
    month: int,
    day: int,
) -> DailyFinancialReportEntry:
    """Get a specific daily sales and purchases entry for a day.

    Args:
        token: The decoded JWT token of the logged-in user.
        session: The database session.
        school_id: The ID of the school to get the entry for.
        year: The year of the report.
        month: The month of the report.
        day: The day of the month (1-31).

    Returns:
        The daily financial report entry for the specified day.
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
            detail="You do not have permission to view daily report entries.",
        )

    # Validate day is within valid range for the month
    if day < 1 or day > 31:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Day must be between 1 and 31.",
        )

    logger.debug(
        "user `%s` requesting daily entry for school %s on %s-%s-%s.",
        token.id,
        school_id,
        year,
        month,
        day,
    )

    # Verify the monthly report exists and belongs to the school
    monthly_report = session.exec(
        select(MonthlyReport).where(
            MonthlyReport.id == datetime.date(year=year, month=month, day=1),
            MonthlyReport.submittedBySchool == school_id,
        )
    ).one_or_none()

    if monthly_report is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Monthly report not found.",
        )

    # Find the entry for the specific day
    entry = session.exec(
        select(DailyFinancialReportEntry).where(
            DailyFinancialReportEntry.parent
            == datetime.date(year=year, month=month, day=1),
            DailyFinancialReportEntry.day == day,
        )
    ).one_or_none()

    if entry is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Entry for day {day} not found.",
        )

    return entry


@router.patch("/{school_id}/{year}/{month}/status")
async def change_daily_report_status(
    token: logged_in_dep,
    session: Annotated[Session, Depends(get_db_session)],
    school_id: int,
    year: int,
    month: int,
    status_change: StatusChangeRequest,
) -> DailyFinancialReport:
    """Change the status of a daily financial report based on user role and permissions.

    Args:
        token: The decoded JWT token of the logged-in user.
        session: The database session.
        school_id: The ID of the school the report belongs to.
        year: The year of the report.
        month: The month of the report.
        status_change: The status change request containing new status and optional comments.

    Returns:
        The updated daily financial report.

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
        "user `%s` (role %s) attempting to change status of daily financial report for school %s, %s-%s to %s",
        token.id,
        user.roleId,
        school_id,
        year,
        month,
        status_change.new_status.value,
    )

    # Get the monthly report and then the daily financial report
    monthly_report = ReportStatusManager.get_monthly_report(
        session, school_id, year, month
    )

    daily_report = monthly_report.daily_financial_report
    if daily_report is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Daily financial report not found.",
        )

    # Use the generic status manager to change the status
    return ReportStatusManager.change_report_status(
        session=session,
        user=user,
        report=daily_report,
        status_change=status_change,
        report_type="daily_financial",
        school_id=school_id,
        year=year,
        month=month,
    )


@router.get("/{school_id}/{year}/{month}/valid-transitions")
async def get_daily_valid_status_transitions(
    token: logged_in_dep,
    session: Annotated[Session, Depends(get_db_session)],
    school_id: int,
    year: int,
    month: int,
) -> dict[str, str | list[str]]:
    """Get the valid status transitions for a daily financial report based on user role.

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

    # Get the monthly report and then the daily financial report
    monthly_report = ReportStatusManager.get_monthly_report(
        session, school_id, year, month
    )

    daily_report = monthly_report.daily_financial_report
    if daily_report is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Daily financial report not found.",
        )

    # Get valid transitions for this user role and current status
    return ReportStatusManager.get_valid_transitions_response(user, daily_report)
