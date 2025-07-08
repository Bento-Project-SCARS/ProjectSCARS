import datetime
from typing import TYPE_CHECKING

from pydantic import BaseModel
from sqlmodel import Field, Relationship, SQLModel

from centralserver.internals.models.reports.report_status import ReportStatus

if TYPE_CHECKING:
    from centralserver.internals.models.reports.monthly_report import MonthlyReport


class PayrollReport(SQLModel, table=True):
    """A model representing the monthly payroll report."""

    __tablename__: str = "payrollReports"  # type: ignore

    parent: datetime.date = Field(
        primary_key=True, index=True, foreign_key="monthlyReports.id"
    )
    preparedBy: str = Field(
        foreign_key="users.id", description="The user who prepared the report."
    )
    notedBy: str | None = Field(foreign_key="users.id")
    reportStatus: ReportStatus = Field(
        default=ReportStatus.DRAFT,
        description="The status of the report.",
    )

    entries: list["PayrollReportEntry"] = Relationship(back_populates="parent_report")
    parent_report: "MonthlyReport" = Relationship(back_populates="payroll_report")


class PayrollReportEntry(SQLModel, table=True):
    """A model representing an entry in the payroll report for a week."""

    __tablename__: str = "payrollReportEntries"  # type: ignore

    parent: datetime.date = Field(
        primary_key=True, index=True, foreign_key="payrollReports.parent"
    )
    weekNumber: int = Field(primary_key=True, description="Week number in the month")
    employeeName: str = Field(primary_key=True, description="Name of the employee")
    sun: float = Field(default=0.0, description="Amount received on Sunday")
    mon: float = Field(default=0.0, description="Amount received on Monday")
    tue: float = Field(default=0.0, description="Amount received on Tuesday")
    wed: float = Field(default=0.0, description="Amount received on Wednesday")
    thu: float = Field(default=0.0, description="Amount received on Thursday")
    fri: float = Field(default=0.0, description="Amount received on Friday")
    sat: float = Field(default=0.0, description="Amount received on Saturday")
    signature: str | None = Field(
        default=None, description="Signature or reference attachments for the entry"
    )

    parent_report: PayrollReport = Relationship(back_populates="entries")


class PayrollEntryRequest(BaseModel):
    """Request model for creating payroll entry data."""

    week_number: int
    employee_name: str
    sun: float = 0.0
    mon: float = 0.0
    tue: float = 0.0
    wed: float = 0.0
    thu: float = 0.0
    fri: float = 0.0
    sat: float = 0.0
    signature: str | None = None


class PayrollEntryUpdateRequest(BaseModel):
    """Request model for updating specific fields in a payroll entry."""

    sun: float | None = None
    mon: float | None = None
    tue: float | None = None
    wed: float | None = None
    thu: float | None = None
    fri: float | None = None
    sat: float | None = None
    signature: str | None = None


class PayrollReportUpdateRequest(BaseModel):
    """Request model for updating payroll report metadata."""

    prepared_by: str | None = None
    noted_by: str | None = None
