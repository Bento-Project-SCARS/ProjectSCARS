"use client";

import { LiquidationReportModal } from "@/components/LiquidationReportCategory";
import { MonthlyReportDetailsModal } from "@/components/MonthlyReportDetailsModal";
import { MonthlyReportEditModal } from "@/components/MonthlyReportEditModal";
import { ReportStatusManager } from "@/components/ReportStatusManager";
import { GetSchoolInfo } from "@/lib/api/school";
import { useUser } from "@/lib/providers/user";
import {
    MonthlyReport,
    School,
    getAllSchoolMonthlyReportsV1ReportsMonthlySchoolIdGet,
    deleteSchoolMonthlyReportV1ReportsMonthlySchoolIdYearMonthDelete,
    changeDailyReportStatusV1ReportsDailySchoolIdYearMonthStatusPatch,
    changePayrollReportStatusV1ReportsPayrollSchoolIdYearMonthStatusPatch,
    changeLiquidationReportStatusV1ReportsLiquidationSchoolIdYearMonthCategoryStatusPatch,
} from "@/lib/api/csclient";
import type { ReportStatus } from "@/lib/api/csclient/types.gen";
import {
    ActionIcon,
    Alert,
    Button,
    Card,
    Checkbox,
    Flex,
    Grid,
    Group,
    Menu,
    Modal,
    Pagination,
    Paper,
    Select,
    Stack,
    Table,
    Text,
    TextInput,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
    IconAlertCircle,
    IconCash,
    IconDots,
    IconDownload,
    IconEye,
    IconFilter,
    IconPencil,
    IconReceipt,
    IconSearch,
    IconTrash,
    IconUsers,
} from "@tabler/icons-react";
import dayjs from "dayjs";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { customLogger } from "@/lib/api/customLogger";

