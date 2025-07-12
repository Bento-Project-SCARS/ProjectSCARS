import { useState, useEffect, useCallback } from "react";
import {
    ActionIcon,
    Badge,
    Card,
    Group,
    Image,
    LoadingOverlay,
    Modal,
    Paper,
    Stack,
    Text,
    Tooltip,
    rem,
} from "@mantine/core";
import { Dropzone, MIME_TYPES, IMAGE_MIME_TYPE, PDF_MIME_TYPE } from "@mantine/dropzone";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import {
    IconUpload,
    IconFile,
    IconEye,
    IconTrash,
    IconX,
    IconPhoto,
    IconFileTypePdf,
    IconFiles,
    IconDownload,
} from "@tabler/icons-react";
import {
    uploadAttachmentEndpointV1ReportsAttachmentsUploadPost,
    getAttachmentsMetadataEndpointV1ReportsAttachmentsMetadataPost,
    deleteAttachmentEndpointV1ReportsAttachmentsFileUrnDelete,
} from "@/lib/api/csclient";
import { GetAccessTokenHeader } from "@/lib/utils/token";
import { Connections } from "@/lib/info";
import { customLogger } from "@/lib/api/customLogger";

interface ReportAttachment {
    file_urn: string;
    filename: string;
    file_size: number;
    file_type: string;
    upload_url?: string; // For display purposes
}

interface ReportAttachmentManagerProps {
    /** Current list of attachments */
    attachments: ReportAttachment[];
    /** Callback when attachments change */
    onAttachmentsChange: (attachments: ReportAttachment[]) => void;
    /** List of existing attachment URNs to load on component mount */
    initialAttachmentUrns?: string[];
    /** Maximum number of files allowed */
    maxFiles?: number;
    /** Maximum file size in bytes */
    maxFileSize?: number;
    /** Whether the component is disabled */
    disabled?: boolean;
    /** Title for the attachment section */
    title?: string;
    /** Description text */
    description?: string;
    /** Accepted file types */
    acceptedTypes?: string[] | Record<string, string[]>;
}

