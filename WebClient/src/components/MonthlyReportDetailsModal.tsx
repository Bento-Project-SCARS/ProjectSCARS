"use client";

import {
    MonthlyReport,
    ReportStatus,
    getLiquidationReportV1ReportsLiquidationSchoolIdYearMonthCategoryGet,
    getSchoolDailyReportV1ReportsDailySchoolIdYearMonthGet,
    getSchoolPayrollReportV1ReportsPayrollSchoolIdYearMonthGet,
    getDailySalesAndPurchasesSummaryV1ReportsDailySchoolIdYearMonthSummaryGet,
    LiquidationReportResponse,
    getSchoolEndpointV1SchoolsGet,
    getSchoolLogoEndpointV1SchoolsLogoGet,
    School,
} from "@/lib/api/csclient";
import { customLogger } from "@/lib/api/customLogger";
import { useUser } from "@/lib/providers/user";
import { formatUTCDateOnlyLocalized } from "@/lib/utils/date";
import { ActionIcon, Alert, Badge, Button, Group, Image, Modal, Stack, Table, Text, Title } from "@mantine/core";
import { IconAlertCircle, IconCalendar, IconCash, IconExternalLink, IconReceipt, IconUsers } from "@tabler/icons-react";
import dayjs from "dayjs";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { notifications } from "@mantine/notifications";

interface LiquidationReportData {
    reportStatus?: string;
    category?: string;
    [key: string]: unknown;
}

interface FinancialData {
    netSales: number;
    costOfSales: number;
    grossProfit: number;
    operatingExpenses: number;
    administrativeExpenses: number;
    netIncomeFromOperations: number;
    utilizationBreakdown: {
        supplementaryFeeding: { percentage: number; actual: number; balance: number };
        clinicFund: { percentage: number; actual: number; balance: number };
        facultyStudentDev: { percentage: number; actual: number; balance: number };
        heFund: { percentage: number; actual: number; balance: number };
        schoolOperations: { percentage: number; actual: number; balance: number };
        revolvingCapital: { percentage: number; actual: number; balance: number };
    };
}

interface LinkedReport {
    id: string;
    name: string;
    type: "daily" | "payroll" | "liquidation";
    category?: string;
    status: ReportStatus | "not-created";
    icon: React.ElementType;
    route: string;
}

interface MonthlyReportDetailsModalProps {
    opened: boolean;
    onClose: () => void;
    report: MonthlyReport | null;
    onDelete?: (reportId: string) => void;
}

const liquidationCategories = [
    { key: "operating_expenses", name: "Operating Expenses" },
    { key: "administrative_expenses", name: "Administrative Expenses" },
    { key: "clinic_fund", name: "Clinic Fund" },
    { key: "supplementary_feeding_fund", name: "Supplementary Feeding Fund" },
    { key: "he_fund", name: "HE Fund" },
    { key: "faculty_stud_dev_fund", name: "Faculty & Student Development Fund" },
    { key: "school_operations_fund", name: "School Operations Fund" },
    { key: "revolving_fund", name: "Revolving Fund" },
];