export default function ReportsPage() {
    customLogger.debug("Rendering ReportsPage");

    const router = useRouter();
    const userCtx = useUser();
    const [userAssignedToSchool, setUserAssignedToSchool] = useState<boolean>(true);
    const [search, setSearch] = useState("");
    const [selectedReports, setSelectedReports] = useState<string[]>([]);
    const [statusFilter, setStatusFilter] = useState("all");
    const [categoryFilter, setCategoryFilter] = useState("all");
    const [liquidationModalOpened, setLiquidationModalOpened] = useState(false);
    const [detailsModalOpened, setDetailsModalOpened] = useState(false);
    const [editModalOpened, setEditModalOpened] = useState(false);
    const [deleteConfirmModalOpened, setDeleteConfirmModalOpened] = useState(false);
    const [reportToDelete, setReportToDelete] = useState<string | null>(null);
    const [selectedReport, setSelectedReport] = useState<MonthlyReport | null>(null);
    const [reportSubmissions, setReportSubmissions] = useState<MonthlyReport[]>([]);
    const [parsedSubmittedBySchools, setParsedSubmittedBySchools] = useState<Record<number, School>>({});

    // Fetch reports on component mount
    useEffect(() => {
        const fetchReports = async () => {
            try {
                if (userCtx.userInfo?.schoolId) {
                    setUserAssignedToSchool(true);
                    const { data: reports } = await getAllSchoolMonthlyReportsV1ReportsMonthlySchoolIdGet({
                        path: { school_id: userCtx.userInfo.schoolId },
                        query: { offset: 0, limit: 10 },
                    });
                    customLogger.debug("Fetched reports:", reports);
                    setReportSubmissions(reports || []);
                } else {
                    setUserAssignedToSchool(false);
                    customLogger.warn("No schoolId found in user context");
                }
            } catch (error) {
                customLogger.error("Failed to fetch reports:", error);
            }
        };

        fetchReports();
    }, [userCtx.userInfo]);

    const filteredReports = reportSubmissions.filter((report) => {
        const matchesSearch = report.name?.toLowerCase().includes(search.toLowerCase());
        const matchesStatus =
            statusFilter === "all" ||
            (report.reportStatus && report.reportStatus.toLowerCase().replace(/\s+/g, "-") === statusFilter);

        return matchesSearch && matchesStatus;
    });

    const handleSelectAll = (checked: boolean) => {
        if (checked) {
            setSelectedReports(filteredReports.map((r) => r.id));
        } else {
            setSelectedReports([]);
        }
    };

    const handleSelectReport = useCallback((id: string, checked: boolean) => {
        if (checked) {
            setSelectedReports((prev) => [...prev, id]);
        } else {
            setSelectedReports((prev) => prev.filter((reportId) => reportId !== id));
        }
    }, []);

    const handleNavigateToSales = () => {
        router.push("/reports/sales");
    };

    const handleCreateLiquidationReport = (category: string, path: string) => {
        customLogger.log(`Selected liquidation category: ${category}, navigating to: ${path}`);
    };

    const handleOpenReportDetails = useCallback((report: MonthlyReport) => {
        setSelectedReport(report);
        setDetailsModalOpened(true);
    }, []);

    const handleCloseDetailsModal = useCallback(() => {
        setDetailsModalOpened(false);
        setSelectedReport(null);
    }, []);

    const handleOpenEditModal = useCallback((report: MonthlyReport) => {
        setSelectedReport(report);
        setEditModalOpened(true);
    }, []);

    const handleCloseEditModal = useCallback(() => {
        setEditModalOpened(false);
        setSelectedReport(null);
    }, []);

    const handleReportUpdate = useCallback((updatedReport: MonthlyReport) => {
        // Update the local state with the updated report
        setReportSubmissions((prev) => prev.map((report) => (report.id === updatedReport.id ? updatedReport : report)));
    }, []);

    const handleDeleteReport = useCallback(async (reportId: string) => {
        setReportToDelete(reportId);
        setDeleteConfirmModalOpened(true);
    }, []);

    const confirmDeleteReport = useCallback(async () => {
        if (!reportToDelete) return;

        try {
            if (!userCtx.userInfo?.schoolId) {
                notifications.show({
                    title: "Error",
                    message: "You must be assigned to a school to delete reports.",
                    color: "red",
                });
                return;
            }

            const year = parseInt(dayjs(reportToDelete).format("YYYY"));
            const month = parseInt(dayjs(reportToDelete).format("MM"));

            await deleteSchoolMonthlyReportV1ReportsMonthlySchoolIdYearMonthDelete({
                path: {
                    school_id: userCtx.userInfo.schoolId,
                    year,
                    month,
                },
            });

            // Remove from local state
            setReportSubmissions((prev) => prev.filter((r) => r.id !== reportToDelete));

            notifications.show({
                title: "Success",
                message: "Monthly report and all related reports have been deleted successfully.",
                color: "green",
            });

            // Close modal and reset state
            setDeleteConfirmModalOpened(false);
            setReportToDelete(null);
        } catch (error) {
            customLogger.error("Failed to delete report:", error);
            notifications.show({
                title: "Error",
                message: "Failed to delete the report. Please try again.",
                color: "red",
            });
        }
    }, [reportToDelete, userCtx.userInfo?.schoolId]);

    const cancelDeleteReport = useCallback(() => {
        setDeleteConfirmModalOpened(false);
        setReportToDelete(null);
    }, []);

    const handleNavigateToPayroll = () => {
        router.push("/reports/payroll");
    };

    const cascadeStatusToComponentReports = useCallback(
        async (reportId: string, newStatus: ReportStatus, schoolId: number) => {
            try {
                const year = parseInt(dayjs(reportId).format("YYYY"));
                const month = parseInt(dayjs(reportId).format("MM"));

                customLogger.log(`Cascading status "${newStatus}" to component reports for ${year}-${month}`);

                const statusChangeRequest = {
                    new_status: newStatus,
                    comments: "Auto-cascaded from monthly report status change",
                };

                // Array to track which component reports were successfully updated
                const updatedReports: string[] = [];
                const failedReports: string[] = [];

                // Change Daily Financial Report status
                try {
                    await changeDailyReportStatusV1ReportsDailySchoolIdYearMonthStatusPatch({
                        path: { school_id: schoolId, year, month },
                        body: statusChangeRequest,
                    });
                    updatedReports.push("Daily Financial Report");
                } catch (error) {
                    customLogger.warn("Failed to update Daily Financial Report status:", error);
                    failedReports.push("Daily Financial Report");
                }

                // Change Payroll Report status
                try {
                    await changePayrollReportStatusV1ReportsPayrollSchoolIdYearMonthStatusPatch({
                        path: { school_id: schoolId, year, month },
                        body: statusChangeRequest,
                    });
                    updatedReports.push("Payroll Report");
                } catch (error) {
                    customLogger.warn("Failed to update Payroll Report status:", error);
                    failedReports.push("Payroll Report");
                }

                // Change all Liquidation Report statuses
                const liquidationCategories = [
                    "operating_expenses",
                    "administrative_expenses",
                    "supplementary_feeding_fund",
                    "clinic_fund",
                    "faculty_stud_dev_fund",
                    "he_fund",
                    "school_operations_fund",
                    "revolving_fund",
                ];

                for (const category of liquidationCategories) {
                    try {
                        await changeLiquidationReportStatusV1ReportsLiquidationSchoolIdYearMonthCategoryStatusPatch({
                            path: { school_id: schoolId, year, month, category },
                            body: statusChangeRequest,
                        });
                        updatedReports.push(
                            `${category.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())} Report`
                        );
                    } catch (error) {
                        customLogger.warn(`Failed to update ${category} liquidation report status:`, error);
                        failedReports.push(
                            `${category.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())} Report`
                        );
                    }
                }

                // Show notification about the cascade operation
                if (updatedReports.length > 0) {
                    notifications.show({
                        title: "Component Reports Updated",
                        message: `Successfully updated ${updatedReports.length} component report(s) to "${newStatus}" status.`,
                        color: "green",
                    });
                }

                if (failedReports.length > 0) {
                    notifications.show({
                        title: "Partial Update",
                        message: `Some component reports could not be updated (${failedReports.length} failed). This is normal if those reports don't exist yet.`,
                        color: "yellow",
                    });
                }

                customLogger.log(
                    `Cascade complete. Updated: ${updatedReports.join(", ")}. Failed: ${failedReports.join(", ")}`
                );
            } catch (error) {
                customLogger.error("Error during cascade operation:", error);
                notifications.show({
                    title: "Cascade Error",
                    message: "An error occurred while updating component reports. Please check the logs.",
                    color: "red",
                });
            }
        },
        []
    );

    const handleReportStatusChange = useCallback(
        (reportId: string, newStatus: ReportStatus) => {
            // Update the local state to reflect the status change
            setReportSubmissions((prev) =>
                prev.map((report) => (report.id === reportId ? { ...report, reportStatus: newStatus } : report))
            );

            // If the status is being changed to "review", cascade to all component reports
            if (newStatus === "review" && userCtx.userInfo?.schoolId) {
                cascadeStatusToComponentReports(reportId, newStatus, userCtx.userInfo.schoolId);
            }
        },
        [userCtx.userInfo?.schoolId, cascadeStatusToComponentReports]
    );

    // Check if user can create reports based on role
    const canCreateReports = useMemo(() => {
        const userRoleId = userCtx.userInfo?.roleId;
        // Only Canteen Managers (roleId: 5) can create reports
        // Principals (4), Administrators (3), and Superintendents (2) cannot create reports
        return userRoleId === 5;
    }, [userCtx.userInfo?.roleId]);

    type QuickActionCardProps = {
        title: string;
        description: string;
        icon: React.ElementType;
        color: string;
        onClick: () => void;
        disabled?: boolean;
    };

    const QuickActionCard = ({
        title,
        description,
        icon: Icon,
        color,
        onClick,
        disabled = false,
    }: QuickActionCardProps) => (
        <Card
            shadow="sm"
            padding="lg"
            radius="md"
            withBorder
            style={{
                cursor: disabled ? "not-allowed" : "pointer",
                opacity: disabled ? 0.6 : 1,
            }}
            onClick={disabled ? undefined : onClick}
        >
            <Group>
                <ActionIcon size="xl" variant="light" color={disabled ? "gray" : color}>
                    <Icon size={24} />
                </ActionIcon>
                <div>
                    <Text fw={500} c={disabled ? "dimmed" : undefined}>
                        {title}
                    </Text>
                    <Text size="sm" c="dimmed">
                        {disabled ? "Access restricted by role" : description}
                    </Text>
                </div>
            </Group>
        </Card>
    );

    const parseSubmittedBySchool = useCallback(async (submittedBySchool: number) => {
        try {
            const school = await GetSchoolInfo(submittedBySchool);
            setParsedSubmittedBySchools((prev) => ({
                ...prev,
                [submittedBySchool]: school,
            }));
            return school;
        } catch (error) {
            customLogger.error("Failed to fetch school info:", error);
            notifications.show({
                title: "Error",
                message: "Failed to fetch school information for report submission.",
                color: "red",
            });
        }
    }, []);

    // Load school data for reports that don't have it cached
    useEffect(() => {
        filteredReports.forEach((report) => {
            if (!parsedSubmittedBySchools[report.submittedBySchool]) {
                parseSubmittedBySchool(report.submittedBySchool);
            }
        });
    }, [filteredReports, parseSubmittedBySchool, parsedSubmittedBySchools]);

    const rows = useMemo(
        () =>
            filteredReports.map((report) => {
                return (
                    <Table.Tr key={`${report.id}`}>
                        <Table.Td>
                            <Checkbox
                                checked={selectedReports.includes(report.id)}
                                onChange={(e) => handleSelectReport(report.id, e.currentTarget.checked)}
                            />
                        </Table.Td>
                        <Table.Td>
                            <div style={{ cursor: "pointer" }} onClick={() => handleOpenReportDetails(report)}>
                                <Text fw={500} size="sm">
                                    {report.name}
                                </Text>
                                <Text size="xs" c="dimmed">
                                    {parsedSubmittedBySchools[report.submittedBySchool]
                                        ? parsedSubmittedBySchools[report.submittedBySchool].name
                                        : "Loading school..."}
                                </Text>
                            </div>
                        </Table.Td>
                        <Table.Td>
                            <Group gap="xs">
                                <Text
                                    size="sm"
                                    c={
                                        report.reportStatus === "received"
                                            ? "green"
                                            : report.reportStatus === "review"
                                            ? "orange"
                                            : report.reportStatus === "rejected"
                                            ? "red"
                                            : "dimmed"
                                    }
                                    fw={500}
                                    tt="capitalize"
                                >
                                    {report.reportStatus || "Draft"}
                                </Text>
                                {userCtx.userInfo?.schoolId && (
                                    <ReportStatusManager
                                        currentStatus={report.reportStatus || "draft"}
                                        reportType="monthly"
                                        schoolId={userCtx.userInfo.schoolId}
                                        year={parseInt(dayjs(report.id).format("YYYY"))}
                                        month={parseInt(dayjs(report.id).format("MM"))}
                                        onStatusChanged={(newStatus) => handleReportStatusChange(report.id, newStatus)}
                                        disabled={false}
                                    />
                                )}
                            </Group>
                        </Table.Td>
                        <Table.Td>
                            <div>
                                <Text size="sm">{dayjs(report.id).format("MMMM YYYY")}</Text>
                            </div>
                        </Table.Td>
                        <Table.Td>
                            <Text size="sm" c="dimmed">
                                {report.lastModified
                                    ? new Date(report.lastModified).toLocaleDateString("en-US", {
                                          month: "2-digit",
                                          day: "2-digit",
                                          year: "numeric",
                                      })
                                    : "N/A"}
                            </Text>
                        </Table.Td>
                        <Table.Td>
                            <Menu withinPortal position="bottom-end" shadow="sm">
                                <Menu.Target>
                                    <ActionIcon variant="subtle" color="gray">
                                        <IconDots size={16} />
                                    </ActionIcon>
                                </Menu.Target>
                                <Menu.Dropdown>
                                    <Menu.Item
                                        leftSection={<IconEye size={14} />}
                                        onClick={() => handleOpenReportDetails(report)}
                                    >
                                        View
                                    </Menu.Item>
                                    {canCreateReports &&
                                        (report.reportStatus === "draft" || report.reportStatus === "rejected") && (
                                            <>
                                                <Menu.Item
                                                    leftSection={<IconPencil size={14} />}
                                                    onClick={() => handleOpenEditModal(report)}
                                                >
                                                    Edit
                                                </Menu.Item>
                                                <Menu.Divider />
                                                <Menu.Item
                                                    color="red"
                                                    leftSection={<IconTrash size={14} />}
                                                    onClick={() => handleDeleteReport(report.id)}
                                                >
                                                    Delete
                                                </Menu.Item>
                                            </>
                                        )}
                                    <Menu.Item leftSection={<IconDownload size={14} />}>Download</Menu.Item>
                                </Menu.Dropdown>
                            </Menu>
                        </Table.Td>
                    </Table.Tr>
                );
            }),
        [
            filteredReports,
            selectedReports,
            parsedSubmittedBySchools,
            handleSelectReport,
            handleDeleteReport,
            handleOpenReportDetails,
            handleOpenEditModal,
            handleReportStatusChange,
            canCreateReports,
            userCtx.userInfo?.schoolId,
        ]
    );

    return (
        <Stack gap="lg">
            {!userCtx.userInfo?.schoolId && (
                <Alert
                    variant="light"
                    color="yellow"
                    withCloseButton
                    title="Warning"
                    icon={<IconAlertCircle size={16} />}
                >
                    You are not yet assigned to a school! Reports you create will fail to submit.
                </Alert>
            )}

            {!canCreateReports && userCtx.userInfo?.roleId && (
                <Alert variant="light" color="blue" title="Role-based Access" icon={<IconAlertCircle size={16} />}>
                    As a{" "}
                    {userCtx.userInfo.roleId === 4
                        ? "Principal"
                        : userCtx.userInfo.roleId === 3
                        ? "Administrator"
                        : userCtx.userInfo.roleId === 2
                        ? "Superintendent"
                        : "non-Canteen Manager"}
                    , you can view and manage reports but cannot create new ones. Only Canteen Managers can create
                    reports.
                </Alert>
            )}
            {/* Quick Actions */}
            <Paper shadow="xs" p="md">
                <Grid>
                    <Grid.Col span={4}>
                        <QuickActionCard
                            title="Daily Sales"
                            description="Record today's sales"
                            icon={IconCash}
                            color="blue"
                            onClick={handleNavigateToSales}
                            disabled={!canCreateReports}
                        />
                    </Grid.Col>
                    <Grid.Col span={4}>
                        <QuickActionCard
                            title="Liquidation Report"
                            description="Create liquidation report"
                            icon={IconReceipt}
                            color="green"
                            onClick={() => setLiquidationModalOpened(true)}
                            disabled={!canCreateReports}
                        />
                    </Grid.Col>
                    <Grid.Col span={4}>
                        <QuickActionCard
                            title="Payroll"
                            description="Manage staff payroll"
                            icon={IconUsers}
                            color="violet"
                            onClick={handleNavigateToPayroll}
                            disabled={!canCreateReports}
                        />
                    </Grid.Col>
                </Grid>
            </Paper>

            {/* Filters and Search */}
            <Paper shadow="xs" p="md">
                <Flex gap="md" align="center" wrap="wrap">
                    <TextInput
                        placeholder="Type report name here"
                        leftSection={<IconSearch size={16} />}
                        value={search}
                        onChange={(e) => setSearch(e.currentTarget.value)}
                        style={{ flex: 1, minWidth: 200 }}
                    />
                    <Select
                        placeholder="Filter by status"
                        leftSection={<IconFilter size={16} />}
                        value={statusFilter}
                        onChange={(value) => setStatusFilter(value ?? "all")}
                        data={[
                            { value: "all", label: "All Status" },
                            { value: "draft", label: "Draft" },
                            { value: "review", label: "Under Review" },
                            { value: "approved", label: "Approved" },
                            { value: "rejected", label: "Rejected" },
                            { value: "received", label: "Received" },
                            { value: "archived", label: "Archived" },
                        ]}
                        w={180}
                    />
                    <Select
                        placeholder="Filter by category"
                        value={categoryFilter}
                        onChange={(value) => setCategoryFilter(value ?? "all")}
                        data={[
                            { value: "all", label: "All Categories" },
                            { value: "monthly-reports", label: "Monthly Reports" },
                            { value: "daily-financial-reports", label: "Daily Financial Reports" },
                            { value: "disbursement-vouchers", label: "Disbursement Vouchers" },
                            { value: "operating-expenses", label: "Operating Expense Reports" },
                            { value: "administrative-expenses", label: "Administrative Expense Reports" },
                            { value: "payroll", label: "Payroll Reports" },
                            { value: "clinic-fund", label: "Clinic Fund Reports" },
                            { value: "supplementary-feeding-fund", label: "Supplementary Feeding Fund Reports" },
                            { value: "he-fund", label: "HE Fund Reports" },
                            {
                                value: "faculty-student-development-fund",
                                label: "Faculty & Student Development Fund Reports",
                            },
                            { value: "school-operation-fund", label: "School Operation Fund Reports" },
                            { value: "revolving-fund", label: "Revolving Fund Reports" },
                        ]}
                        w={160}
                    />
                </Flex>
            </Paper>

            {/* Bulk Actions */}
            {selectedReports.length > 0 && (
                <Paper shadow="xs" p="md">
                    <Flex align="center" gap="md">
                        <Text size="sm">{selectedReports.length} reports selected</Text>
                        <ActionIcon variant="light" size="sm" aria-label="Download">
                            <IconDownload size={16} />
                        </ActionIcon>
                        {canCreateReports && (
                            <ActionIcon variant="light" color="red" size="sm" aria-label="Delete">
                                <IconTrash size={16} />
                            </ActionIcon>
                        )}
                    </Flex>
                </Paper>
            )}

            {/* Reports Table */}
            <Paper shadow="xs">
                <Table highlightOnHover>
                    <Table.Thead>
                        <Table.Tr>
                            <Table.Th>
                                <Checkbox
                                    checked={
                                        selectedReports.length === filteredReports.length && filteredReports.length > 0
                                    }
                                    indeterminate={
                                        selectedReports.length > 0 && selectedReports.length < filteredReports.length
                                    }
                                    onChange={(e) => handleSelectAll(e.currentTarget.checked)}
                                />
                            </Table.Th>
                            <Table.Th>Report Name</Table.Th>
                            <Table.Th>Status</Table.Th>
                            <Table.Th>Period</Table.Th>
                            <Table.Th>Last Modified</Table.Th>
                            <Table.Th></Table.Th>
                        </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>{rows}</Table.Tbody>
                </Table>

                {filteredReports.length === 0 && (
                    <Paper p="xl" ta="center">
                        {userAssignedToSchool ? (
                            <Text c="dimmed">No reports found</Text>
                        ) : (
                            <Text c="dimmed">You are not assigned to any school.</Text>
                        )}
                    </Paper>
                )}
            </Paper>

            {/* Pagination */}
            <Group justify="center">
                <Pagination total={Math.ceil(filteredReports.length / 10)} />
            </Group>

            {/* Liquidation Report Modal */}
            <LiquidationReportModal
                opened={liquidationModalOpened}
                onClose={() => setLiquidationModalOpened(false)}
                onSelect={handleCreateLiquidationReport}
            />

            {/* Monthly Report Details Modal */}
            <MonthlyReportDetailsModal
                opened={detailsModalOpened}
                onClose={handleCloseDetailsModal}
                report={selectedReport}
                onDelete={handleDeleteReport}
            />

            {/* Monthly Report Edit Modal */}
            <MonthlyReportEditModal
                opened={editModalOpened}
                onClose={handleCloseEditModal}
                report={selectedReport}
                onUpdate={handleReportUpdate}
            />

            {/* Delete Confirmation Modal */}
            <Modal opened={deleteConfirmModalOpened} onClose={cancelDeleteReport} title="Confirm Deletion" centered>
                <Stack gap="md">
                    <Text>
                        Are you sure you want to delete this monthly report? This action cannot be undone and will
                        permanently remove the report and all related data.
                    </Text>
                    <Group justify="flex-end" gap="sm">
                        <Button variant="default" onClick={cancelDeleteReport}>
                            Cancel
                        </Button>
                        <Button color="red" onClick={confirmDeleteReport}>
                            Delete Report
                        </Button>
                    </Group>
                </Stack>
            </Modal>
        </Stack>
    );
}
