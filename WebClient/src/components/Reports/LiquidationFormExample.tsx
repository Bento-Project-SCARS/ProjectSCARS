/**
 * Example of how to integrate the ReceiptAttachmentUploader component
 * into liquidation and payroll report forms.
 *
 * This demonstrates:
 * 1. Managing receipt attachments state
 * 2. Converting attachments to URN list for backend storage
 * 3. Loading existing attachments from URN list
 */
import { useState, useEffect } from "react";
import { Button, Group, Stack, TextInput, NumberInput } from "@mantine/core";
import { useForm } from "@mantine/form";
import { ReceiptAttachmentUploader } from "./ReceiptAttachmentUploader";
import { customLogger } from "@/lib/api/customLogger";

interface ReceiptAttachment {
    file_urn: string;
    filename: string;
    file_size: number;
    file_type: string;
}

interface ReportEntry {
    id?: number;
    description: string;
    amount: number;
    receipt_attachment_urns?: string; // JSON string of URNs
}

interface LiquidationFormExampleProps {
    initialEntry?: ReportEntry;
    onSubmit: (entry: ReportEntry) => void;
}

export function LiquidationFormExample({ initialEntry, onSubmit }: LiquidationFormExampleProps) {
    const [attachments, setAttachments] = useState<ReceiptAttachment[]>([]);
    const [loading, setLoading] = useState(false);

    const form = useForm({
        initialValues: {
            description: initialEntry?.description || "",
            amount: initialEntry?.amount || 0,
        },
        validate: {
            description: (value) => (!value ? "Description is required" : null),
            amount: (value) => (value <= 0 ? "Amount must be greater than 0" : null),
        },
    });

    // Load existing attachments when component mounts or initialEntry changes
    useEffect(() => {
        if (initialEntry?.receipt_attachment_urns) {
            try {
                const urns = JSON.parse(initialEntry.receipt_attachment_urns) as string[];

                // Convert URNs to attachment objects (you would typically fetch these from the server)
                // For now, we'll create placeholder objects
                const loadedAttachments: ReceiptAttachment[] = urns.map((urn, index) => ({
                    file_urn: urn,
                    filename: `receipt_${index + 1}.jpg`, // In real app, fetch from server
                    file_size: 0, // In real app, fetch from server
                    file_type: "image/jpeg", // In real app, fetch from server
                }));

                setAttachments(loadedAttachments);
            } catch (error) {
                customLogger.error("Error parsing receipt attachment URNs:", error);
            }
        }
    }, [initialEntry]);

    const handleSubmit = async (values: typeof form.values) => {
        setLoading(true);
        try {
            // Convert attachments to URN list for backend storage
            const receiptUrns = attachments.map((attachment) => attachment.file_urn);
            const receiptUrnString = receiptUrns.length > 0 ? JSON.stringify(receiptUrns) : null;

            const entry: ReportEntry = {
                ...initialEntry,
                description: values.description,
                amount: values.amount,
                receipt_attachment_urns: receiptUrnString || undefined,
            };

            await onSubmit(entry);
        } finally {
            setLoading(false);
        }
    };

    return (
        <form onSubmit={form.onSubmit(handleSubmit)}>
            <Stack gap="md">
                <TextInput
                    label="Description"
                    placeholder="Enter expense description"
                    {...form.getInputProps("description")}
                />

                <NumberInput
                    label="Amount"
                    placeholder="Enter amount"
                    min={0}
                    decimalScale={2}
                    fixedDecimalScale
                    {...form.getInputProps("amount")}
                />

                <div>
                    <label style={{ fontSize: "14px", fontWeight: 500, marginBottom: "8px", display: "block" }}>
                        Receipt Attachments
                    </label>
                    <ReceiptAttachmentUploader
                        attachments={attachments}
                        onAttachmentsChange={setAttachments}
                        maxFiles={5}
                        disabled={loading}
                    />
                </div>

                <Group justify="flex-end">
                    <Button type="submit" loading={loading}>
                        {initialEntry?.id ? "Update Entry" : "Add Entry"}
                    </Button>
                </Group>
            </Stack>
        </form>
    );
}

/**
 * Usage example:
 *
 * const [reportEntries, setReportEntries] = useState<ReportEntry[]>([]);
 *
 * const handleEntrySubmit = (entry: ReportEntry) => {
 *     if (entry.id) {
 *         // Update existing entry
 *         setReportEntries(prev => prev.map(e => e.id === entry.id ? entry : e));
 *     } else {
 *         // Add new entry
 *         setReportEntries(prev => [...prev, { ...entry, id: Date.now() }]);
 *     }
 * };
 *
 * return (
 *     <LiquidationFormExample
 *         onSubmit={handleEntrySubmit}
 *     />
 * );
 */
