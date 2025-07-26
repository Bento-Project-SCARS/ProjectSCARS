"use client";

import { Modal, Stack, Alert, Text, Group, Button, Textarea, Checkbox } from "@mantine/core";
import { IconAlertCircle } from "@tabler/icons-react";
import { useState } from "react";
import { notifications } from "@mantine/notifications";
import * as csclient from "@/lib/api/csclient";
import { customLogger } from "@/lib/api/customLogger";

interface SubmitForReviewModalProps {
    opened: boolean;
    onClose: () => void;
    reportType: "daily" | "payroll" | "liquidation" | "monthly";
    reportPeriod: {
        schoolId: number;
        year: number;
        month: number;
        category?: string; // For liquidation reports
    };
    onSuccess?: () => void;
}

export function SubmitForReviewModal({
    opened,
    onClose,
    reportType,
    reportPeriod,
    onSuccess,
}: SubmitForReviewModalProps) {
    const [comments, setComments] = useState("");
    const [confirmationChecked, setConfirmationChecked] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async () => {
        if (!confirmationChecked) {
            notifications.show({
                title: "Confirmation Required",
                message: "Please confirm that you want to submit this report for review.",
                color: "orange",
            });
            return;
        }

        setIsSubmitting(true);

        try {
            const statusChangeRequest = {
                new_status: "review" as const,
                comments: comments.trim() || undefined,
            };

            // Call the appropriate API endpoint based on report type
            let response;
            switch (reportType) {
                case "daily":
                    response = await csclient.changeDailyReportStatusV1ReportsDailySchoolIdYearMonthStatusPatch({
                        path: {
                            school_id: reportPeriod.schoolId,
                            year: reportPeriod.year,
                            month: reportPeriod.month,
                        },
                        body: statusChangeRequest,
                    });
                    break;
                case "payroll":
                    response = await csclient.changePayrollReportStatusV1ReportsPayrollSchoolIdYearMonthStatusPatch({
                        path: {
                            school_id: reportPeriod.schoolId,
                            year: reportPeriod.year,
                            month: reportPeriod.month,
                        },
                        body: statusChangeRequest,
                    });
                    break;
                case "liquidation":
                    if (!reportPeriod.category) {
                        throw new Error("Category is required for liquidation reports");
                    }
                    response =
                        await csclient.changeLiquidationReportStatusV1ReportsLiquidationSchoolIdYearMonthCategoryStatusPatch(
                            {
                                path: {
                                    school_id: reportPeriod.schoolId,
                                    year: reportPeriod.year,
                                    month: reportPeriod.month,
                                    category: reportPeriod.category,
                                },
                                body: statusChangeRequest,
                            }
                        );
                    break;
                case "monthly":
                    response = await csclient.changeMonthlyReportStatusV1ReportsMonthlySchoolIdYearMonthStatusPatch({
                        path: {
                            school_id: reportPeriod.schoolId,
                            year: reportPeriod.year,
                            month: reportPeriod.month,
                        },
                        body: statusChangeRequest,
                    });
                    break;
                default:
                    throw new Error(`Unsupported report type: ${reportType}`);
            }

            if (response.error) {
                throw new Error(
                    `Failed to submit report for review: ${response.response.status} ${response.response.statusText}`
                );
            }

            // notifications.show({
            //     title: "Success",
            //     message: "Report has been submitted for review successfully.",
            //     color: "green",
            // });

            // Reset form state
            setComments("");
            setConfirmationChecked(false);

            // Call success callback if provided
            if (onSuccess) {
                onSuccess();
            }

            // Close modal
            onClose();
        } catch (error) {
            customLogger.error("Failed to submit report for review:", error);

            // Extract error message from API response
            let errorMessage = "Failed to submit report for review.";

            if (error instanceof Error) {
                errorMessage = error.message;
            } else if (error && typeof error === "object" && "response" in error) {
                const apiError = error as { response?: { data?: { detail?: string }; statusText?: string } };
                if (apiError.response?.data?.detail) {
                    errorMessage = apiError.response.data.detail;
                } else if (apiError.response?.statusText) {
                    errorMessage = `API Error: ${apiError.response.statusText}`;
                }
            }

            notifications.show({
                title: "Cannot Submit for Review",
                message: errorMessage,
                color: "red",
                autoClose: false, // Don't auto-close for validation errors as they need user action
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleClose = () => {
        if (!isSubmitting) {
            setComments("");
            setConfirmationChecked(false);
            onClose();
        }
    };

    const getReportTypeName = () => {
        switch (reportType) {
            case "daily":
                return "Daily Sales Report";
            case "payroll":
                return "Payroll Report";
            case "liquidation":
                return "Liquidation Report";
            case "monthly":
                return "Monthly Report";
            default:
                return "Report";
        }
    };

    return (
        <Modal
            opened={opened}
            onClose={handleClose}
            title="Submit for Review"
            centered
            size="md"
            closeOnClickOutside={!isSubmitting}
            closeOnEscape={!isSubmitting}
        >
            <Stack gap="md">
                <Alert
                    variant="light"
                    color="blue"
                    title="Submit Report for Review"
                    icon={<IconAlertCircle size={16} />}
                >
                    You are about to submit this <strong>{getReportTypeName()}</strong> for review. Once submitted, the
                    report status will change from &quot;DRAFT&quot; to &quot;REVIEW&quot; and will be available for
                    approval by authorized personnel.
                </Alert>

                <Text size="sm" c="dimmed">
                    This action will:
                </Text>

                <Stack gap="xs" pl="md">
                    <Text size="sm">• Change the report status to &quot;REVIEW&quot;</Text>
                    <Text size="sm">• Make the report visible to approvers</Text>
                    <Text size="sm">• Lock the report from further editing</Text>
                    <Text size="sm">• Send notifications to relevant personnel</Text>
                </Stack>

                <Textarea
                    label="Comments (Optional)"
                    placeholder="Add any comments or notes about this submission..."
                    value={comments}
                    onChange={(event) => setComments(event.currentTarget.value)}
                    autosize
                    minRows={2}
                    maxRows={4}
                    disabled={isSubmitting}
                />

                <Checkbox
                    label="I confirm that I have reviewed the report data and want to submit it for review"
                    checked={confirmationChecked}
                    onChange={(event) => setConfirmationChecked(event.currentTarget.checked)}
                    disabled={isSubmitting}
                />

                <Group justify="flex-end" gap="sm">
                    <Button variant="outline" onClick={handleClose} disabled={isSubmitting}>
                        Cancel
                    </Button>
                    <Button onClick={handleSubmit} disabled={!confirmationChecked} loading={isSubmitting} color="blue">
                        Submit for Review
                    </Button>
                </Group>
            </Stack>
        </Modal>
    );
}