export function MonthlyReportDetailsModal({ opened, onClose, report, onDelete }: MonthlyReportDetailsModalProps) {
    const router = useRouter();
    const userCtx = useUser();
    const [linkedReports, setLinkedReports] = useState<LinkedReport[]>([]);
    const [loading, setLoading] = useState(false);
    const [financialData, setFinancialData] = useState<FinancialData | null>(null);
    const [financialLoading, setFinancialLoading] = useState(false);
    const [pdfModalOpened, setPdfModalOpened] = useState(false);
    const [pdfCanvas, setPdfCanvas] = useState<HTMLCanvasElement | null>(null);
    const [pdfLoading, setPdfLoading] = useState(false);
    const [schoolData, setSchoolData] = useState<School | null>(null);
    const [logoUrl, setLogoUrl] = useState<string | null>(null);

    const getStatusColor = (status: ReportStatus | "not-created") => {
        switch (status) {
            case "approved":
                return "green";
            case "draft":
                return "blue";
            case "review":
                return "yellow";
            case "rejected":
                return "red";
            case "archived":
                return "gray";
            case "not-created":
                return "gray";
            default:
                return "gray";
        }
    };

    const formatReportPeriod = (reportId: string) => {
        return dayjs(reportId).format("MMMM YYYY");
    };

    const formatCurrency = (amount: number) => {
        return `₱${amount.toLocaleString("en-US", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        })}`;
    };

    const fetchLinkedReports = useCallback(async () => {
        if (!report) return;

        setLoading(true);
        const reports: LinkedReport[] = [];

        try {
            const year = dayjs(report.id).format("YYYY");
            const month = dayjs(report.id).format("MM");

            // Always add Daily Financial Report entry
            try {
                const { data: dailyReport } = await getSchoolDailyReportV1ReportsDailySchoolIdYearMonthGet({
                    path: {
                        school_id: report.submittedBySchool,
                        year: parseInt(year),
                        month: parseInt(month),
                    },
                });

                reports.push({
                    id: `daily-${year}-${month}`,
                    name: `Daily Sales & Purchases Report - ${formatReportPeriod(report.id)}`,
                    type: "daily",
                    status: dailyReport?.reportStatus || "not-created",
                    icon: IconCash,
                    route: `/reports/sales?year=${year}&month=${month}`,
                });
            } catch (error) {
                customLogger.warn("Daily report not found or error fetching:", error);
                // Add as not created
                reports.push({
                    id: `daily-${year}-${month}`,
                    name: `Daily Sales & Purchases Report - ${formatReportPeriod(report.id)}`,
                    type: "daily",
                    status: "not-created",
                    icon: IconCash,
                    route: `/reports/sales?year=${year}&month=${month}`,
                });
            }

            // Always add Payroll Report entry
            try {
                const { data: payrollReport } = await getSchoolPayrollReportV1ReportsPayrollSchoolIdYearMonthGet({
                    path: {
                        school_id: report.submittedBySchool,
                        year: parseInt(year),
                        month: parseInt(month),
                    },
                });

                reports.push({
                    id: `payroll-${year}-${month}`,
                    name: `Payroll Report - ${formatReportPeriod(report.id)}`,
                    type: "payroll",
                    status: payrollReport?.reportStatus || "not-created",
                    icon: IconUsers,
                    route: `/reports/payroll?year=${year}&month=${month}`,
                });
            } catch (error) {
                customLogger.warn("Payroll report not found or error fetching:", error);
                // Add as not created
                reports.push({
                    id: `payroll-${year}-${month}`,
                    name: `Payroll Report - ${formatReportPeriod(report.id)}`,
                    type: "payroll",
                    status: "not-created",
                    icon: IconUsers,
                    route: `/reports/payroll?year=${year}&month=${month}`,
                });
            }

            // Always add all Liquidation Report categories
            for (const category of liquidationCategories) {
                try {
                    const { data: liquidationReport } =
                        await getLiquidationReportV1ReportsLiquidationSchoolIdYearMonthCategoryGet({
                            path: {
                                school_id: report.submittedBySchool,
                                year: parseInt(year),
                                month: parseInt(month),
                                category: category.key,
                            },
                        });

                    // Check if the report actually exists (has data)
                    if (liquidationReport && Object.keys(liquidationReport).length > 0) {
                        const reportStatus =
                            ((liquidationReport as LiquidationReportData)?.reportStatus as ReportStatus) ||
                            "not-created";
                        reports.push({
                            id: `liquidation-${category.key}-${year}-${month}`,
                            name: `${category.name} Liquidation Report - ${formatReportPeriod(report.id)}`,
                            type: "liquidation",
                            category: category.key,
                            status: reportStatus,
                            icon: IconReceipt,
                            route: `/reports/liquidation-report?category=${category.key}&year=${year}&month=${month}`,
                        });
                    } else {
                        // API succeeded but returned empty/null data - report doesn't exist
                        reports.push({
                            id: `liquidation-${category.key}-${year}-${month}`,
                            name: `${category.name} Liquidation Report - ${formatReportPeriod(report.id)}`,
                            type: "liquidation",
                            category: category.key,
                            status: "not-created",
                            icon: IconReceipt,
                            route: `/reports/liquidation-report?category=${category.key}&year=${year}&month=${month}`,
                        });
                    }
                } catch (error) {
                    // If we get a 404 or any error, the report doesn't exist
                    customLogger.warn(`Liquidation report for ${category.key} not found or error fetching:`, error);
                    reports.push({
                        id: `liquidation-${category.key}-${year}-${month}`,
                        name: `${category.name} Liquidation Report - ${formatReportPeriod(report.id)}`,
                        type: "liquidation",
                        category: category.key,
                        status: "not-created",
                        icon: IconReceipt,
                        route: `/reports/liquidation-report?category=${category.key}&year=${year}&month=${month}`,
                    });
                }
            }

            setLinkedReports(reports);
        } catch (error) {
            customLogger.error("Error fetching linked reports:", error);
        } finally {
            setLoading(false);
        }
    }, [report]);

    const fetchFinancialData = useCallback(async () => {
        if (!report) return;

        setFinancialLoading(true);
        try {
            const year = parseInt(dayjs(report.id).format("YYYY"));
            const month = parseInt(dayjs(report.id).format("MM"));

            // Fetch daily sales summary
            let dailySummary: {
                [key: string]:
                    | number
                    | number
                    | {
                          [key: string]: number | number;
                      }
                    | null;
            } | null = null;
            try {
                const { data } = await getDailySalesAndPurchasesSummaryV1ReportsDailySchoolIdYearMonthSummaryGet({
                    path: {
                        school_id: report.submittedBySchool,
                        year,
                        month,
                    },
                });
                if (data) {
                    dailySummary = data;
                }
            } catch (error) {
                customLogger.warn("Failed to fetch daily sales summary:", error);
            }

            // Fetch liquidation reports for expenses
            const liquidationReports: { [key: string]: LiquidationReportResponse } = {};
            for (const category of liquidationCategories) {
                try {
                    const { data } = await getLiquidationReportV1ReportsLiquidationSchoolIdYearMonthCategoryGet({
                        path: {
                            school_id: report.submittedBySchool,
                            year,
                            month,
                            category: category.key,
                        },
                    });
                    if (data) {
                        liquidationReports[category.key] = data;
                    }
                } catch (error) {
                    customLogger.warn(`Failed to fetch liquidation report for ${category.key}:`, error);
                }
            }

            // Calculate financial data
            const netSales = typeof dailySummary?.total_sales === "number" ? dailySummary.total_sales : 0;
            const costOfSales = typeof dailySummary?.total_purchases === "number" ? dailySummary.total_purchases : 0;
            const grossProfit = netSales - costOfSales;

            const operatingExpenses = liquidationReports.operating_expenses?.totalAmount || 0;
            const administrativeExpenses = liquidationReports.administrative_expenses?.totalAmount || 0;
            const netIncomeFromOperations = grossProfit - operatingExpenses - administrativeExpenses;

            // Calculate utilization breakdown
            const utilizationBreakdown = {
                supplementaryFeeding: {
                    percentage: 30,
                    actual: liquidationReports.supplementary_feeding_fund?.totalAmount || 0,
                    balance:
                        netIncomeFromOperations * 0.3 -
                        (liquidationReports.supplementary_feeding_fund?.totalAmount || 0),
                },
                clinicFund: {
                    percentage: 5,
                    actual: liquidationReports.clinic_fund?.totalAmount || 0,
                    balance: netIncomeFromOperations * 0.05 - (liquidationReports.clinic_fund?.totalAmount || 0),
                },
                facultyStudentDev: {
                    percentage: 15,
                    actual: liquidationReports.faculty_stud_dev_fund?.totalAmount || 0,
                    balance:
                        netIncomeFromOperations * 0.15 - (liquidationReports.faculty_stud_dev_fund?.totalAmount || 0),
                },
                heFund: {
                    percentage: 10,
                    actual: liquidationReports.he_fund?.totalAmount || 0,
                    balance: netIncomeFromOperations * 0.1 - (liquidationReports.he_fund?.totalAmount || 0),
                },
                schoolOperations: {
                    percentage: 25,
                    actual: liquidationReports.school_operations_fund?.totalAmount || 0,
                    balance:
                        netIncomeFromOperations * 0.25 - (liquidationReports.school_operations_fund?.totalAmount || 0),
                },
                revolvingCapital: {
                    percentage: 15,
                    actual: liquidationReports.revolving_fund?.totalAmount || 0,
                    balance: netIncomeFromOperations * 0.15 - (liquidationReports.revolving_fund?.totalAmount || 0),
                },
            };

            setFinancialData({
                netSales,
                costOfSales,
                grossProfit,
                operatingExpenses,
                administrativeExpenses,
                netIncomeFromOperations,
                utilizationBreakdown,
            });
        } catch (error) {
            customLogger.error("Error fetching financial data:", error);
        } finally {
            setFinancialLoading(false);
        }
    }, [report]);

    useEffect(() => {
        if (opened && report) {
            fetchLinkedReports();
            fetchFinancialData();
        }
    }, [opened, report, fetchLinkedReports, fetchFinancialData]);

    // Load school data and logo
    useEffect(() => {
        const loadSchoolData = async () => {
            if (!report?.submittedBySchool) return;

            try {
                // Get school details using the school ID
                const schoolResponse = await getSchoolEndpointV1SchoolsGet({
                    query: {
                        school_id: report.submittedBySchool,
                    },
                });

                if (schoolResponse.data) {
                    setSchoolData(schoolResponse.data);

                    // Load school logo if available
                    if (schoolResponse.data.logoUrn) {
                        try {
                            const logoResponse = await getSchoolLogoEndpointV1SchoolsLogoGet({
                                query: { fn: schoolResponse.data.logoUrn },
                            });

                            if (logoResponse.data) {
                                const logoUrl = URL.createObjectURL(logoResponse.data as Blob);
                                setLogoUrl(logoUrl);
                            }
                        } catch (error) {
                            customLogger.warn("Failed to load school logo:", error);
                        }
                    }
                }
            } catch (error) {
                customLogger.error("Failed to load school data:", error);
            }
        };

        if (opened && report) {
            loadSchoolData();
        }

        // Cleanup function to revoke logo URL
        return () => {
            if (logoUrl) {
                URL.revokeObjectURL(logoUrl);
            }
        };
    }, [opened, report, logoUrl]);

    const handleOpenReport = (reportRoute: string) => {
        // Check if user is admin/superintendent and append schoolId parameter
        const userRoleId = userCtx.userInfo?.roleId;
        const isAdminOrSuperintendent = userRoleId === 2 || userRoleId === 3;

        if (isAdminOrSuperintendent && report?.submittedBySchool) {
            const separator = reportRoute.includes("?") ? "&" : "?";
            const routeWithSchoolId = `${reportRoute}${separator}schoolId=${report.submittedBySchool}`;
            router.push(routeWithSchoolId);
        } else {
            router.push(reportRoute);
        }
        onClose();
    };

    const handleDeleteReport = async () => {
        if (report && onDelete) {
            await onDelete(report.id);
            onClose();
        }
    };

    const getFileName = () => {
        const monthYear = formatReportPeriod(report?.id || "");
        const schoolName = schoolData?.name || report?.submittedBySchool || "School";
        return `Monthly-Report-${schoolName}-${monthYear.replace(" ", "-")}.pdf`;
    };

    const PDFReportTemplate = useCallback(() => {
        if (!report || !financialData) return null;

        const monthYear = formatReportPeriod(report.id);

        return (
            <div
                id="monthly-report-content"
                style={{
                    backgroundColor: "white",
                    padding: "40px",
                    fontFamily: "Arial, sans-serif",
                    minHeight: "100vh",
                }}
            >
                {/* Header with logos and school info */}
                <div style={{ textAlign: "center", marginBottom: "30px" }}>
                    <div
                        style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            marginBottom: "20px",
                        }}
                    >
                        <div style={{ width: "80px", height: "80px" }}>
                            {/* School Logo */}
                            {logoUrl ? (
                                <img
                                    src={logoUrl}
                                    alt="School Logo"
                                    style={{
                                        width: "100%",
                                        height: "100%",
                                        objectFit: "cover",
                                        borderRadius: "50%",
                                    }}
                                />
                            ) : (
                                <div
                                    style={{
                                        width: "100%",
                                        height: "100%",
                                        border: "1px solid #ccc",
                                        borderRadius: "50%",
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        fontSize: "12px",
                                        color: "#666",
                                    }}
                                >
                                    LOGO
                                </div>
                            )}
                        </div>

                        <div style={{ textAlign: "center", flex: 1 }}>
                            <div style={{ fontSize: "14px", fontWeight: "bold" }}>Republic of the Philippines</div>
                            <div style={{ fontSize: "14px", fontWeight: "bold" }}>Department of Education</div>
                            <div style={{ fontSize: "14px", fontWeight: "bold" }}>Region III- Central Luzon</div>
                            <div style={{ fontSize: "14px", fontWeight: "bold" }}>
                                SCHOOLS DIVISION OF CITY OF BALIWAG
                            </div>
                            <div style={{ fontSize: "16px", fontWeight: "bold", marginTop: "5px" }}>
                                {schoolData?.name.toUpperCase() || "SCHOOL NAME"}
                            </div>
                            <div style={{ fontSize: "12px" }}>{schoolData?.address || "School Address"}</div>
                        </div>

                        <div style={{ width: "80px", height: "80px" }}>
                            {/* DepEd Logo */}
                            <img
                                src="/assets/logos/deped.svg"
                                alt="Deped Logo"
                                style={{
                                    width: "100%",
                                    height: "100%",
                                    objectFit: "cover",
                                    borderRadius: "50%",
                                }}
                            />
                        </div>
                    </div>

                    <div
                        style={{
                            fontSize: "18px",
                            fontWeight: "bold",
                            marginTop: "30px",
                            textDecoration: "underline",
                        }}
                    >
                        Monthly Financial Report for {monthYear.toUpperCase()}
                    </div>
                </div>

                {/* Financial Statement Table */}
                <div style={{ marginBottom: "30px" }}>
                    <h3 style={{ fontSize: "14px", fontWeight: "bold", marginBottom: "10px" }}>
                        Statement of Receipts, Disbursements and Utilization of Income
                    </h3>
                    <table
                        style={{
                            width: "100%",
                            borderCollapse: "collapse",
                            fontSize: "12px",
                            marginBottom: "20px",
                        }}
                    >
                        <thead>
                            <tr style={{ backgroundColor: "#f5f5f5" }}>
                                <th style={{ border: "1px solid #000", padding: "8px", textAlign: "left" }}>
                                    Description
                                </th>
                                <th style={{ border: "1px solid #000", padding: "8px", textAlign: "right" }}>Amount</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td style={{ border: "1px solid #000", padding: "8px", fontWeight: "bold" }}>
                                    Net Sales
                                </td>
                                <td style={{ border: "1px solid #000", padding: "8px", textAlign: "right" }}>
                                    {formatCurrency(financialData.netSales)}
                                </td>
                            </tr>
                            <tr>
                                <td style={{ border: "1px solid #000", padding: "8px", fontWeight: "bold" }}>
                                    Cost of Sales
                                </td>
                                <td style={{ border: "1px solid #000", padding: "8px", textAlign: "right" }}>
                                    {formatCurrency(financialData.costOfSales)}
                                </td>
                            </tr>
                            <tr style={{ backgroundColor: "#f5f5f5" }}>
                                <td style={{ border: "1px solid #000", padding: "8px", fontWeight: "bold" }}>
                                    GROSS PROFIT
                                </td>
                                <td
                                    style={{
                                        border: "1px solid #000",
                                        padding: "8px",
                                        textAlign: "right",
                                        fontWeight: "bold",
                                    }}
                                >
                                    {formatCurrency(financialData.grossProfit)}
                                </td>
                            </tr>
                            <tr>
                                <td style={{ border: "1px solid #000", padding: "8px", fontWeight: "bold" }}>
                                    Operating Expenses
                                </td>
                                <td style={{ border: "1px solid #000", padding: "8px", textAlign: "right" }}>
                                    {formatCurrency(financialData.operatingExpenses)}
                                </td>
                            </tr>
                            <tr>
                                <td style={{ border: "1px solid #000", padding: "8px", fontWeight: "bold" }}>
                                    Administrative Expenses
                                </td>
                                <td style={{ border: "1px solid #000", padding: "8px", textAlign: "right" }}>
                                    {formatCurrency(financialData.administrativeExpenses)}
                                </td>
                            </tr>
                            <tr style={{ backgroundColor: "#f5f5f5" }}>
                                <td style={{ border: "1px solid #000", padding: "8px", fontWeight: "bold" }}>
                                    NET INCOME FROM OPERATIONS
                                </td>
                                <td
                                    style={{
                                        border: "1px solid #000",
                                        padding: "8px",
                                        textAlign: "right",
                                        fontWeight: "bold",
                                    }}
                                >
                                    {formatCurrency(financialData.netIncomeFromOperations)}
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                {/* Utilization Table */}
                <div style={{ marginBottom: "30px" }}>
                    <h3 style={{ fontSize: "14px", fontWeight: "bold", marginBottom: "10px" }}>
                        Utilization of Net Income
                    </h3>
                    <table
                        style={{
                            width: "100%",
                            borderCollapse: "collapse",
                            fontSize: "12px",
                        }}
                    >
                        <thead>
                            <tr style={{ backgroundColor: "#f5f5f5" }}>
                                <th style={{ border: "1px solid #000", padding: "8px", textAlign: "left" }}>Fund</th>
                                <th style={{ border: "1px solid #000", padding: "8px", textAlign: "center" }}>
                                    Percentage
                                </th>
                                <th style={{ border: "1px solid #000", padding: "8px", textAlign: "right" }}>Actual</th>
                                <th style={{ border: "1px solid #000", padding: "8px", textAlign: "right" }}>
                                    Balance
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td style={{ border: "1px solid #000", padding: "8px" }}>
                                    Supplementary Feeding Program
                                </td>
                                <td style={{ border: "1px solid #000", padding: "8px", textAlign: "center" }}>
                                    {financialData.utilizationBreakdown.supplementaryFeeding.percentage}%
                                </td>
                                <td style={{ border: "1px solid #000", padding: "8px", textAlign: "right" }}>
                                    {formatCurrency(financialData.utilizationBreakdown.supplementaryFeeding.actual)}
                                </td>
                                <td style={{ border: "1px solid #000", padding: "8px", textAlign: "right" }}>
                                    {formatCurrency(financialData.utilizationBreakdown.supplementaryFeeding.balance)}
                                </td>
                            </tr>
                            <tr>
                                <td style={{ border: "1px solid #000", padding: "8px" }}>Clinic Fund</td>
                                <td style={{ border: "1px solid #000", padding: "8px", textAlign: "center" }}>
                                    {financialData.utilizationBreakdown.clinicFund.percentage}%
                                </td>
                                <td style={{ border: "1px solid #000", padding: "8px", textAlign: "right" }}>
                                    {formatCurrency(financialData.utilizationBreakdown.clinicFund.actual)}
                                </td>
                                <td style={{ border: "1px solid #000", padding: "8px", textAlign: "right" }}>
                                    {formatCurrency(financialData.utilizationBreakdown.clinicFund.balance)}
                                </td>
                            </tr>
                            <tr>
                                <td style={{ border: "1px solid #000", padding: "8px" }}>
                                    Faculty & Student Development Fund
                                </td>
                                <td style={{ border: "1px solid #000", padding: "8px", textAlign: "center" }}>
                                    {financialData.utilizationBreakdown.facultyStudentDev.percentage}%
                                </td>
                                <td style={{ border: "1px solid #000", padding: "8px", textAlign: "right" }}>
                                    {formatCurrency(financialData.utilizationBreakdown.facultyStudentDev.actual)}
                                </td>
                                <td style={{ border: "1px solid #000", padding: "8px", textAlign: "right" }}>
                                    {formatCurrency(financialData.utilizationBreakdown.facultyStudentDev.balance)}
                                </td>
                            </tr>
                            <tr>
                                <td style={{ border: "1px solid #000", padding: "8px" }}>Higher Education Fund</td>
                                <td style={{ border: "1px solid #000", padding: "8px", textAlign: "center" }}>
                                    {financialData.utilizationBreakdown.heFund.percentage}%
                                </td>
                                <td style={{ border: "1px solid #000", padding: "8px", textAlign: "right" }}>
                                    {formatCurrency(financialData.utilizationBreakdown.heFund.actual)}
                                </td>
                                <td style={{ border: "1px solid #000", padding: "8px", textAlign: "right" }}>
                                    {formatCurrency(financialData.utilizationBreakdown.heFund.balance)}
                                </td>
                            </tr>
                            <tr>
                                <td style={{ border: "1px solid #000", padding: "8px" }}>School Operations Fund</td>
                                <td style={{ border: "1px solid #000", padding: "8px", textAlign: "center" }}>
                                    {financialData.utilizationBreakdown.schoolOperations.percentage}%
                                </td>
                                <td style={{ border: "1px solid #000", padding: "8px", textAlign: "right" }}>
                                    {formatCurrency(financialData.utilizationBreakdown.schoolOperations.actual)}
                                </td>
                                <td style={{ border: "1px solid #000", padding: "8px", textAlign: "right" }}>
                                    {formatCurrency(financialData.utilizationBreakdown.schoolOperations.balance)}
                                </td>
                            </tr>
                            <tr>
                                <td style={{ border: "1px solid #000", padding: "8px" }}>Revolving Capital Fund</td>
                                <td style={{ border: "1px solid #000", padding: "8px", textAlign: "center" }}>
                                    {financialData.utilizationBreakdown.revolvingCapital.percentage}%
                                </td>
                                <td style={{ border: "1px solid #000", padding: "8px", textAlign: "right" }}>
                                    {formatCurrency(financialData.utilizationBreakdown.revolvingCapital.actual)}
                                </td>
                                <td style={{ border: "1px solid #000", padding: "8px", textAlign: "right" }}>
                                    {formatCurrency(financialData.utilizationBreakdown.revolvingCapital.balance)}
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                {/* Signatures */}
                <div
                    style={{
                        marginTop: "40px",
                        display: "flex",
                        justifyContent: "space-between",
                    }}
                >
                    <div style={{ textAlign: "center" }}>
                        <div style={{ fontSize: "12px", marginBottom: "5px" }}>Prepared by:</div>
                        <div
                            style={{
                                width: "200px",
                                height: "60px",
                                border: "1px solid #ccc",
                                marginBottom: "10px",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                            }}
                        >
                            <div style={{ fontSize: "10px", color: "#666" }}>Signature</div>
                        </div>
                        <div style={{ borderBottom: "1px solid #000", width: "200px", marginBottom: "5px" }}></div>
                        <div style={{ fontSize: "12px", fontWeight: "bold" }}>NAME</div>
                        <div style={{ fontSize: "10px" }}>Position</div>
                    </div>

                    <div style={{ textAlign: "center" }}>
                        <div style={{ fontSize: "12px", marginBottom: "5px" }}>Noted:</div>
                        <div
                            style={{
                                width: "200px",
                                height: "60px",
                                border: "1px solid #ccc",
                                marginBottom: "10px",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                            }}
                        >
                            <div style={{ fontSize: "10px", color: "#666" }}>Signature</div>
                        </div>
                        <div style={{ borderBottom: "1px solid #000", width: "200px", marginBottom: "5px" }}></div>
                        <div style={{ fontSize: "12px", fontWeight: "bold" }}>NAME</div>
                        <div style={{ fontSize: "10px" }}>Position</div>
                    </div>
                </div>
            </div>
        );
    }, [report, financialData, schoolData, logoUrl]);

    const exportToPDF = useCallback(async () => {
        if (!financialData || !report) return;

        setPdfLoading(true);

        try {
            // Create a temporary div to render the PDF content
            const tempDiv = document.createElement("div");
            tempDiv.id = "monthly-report-content";
            document.body.appendChild(tempDiv);

            // Create React root and render the PDF template
            const root = createRoot(tempDiv);
            const pdfContent = PDFReportTemplate();

            if (pdfContent) {
                root.render(pdfContent);

                // Wait for rendering to complete
                await new Promise((resolve) => setTimeout(resolve, 100));

                // Convert to canvas
                const canvas = await html2canvas(tempDiv, {
                    backgroundColor: "#ffffff",
                    useCORS: true,
                    logging: false,
                    allowTaint: false,
                    width: tempDiv.offsetWidth,
                    height: tempDiv.offsetHeight,
                });

                // Clean up
                root.unmount();
                document.body.removeChild(tempDiv);

                // Set canvas and open modal
                setPdfCanvas(canvas);
                setPdfModalOpened(true);
            }
        } catch (error) {
            console.error("Error generating PDF:", error);
            notifications.show({
                title: "Error",
                message: "Failed to generate PDF. Please try again.",
                color: "red",
            });
        } finally {
            setPdfLoading(false);
        }
    }, [financialData, report, PDFReportTemplate]);

    if (!report) return null;

    return (
        <>
            <Modal
                opened={opened}
                onClose={onClose}
                title={
                    <Group>
                        <IconCalendar size={20} />
                        <Title order={3}>{report.name}</Title>
                    </Group>
                }
                size="xl"
                padding="lg"
            >
                <Stack gap="lg">
                    {/* Report Information */}
                    <div>
                        <Group gap="md" mb="sm">
                            <Badge color={getStatusColor(report.reportStatus || "draft")} variant="filled">
                                {report.reportStatus || "Draft"}
                            </Badge>
                            <Text size="sm" c="dimmed">
                                Period: {formatReportPeriod(report.id)}
                            </Text>
                        </Group>

                        <Group gap="md">
                            <Text size="sm">
                                <strong>Last Modified:</strong>{" "}
                                {formatUTCDateOnlyLocalized(report.lastModified, "en-US", {
                                    month: "long",
                                    day: "numeric",
                                    year: "numeric",
                                })}
                            </Text>
                            {report.dateApproved && (
                                <Text size="sm">
                                    <strong>Date Approved:</strong>{" "}
                                    {formatUTCDateOnlyLocalized(report.dateApproved, "en-US", {
                                        month: "long",
                                        day: "numeric",
                                        year: "numeric",
                                    })}
                                </Text>
                            )}
                        </Group>
                    </div>

                    <div>
                        <Title order={4} mb="md">
                            Statement of Receipts, Disbursements and Utilization of Income
                        </Title>
                        <Table highlightOnHover>
                            <Table.Tbody>
                                {/* Sales Section */}
                                <Table.Tr>
                                    <Table.Td>
                                        <Text size="sm" fw={600}>
                                            Net Sales
                                        </Text>
                                    </Table.Td>
                                    <Table.Td>
                                        <Text size="sm" c="dimmed">
                                            {financialLoading
                                                ? "Loading..."
                                                : financialData
                                                ? formatCurrency(financialData.netSales)
                                                : "₱0.00"}
                                        </Text>
                                    </Table.Td>
                                </Table.Tr>

                                {/* Cost of Sales Section */}
                                <Table.Tr>
                                    <Table.Td>
                                        <Text size="sm" fw={600}>
                                            Cost of Sales
                                        </Text>
                                    </Table.Td>
                                    <Table.Td>
                                        <Text size="sm" c="dimmed">
                                            {financialLoading
                                                ? "Loading..."
                                                : financialData
                                                ? formatCurrency(financialData.costOfSales)
                                                : "₱0.00"}
                                        </Text>
                                    </Table.Td>
                                </Table.Tr>

                                {/* Gross Profit */}
                                <Table.Tr style={{ backgroundColor: "#f8f9fa" }}>
                                    <Table.Td>
                                        <Text size="sm" fw={700}>
                                            GROSS PROFIT
                                        </Text>
                                    </Table.Td>
                                    <Table.Td>
                                        <Text size="sm" fw={700} c="dimmed">
                                            {financialLoading
                                                ? "Loading..."
                                                : financialData
                                                ? formatCurrency(financialData.grossProfit)
                                                : "₱0.00"}
                                        </Text>
                                    </Table.Td>
                                </Table.Tr>

                                {/* Expenses Section */}
                                <Table.Tr>
                                    <Table.Td>
                                        <Text size="sm" fw={600}>
                                            EXPENSES
                                        </Text>
                                    </Table.Td>
                                    <Table.Td>
                                        <Text size="sm" c="dimmed">
                                            {financialLoading
                                                ? "Loading..."
                                                : financialData
                                                ? formatCurrency(
                                                      financialData.operatingExpenses +
                                                          financialData.administrativeExpenses
                                                  )
                                                : "₱0.00"}
                                        </Text>
                                    </Table.Td>
                                </Table.Tr>
                                <Table.Tr>
                                    <Table.Td pl="md">
                                        <Text size="sm">Operating Costs</Text>
                                    </Table.Td>
                                    <Table.Td>
                                        <Text size="sm" c="dimmed">
                                            {financialLoading
                                                ? "Loading..."
                                                : financialData
                                                ? formatCurrency(financialData.operatingExpenses)
                                                : "₱0.00"}
                                        </Text>
                                    </Table.Td>
                                </Table.Tr>
                                <Table.Tr>
                                    <Table.Td pl="md">
                                        <Text size="sm">Administrative Costs</Text>
                                    </Table.Td>
                                    <Table.Td>
                                        <Text size="sm" c="dimmed">
                                            {financialLoading
                                                ? "Loading..."
                                                : financialData
                                                ? formatCurrency(financialData.administrativeExpenses)
                                                : "₱0.00"}
                                        </Text>
                                    </Table.Td>
                                </Table.Tr>

                                {/* Net Income From Operations */}
                                <Table.Tr style={{ backgroundColor: "#f8f9fa" }}>
                                    <Table.Td>
                                        <Text size="sm" fw={700}>
                                            NET INCOME FROM OPERATIONS
                                        </Text>
                                    </Table.Td>
                                    <Table.Td>
                                        <Text size="sm" fw={700} c="dimmed">
                                            {financialLoading
                                                ? "Loading..."
                                                : financialData
                                                ? formatCurrency(financialData.netIncomeFromOperations)
                                                : "₱0.00"}
                                        </Text>
                                    </Table.Td>
                                </Table.Tr>

                                {/* Utilization of Net Income Section */}
                                <Table.Tr>
                                    <Table.Td>
                                        <Text size="sm" fw={600} pt="md">
                                            UTILIZATION OF NET INCOME
                                        </Text>
                                    </Table.Td>
                                    <Table.Td>
                                        <Text size="sm" fw={600} pt="md">
                                            Percentage
                                        </Text>
                                    </Table.Td>
                                    <Table.Td>
                                        <Text size="sm" fw={600} pt="md">
                                            Actual
                                        </Text>
                                    </Table.Td>
                                    <Table.Td>
                                        <Text size="sm" fw={600} pt="md">
                                            Balance/Output
                                        </Text>
                                    </Table.Td>
                                </Table.Tr>
                                <Table.Tr>
                                    <Table.Td pl="md">
                                        <Text size="sm">Supplementary Feeding Program</Text>
                                    </Table.Td>
                                    <Table.Td>
                                        <Text size="sm" c="dimmed">
                                            30%
                                        </Text>
                                    </Table.Td>
                                    <Table.Td>
                                        <Text size="sm" c="dimmed">
                                            {financialLoading
                                                ? "Loading..."
                                                : financialData
                                                ? formatCurrency(
                                                      financialData.utilizationBreakdown.supplementaryFeeding.actual
                                                  )
                                                : "₱0.00"}
                                        </Text>
                                    </Table.Td>
                                    <Table.Td>
                                        <Text size="sm" c="dimmed">
                                            {financialLoading
                                                ? "Loading..."
                                                : financialData
                                                ? formatCurrency(
                                                      financialData.utilizationBreakdown.supplementaryFeeding.balance
                                                  )
                                                : "₱0.00"}
                                        </Text>
                                    </Table.Td>
                                </Table.Tr>
                                <Table.Tr>
                                    <Table.Td pl="md">
                                        <Text size="sm">Clinic Fund</Text>
                                    </Table.Td>
                                    <Table.Td>
                                        <Text size="sm" c="dimmed">
                                            5%
                                        </Text>
                                    </Table.Td>
                                    <Table.Td>
                                        <Text size="sm" c="dimmed">
                                            {financialLoading
                                                ? "Loading..."
                                                : financialData
                                                ? formatCurrency(financialData.utilizationBreakdown.clinicFund.actual)
                                                : "₱0.00"}
                                        </Text>
                                    </Table.Td>
                                    <Table.Td>
                                        <Text size="sm" c="dimmed">
                                            {financialLoading
                                                ? "Loading..."
                                                : financialData
                                                ? formatCurrency(financialData.utilizationBreakdown.clinicFund.balance)
                                                : "₱0.00"}
                                        </Text>
                                    </Table.Td>
                                </Table.Tr>
                                <Table.Tr>
                                    <Table.Td pl="md">
                                        <Text size="sm">Faculty and Student Development Fund</Text>
                                    </Table.Td>
                                    <Table.Td>
                                        <Text size="sm" c="dimmed">
                                            15%
                                        </Text>
                                    </Table.Td>
                                    <Table.Td>
                                        <Text size="sm" c="dimmed">
                                            {financialLoading
                                                ? "Loading..."
                                                : financialData
                                                ? formatCurrency(
                                                      financialData.utilizationBreakdown.facultyStudentDev.actual
                                                  )
                                                : "₱0.00"}
                                        </Text>
                                    </Table.Td>
                                    <Table.Td>
                                        <Text size="sm" c="dimmed">
                                            {financialLoading
                                                ? "Loading..."
                                                : financialData
                                                ? formatCurrency(
                                                      financialData.utilizationBreakdown.facultyStudentDev.balance
                                                  )
                                                : "₱0.00"}
                                        </Text>
                                    </Table.Td>
                                </Table.Tr>
                                <Table.Tr>
                                    <Table.Td pl="md">
                                        <Text size="sm">HE Instructional Fund</Text>
                                    </Table.Td>
                                    <Table.Td>
                                        <Text size="sm" c="dimmed">
                                            10%
                                        </Text>
                                    </Table.Td>
                                    <Table.Td>
                                        <Text size="sm" c="dimmed">
                                            {financialLoading
                                                ? "Loading..."
                                                : financialData
                                                ? formatCurrency(financialData.utilizationBreakdown.heFund.actual)
                                                : "₱0.00"}
                                        </Text>
                                    </Table.Td>
                                    <Table.Td>
                                        <Text size="sm" c="dimmed">
                                            {financialLoading
                                                ? "Loading..."
                                                : financialData
                                                ? formatCurrency(financialData.utilizationBreakdown.heFund.balance)
                                                : "₱0.00"}
                                        </Text>
                                    </Table.Td>
                                </Table.Tr>
                                <Table.Tr>
                                    <Table.Td pl="md">
                                        <Text size="sm">Schools Operations Fund</Text>
                                    </Table.Td>
                                    <Table.Td>
                                        <Text size="sm" c="dimmed">
                                            25%
                                        </Text>
                                    </Table.Td>
                                    <Table.Td>
                                        <Text size="sm" c="dimmed">
                                            {financialLoading
                                                ? "Loading..."
                                                : financialData
                                                ? formatCurrency(
                                                      financialData.utilizationBreakdown.schoolOperations.actual
                                                  )
                                                : "₱0.00"}
                                        </Text>
                                    </Table.Td>
                                    <Table.Td>
                                        <Text size="sm" c="dimmed">
                                            {financialLoading
                                                ? "Loading..."
                                                : financialData
                                                ? formatCurrency(
                                                      financialData.utilizationBreakdown.schoolOperations.balance
                                                  )
                                                : "₱0.00"}
                                        </Text>
                                    </Table.Td>
                                </Table.Tr>
                                <Table.Tr>
                                    <Table.Td pl="md">
                                        <Text size="sm">Revolving Capital</Text>
                                    </Table.Td>
                                    <Table.Td>
                                        <Text size="sm" c="dimmed">
                                            15%
                                        </Text>
                                    </Table.Td>
                                    <Table.Td>
                                        <Text size="sm" c="dimmed">
                                            {financialLoading
                                                ? "Loading..."
                                                : financialData
                                                ? formatCurrency(
                                                      financialData.utilizationBreakdown.revolvingCapital.actual
                                                  )
                                                : "₱0.00"}
                                        </Text>
                                    </Table.Td>
                                    <Table.Td>
                                        <Text size="sm" c="dimmed">
                                            {financialLoading
                                                ? "Loading..."
                                                : financialData
                                                ? formatCurrency(
                                                      financialData.utilizationBreakdown.revolvingCapital.balance
                                                  )
                                                : "₱0.00"}
                                        </Text>
                                    </Table.Td>
                                </Table.Tr>
                                <Table.Tr style={{ backgroundColor: "#f8f9fa" }}>
                                    <Table.Td>
                                        <Text size="sm" fw={700}>
                                            UTILIZATION OF NET INCOME
                                        </Text>
                                    </Table.Td>
                                    <Table.Td>
                                        <Text size="sm" fw={700}>
                                            100%
                                        </Text>
                                    </Table.Td>
                                    <Table.Td>
                                        <Text size="sm" fw={700} c="dimmed">
                                            {financialLoading
                                                ? "Loading..."
                                                : financialData
                                                ? formatCurrency(
                                                      financialData.utilizationBreakdown.supplementaryFeeding.actual +
                                                          financialData.utilizationBreakdown.clinicFund.actual +
                                                          financialData.utilizationBreakdown.facultyStudentDev.actual +
                                                          financialData.utilizationBreakdown.heFund.actual +
                                                          financialData.utilizationBreakdown.schoolOperations.actual +
                                                          financialData.utilizationBreakdown.revolvingCapital.actual
                                                  )
                                                : "₱0.00"}
                                        </Text>
                                    </Table.Td>
                                    <Table.Td>
                                        <Text size="sm" fw={700} c="dimmed">
                                            {financialLoading
                                                ? "Loading..."
                                                : financialData
                                                ? formatCurrency(
                                                      financialData.utilizationBreakdown.supplementaryFeeding.balance +
                                                          financialData.utilizationBreakdown.clinicFund.balance +
                                                          financialData.utilizationBreakdown.facultyStudentDev.balance +
                                                          financialData.utilizationBreakdown.heFund.balance +
                                                          financialData.utilizationBreakdown.schoolOperations.balance +
                                                          financialData.utilizationBreakdown.revolvingCapital.balance
                                                  )
                                                : "₱0.00"}
                                        </Text>
                                    </Table.Td>
                                </Table.Tr>
                            </Table.Tbody>
                        </Table>
                    </div>

                    {/* Linked Reports Section */}
                    <div>
                        <Title order={4} mb="md">
                            Related Reports
                        </Title>

                        {loading ? (
                            <Text size="sm" c="dimmed">
                                Loading related reports...
                            </Text>
                        ) : linkedReports.length > 0 ? (
                            <Table highlightOnHover>
                                <Table.Thead>
                                    <Table.Tr>
                                        <Table.Th>Report Name</Table.Th>
                                        <Table.Th>Type</Table.Th>
                                        <Table.Th>Status</Table.Th>
                                        {/* <Table.Th>Signatures</Table.Th> */}
                                        <Table.Th>Actions</Table.Th>
                                    </Table.Tr>
                                </Table.Thead>
                                <Table.Tbody>
                                    {linkedReports.map((linkedReport) => {
                                        const Icon = linkedReport.icon;
                                        return (
                                            <Table.Tr key={linkedReport.id}>
                                                <Table.Td>
                                                    <Group gap="sm">
                                                        <Icon size={16} />
                                                        <Text size="sm">{linkedReport.name}</Text>
                                                    </Group>
                                                </Table.Td>
                                                <Table.Td>
                                                    <Text size="sm" tt="capitalize">
                                                        {linkedReport.type}
                                                    </Text>
                                                </Table.Td>
                                                <Table.Td>
                                                    <Badge
                                                        color={getStatusColor(linkedReport.status)}
                                                        variant="light"
                                                        size="sm"
                                                    >
                                                        {linkedReport.status === "not-created"
                                                            ? "Not Created"
                                                            : linkedReport.status || "Draft"}
                                                    </Badge>
                                                </Table.Td>
                                                {/* <Table.Td>
                                                <Text size="sm" c="dimmed">
                                                    {linkedReport.status === "approved" ? "Signed" : "Not Signed"}
                                                </Text>
                                            </Table.Td> */}
                                                <Table.Td>
                                                    <ActionIcon
                                                        variant="subtle"
                                                        color={linkedReport.status === "not-created" ? "gray" : "blue"}
                                                        onClick={() => handleOpenReport(linkedReport.route)}
                                                        aria-label={
                                                            linkedReport.status === "not-created"
                                                                ? `Create ${linkedReport.name}`
                                                                : `Open ${linkedReport.name}`
                                                        }
                                                        title={
                                                            linkedReport.status === "not-created"
                                                                ? "Click to create this report"
                                                                : "Click to open this report"
                                                        }
                                                    >
                                                        <IconExternalLink size={16} />
                                                    </ActionIcon>
                                                </Table.Td>
                                            </Table.Tr>
                                        );
                                    })}
                                </Table.Tbody>
                            </Table>
                        ) : (
                            <Alert
                                variant="light"
                                color="blue"
                                icon={<IconAlertCircle size={16} />}
                                title="No Related Reports"
                            >
                                This monthly report doesn&apos;t have any related daily, payroll, or liquidation reports
                                yet.
                            </Alert>
                        )}
                    </div>

                    {/* Actions */}
                    <Group justify="space-between" mt="md">
                        <Group>
                            <Button
                                variant="light"
                                onClick={() => exportToPDF()}
                                loading={pdfLoading}
                                disabled={!financialData}
                            >
                                Export to PDF
                            </Button>
                        </Group>
                        <Group>
                            {onDelete && (
                                <Button color="red" variant="outline" onClick={handleDeleteReport}>
                                    Delete Report
                                </Button>
                            )}
                            <Button variant="default" onClick={onClose}>
                                Close
                            </Button>
                        </Group>
                    </Group>
                </Stack>
            </Modal>

            {/* PDF Preview Modal */}
            <Modal
                opened={pdfModalOpened}
                onClose={() => setPdfModalOpened(false)}
                title="PDF Preview"
                size="xl"
                centered
            >
                <Stack align="center" p="md">
                    {pdfCanvas && (
                        <Image
                            src={pdfCanvas.toDataURL()}
                            alt="PDF Preview"
                            style={{
                                maxWidth: "100%",
                                maxHeight: "70vh",
                                border: "1px solid #ddd",
                            }}
                        />
                    )}
                    <Group>
                        <Button
                            variant="filled"
                            onClick={() => {
                                if (pdfCanvas) {
                                    const pdf = new jsPDF({
                                        orientation: "portrait",
                                        unit: "mm",
                                        format: "a4",
                                    });

                                    const imgData = pdfCanvas.toDataURL("image/png");
                                    const imgWidth = 210;
                                    const imgHeight = (pdfCanvas.height * imgWidth) / pdfCanvas.width;

                                    let heightLeft = imgHeight;
                                    let position = 0;

                                    pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
                                    heightLeft -= 297;

                                    while (heightLeft >= 0) {
                                        position = heightLeft - imgHeight;
                                        pdf.addPage();
                                        pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
                                        heightLeft -= 297;
                                    }

                                    pdf.save(getFileName());
                                }
                            }}
                            disabled={!pdfCanvas}
                        >
                            Download PDF
                        </Button>
                        <Button variant="outline" onClick={() => setPdfModalOpened(false)}>
                            Close
                        </Button>
                    </Group>
                </Stack>
            </Modal>
        </>
    );
}
