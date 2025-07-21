"use client";

import { MonthlyReportDetailsModal } from "@/components/MonthlyReportDetailsModal";
import { MonthlyReportEditModal } from "@/components/MonthlyReportEditModal";
import { ReportStatusManager } from "@/components/ReportStatusManager";
import {
    MonthlyReport,
    School,
    deleteSchoolMonthlyReportV1ReportsMonthlySchoolIdYearMonthDelete,
    getAllSchoolMonthlyReportsV1ReportsMonthlySchoolIdGet,
} from "@/lib/api/csclient";
import type { ReportStatus } from "@/lib/api/csclient/types.gen";
import { customLogger } from "@/lib/api/customLogger";
import { GetAllSchools, GetSchoolInfo } from "@/lib/api/school";
import { useUser } from "@/lib/providers/user";
import {
    ActionIcon,
    Button,
    Checkbox,
    Container,
    Flex,
    Group,
    Menu,
    Modal,
    Pagination,
    Paper,
    ScrollArea,
    Select,
    Stack,
    Table,
    Text,
    TextInput,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
    IconDots,
    IconDownload,
    IconEye,
    IconFileSad,
    IconFilter,
    IconPencil,
    IconSearch,
    IconTrash,
} from "@tabler/icons-react";
import dayjs from "dayjs";
import { useCallback, useEffect, useMemo, useState } from "react";
import { formatUTCDateOnlyLocalized } from "@/lib/utils/date";

