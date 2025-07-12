"use client";

import { Badge, Button, Group, Modal, Stack, Table, Text, Title, ActionIcon, Alert } from "@mantine/core";
import {
    MonthlyReport,
    ReportStatus,
    getSchoolDailyReportV1ReportsDailySchoolIdYearMonthGet,
    getSchoolPayrollReportV1ReportsPayrollSchoolIdYearMonthGet,
    getLiquidationReportV1ReportsLiquidationSchoolIdYearMonthCategoryGet,
} from "@/lib/api/csclient";
import {
    IconEye,
    IconExternalLink,
    IconAlertCircle,
    IconCalendar,
    IconCash,
    IconReceipt,
    IconUsers,
} from "@tabler/icons-react";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import dayjs from "dayjs";
import { customLogger } from "@/lib/api/customLogger";

interface LiquidationReportData {
    reportStatus?: string;
    category?: string;
    [key: string]: unknown;
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
    const [linkedReports, setLinkedReports] = useState<LinkedReport[]>([]);
    const [loading, setLoading] = useState(false);

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
                    route: `/reports/sales`,
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
                    route: `/reports/sales`,
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
                    route: `/reports/payroll`,
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
                    route: `/reports/payroll`,
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
                            route: `/reports/liquidation-report?category=${category.key}`,
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
                            route: `/reports/liquidation-report?category=${category.key}`,
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
                        route: `/reports/liquidation-report?category=${category.key}`,
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

    useEffect(() => {
        if (opened && report) {
            fetchLinkedReports();
        }
    }, [opened, report, fetchLinkedReports]);

    const handleOpenReport = (reportRoute: string) => {
        router.push(reportRoute);
        onClose();
    };

    const handleDeleteReport = async () => {
        if (report && onDelete) {
            await onDelete(report.id);
            onClose();
        }
    };

    if (!report) return null;

    return (
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
                            {report.lastModified
                                ? new Date(report.lastModified).toLocaleDateString("en-US", {
                                      month: "long",
                                      day: "numeric",
                                      year: "numeric",
                                  })
                                : "N/A"}
                        </Text>
                        {report.dateApproved && (
                            <Text size="sm">
                                <strong>Date Approved:</strong>{" "}
                                {new Date(report.dateApproved).toLocaleDateString("en-US", {
                                    month: "long",
                                    day: "numeric",
                                    year: "numeric",
                                })}
                            </Text>
                        )}
                    </Group>
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
                                    <Table.Th>Signatures</Table.Th>
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
                                            <Table.Td>
                                                <Text size="sm" c="dimmed">
                                                    {linkedReport.status === "approved" ? "Signed" : "Not Signed"}
                                                </Text>
                                            </Table.Td>
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
                            leftSection={<IconEye size={16} />}
                            onClick={() =>
                                handleOpenReport(
                                    `/reports/monthly/${dayjs(report.id).format("YYYY")}/${dayjs(report.id).format(
                                        "MM"
                                    )}`
                                )
                            }
                        >
                            View Monthly Report
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
    );
}
