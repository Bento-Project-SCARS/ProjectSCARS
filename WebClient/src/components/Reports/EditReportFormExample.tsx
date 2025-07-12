"use client";

import { useState, useMemo } from "react";
import { Button, Stack, TextInput, Group } from "@mantine/core";
import { ReceiptAttachmentUploader } from "./ReceiptAttachmentUploader";
import { customLogger } from "@/lib/api/customLogger";

interface ExampleReportEntry {
    id: number;
    description: string;
    amount: number;
    receipt_attachment_urns: string | null;
}

interface ReceiptAttachment {
    file_urn: string;
    filename: string;
    file_size: number;
    file_type: string;
}

export function EditReportFormExample() {
    // Mock existing report entry with attachments
    const [reportEntry] = useState<ExampleReportEntry>({
        id: 1,
        description: "Office Supplies",
        amount: 500.0,
        receipt_attachment_urns: '["attachment_abc123", "attachment_def456"]', // Existing attachments
    });

    const [attachments, setAttachments] = useState<ReceiptAttachment[]>([]);
    const [loading, setLoading] = useState(false);

    // Parse URNs from the report entry
    const initialUrns = useMemo(() => {
        if (reportEntry?.receipt_attachment_urns) {
            try {
                return JSON.parse(reportEntry.receipt_attachment_urns);
            } catch (error) {
                customLogger.error("Error parsing receipt URNs:", error);
                return [];
            }
        }
        return [];
    }, [reportEntry]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            // Convert attachments to URN list
            const receiptUrns = attachments.map((attachment) => attachment.file_urn);
            const receiptUrnString = receiptUrns.length > 0 ? JSON.stringify(receiptUrns) : null;

            // Prepare updated report entry
            const updatedEntry = {
                ...reportEntry,
                receipt_attachment_urns: receiptUrnString,
            };

            customLogger.log("Submitting report entry:", updatedEntry);
            customLogger.log("Receipt URNs:", receiptUrns);

            // TODO: Submit to backend API
            // await updateReportEntry(updatedEntry);

            alert("Report updated successfully!");
        } catch (error) {
            customLogger.error("Error updating report:", error);
            alert("Failed to update report");
        } finally {
            setLoading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit}>
            <Stack gap="md">
                <TextInput label="Description" value={reportEntry.description} disabled />

                <TextInput label="Amount" value={`₱${reportEntry.amount.toFixed(2)}`} disabled />

                <ReceiptAttachmentUploader
                    attachments={attachments}
                    onAttachmentsChange={setAttachments}
                    initialAttachmentUrns={initialUrns}
                    maxFiles={5}
                    disabled={loading}
                />

                <Group gap="sm">
                    <Button type="submit" loading={loading}>
                        Update Report
                    </Button>
                    <Button variant="outline" disabled={loading}>
                        Cancel
                    </Button>
                </Group>
            </Stack>
        </form>
    );
}