export default function ReportsPage() {
    customLogger.debug("Rendering Administration ReportsPage");

    const userCtx = useUser();
    const [search, setSearch] = useState("");
    const [selectedReports, setSelectedReports] = useState<string[]>([]);
    const [statusFilter, setStatusFilter] = useState("all");
    const [showArchived, setShowArchived] = useState(false);
    const [detailsModalOpened, setDetailsModalOpened] = useState(false);
    const [editModalOpened, setEditModalOpened] = useState(false);
    const [deleteConfirmModalOpened, setDeleteConfirmModalOpened] = useState(false);
    const [archiveConfirmModalOpened, setArchiveConfirmModalOpened] = useState(false);
    const [reportToDelete, setReportToDelete] = useState<string | null>(null);
    const [reportToArchive, setReportToArchive] = useState<MonthlyReport | null>(null);
    const [selectedReport, setSelectedReport] = useState<MonthlyReport | null>(null);
    const [allReports, setAllReports] = useState<MonthlyReport[]>([]);
    const [parsedSubmittedBySchools, setParsedSubmittedBySchools] = useState<Record<number, School>>({});

    // Fetch all monthly reports from all schools
    const fetchAllMonthlyReports = async () => {
        try {
            // First get all schools
            const schools = await GetAllSchools(0, 10000);
            const allReports: MonthlyReport[] = [];

            // Fetch reports from each school
            for (const school of schools) {
                try {
                    const { data: schoolReports } = await getAllSchoolMonthlyReportsV1ReportsMonthlySchoolIdGet({
                        path: { school_id: school.id! },
                        query: { offset: 0, limit: 1000 }, // Get all reports for each school
                    });
                    if (schoolReports) {
                        allReports.push(...schoolReports);
                    }
                } catch (error) {
                    customLogger.error(`Failed to fetch reports for school ${school.id}:`, error);
                    // Continue with other schools even if one fails
                }
            }

            setAllReports(allReports);
            customLogger.debug("Fetched all reports:", allReports);
        } catch (error) {
            customLogger.error("Failed to fetch all monthly reports:", error);
            notifications.show({
                title: "Error",
                message: "Failed to fetch monthly reports. Please try again later.",
                color: "red",
            });
        }
    };

    // Fetch reports on component mount
    useEffect(() => {
        fetchAllMonthlyReports();
    }, []);

    const filteredReports = allReports.filter((report) => {
        const matchesSearch = report.name?.toLowerCase().includes(search.toLowerCase());
        const matchesStatus =
            statusFilter === "all" ||
            (report.reportStatus && report.reportStatus.toLowerCase().replace(/\s+/g, "-") === statusFilter);

        // Filter out archived reports unless explicitly showing them
        const matchesArchived = showArchived || report.reportStatus !== "archived";

        return matchesSearch && matchesStatus && matchesArchived;
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
        setAllReports((prev) => prev.map((report) => (report.id === updatedReport.id ? updatedReport : report)));
    }, []);

    const handleDeleteReport = useCallback(async (reportId: string) => {
        setReportToDelete(reportId);
        setDeleteConfirmModalOpened(true);
    }, []);

    const confirmDeleteReport = useCallback(async () => {
        if (!reportToDelete) return;

        try {
            // Find the report to get the school ID
            const reportToDeleteObj = allReports.find((r) => r.id === reportToDelete);
            if (!reportToDeleteObj) {
                notifications.show({
                    title: "Error",
                    message: "Report not found.",
                    color: "red",
                });
                return;
            }

            const year = parseInt(dayjs(reportToDelete).format("YYYY"));
            const month = parseInt(dayjs(reportToDelete).format("MM"));

            await deleteSchoolMonthlyReportV1ReportsMonthlySchoolIdYearMonthDelete({
                path: {
                    school_id: reportToDeleteObj.submittedBySchool,
                    year,
                    month,
                },
            });

            // Remove from local state
            setAllReports((prev) => prev.filter((r) => r.id !== reportToDelete));

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
    }, [reportToDelete, allReports]);

    const cancelDeleteReport = useCallback(() => {
        setDeleteConfirmModalOpened(false);
        setReportToDelete(null);
    }, []);

    const handleReportStatusChange = useCallback(
        (reportId: string, newStatus: ReportStatus) => {
            // If trying to archive, show confirmation first
            if (newStatus === "archived") {
                const reportToArchive = allReports.find((r) => r.id === reportId);
                if (reportToArchive) {
                    setReportToArchive(reportToArchive);
                    setArchiveConfirmModalOpened(true);
                    return;
                }
            }

            // Update the local state to reflect the status change for non-archive statuses
            setAllReports((prev) =>
                prev.map((report) => (report.id === reportId ? { ...report, reportStatus: newStatus } : report))
            );
        },
        [allReports]
    );

    const confirmArchiveReport = useCallback(async () => {
        if (!reportToArchive) return;

        // Update the local state to reflect the archive status change
        setAllReports((prev) =>
            prev.map((report) => (report.id === reportToArchive.id ? { ...report, reportStatus: "archived" } : report))
        );

        // Close modal and reset state
        setArchiveConfirmModalOpened(false);
        setReportToArchive(null);
    }, [reportToArchive]);

    const cancelArchiveReport = useCallback(() => {
        setArchiveConfirmModalOpened(false);
        setReportToArchive(null);
    }, []);

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

    // Check if user can create reports based on role
    const canCreateReports = useMemo(() => {
        const userRoleId = userCtx.userInfo?.roleId;
        // Only Canteen Managers (roleId: 5) can create reports
        // Principals (4), Administrators (3), and Superintendents (2) cannot create reports
        return userRoleId === 5;
    }, [userCtx.userInfo?.roleId]);

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
                                <ReportStatusManager
                                    currentStatus={report.reportStatus || "draft"}
                                    reportType="monthly"
                                    schoolId={report.submittedBySchool}
                                    year={parseInt(dayjs(report.id).format("YYYY"))}
                                    month={parseInt(dayjs(report.id).format("MM"))}
                                    onStatusChanged={(newStatus) => handleReportStatusChange(report.id, newStatus)}
                                    disabled={false}
                                />
                            </Group>
                        </Table.Td>
                        <Table.Td>
                            <div>
                                <Text size="sm">{dayjs(report.id).format("MMMM YYYY")}</Text>
                            </div>
                        </Table.Td>
                        <Table.Td>
                            {" "}
                            <Text size="sm" c="dimmed">
                                {formatUTCDateOnlyLocalized(report.lastModified, "en-US", {
                                    month: "2-digit",
                                    day: "2-digit",
                                    year: "numeric",
                                })}
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
        ]
    );

    return (
        <Container size="xl" py={{ base: "sm", md: "md" }}>
            <Stack gap="lg">
                {/* Filters and Search */}
                <Paper shadow="xs" p={{ base: "sm", md: "md" }}>
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
                            w={{ base: "auto", sm: 180 }}
                        />
                        <Checkbox
                            label="Show archived reports"
                            checked={showArchived}
                            onChange={(event) => setShowArchived(event.currentTarget.checked)}
                            size="sm"
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
                    <ScrollArea>
                        <Table highlightOnHover>
                            <Table.Thead>
                                <Table.Tr>
                                    <Table.Th>
                                        <Checkbox
                                            checked={
                                                selectedReports.length === filteredReports.length &&
                                                filteredReports.length > 0
                                            }
                                            indeterminate={
                                                selectedReports.length > 0 &&
                                                selectedReports.length < filteredReports.length
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
                    </ScrollArea>

                    {filteredReports.length === 0 && (
                        <Paper pb="xl" ta="center">
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
                        </Paper>
                    )}
                </Paper>

                {/* Pagination */}
                <Group justify="center">
                    <Pagination total={Math.ceil(filteredReports.length / 10)} />
                </Group>

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

                {/* Archive Confirmation Modal */}
                <Modal
                    opened={archiveConfirmModalOpened}
                    onClose={cancelArchiveReport}
                    title="Confirm Archive"
                    centered
                >
                    <Stack gap="md">
                        <Text>
                            Are you sure you want to archive this monthly report? This action cannot be undone. Archived
                            reports will be hidden from the main view and cannot be modified.
                        </Text>
                        <Text size="sm" c="dimmed">
                            Report: <strong>{reportToArchive?.name}</strong>
                        </Text>
                        <Group justify="flex-end" gap="sm">
                            <Button variant="default" onClick={cancelArchiveReport}>
                                Cancel
                            </Button>
                            <Button color="orange" onClick={confirmArchiveReport}>
                                Archive Report
                            </Button>
                        </Group>
                    </Stack>
                </Modal>
            </Stack>
        </Container>
    );
}
