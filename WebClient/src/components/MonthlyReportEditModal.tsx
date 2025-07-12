"use client";

import { Button, Group, Modal, Stack, Text, TextInput, Alert } from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { MonthlyReport, createSchoolMonthlyReportV1ReportsMonthlySchoolIdYearMonthPatch } from "@/lib/api/csclient";
import { useEffect } from "react";
import dayjs from "dayjs";
import { customLogger } from "@/lib/api/customLogger";
import { IconAlertCircle } from "@tabler/icons-react";

interface MonthlyReportEditModalProps {
    opened: boolean;
    onClose: () => void;
    report: MonthlyReport | null;
    onUpdate?: (updatedReport: MonthlyReport) => void;
}

export function MonthlyReportEditModal({ opened, onClose, report, onUpdate }: MonthlyReportEditModalProps) {
    const form = useForm({
        mode: "uncontrolled",
        initialValues: {
            notedBy: "",
        },
        validate: {
            notedBy: (value) => (value.trim().length < 1 ? "Noted by is required" : null),
        },
    });

    useEffect(() => {
        if (opened && report) {
            form.setValues({
                notedBy: report.notedBy || "",
            });
        }
    }, [opened, report, form]);

    const handleSubmit = async (values: typeof form.values) => {
        if (!report) return;

        try {
            const year = parseInt(dayjs(report.id).format("YYYY"));
            const month = parseInt(dayjs(report.id).format("MM"));

            const { data: updatedReport } = await createSchoolMonthlyReportV1ReportsMonthlySchoolIdYearMonthPatch({
                path: {
                    school_id: report.submittedBySchool,
                    year,
                    month,
                },
                query: {
                    noted_by: values.notedBy.trim(),
                },
            });

            if (updatedReport) {
                notifications.show({
                    title: "Success",
                    message: "Monthly report updated successfully",
                    color: "green",
                });

                onUpdate?.(updatedReport);
                onClose();
            }
        } catch (error) {
            customLogger.error("Failed to update monthly report:", error);
            notifications.show({
                title: "Error",
                message: "Failed to update monthly report. Please try again.",
                color: "red",
            });
        }
    };

    if (!report) return null;

    return (
        <Modal opened={opened} onClose={onClose} title="Edit Monthly Report - Noted By" size="md">
            <form onSubmit={form.onSubmit(handleSubmit)}>
                <Stack gap="md">
                    {report?.reportStatus === "rejected" && (
                        <Alert
                            variant="light"
                            color="orange"
                            icon={<IconAlertCircle size={16} />}
                            title="Report was Rejected"
                        >
                            This report was rejected and can now be edited. After making your changes, you can re-submit
                            it for review using the status manager.
                        </Alert>
                    )}

                    <Text size="sm" c="dimmed">
                        Note: Currently only the &quot;Noted By&quot; field can be edited for monthly reports.
                    </Text>

                    <TextInput
                        label="Noted By"
                        placeholder="Enter name of person who noted the report"
                        key={form.key("notedBy")}
                        {...form.getInputProps("notedBy")}
                        required
                    />

                    {/* Additional details - read-only */}
                    <Stack gap="xs" mt="md">
                        <Text size="sm" fw={500}>
                            Report Details
                        </Text>

                        <Group justify="space-between">
                            <Text size="sm" c="dimmed">
                                Period:
                            </Text>
                            <Text size="sm">{dayjs(report.id).format("MMMM YYYY")}</Text>
                        </Group>

                        <Group justify="space-between">
                            <Text size="sm" c="dimmed">
                                Status:
                            </Text>
                            <Text size="sm" tt="capitalize">
                                {report.reportStatus || "Draft"}
                            </Text>
                        </Group>

                        <Group justify="space-between">
                            <Text size="sm" c="dimmed">
                                Prepared By:
                            </Text>
                            <Text size="sm">{report.preparedBy || "N/A"}</Text>
                        </Group>

                        {report.dateApproved && (
                            <Group justify="space-between">
                                <Text size="sm" c="dimmed">
                                    Date Approved:
                                </Text>
                                <Text size="sm">
                                    {new Date(report.dateApproved).toLocaleDateString("en-US", {
                                        month: "long",
                                        day: "numeric",
                                        year: "numeric",
                                    })}
                                </Text>
                            </Group>
                        )}

                        {(report.reportStatus === "received" || report.reportStatus === "archived") &&
                            report.dateReceived && (
                                <Group justify="space-between">
                                    <Text size="sm" c="dimmed">
                                        Date Received:
                                    </Text>
                                    <Text size="sm">
                                        {new Date(report.dateReceived).toLocaleDateString("en-US", {
                                            month: "long",
                                            day: "numeric",
                                            year: "numeric",
                                        })}
                                    </Text>
                                </Group>
                            )}

                        {/* Received By fields (only show when approved) */}
                        {report.reportStatus === "approved" && (
                            <>
                                {report.receivedByDailyFinancialReport && (
                                    <Group justify="space-between">
                                        <Text size="sm" c="dimmed">
                                            Daily Financial Report Received By:
                                        </Text>
                                        <Text size="sm">{report.receivedByDailyFinancialReport}</Text>
                                    </Group>
                                )}
                                {report.receivedByOperatingExpensesReport && (
                                    <Group justify="space-between">
                                        <Text size="sm" c="dimmed">
                                            Operating Expenses Report Received By:
                                        </Text>
                                        <Text size="sm">{report.receivedByOperatingExpensesReport}</Text>
                                    </Group>
                                )}
                                {report.receivedByAdministrativeExpensesReport && (
                                    <Group justify="space-between">
                                        <Text size="sm" c="dimmed">
                                            Administrative Expenses Report Received By:
                                        </Text>
                                        <Text size="sm">{report.receivedByAdministrativeExpensesReport}</Text>
                                    </Group>
                                )}
                                {report.receivedByClinicFundReport && (
                                    <Group justify="space-between">
                                        <Text size="sm" c="dimmed">
                                            Clinic Fund Report Received By:
                                        </Text>
                                        <Text size="sm">{report.receivedByClinicFundReport}</Text>
                                    </Group>
                                )}
                                {report.receivedBySupplementaryFeedingFundReport && (
                                    <Group justify="space-between">
                                        <Text size="sm" c="dimmed">
                                            Supplementary Feeding Fund Report Received By:
                                        </Text>
                                        <Text size="sm">{report.receivedBySupplementaryFeedingFundReport}</Text>
                                    </Group>
                                )}
                                {report.receivedByHEFundReport && (
                                    <Group justify="space-between">
                                        <Text size="sm" c="dimmed">
                                            HE Fund Report Received By:
                                        </Text>
                                        <Text size="sm">{report.receivedByHEFundReport}</Text>
                                    </Group>
                                )}
                                {report.receivedByFacultyAndStudentDevFundReport && (
                                    <Group justify="space-between">
                                        <Text size="sm" c="dimmed">
                                            Faculty & Student Dev Fund Report Received By:
                                        </Text>
                                        <Text size="sm">{report.receivedByFacultyAndStudentDevFundReport}</Text>
                                    </Group>
                                )}
                                {report.receivedBySchoolOperationFundReport && (
                                    <Group justify="space-between">
                                        <Text size="sm" c="dimmed">
                                            School Operation Fund Report Received By:
                                        </Text>
                                        <Text size="sm">{report.receivedBySchoolOperationFundReport}</Text>
                                    </Group>
                                )}
                                {report.receivedByRevolvingFundReport && (
                                    <Group justify="space-between">
                                        <Text size="sm" c="dimmed">
                                            Revolving Fund Report Received By:
                                        </Text>
                                        <Text size="sm">{report.receivedByRevolvingFundReport}</Text>
                                    </Group>
                                )}
                            </>
                        )}
                    </Stack>

                    <Group justify="flex-end" mt="md">
                        <Button variant="default" onClick={onClose}>
                            Cancel
                        </Button>
                        <Button type="submit">Update Report</Button>
                    </Group>
                </Stack>
            </form>
        </Modal>
    );
}
