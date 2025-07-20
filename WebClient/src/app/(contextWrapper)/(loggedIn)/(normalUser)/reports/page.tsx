"use client";

import { LiquidationReportModal } from "@/components/LiquidationReportCategory";
import { MonthlyReportDetailsModal } from "@/components/MonthlyReportDetailsModal";
import { MonthlyReportEditModal } from "@/components/MonthlyReportEditModal";
import { ReportStatusManager } from "@/components/ReportStatusManager";
import {
    MonthlyReport,
    School,
    changeDailyReportStatusV1ReportsDailySchoolIdYearMonthStatusPatch,
    changeLiquidationReportStatusV1ReportsLiquidationSchoolIdYearMonthCategoryStatusPatch,
    changePayrollReportStatusV1ReportsPayrollSchoolIdYearMonthStatusPatch,
    deleteSchoolMonthlyReportV1ReportsMonthlySchoolIdYearMonthDelete,
    getAllSchoolMonthlyReportsV1ReportsMonthlySchoolIdGet,
    getSchoolMonthlyReportQuantityV1ReportsMonthlySchoolIdQuantityGet,
} from "@/lib/api/csclient";
import type { ReportStatus } from "@/lib/api/csclient/types.gen";
import { customLogger } from "@/lib/api/customLogger";
import { GetSchoolInfo } from "@/lib/api/school";
import { useUser } from "@/lib/providers/user";
import { formatUTCDateOnlyLocalized } from "@/lib/utils/date";
import {
    ActionIcon,
    Alert,
    Button,
    Card,
    Checkbox,
    Container,
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
    IconBuildings,
    IconCash,
    IconDots,
    IconDownload,
    IconEye,
    IconFileSad,
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

export default function ReportsPage() {
    customLogger.debug("Rendering ReportsPage");

    const router = useRouter();
    const userCtx = useUser();
    const [userAssignedToSchool, setUserAssignedToSchool] = useState<boolean>(true);
    const [schoolData, setSchoolData] = useState<School | null>(null);
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
    const [currentPage, setCurrentPage] = useState(1);
    const [totalReports, setTotalReports] = useState(0);
    const [loading, setLoading] = useState(false);
    const itemsPerPage = 10;

    // Fetch reports with pagination
    const fetchReports = useCallback(
        async (page: number = 1) => {
            if (!userCtx.userInfo?.schoolId) {
                setUserAssignedToSchool(false);
                return;
            }

            setLoading(true);
            try {
                setUserAssignedToSchool(true);

                // Calculate offset for API
                const offset = (page - 1) * itemsPerPage;

                // Fetch reports for current page
                const { data: reports } = await getAllSchoolMonthlyReportsV1ReportsMonthlySchoolIdGet({
                    path: { school_id: userCtx.userInfo.schoolId },
                    query: { offset, limit: itemsPerPage },
                });

                // Fetch total count
                const { data: totalCount } = await getSchoolMonthlyReportQuantityV1ReportsMonthlySchoolIdQuantityGet({
                    path: { school_id: userCtx.userInfo.schoolId },
                });

                customLogger.debug("Fetched reports:", reports);
                customLogger.debug("Total reports count:", totalCount);

                setReportSubmissions(reports || []);
                setTotalReports(totalCount || 0);
            } catch (error) {
                customLogger.error("Failed to fetch reports:", error);
                setReportSubmissions([]);
                setTotalReports(0);
            } finally {
                setLoading(false);
            }
        },
        [userCtx.userInfo?.schoolId]
    );

    // Fetch reports on component mount and when page changes
    useEffect(() => {
        fetchReports(currentPage);
    }, [fetchReports, currentPage]);

    // Fetch reports on component mount
    useEffect(() => {
        const fetchInitialReports = async () => {
            try {
                if (userCtx.userInfo?.schoolId) {
                    await fetchReports(1);
                } else {
                    setUserAssignedToSchool(false);
                    customLogger.warn("No schoolId found in user context");
                }
            } catch (error) {
                customLogger.error("Failed to fetch initial reports:", error);
            }
        };

        fetchInitialReports();
    }, [userCtx.userInfo, fetchReports]);

    // Fetch school data to check for assigned principal
    useEffect(() => {
        const fetchSchoolData = async () => {
            try {
                if (userCtx.userInfo?.schoolId) {
                    const school = await GetSchoolInfo(userCtx.userInfo.schoolId);
                    setSchoolData(school);
                    customLogger.debug("Fetched school data:", school);
                } else {
                    setSchoolData(null);
                }
            } catch (error) {
                customLogger.error("Failed to fetch school data:", error);
                setSchoolData(null);
            }
        };

        fetchSchoolData();
    }, [userCtx.userInfo?.schoolId]);

    const filteredReports = reportSubmissions.filter((report) => {
        const matchesSearch = report.name?.toLowerCase().includes(search.toLowerCase());
        const matchesStatus =
            statusFilter === "all" ||
            (report.reportStatus && report.reportStatus.toLowerCase().replace(/\s+/g, "-") === statusFilter);

        return matchesSearch && matchesStatus;
    });

    // Calculate total pages based on total reports from API
    const totalPages = Math.ceil(totalReports / itemsPerPage);

    // Reset to first page when filters change and refetch
    useEffect(() => {
        if (currentPage !== 1) {
            setCurrentPage(1);
        } else {
            fetchReports(1);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search, statusFilter, categoryFilter, fetchReports]);

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

    const handleReportUpdate = useCallback(async () => {
        // Refetch the current page to get updated data
        await fetchReports(currentPage);
    }, [fetchReports, currentPage]);

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

            // Refetch the current page to get updated data
            await fetchReports(currentPage);

            notifications.show({
                title: "Success",
                message: "Monthly report and all related reports have been deleted successfully.",
                color: "green",
            });

            // Close modal and reset state
            setDeleteConfirmModalOpened(false);
            setReportToDelete(null);
            setSelectedReports([]);
        } catch (error) {
            customLogger.error("Failed to delete report:", error);
            notifications.show({
                title: "Error",
                message: "Failed to delete the report. Please try again.",
                color: "red",
            });
        }
    }, [reportToDelete, userCtx.userInfo?.schoolId, fetchReports, currentPage]);

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

                // if (failedReports.length > 0) {
                //     notifications.show({
                //         title: "Partial Update",
                //         message: `Some component reports could not be updated (${failedReports.length} failed). This is normal if those reports don't exist yet.`,
                //         color: "yellow",
                //     });
                // }

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
        async (reportId: string, newStatus: ReportStatus) => {
            // Refetch the current page to get updated data
            await fetchReports(currentPage);

            // If the status is being changed to "review", cascade to all component reports
            if (newStatus === "review" && userCtx.userInfo?.schoolId) {
                cascadeStatusToComponentReports(reportId, newStatus, userCtx.userInfo.schoolId);
            }
        },
        [userCtx.userInfo?.schoolId, cascadeStatusToComponentReports, fetchReports, currentPage]
    );

    // Check if user can create reports based on role
    const canCreateReports = useMemo(() => {
        const userRoleId = userCtx.userInfo?.roleId;
        // Only Canteen Managers (roleId: 5) can create reports
        // Principals (4), Administrators (3), and Superintendents (2) cannot create reports
        return userRoleId === 5;
    }, [userCtx.userInfo?.roleId]);

    // Check if user has complete profile and is assigned to school
    const hasCompleteProfile = useMemo(() => {
        return !!(
            userCtx.userInfo?.nameFirst &&
            userCtx.userInfo?.nameLast &&
            userCtx.userInfo?.position &&
            userCtx.userInfo?.signatureUrn
        );
    }, [userCtx.userInfo]);

    const isAssignedToSchool = useMemo(() => {
        return !!userCtx.userInfo?.schoolId;
    }, [userCtx.userInfo?.schoolId]);

    const hasPrincipalAssigned = useMemo(() => {
        return !!schoolData?.assignedNotedBy;
    }, [schoolData?.assignedNotedBy]);

    const getDisabledReason = () => {
        if (!isAssignedToSchool) {
            return "Not assigned to a school";
        }
        if (!hasCompleteProfile) {
            return "Profile incomplete";
        }
        if (!hasPrincipalAssigned) {
            return "No principal assigned to school";
        }
        if (!canCreateReports) {
            return "Access restricted by role";
        }
        return "";
    };

    type QuickActionCardProps = {
        title: string;
        description: string;
        icon: React.ElementType;
        color: string;
        onClick: () => void;
        disabled?: boolean;
        disabledReason?: string;
    };

    const QuickActionCard = ({
        title,
        description,
        icon: Icon,
        color,
        onClick,
        disabled = false,
        disabledReason,
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
                        {disabled ? disabledReason || "Access restricted" : description}
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
                                disabled={!canCreateReports}
                                checked={selectedReports.includes(report.id)}
                                onChange={(e) => handleSelectReport(report.id, e.currentTarget.checked)}
                            />
                        </Table.Td>
                        <Table.Td>
                            <div
                                style={{
                                    cursor: hasCompleteProfile ? "pointer" : "not-allowed",
                                    opacity: hasCompleteProfile ? 1 : 0.6,
                                }}
                                onClick={hasCompleteProfile ? () => handleOpenReportDetails(report) : undefined}
                            >
                                <Text fw={500} size="sm" c={hasCompleteProfile ? undefined : "dimmed"}>
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
                                        disabled={!hasCompleteProfile}
                                        currentStatus={report.reportStatus || "draft"}
                                        reportType="monthly"
                                        schoolId={userCtx.userInfo.schoolId}
                                        year={parseInt(dayjs(report.id).format("YYYY"))}
                                        month={parseInt(dayjs(report.id).format("MM"))}
                                        onStatusChanged={(newStatus) => handleReportStatusChange(report.id, newStatus)}
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
                                {formatUTCDateOnlyLocalized(report.lastModified, "en-US", {
                                    month: "2-digit",
                                    day: "2-digit",
                                    year: "numeric",
                                })}
                            </Text>
                        </Table.Td>
                        <Table.Td>
                            <Menu disabled={!hasCompleteProfile} withinPortal position="bottom-end" shadow="sm">
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
            hasCompleteProfile,
            userCtx.userInfo?.schoolId,
        ]
    );

    // Show notification for users not assigned to school
    useEffect(() => {
        if (!isAssignedToSchool && userCtx.userInfo) {
            notifications.show({
                id: "no-school-assigned",
                title: "No School Assigned",
                message:
                    "You are not yet assigned to a school! You will not be able to create or manage reports until you are assigned to a school. Please contact your administrator to get assigned.",
                color: "yellow",
                icon: <IconAlertCircle size={16} />,
                autoClose: false,
                withCloseButton: true,
            });
        }
    }, [isAssignedToSchool, userCtx.userInfo]);

    // Show notification for incomplete profile
    useEffect(() => {
        if (!hasCompleteProfile && userCtx.userInfo && isAssignedToSchool) {
            notifications.show({
                id: "incomplete-profile",
                title: "Incomplete Profile",
                message:
                    "Your profile is incomplete. Please update your profile with your full name, position, and signature to create reports.",
                color: "red",
                icon: <IconAlertCircle size={16} />,
                autoClose: false,
                withCloseButton: true,
            });
        }
    }, [hasCompleteProfile, userCtx.userInfo, isAssignedToSchool]);

    // Show notification for schools without assigned principal
    useEffect(() => {
        if (!hasPrincipalAssigned && userCtx.userInfo && isAssignedToSchool && hasCompleteProfile && schoolData) {
            notifications.show({
                id: "no-principal-assigned",
                title: "No Principal Assigned",
                message:
                    "Your school does not have a principal assigned. Reports require a principal for approval. Please contact your administrator to assign a principal to your school.",
                color: "orange",
                icon: <IconAlertCircle size={16} />,
                autoClose: false,
                withCloseButton: true,
            });
        }
    }, [hasPrincipalAssigned, userCtx.userInfo, isAssignedToSchool, hasCompleteProfile, schoolData]);

    return (
        <Stack gap="lg">
            {!canCreateReports && userCtx.userInfo?.roleId && (
                <Alert variant="light" color="blue" title="Role-Based Access" icon={<IconAlertCircle size={16} />}>
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
                            disabled={
                                !canCreateReports || !hasCompleteProfile || !isAssignedToSchool || !hasPrincipalAssigned
                            }
                            disabledReason={getDisabledReason()}
                        />
                    </Grid.Col>
                    <Grid.Col span={4}>
                        <QuickActionCard
                            title="Liquidation Report"
                            description="Create liquidation report"
                            icon={IconReceipt}
                            color="green"
                            onClick={() => setLiquidationModalOpened(true)}
                            disabled={
                                !canCreateReports || !hasCompleteProfile || !isAssignedToSchool || !hasPrincipalAssigned
                            }
                            disabledReason={getDisabledReason()}
                        />
                    </Grid.Col>
                    <Grid.Col span={4}>
                        <QuickActionCard
                            title="Payroll"
                            description="Manage staff payroll"
                            icon={IconUsers}
                            color="violet"
                            onClick={handleNavigateToPayroll}
                            disabled={
                                !canCreateReports || !hasCompleteProfile || !isAssignedToSchool || !hasPrincipalAssigned
                            }
                            disabledReason={getDisabledReason()}
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
                                    disabled={loading}
                                />
                            </Table.Th>
                            <Table.Th>Report Name</Table.Th>
                            <Table.Th>Status</Table.Th>
                            <Table.Th>Period</Table.Th>
                            <Table.Th>Last Modified</Table.Th>
                            <Table.Th></Table.Th>
                        </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody style={{ opacity: loading ? 0.5 : 1 }}>
                        {loading ? (
                            <Table.Tr>
                                <Table.Td colSpan={6} style={{ textAlign: "center", padding: "2rem" }}>
                                    <Text c="dimmed">Loading reports...</Text>
                                </Table.Td>
                            </Table.Tr>
                        ) : (
                            rows
                        )}
                    </Table.Tbody>
                </Table>

                {!loading && filteredReports.length === 0 && (
                    <Paper p="xl" ta="center">
                        {userAssignedToSchool ? (
                            <Container size="xl" mt={50} style={{ textAlign: "center" }}>
                                <IconFileSad
                                    size={64}
                                    style={{ margin: "auto", display: "block" }}
                                    color="var(--mantine-color-dimmed)"
                                />
                                <Text size="lg" mt="xl" c="dimmed">
                                    No Reports Found
                                </Text>
                            </Container>
                        ) : (
                            <Container size="xl" mt={50} style={{ textAlign: "center" }}>
                                <IconBuildings
                                    size={64}
                                    style={{ margin: "auto", display: "block" }}
                                    color="var(--mantine-color-dimmed)"
                                />
                                <Text size="lg" mt="xl" c="dimmed">
                                    You are not assigned to any school
                                </Text>
                            </Container>
                        )}
                    </Paper>
                )}
            </Paper>

            {/* Pagination */}
            {totalReports > 0 && (
                <Group justify="center">
                    <Pagination
                        total={totalPages}
                        value={currentPage}
                        onChange={setCurrentPage}
                        size="sm"
                        disabled={loading}
                    />
                </Group>
            )}

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