export function ReportAttachmentManager({
    attachments,
    onAttachmentsChange,
    initialAttachmentUrns = [],
    maxFiles = 10,
    maxFileSize = 10 * 1024 * 1024, // 10MB default to match backend limit
    disabled = false,
    title = "Attachments",
    description = "Upload supporting documents, receipts, or images",
    acceptedTypes = [
        ...IMAGE_MIME_TYPE,
        ...PDF_MIME_TYPE,
        MIME_TYPES.docx,
        MIME_TYPES.xlsx,
        MIME_TYPES.csv,
        MIME_TYPES.zip,
        "application/vnd.ms-excel", // for .xls files
        "application/msword", // for .doc files
        "text/plain", // for .txt files
        "application/rtf", // for .rtf files
    ],
}: ReportAttachmentManagerProps) {
    const [uploading, setUploading] = useState(false);
    const [loading, setLoading] = useState(false);
    const [previewAttachment, setPreviewAttachment] = useState<ReportAttachment | null>(null);
    const [previewOpened, { open: openPreview, close: closePreview }] = useDisclosure(false);
    const [previewUrl, setPreviewUrl] = useState<string>("");

    /**
     * Load existing attachments from the server using their URNs
     */
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

            const loadedAttachments: ReportAttachment[] = result.data.map((metadata) => ({
                file_urn: metadata.file_urn,
                filename: metadata.filename,
                file_size: metadata.file_size,
                file_type: metadata.file_type,
                upload_url: `${Connections.CentralServer.endpoint}/v1/reports/attachments/${metadata.file_urn}`,
            }));

            onAttachmentsChange(loadedAttachments);

            notifications.show({
                id: "attachments-loaded",
                title: "Attachments Loaded",
                message: `Loaded ${loadedAttachments.length} existing attachment${
                    loadedAttachments.length !== 1 ? "s" : ""
                }.`,
                color: "blue",
            });
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

    /**
     * Upload multiple files to the server
     */
    const uploadFiles = async (files: File[]) => {
        if (attachments.length + files.length > maxFiles) {
            notifications.show({
                id: "max-files-exceeded",
                title: "Too Many Files",
                message: `You can only upload up to ${maxFiles} attachments total. You currently have ${attachments.length} and are trying to add ${files.length} more.`,
                color: "orange",
            });
            return;
        }

        // Check individual file sizes
        const oversizedFiles = files.filter((file) => file.size > maxFileSize);
        if (oversizedFiles.length > 0) {
            notifications.show({
                id: "file-size-exceeded",
                title: "File Size Too Large",
                message: `The following files are too large: ${oversizedFiles
                    .map((f) => f.name)
                    .join(", ")}. Maximum size is ${formatFileSize(maxFileSize)}.`,
                color: "red",
            });
            return;
        }

        setUploading(true);
        const uploadedAttachments: ReportAttachment[] = [];
        const failedUploads: string[] = [];

        try {
            for (const file of files) {
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
                        throw new Error(
                            `Failed to upload ${file.name}: ${result.response.status} ${result.response.statusText}`
                        );
                    }

                    const newAttachment: ReportAttachment = {
                        file_urn: result.data.file_urn,
                        filename: result.data.filename,
                        file_size: result.data.file_size,
                        file_type: result.data.file_type,
                        upload_url: `${Connections.CentralServer.endpoint}/v1/reports/attachments/${result.data.file_urn}`,
                    };

                    uploadedAttachments.push(newAttachment);
                } catch (error) {
                    customLogger.error(`Failed to upload ${file.name}:`, error);
                    failedUploads.push(file.name);
                }
            }

            // Update attachments list with successfully uploaded files
            if (uploadedAttachments.length > 0) {
                onAttachmentsChange([...attachments, ...uploadedAttachments]);
            }

            // Show appropriate notifications
            if (uploadedAttachments.length > 0) {
                notifications.show({
                    id: "upload-success",
                    title: "Upload Successful",
                    message: `Successfully uploaded ${uploadedAttachments.length} file${
                        uploadedAttachments.length !== 1 ? "s" : ""
                    }.`,
                    color: "green",
                });
            }

            if (failedUploads.length > 0) {
                notifications.show({
                    id: "upload-partial-failure",
                    title: "Some Uploads Failed",
                    message: `Failed to upload: ${failedUploads.join(", ")}`,
                    color: "red",
                });
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : "Unknown error occurred";
            customLogger.error("Upload failed:", message);
            notifications.show({
                id: "upload-error",
                title: "Upload Failed",
                message,
                color: "red",
            });
        } finally {
            setUploading(false);
        }
    };

    /**
     * Remove an attachment from the list
     */
    const removeAttachment = async (index: number, attachment: ReportAttachment) => {
        try {
            // Delete from server if it's an existing attachment (has upload_url)
            if (attachment.upload_url) {
                const result = await deleteAttachmentEndpointV1ReportsAttachmentsFileUrnDelete({
                    headers: {
                        Authorization: GetAccessTokenHeader(),
                    },
                    path: {
                        file_urn: attachment.file_urn,
                    },
                });

                if (result.error) {
                    customLogger.warn(`Failed to delete attachment from server: ${result.response.status}`);
                    // Continue with local removal even if server deletion fails
                }
            }

            // Remove from local state
            const newAttachments = attachments.filter((_, i) => i !== index);
            onAttachmentsChange(newAttachments);

            notifications.show({
                id: "attachment-removed",
                title: "Attachment Removed",
                message: `"${attachment.filename}" has been removed.`,
                color: "blue",
            });
        } catch (error) {
            customLogger.error("Failed to remove attachment:", error);
            notifications.show({
                id: "remove-error",
                title: "Failed to Remove",
                message: "Could not remove the attachment. Please try again.",
                color: "red",
            });
        }
    };

    /**
     * Preview an attachment in a modal
     */
    const previewAttachmentFile = async (attachment: ReportAttachment) => {
        try {
            setPreviewAttachment(attachment);

            if (isImageFile(attachment.file_type)) {
                // For images, fetch and create a blob URL
                const apiUrl = `${Connections.CentralServer.endpoint}/v1/reports/attachments/${attachment.file_urn}`;

                // Create a fetch request with authentication header
                const response = await fetch(apiUrl, {
                    headers: {
                        Authorization: GetAccessTokenHeader(),
                    },
                });

                if (!response.ok) {
                    throw new Error(`Failed to load preview: ${response.status} ${response.statusText}`);
                }

                // Get the file blob and create a local URL
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                setPreviewUrl(url);
                openPreview();
            } else if (isPdfFile(attachment.file_type)) {
                // For PDFs, open in new tab with proper authentication
                const apiUrl = `${Connections.CentralServer.endpoint}/v1/reports/attachments/${attachment.file_urn}`;
                // We need to handle this specially to pass auth token to the new window
                const w = window.open("about:blank", "_blank");
                if (w) {
                    setTimeout(() => {
                        // Create a form to post the auth token
                        const form = w.document.createElement("form");
                        form.method = "GET";
                        form.action = apiUrl;

                        // Add auth header script
                        const script = w.document.createElement("script");
                        script.textContent = `
                            const xhr = new XMLHttpRequest();
                            xhr.open('GET', '${apiUrl}', true);
                            xhr.setRequestHeader('Authorization', '${GetAccessTokenHeader()}');
                            xhr.responseType = 'blob';
                            xhr.onload = function() {
                                if (this.status === 200) {
                                    const blob = new Blob([this.response], {type: '${attachment.file_type}'});
                                    const url = URL.createObjectURL(blob);
                                    document.location = url;
                                }
                            };
                            xhr.send();
                        `;
                        w.document.body.appendChild(script);
                    }, 100);
                } else {
                    // Fallback if popup is blocked
                    notifications.show({
                        id: "popup-blocked",
                        title: "Popup Blocked",
                        message: "Please allow popups to preview PDF files.",
                        color: "orange",
                    });
                }
            } else {
                // For other files, trigger download
                downloadAttachment(attachment);
            }
        } catch (error) {
            customLogger.error("Failed to preview attachment:", error);
            notifications.show({
                id: "preview-error",
                title: "Preview Failed",
                message: "Could not open the attachment for preview.",
                color: "red",
            });
        }
    };

    /**
     * Close preview modal and cleanup
     */
    const handleClosePreview = () => {
        closePreview();
        if (previewUrl) {
            // Only revoke if it's a blob URL we created
            if (previewUrl.startsWith("blob:")) {
                URL.revokeObjectURL(previewUrl);
            }
            setPreviewUrl("");
        }
        setPreviewAttachment(null);
    };

    /**
     * Download an attachment file
     */
    const downloadAttachment = async (attachment: ReportAttachment) => {
        try {
            // Construct the API URL with authentication
            const apiUrl = `${Connections.CentralServer.endpoint}/v1/reports/attachments/${attachment.file_urn}`;

            // Create a fetch request with authentication header
            const response = await fetch(apiUrl, {
                headers: {
                    Authorization: GetAccessTokenHeader(),
                },
            });

            if (!response.ok) {
                throw new Error(`Failed to download attachment: ${response.status} ${response.statusText}`);
            }

            // Get the file blob
            const blob = await response.blob();

            // Create a temporary URL for the blob
            const url = window.URL.createObjectURL(blob);

            // Create a temporary link element
            const link = document.createElement("a");
            link.href = url;
            link.download = attachment.filename;
            document.body.appendChild(link);

            // Trigger the download
            link.click();

            // Clean up
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);

            notifications.show({
                id: "download-success",
                title: "Download Started",
                message: `Downloading ${attachment.filename}`,
                color: "green",
            });
        } catch (error) {
            customLogger.error("Failed to download attachment:", error);
            notifications.show({
                id: "download-error",
                title: "Download Failed",
                message: "Could not download the attachment. Please try again.",
                color: "red",
            });
        }
    };

    /**
     * Format file size for display
     */
    const formatFileSize = (bytes: number): string => {
        if (bytes === 0) return "0 Bytes";
        const k = 1024;
        const sizes = ["Bytes", "KB", "MB", "GB"];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
    };

    /**
     * Check if file is an image
     */
    const isImageFile = (fileType: string): boolean => {
        return fileType.startsWith("image/");
    };

    /**
     * Check if file is a PDF
     */
    const isPdfFile = (fileType: string): boolean => {
        return fileType === "application/pdf";
    };

    /**
     * Get appropriate icon for file type
     */
    const getFileIcon = (fileType: string) => {
        if (isImageFile(fileType)) {
            return <IconPhoto size={20} />;
        } else if (isPdfFile(fileType)) {
            return <IconFileTypePdf size={20} />;
        }
        return <IconFile size={20} />;
    };

    /**
     * Get file type badge color
     */
    const getFileTypeBadgeColor = (fileType: string) => {
        if (isImageFile(fileType)) return "blue";
        if (isPdfFile(fileType)) return "red";
        if (fileType.includes("document") || fileType.includes("word")) return "green";
        if (fileType.includes("spreadsheet") || fileType.includes("excel")) return "teal";
        return "gray";
    };

    return (
        <Card withBorder>
            <LoadingOverlay visible={loading} loaderProps={{ children: "Loading attachments..." }} />

            <Stack gap="md">
                {/* Header */}
                <Group justify="space-between" align="center">
                    <div>
                        <Text fw={500}>{title}</Text>
                        <Text size="sm" c="dimmed">
                            {description}
                        </Text>
                    </div>
                    <Badge size="sm" color={attachments.length >= maxFiles ? "red" : "blue"} variant="light">
                        {attachments.length}/{maxFiles} files
                    </Badge>
                </Group>

                {/* Dropzone */}
                <Dropzone
                    onDrop={uploadFiles}
                    accept={acceptedTypes}
                    maxSize={maxFileSize}
                    maxFiles={maxFiles - attachments.length}
                    disabled={disabled || uploading || attachments.length >= maxFiles}
                    loading={uploading}
                >
                    <Group justify="center" gap="xl" mih={120} style={{ pointerEvents: "none" }}>
                        <Dropzone.Accept>
                            <IconUpload
                                style={{
                                    width: rem(52),
                                    height: rem(52),
                                    color: "var(--mantine-color-blue-6)",
                                }}
                                stroke={1.5}
                            />
                        </Dropzone.Accept>
                        <Dropzone.Reject>
                            <IconX
                                style={{
                                    width: rem(52),
                                    height: rem(52),
                                    color: "var(--mantine-color-red-6)",
                                }}
                                stroke={1.5}
                            />
                        </Dropzone.Reject>
                        <Dropzone.Idle>
                            <IconFiles
                                style={{
                                    width: rem(52),
                                    height: rem(52),
                                    color: "var(--mantine-color-dimmed)",
                                }}
                                stroke={1.5}
                            />
                        </Dropzone.Idle>

                        <div>
                            <Text size="xl" inline>
                                Drag files here or click to select
                            </Text>
                            <Text size="sm" c="dimmed" inline mt={7}>
                                Attach up to {maxFiles - attachments.length} files, each file should not exceed{" "}
                                {formatFileSize(maxFileSize)}
                            </Text>
                        </div>
                    </Group>
                </Dropzone>

                {/* Attachments List */}
                {attachments.length > 0 && (
                    <Stack gap="xs">
                        <Text size="sm" fw={500}>
                            Uploaded Files:
                        </Text>
                        {attachments.map((attachment, index) => (
                            <Paper key={attachment.file_urn} p="sm" withBorder>
                                <Group justify="space-between" align="center">
                                    <Group gap="sm" style={{ flex: 1 }}>
                                        {/* File Preview/Icon */}
                                        {isImageFile(attachment.file_type) ? (
                                            <div
                                                style={{
                                                    width: 40,
                                                    height: 40,
                                                    display: "flex",
                                                    alignItems: "center",
                                                    justifyContent: "center",
                                                    backgroundColor: "var(--mantine-color-blue-0)",
                                                    borderRadius: "var(--mantine-radius-sm)",
                                                }}
                                            >
                                                <IconPhoto size={20} color="var(--mantine-color-blue-5)" />
                                            </div>
                                        ) : (
                                            <div
                                                style={{
                                                    width: 40,
                                                    height: 40,
                                                    display: "flex",
                                                    alignItems: "center",
                                                    justifyContent: "center",
                                                    backgroundColor: "var(--mantine-color-gray-1)",
                                                    borderRadius: "var(--mantine-radius-sm)",
                                                }}
                                            >
                                                {getFileIcon(attachment.file_type)}
                                            </div>
                                        )}

                                        {/* File Info */}
                                        <div style={{ flex: 1 }}>
                                            <Text size="sm" fw={500} truncate>
                                                {attachment.filename}
                                            </Text>
                                            <Group gap="xs" align="center">
                                                <Text size="xs" c="dimmed">
                                                    {formatFileSize(attachment.file_size)}
                                                </Text>
                                                <Badge
                                                    size="xs"
                                                    color={getFileTypeBadgeColor(attachment.file_type)}
                                                    variant="light"
                                                >
                                                    {attachment.file_type.split("/")[1]?.toUpperCase() ||
                                                        attachment.file_type}
                                                </Badge>
                                            </Group>
                                        </div>
                                    </Group>

                                    {/* Actions */}
                                    <Group gap="xs">
                                        <Tooltip label="Preview">
                                            <ActionIcon
                                                size="sm"
                                                variant="subtle"
                                                onClick={() => previewAttachmentFile(attachment)}
                                            >
                                                <IconEye size={16} />
                                            </ActionIcon>
                                        </Tooltip>
                                        <Tooltip label="Download">
                                            <ActionIcon
                                                size="sm"
                                                variant="subtle"
                                                color="blue"
                                                onClick={() => downloadAttachment(attachment)}
                                            >
                                                <IconDownload size={16} />
                                            </ActionIcon>
                                        </Tooltip>
                                        <Tooltip label="Remove">
                                            <ActionIcon
                                                size="sm"
                                                color="red"
                                                variant="subtle"
                                                onClick={() => removeAttachment(index, attachment)}
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

                {/* Upload Progress */}
                {uploading && (
                    <Text size="sm" c="dimmed" ta="center">
                        Uploading files...
                    </Text>
                )}
            </Stack>

            {/* Preview Modal */}
            <Modal
                opened={previewOpened}
                onClose={handleClosePreview}
                title={previewAttachment?.filename}
                size="lg"
                centered
            >
                {previewUrl && previewAttachment && isImageFile(previewAttachment.file_type) && (
                    <div style={{ textAlign: "center" }}>
                        <Image
                            src={previewUrl}
                            alt={previewAttachment.filename}
                            fit="contain"
                            style={{ maxHeight: "70vh" }}
                        />
                    </div>
                )}
            </Modal>
        </Card>
    );
}
