"""Generic utilities for report status management across all report types."""

import datetime
from typing import Any, Dict, List, Tuple, Union

from fastapi import HTTPException, status
from sqlalchemy.exc import NoResultFound
from sqlmodel import Session, select

from centralserver.internals.logger import LoggerFactory
from centralserver.internals.models.notification import NotificationType
from centralserver.internals.models.reports.monthly_report import MonthlyReport
from centralserver.internals.models.reports.report_status import ReportStatus
from centralserver.internals.models.reports.status_change_request import (
    RoleBasedTransitions,
    StatusChangeRequest,
)
from centralserver.internals.models.user import User
from centralserver.internals.notification_handler import push_notification

logger = LoggerFactory().get_logger(__name__)


class ReportStatusManager:
    """Generic manager for handling report status changes across different report types."""

    @staticmethod
    def get_monthly_report(
        session: Session, school_id: int, year: int, month: int
    ) -> MonthlyReport:
        """Get the monthly report for the given parameters."""
        try:
            return session.exec(
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

    @staticmethod
    async def change_report_status(
        session: Session,
        user: User,
        report: Any,  # Any report type with reportStatus field
        status_change: StatusChangeRequest,
        report_type: str,
        school_id: int,
        year: int,
        month: int,
        category: str | None = None,
    ) -> Any:
        """
        Generic function to change the status of any report type.

        Args:
            session: Database session
            user: User making the change
            report: The report object to change status for
            status_change: The status change request
            report_type: Type of report (e.g., "monthly", "payroll", "liquidation")
            school_id: School ID
            year: Report year
            month: Report month
            category: Category (for liquidation reports)

        Returns:
            The updated report object
        """

        # Special validation for monthly reports has been removed to allow cascading behavior.
        # When a monthly report status changes to REVIEW, it will automatically
        # cascade to all component reports, eliminating the need for pre-validation.

        # Validate the status transition based on user role
        if not RoleBasedTransitions.is_transition_valid(
            user.roleId, report.reportStatus, status_change.new_status
        ):
            valid_transitions = RoleBasedTransitions.get_valid_transitions(
                user.roleId, report.reportStatus
            )
            role_description = RoleBasedTransitions.get_role_description(user.roleId)

            if not valid_transitions:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"As a {role_description}, you cannot change reports with '{report.reportStatus.value}' status.",
                )
            else:
                valid_statuses = [status.value for status in valid_transitions]
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"As a {role_description}, you can only change reports from '{report.reportStatus.value}' to: {', '.join(valid_statuses)}.",
                )

        # Update the report status
        old_status = report.reportStatus
        report.reportStatus = status_change.new_status

        # Update timestamps based on status change
        ReportStatusManager._update_status_timestamps(report, status_change.new_status)

        # Add to session and commit
        session.add(report)

        # For monthly reports, cascade status to component reports
        if report_type == "monthly":
            await ReportStatusManager._cascade_status_to_component_reports(
                session, report, status_change.new_status
            )

        session.commit()
        session.refresh(report)

        # Send notifications based on status change
        await ReportStatusManager._notify_report_status_change(
            session=session,
            report=report,
            old_status=old_status,
            new_status=status_change.new_status,
            report_type=report_type,
            year=year,
            month=month,
            category=category,
            comments=status_change.comments,
        )

        # Build log context
        context_parts = [f"school {school_id}", f"{year}-{month}"]
        if category:
            context_parts.append(f"category {category}")
        context = ", ".join(context_parts)

        logger.info(
            "user `%s` (role %s) changed status of %s report for %s from '%s' to '%s'",
            user.id,
            user.roleId,
            report_type,
            context,
            old_status.value,
            status_change.new_status.value,
        )

        # Cascade status change to component reports if monthly report
        if report_type == "monthly":
            await ReportStatusManager._cascade_status_to_component_reports(
                session, report, status_change.new_status
            )

        return report

    @staticmethod
    async def _cascade_status_to_component_reports(
        session: Session, monthly_report: MonthlyReport, new_status: ReportStatus
    ) -> None:
        """
        Cascade status changes from monthly report to all existing component reports.
        This ensures consistency across all related reports.

        Args:
            session: Database session
            monthly_report: The monthly report whose status changed
            new_status: The new status to apply to component reports
        """
        # Only cascade for certain statuses
        cascade_statuses = [
            ReportStatus.REVIEW,  # Added: Cascade when monthly report is submitted for review
            ReportStatus.APPROVED,
            ReportStatus.REJECTED,
            ReportStatus.RECEIVED,
            ReportStatus.ARCHIVED,
        ]

        if new_status not in cascade_statuses:
            return

        reports_updated: List[str] = []

        # Extract year and month from monthly report
        year = monthly_report.id.year
        month = monthly_report.id.month

        # Update Daily Financial Report if it exists
        if monthly_report.daily_financial_report is not None:
            old_status = monthly_report.daily_financial_report.reportStatus
            if old_status is not None:
                monthly_report.daily_financial_report.reportStatus = new_status
                ReportStatusManager._update_status_timestamps(
                    monthly_report.daily_financial_report, new_status
                )
                session.add(monthly_report.daily_financial_report)
                reports_updated.append(
                    f"Daily Financial Report ({old_status.value} → {new_status.value})"
                )

                # Send notification for daily financial report
                cascade_comment = (
                    "Automatically submitted for review when monthly report was submitted for review"
                    if new_status == ReportStatus.REVIEW
                    else f"Status cascaded from monthly report status change to {new_status.value}"
                )
                await ReportStatusManager._notify_report_status_change(
                    session=session,
                    report=monthly_report.daily_financial_report,
                    old_status=old_status,
                    new_status=new_status,
                    report_type="daily financial",
                    year=year,
                    month=month,
                    comments=cascade_comment,
                )

        # Update Payroll Report if it exists
        if monthly_report.payroll_report is not None:
            old_status = monthly_report.payroll_report.reportStatus
            monthly_report.payroll_report.reportStatus = new_status
            ReportStatusManager._update_status_timestamps(
                monthly_report.payroll_report, new_status
            )
            session.add(monthly_report.payroll_report)
            reports_updated.append(
                f"Payroll Report ({old_status.value} → {new_status.value})"
            )

            # Send notification for payroll report
            cascade_comment = (
                "Automatically submitted for review when monthly report was submitted for review"
                if new_status == ReportStatus.REVIEW
                else f"Status cascaded from monthly report status change to {new_status.value}"
            )
            await ReportStatusManager._notify_report_status_change(
                session=session,
                report=monthly_report.payroll_report,
                old_status=old_status,
                new_status=new_status,
                report_type="payroll",
                year=year,
                month=month,
                comments=cascade_comment,
            )

        # Update all liquidation reports if they exist
        liquidation_reports: List[tuple[str, Any]] = [
            ("Operating Expenses", monthly_report.operating_expenses_report),
            ("Administrative Expenses", monthly_report.administrative_expenses_report),
            ("Clinic Fund", monthly_report.clinic_fund_report),
            (
                "Supplementary Feeding Fund",
                monthly_report.supplementary_feeding_fund_report,
            ),
            ("HE Fund", monthly_report.he_fund_report),
            (
                "Faculty & Student Dev Fund",
                monthly_report.faculty_and_student_dev_fund_report,
            ),
            ("School Operation Fund", monthly_report.school_operation_fund_report),
            ("Revolving Fund", monthly_report.revolving_fund_report),
        ]

        for report_name, report in liquidation_reports:
            if report is not None and hasattr(report, "reportStatus"):
                old_status = getattr(report, "reportStatus", None)
                if old_status is not None:
                    setattr(report, "reportStatus", new_status)
                    ReportStatusManager._update_status_timestamps(report, new_status)
                    session.add(report)
                    reports_updated.append(
                        f"{report_name} Report ({old_status.value} → {new_status.value})"
                    )

                    # Send notification for liquidation report
                    # Convert report name to category format (e.g., "Operating Expenses" -> "operating_expenses")
                    category = report_name.lower().replace(" ", "_").replace("&", "and")
                    cascade_comment = (
                        "Automatically submitted for review when monthly report was submitted for review"
                        if new_status == ReportStatus.REVIEW
                        else f"Status cascaded from monthly report status change to {new_status.value}"
                    )
                    await ReportStatusManager._notify_report_status_change(
                        session=session,
                        report=report,
                        old_status=old_status,
                        new_status=new_status,
                        report_type="liquidation",
                        year=year,
                        month=month,
                        category=category,
                        comments=cascade_comment,
                    )

        # Log the cascade operation
        if reports_updated:
            logger.info(
                "Cascaded status change to component reports for monthly report %s: %s",
                monthly_report.id,
                ", ".join(reports_updated),
            )

    @staticmethod
    def _update_status_timestamps(report: Any, new_status: ReportStatus) -> None:
        """
        Update timestamp fields based on status changes.

        Args:
            report: The report object to update timestamps for
            new_status: The new status being set
        """
        current_time = datetime.datetime.now()

        # Set dateApproved when status becomes APPROVED
        if new_status == ReportStatus.APPROVED and hasattr(report, "dateApproved"):
            report.dateApproved = current_time

        # Set dateReceived when status becomes RECEIVED
        if new_status == ReportStatus.RECEIVED and hasattr(report, "dateReceived"):
            report.dateReceived = current_time

        # Always update lastModified
        if hasattr(report, "lastModified"):
            report.lastModified = current_time

    @staticmethod
    def get_valid_transitions_response(
        user: User,
        report: Any,  # Any report type with reportStatus field
    ) -> Dict[str, Union[str, list[str]]]:
        """Get valid transitions for a report based on user role."""
        valid_transitions = RoleBasedTransitions.get_valid_transitions(
            user.roleId, report.reportStatus
        )

        return {
            "current_status": report.reportStatus.value,
            "valid_transitions": [status.value for status in valid_transitions],
            "user_role": RoleBasedTransitions.get_role_description(user.roleId),
        }

    @staticmethod
    def check_view_permission(
        user: User,
        report: Any,  # Any report type with reportStatus field
    ) -> bool:
        """Check if user can view the report based on role and report status."""
        return RoleBasedTransitions.can_view_report(user.roleId, report.reportStatus)

    @staticmethod
    def check_create_permission(user: User) -> bool:
        """Check if user can create new reports."""
        return RoleBasedTransitions.can_create_report(user.roleId)

    @staticmethod
    def get_viewable_reports_filter(user: User) -> List[Any]:
        """Get list of viewable report statuses for filtering queries."""
        viewable_statuses = RoleBasedTransitions.get_viewable_statuses(user.roleId)
        return viewable_statuses  # Return the enum objects directly

    @staticmethod
    async def _notify_report_status_change(
        session: Session,
        report: Any,
        old_status: ReportStatus,
        new_status: ReportStatus,
        report_type: str,
        year: int,
        month: int,
        category: str | None = None,
        comments: str | None = None,
    ) -> None:
        """
        Send notifications to appropriate users based on status changes.

        Notification rules:
        - Draft to Review:
          * Always notify Canteen Manager (preparedBy)
          * Only notify Principal (notedBy) for monthly reports
        - Review to Approved/Rejected: Notify Canteen Manager (preparedBy)
        - Approved to Received: Notify Principal (notedBy) and Canteen Manager (preparedBy)

        Args:
            session: Database session
            report: The report object
            old_status: Previous status
            new_status: New status
            report_type: Type of report (e.g., "monthly", "payroll", "liquidation")
            year: Report year
            month: Report month
            category: Category (for liquidation reports)
            comments: Optional comments about the status change
        """
        # Get the users to notify based on status change
        users_to_notify: List[Tuple[str, str]] = []

        # Draft to Review: Notify both Canteen Manager and Principal (only for monthly reports)
        if old_status == ReportStatus.DRAFT and new_status == ReportStatus.REVIEW:
            # Notify Canteen Manager (preparedBy) for all report types
            prepared_by = getattr(report, "preparedBy", None)
            if prepared_by:
                users_to_notify.append(("canteen_manager", prepared_by))

            # Notify Principal (notedBy) only for monthly reports
            if report_type == "monthly":
                noted_by = getattr(report, "notedBy", None)
                if noted_by:
                    users_to_notify.append(("principal", noted_by))

        # Review to Approved/Rejected: Notify Canteen Manager
        elif old_status == ReportStatus.REVIEW and new_status in [
            ReportStatus.APPROVED,
            ReportStatus.REJECTED,
        ]:
            prepared_by = getattr(report, "preparedBy", None)
            if prepared_by:
                users_to_notify.append(("canteen_manager", prepared_by))

        # Approved to Received: Notify both Principal and Canteen Manager
        elif (
            old_status == ReportStatus.APPROVED and new_status == ReportStatus.RECEIVED
        ):
            # Notify Principal (notedBy)
            noted_by = getattr(report, "notedBy", None)
            if noted_by:
                users_to_notify.append(("principal", noted_by))

            # Notify Canteen Manager (preparedBy)
            prepared_by = getattr(report, "preparedBy", None)
            if prepared_by:
                users_to_notify.append(("canteen_manager", prepared_by))

        # For other status changes, notify preparedBy (legacy behavior)
        else:
            prepared_by = getattr(report, "preparedBy", None)
            if prepared_by:
                users_to_notify.append(("preparedBy", prepared_by))

        if not users_to_notify:
            logger.debug(
                "No users to notify for %s report status change from %s to %s",
                report_type,
                old_status.value,
                new_status.value,
            )
            return

        # Build report description
        report_description = f"{report_type.title()} Report"
        if category:
            report_description = (
                f"{category.replace('_', ' ').title()} {report_description}"
            )

        report_context = f"for {year}-{month:02d}"

        # Send notifications to each user
        for user_role, user_id in users_to_notify:
            await ReportStatusManager._send_notification_to_user(
                session=session,
                user_id=user_id,
                user_role=user_role,
                report_description=report_description,
                report_context=report_context,
                old_status=old_status,
                new_status=new_status,
                report_type=report_type,
                comments=comments,
            )

    @staticmethod
    async def _send_notification_to_user(
        session: Session,
        user_id: str,
        user_role: str,
        report_description: str,
        report_context: str,
        old_status: ReportStatus,
        new_status: ReportStatus,
        report_type: str,
        comments: str | None = None,
    ) -> None:
        """
        Send a notification to a specific user with role-appropriate messaging.

        Args:
            session: Database session
            user_id: ID of the user to notify
            user_role: Role of the user (for customizing message)
            report_description: Description of the report
            report_context: Context string (e.g., "for 2025-01")
            old_status: Previous status
            new_status: New status
            report_type: Type of report
            comments: Optional comments
        """
        # Create notification title and content based on status and user role
        status_action_map = {
            ReportStatus.REVIEW: "submitted for review",
            ReportStatus.APPROVED: "approved",
            ReportStatus.REJECTED: "rejected",
            ReportStatus.RECEIVED: "received",
            ReportStatus.ARCHIVED: "archived",
        }

        action = status_action_map.get(new_status, f"changed to {new_status.value}")

        # Customize message based on user role and status change
        if user_role == "canteen_manager":
            if new_status == ReportStatus.REVIEW:
                title = f"Report Submitted: {report_description}"
                content = f"Your {report_description} {report_context} has been successfully submitted for review and is now pending approval."
            elif new_status == ReportStatus.APPROVED:
                title = f"Report Approved: {report_description}"
                content = f"Great news! Your {report_description} {report_context} has been approved."
            elif new_status == ReportStatus.REJECTED:
                title = f"Report Needs Changes: {report_description}"
                content = f"Your {report_description} {report_context} has been rejected and needs changes before resubmission."
            elif new_status == ReportStatus.RECEIVED:
                title = f"Report Received: {report_description}"
                content = f"Your {report_description} {report_context} has been successfully received by the division office."
            else:
                title = f"Report Status Update: {report_description}"
                content = f"Your {report_description} {report_context} status has been updated to {new_status.value}."

        elif user_role == "principal":
            if new_status == ReportStatus.REVIEW:
                title = f"Report Ready for Review: {report_description}"
                content = f"A {report_description} {report_context} has been submitted and is ready for your review and approval."
            elif new_status == ReportStatus.RECEIVED:
                title = f"Report Received: {report_description}"
                content = f"The {report_description} {report_context} you approved has been successfully received by the division office."
            else:
                title = f"Report Status Update: {report_description}"
                content = f"The {report_description} {report_context} status has been updated to {new_status.value}."

        else:  # Default/legacy behavior
            title = f"Report Status Update: {report_description} {action}"
            content = f"The {report_description} {report_context} has been {action}."

        # Add status information
        content += f"\n\nPrevious status: {old_status.value}"
        content += f"\nCurrent status: {new_status.value}"

        if comments:
            content += f"\n\nComments: {comments}"

        # Determine notification type and importance based on status
        notification_type = NotificationType.INFO
        is_important = False

        if new_status == ReportStatus.APPROVED:
            notification_type = NotificationType.SUCCESS
            is_important = False
        elif new_status == ReportStatus.REJECTED:
            notification_type = NotificationType.WARNING
            is_important = False
        elif new_status == ReportStatus.RECEIVED:
            notification_type = NotificationType.SUCCESS
            is_important = False
        elif new_status == ReportStatus.REVIEW:
            notification_type = NotificationType.INFO
            is_important = False

        # Send the notification
        await push_notification(
            owner_id=user_id,
            title=title,
            content=content,
            session=session,
            important=is_important,
            notification_type=notification_type,
        )

        logger.info(
            "Sent %s notification to user %s (%s) for %s report %s: %s → %s",
            new_status.value,
            user_id,
            user_role,
            report_type,
            report_context,
            old_status.value,
            new_status.value,
        )
