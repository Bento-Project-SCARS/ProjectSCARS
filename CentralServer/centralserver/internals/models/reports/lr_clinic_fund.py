import datetime
from typing import TYPE_CHECKING

from sqlmodel import Field, Relationship, SQLModel

from centralserver.internals.models.reports.report_status import ReportStatus

if TYPE_CHECKING:
    from centralserver.internals.models.reports.monthly_report import MonthlyReport


class LiquidationReportClinicFund(SQLModel, table=True):
    """A model representing the liquidation (Clinic Fund) reports.

    Document Name: Liquidation Report > Clinic Fund
    """

    __tablename__: str = "liquidationReportClinicFund"  # type: ignore

    parent: datetime.date = Field(
        primary_key=True, index=True, foreign_key="monthlyReports.id"
    )
    notedBy: str = Field(foreign_key="users.id")
    preparedBy: str = Field(foreign_key="users.id")
    teacherInCharge: str = Field(foreign_key="users.id")
    reportStatus: ReportStatus = Field(
        default=ReportStatus.DRAFT,
        description="The status of the report.",
    )

    parent_report: "MonthlyReport" = Relationship(back_populates="clinic_fund_report")
    certified_by: list["LiquidationReportClinicFundCertifiedBy"] = Relationship(
        back_populates="parent_report", cascade_delete=True
    )
    entries: list["LiquidationReportClinicFundEntry"] = Relationship(
        back_populates="parent_report", cascade_delete=True
    )


class LiquidationReportClinicFundCertifiedBy(SQLModel, table=True):
    __tablename__: str = "liquidationReportClinicFundCertifiedBy"  # type: ignore

    parent: datetime.date = Field(
        primary_key=True,
        index=True,
        foreign_key="liquidationReportClinicFund.parent",
    )
    user: str = Field(primary_key=True, foreign_key="users.id")

    parent_report: LiquidationReportClinicFund = Relationship(
        back_populates="certified_by"
    )


class LiquidationReportClinicFundEntry(SQLModel, table=True):
    __tablename__: str = "liquidationReportClinicFundEntries"  # type: ignore

    parent: datetime.date = Field(
        primary_key=True,
        index=True,
        foreign_key="liquidationReportClinicFund.parent",
    )
    date: datetime.datetime = Field(
        primary_key=True,
        index=True,
        description="The date of the expense entry.",
    )
    receiptNumber: str | None = Field(description="Receipt or voucher number.")
    particulars: str = Field(primary_key=True, description="Item description.")
    amount: float = Field(description="Amount of the expense.")

    parent_report: LiquidationReportClinicFund = Relationship(back_populates="entries")
