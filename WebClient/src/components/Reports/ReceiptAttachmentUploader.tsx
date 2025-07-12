import { useState, useEffect, useCallback } from "react";
import { ActionIcon, FileInput, Group, Image, Paper, Stack, Text, Tooltip } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconTrash, IconUpload, IconFile, IconEye } from "@tabler/icons-react";
import {
    uploadAttachmentEndpointV1ReportsAttachmentsUploadPost,
    getAttachmentsMetadataEndpointV1ReportsAttachmentsMetadataPost,
} from "@/lib/api/csclient";
import { GetAccessTokenHeader } from "@/lib/utils/token";
import { customLogger } from "@/lib/api/customLogger";

interface ReceiptAttachment {
    file_urn: string;
    filename: string;
    file_size: number;
    file_type: string;
}

interface ReceiptAttachmentUploaderProps {
    attachments: ReceiptAttachment[];
    onAttachmentsChange: (attachments: ReceiptAttachment[]) => void;
    initialAttachmentUrns?: string[]; // List of existing attachment URNs to load
    maxFiles?: number;
    disabled?: boolean;
}

export function ReceiptAttachmentUploader({
    attachments,
    onAttachmentsChange,
    initialAttachmentUrns = [],
    maxFiles = 5,
    disabled = false,
}: ReceiptAttachmentUploaderProps) {
    const [uploading, setUploading] = useState(false);
    const [loading, setLoading] = useState(false);

    const loadExistingAttachments = useCallback(async () => {
        if (initialAttachmentUrns.length === 0) return;

        setLoading(true);
        try {
            const result = await getAttachmentsMetadataEndpointV1ReportsAttachmentsMetadataPost({
                headers: {
                    Authorization: GetAccessTokenHeader(),
                },
                body: initialAttachmentUrns,
            });

            if (result.error) {
                throw new Error(`Failed to load attachments: ${result.response.status} ${result.response.statusText}`);
            }

            const loadedAttachments: ReceiptAttachment[] = result.data.map((metadata) => ({
                file_urn: metadata.file_urn,
                filename: metadata.filename,
                file_size: metadata.file_size,
                file_type: metadata.file_type,
            }));

            onAttachmentsChange(loadedAttachments);
        } catch (error) {
            const message = error instanceof Error ? error.message : "Unknown error occurred";
            customLogger.error("Failed to load existing attachments:", message);
            notifications.show({
                id: "attachment-load-error",
                title: "Failed to Load Attachments",
                message,
                color: "red",
            });
        } finally {
            setLoading(false);
        }
    }, [initialAttachmentUrns, onAttachmentsChange]);

    // Load existing attachments when component mounts
    useEffect(() => {
        if (initialAttachmentUrns.length > 0 && attachments.length === 0) {
            loadExistingAttachments();
        }
    }, [initialAttachmentUrns, attachments.length, loadExistingAttachments]);

    const uploadFile = async (file: File) => {
        if (attachments.length >= maxFiles) {
            notifications.show({
                id: "max-files-reached",
                title: "Maximum Files Reached",
                message: `You can only upload up to ${maxFiles} receipt attachments.`,
                color: "orange",
            });
            return;
        }

        setUploading(true);
        try {
            const result = await uploadAttachmentEndpointV1ReportsAttachmentsUploadPost({
                headers: {
                    Authorization: GetAccessTokenHeader(),
                },
                body: {
                    file,
                },
            });

            if (result.error) {
                throw new Error(`Failed to upload file: ${result.response.status} ${result.response.statusText}`);
            }

            const newAttachment: ReceiptAttachment = {
                file_urn: result.data.file_urn,
                filename: result.data.filename,
                file_size: result.data.file_size,
                file_type: result.data.file_type,
            };

            onAttachmentsChange([...attachments, newAttachment]);

            notifications.show({
                id: "receipt-upload-success",
                title: "Success",
                message: `Receipt "${file.name}" uploaded successfully.`,
                color: "green",
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : "Unknown error occurred";
            customLogger.error("Receipt upload failed:", message);
            notifications.show({
                id: "receipt-upload-error",
                title: "Upload Failed",
                message,
                color: "red",
            });
        } finally {
            setUploading(false);
        }
    };

    const removeAttachment = (index: number) => {
        const newAttachments = attachments.filter((_, i) => i !== index);
        onAttachmentsChange(newAttachments);
    };

    const viewAttachment = (attachment: ReceiptAttachment) => {
        // Open attachment in new window/tab
        const url = `/api/v1/reports/attachments/${attachment.file_urn}`;
        window.open(url, "_blank");
    };

    const formatFileSize = (bytes: number): string => {
        if (bytes === 0) return "0 Bytes";
        const k = 1024;
        const sizes = ["Bytes", "KB", "MB", "GB"];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
    };

    const isImageFile = (fileType: string): boolean => {
        return fileType.startsWith("image/");
    };

    return (
        <Stack gap="sm">
            <Group>
                <FileInput
                    placeholder="Choose receipt file"
                    accept="image/*"
                    disabled={disabled || uploading || loading || attachments.length >= maxFiles}
                    onChange={(file) => {
                        if (file) {
                            uploadFile(file);
                        }
                    }}
                    leftSection={<IconUpload size={16} />}
                    style={{ flex: 1 }}
                />
                <Text size="xs" c="dimmed">
                    {attachments.length}/{maxFiles} files
                </Text>
            </Group>

            {attachments.length > 0 && (
                <Stack gap="xs">
                    <Text size="sm" fw={500}>
                        Uploaded Receipts:
                    </Text>
                    {attachments.map((attachment, index) => (
                        <Paper key={attachment.file_urn} p="sm" withBorder>
                            <Group justify="space-between" align="center">
                                <Group gap="sm" style={{ flex: 1 }}>
                                    {isImageFile(attachment.file_type) ? (
                                        <Image
                                            src={`/api/v1/reports/attachments/${attachment.file_urn}`}
                                            alt={attachment.filename}
                                            width={40}
                                            height={40}
                                            fit="cover"
                                            radius="sm"
                                        />
                                    ) : (
                                        <IconFile size={40} color="gray" />
                                    )}
                                    <div style={{ flex: 1 }}>
                                        <Text size="sm" fw={500} truncate>
                                            {attachment.filename}
                                        </Text>
                                        <Text size="xs" c="dimmed">
                                            {formatFileSize(attachment.file_size)} • {attachment.file_type}
                                        </Text>
                                    </div>
                                </Group>
                                <Group gap="xs">
                                    <Tooltip label="View">
                                        <ActionIcon
                                            size="sm"
                                            variant="subtle"
                                            onClick={() => viewAttachment(attachment)}
                                        >
                                            <IconEye size={16} />
                                        </ActionIcon>
                                    </Tooltip>
                                    <Tooltip label="Remove">
                                        <ActionIcon
                                            size="sm"
                                            color="red"
                                            variant="subtle"
                                            onClick={() => removeAttachment(index)}
                                            disabled={disabled}
                                        >
                                            <IconTrash size={16} />
                                        </ActionIcon>
                                    </Tooltip>
                                </Group>
                            </Group>
                        </Paper>
                    ))}
                </Stack>
            )}

            {(uploading || loading) && (
                <Text size="sm" c="dimmed" ta="center">
                    {loading ? "Loading existing receipts..." : "Uploading receipt..."}
                </Text>
            )}
        </Stack>
    );
}
