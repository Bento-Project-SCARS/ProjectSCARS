"""Model for handling report status change requests."""

from typing import Dict, List

from pydantic import BaseModel, Field
from ulid import R

from centralserver.internals.models.reports.report_status import ReportStatus


class StatusChangeRequest(BaseModel):
    """Request model for changing report status."""

    new_status: ReportStatus = Field(description="The new status to set for the report")
    comments: str | None = Field(
        default=None, description="Optional comments about the status change"
    )


class RoleBasedTransitions:
    """Defines valid status transitions based on user roles."""

    # Role ID to valid transitions mapping
    ROLE_TRANSITIONS: Dict[int, Dict[ReportStatus, List[ReportStatus]]] = {
        5: {  # Canteen Manager
            ReportStatus.DRAFT: [ReportStatus.REVIEW],
            ReportStatus.REJECTED: [
                ReportStatus.REVIEW
            ],  # Allow re-submission after rejection
        },
        4: {  # Principal
            ReportStatus.REVIEW: [ReportStatus.APPROVED, ReportStatus.REJECTED]
        },
        2: {  # Superintendent
            ReportStatus.APPROVED: [ReportStatus.RECEIVED, ReportStatus.ARCHIVED],
            ReportStatus.RECEIVED: [ReportStatus.ARCHIVED],
        },
        3: {
            ReportStatus.APPROVED: [ReportStatus.RECEIVED, ReportStatus.ARCHIVED],
            ReportStatus.RECEIVED: [ReportStatus.ARCHIVED],
        },  # Administrator
    }

    # Define which roles can view reports in specific statuses
    ROLE_VIEW_PERMISSIONS: Dict[int, List[ReportStatus]] = {
        5: [  # Canteen Manager
            ReportStatus.DRAFT,
            ReportStatus.REVIEW,
            ReportStatus.APPROVED,
            ReportStatus.REJECTED,
            ReportStatus.RECEIVED,
            ReportStatus.ARCHIVED,
        ],
        4: [  # Principal
            ReportStatus.REVIEW,
            ReportStatus.APPROVED,
            ReportStatus.REJECTED,
            ReportStatus.RECEIVED,
            ReportStatus.ARCHIVED,
        ],
        2: [  # Superintendent
            ReportStatus.APPROVED,
            ReportStatus.RECEIVED,
            ReportStatus.ARCHIVED,
        ],
        3: [  # Administrator
            ReportStatus.APPROVED,
            ReportStatus.RECEIVED,
            ReportStatus.ARCHIVED,
        ],
    }

    @classmethod
    def is_transition_valid(
        cls, user_role_id: int, current_status: ReportStatus, new_status: ReportStatus
    ) -> bool:
        """Check if a status transition is valid for the given user role."""
        role_transitions = cls.ROLE_TRANSITIONS.get(user_role_id, {})
        valid_transitions = role_transitions.get(current_status, [])
        return new_status in valid_transitions

    @classmethod
    def get_valid_transitions(
        cls, user_role_id: int, current_status: ReportStatus
    ) -> List[ReportStatus]:
        """Get all valid transitions for a user role and current status."""
        role_transitions = cls.ROLE_TRANSITIONS.get(user_role_id, {})
        return role_transitions.get(current_status, [])

    @classmethod
    def can_view_report(cls, user_role_id: int, report_status: ReportStatus) -> bool:
        """Check if a user role can view reports with the given status."""
        viewable_statuses = cls.ROLE_VIEW_PERMISSIONS.get(user_role_id, [])
        return report_status in viewable_statuses

    @classmethod
    def get_viewable_statuses(cls, user_role_id: int) -> List[ReportStatus]:
        """Get all statuses that a user role can view."""
        return cls.ROLE_VIEW_PERMISSIONS.get(user_role_id, [])

    @classmethod
    def can_create_report(cls, user_role_id: int) -> bool:
        """Check if a user role can create new reports."""
        # Only Canteen Managers can create reports
        return user_role_id == 5

    @classmethod
    def get_role_description(cls, role_id: int) -> str:
        """Get human-readable role description."""
        role_names = {
            1: "Website Administrator",
            2: "Superintendent",
            3: "Administrator",
            4: "Principal",
            5: "Canteen Manager",
        }
        return role_names.get(role_id, f"Unknown Role ({role_id})")
