/**
 * Integration with Central Server for Liquidation Reports
 *
 * This component integrates with the Central Server API to:
 * 1. Load existing liquidation report data for the selected month/category
 * 2. Save draft reports (allowing incomplete data)
 * 3. Submit complete reports for approval
 * 4. Handle all liquidation report categories:
 *    - Operating Expenses
 *    - Administrative Expenses
 *    - Supplementary Feeding Fund
 *    - Clinic Fund
 *    - Faculty and Student Development Fund
 *    - HE Fund
 *    - School Operations Fund
 *    - Revolving Fund
 *
 * The integration follows the same pattern as daily sales reports,
 * using the generated OpenAPI client for type safety and consistency.
 */

"use client";

import { CreatableUnitSelect } from "@/components/CreatableUnitSelect";
import { LoadingComponent } from "@/components/LoadingComponent/LoadingComponent";
import { SplitButton } from "@/components/SplitButton/SplitButton";
import { SubmitForReviewButton } from "@/components/SubmitForReview";
import { ReportAttachmentManager } from "@/components/Reports/ReportAttachmentManager";
import * as csclient from "@/lib/api/csclient";
import { useUser } from "@/lib/providers/user";
import {
    ActionIcon,
    Badge,
    Box,
    Button,
    Card,
    Checkbox,
    Divider,
    Flex,
    Group,
    Image,
    Modal,
    NumberInput,
    ScrollArea,
    SimpleGrid,
    Stack,
    Table,
    Text,
    TextInput,
    Textarea,
    Title,
} from "@mantine/core";
import { DateInput, MonthPickerInput } from "@mantine/dates";
import "@mantine/dates/styles.css";
import { notifications } from "@mantine/notifications";
import { IconCalendar, IconFileText, IconHistory, IconPlus, IconTrash, IconX } from "@tabler/icons-react";
import dayjs from "dayjs";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { customLogger } from "@/lib/api/customLogger";

const report_type = {
    operating_expenses: "Operating Expenses",
    administrative_expenses: "Administrative Expenses",
    supplementary_feeding_fund: "Supplementary Feeding Fund",
    clinic_fund: "Clinic Fund",
    faculty_stud_dev_fund: "Faculty and Student Development Fund",
    he_fund: "HE Fund",
    school_operations_fund: "School Operations Fund",
    revolving_fund: "Revolving Fund",
};

const QTY_FIELDS_REQUIRED = ["operating_expenses", "administrative_expenses"];
const RECEIPT_FIELDS_REQUIRED = [
    "supplementary_feeding_fund",
    "clinic_fund",
    "faculty_stud_dev_fund",
    "he_fund",
    "school_operations_fund",
    "revolving_fund",
];

// Fields that only require amount (no quantity/unit)
const AMOUNT_ONLY_FIELDS = ["supplementary_feeding_fund", "clinic_fund"];

const defaultUnitOptions = ["pcs", "packs", "boxes", "kg", "liters", "gallons", "bottles"];

interface ExpenseDetails {
    id: Date;
    date: Date;
    particulars: string;
    receiptNumber?: string;
    quantity?: number;
    unit?: string;
    unitPrice: number;
}

function LiquidationReportContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const category = searchParams.get("category");
    const userCtx = useUser();

    const [reportPeriod, setReportPeriod] = useState<Date | null>(new Date());
    const [unitOptions, setUnitOptions] = useState<string[]>(defaultUnitOptions);
    const [expenseItems, setExpenseItems] = useState<ExpenseDetails[]>([
        {
            id: new Date(),
            date: new Date(),
            particulars: "",
            receiptNumber: RECEIPT_FIELDS_REQUIRED.includes(category || "") ? "" : undefined,
            quantity: QTY_FIELDS_REQUIRED.includes(category || "") ? 1 : undefined,
            unit: QTY_FIELDS_REQUIRED.includes(category || "") ? "" : undefined,
            unitPrice: 0,
        },
    ]);
    const [notes, setNotes] = useState<string>("");
    const [reportAttachments, setReportAttachments] = useState<
        {
            file_urn: string;
            filename: string;
            file_size: number;
            file_type: string;
            upload_url?: string;
        }[]
    >([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Receipt attachment state management
    const [receiptAttachmentUrns, setReceiptAttachmentUrns] = useState<string[]>([]);

    // Signature state management
    // Reason: Track prepared by (current user) and noted by (selected user) for report signatures
    const [preparedBy, setPreparedBy] = useState<string | null>(null);
    const [notedBy, setNotedBy] = useState<string | null>(null);
    const [preparedBySignatureUrl, setPreparedBySignatureUrl] = useState<string | null>(null);
    const [notedBySignatureUrl, setNotedBySignatureUrl] = useState<string | null>(null);

    // User selection state for "noted by" field
    const [schoolUsers, setSchoolUsers] = useState<csclient.UserSimple[]>([]);
    const [selectedNotedByUser, setSelectedNotedByUser] = useState<csclient.UserSimple | null>(null);
    const [userSelectModalOpened, setUserSelectModalOpened] = useState(false);

    // Approval state management
    const [approvalModalOpened, setApprovalModalOpened] = useState(false);
    const [approvalCheckbox, setApprovalCheckbox] = useState(false);

    // Report status tracking
    const [reportStatus, setReportStatus] = useState<string | null>(null);

    const hasQtyUnit = QTY_FIELDS_REQUIRED.includes(category || "");
    const hasReceiptVoucher = RECEIPT_FIELDS_REQUIRED.includes(category || "");

    // Load existing report data
    useEffect(() => {
        const loadExistingReport = async () => {
            if (!userCtx.userInfo?.schoolId || !reportPeriod || !category) return;

            setIsLoading(true);
            try {
                const year = reportPeriod.getFullYear();
                const month = reportPeriod.getMonth() + 1;

                const response = await csclient.getLiquidationReportV1ReportsLiquidationSchoolIdYearMonthCategoryGet({
                    path: {
                        school_id: userCtx.userInfo.schoolId,
                        year,
                        month,
                        category,
                    },
                });

                if (response.data) {
                    const report = response.data;

                    // Load report status to determine approval state
                    if (report.reportStatus) {
                        setReportStatus(report.reportStatus);
                    }

                    // Load signature information from existing report
                    if (report.preparedBy) {
                        setPreparedBy(report.preparedBy);
                    }
                    if (report.notedBy) {
                        setNotedBy(report.notedBy);
                        // Store the noted by ID so we can match it with a user later
                        // The signature will be loaded in the effect after school users are loaded
                    }

                    // Load memo field
                    if (report.memo) {
                        setNotes(report.memo);
                    }

                    // Load entries
                    if (report.entries && report.entries.length > 0) {
                        const isAmountOnly = AMOUNT_ONLY_FIELDS.includes(category || "");
                        const loadedItems: ExpenseDetails[] = report.entries.map((entry, index) => ({
                            id: new Date(Date.now() + index), // Generate unique IDs
                            date: new Date(entry.date),
                            particulars: entry.particulars,
                            receiptNumber: entry.receiptNumber || undefined,
                            quantity: entry.quantity || undefined,
                            unit: entry.unit || undefined,
                            // Use amount field for amount-only categories, unitPrice for others
                            unitPrice: isAmountOnly ? entry.amount || 0 : entry.unitPrice || 0,
                        }));
                        setExpenseItems(loadedItems);

                        // Load receipt attachments if available
                        const allAttachmentUrns: string[] = [];
                        report.entries.forEach((entry) => {
                            if (entry.receipt_attachment_urns) {
                                try {
                                    const urns = JSON.parse(entry.receipt_attachment_urns);
                                    if (Array.isArray(urns)) {
                                        allAttachmentUrns.push(...urns);
                                    }
                                } catch (error) {
                                    customLogger.error("Failed to parse receipt attachment URNs:", error);
                                }
                            }
                        });
                        setReceiptAttachmentUrns(allAttachmentUrns);

                        // notifications.show({
                        //     title: "Report Loaded",
                        //     message: `Loaded existing report with ${loadedItems.length} items${
                        //         allAttachmentUrns.length > 0 ? ` and ${allAttachmentUrns.length} attachments` : ""
                        //     }.`,
                        //     color: "blue",
                        // });
                    }
                }
            } catch {
                // If report doesn't exist (404), that's fine - we'll create a new one
                customLogger.log("No existing report found, starting fresh");
            }
            setIsLoading(false);
        };

        loadExistingReport();
    }, [userCtx.userInfo?.schoolId, reportPeriod, category]);

    // Initialize signature data and load school users
    useEffect(() => {
        const initializeSignatures = async () => {
            if (!userCtx.userInfo) return;

            /**
             * Fetch user signature from the server using their signatureUrn
             * Reason: Convert stored signature URN to displayable blob URL
             */
            const fetchUserSignature = async (signatureUrn: string): Promise<string | null> => {
                try {
                    const response = await csclient.getUserSignatureEndpointV1UsersSignatureGet({
                        query: { fn: signatureUrn },
                    });

                    // Response data is already a blob, create object URL for display
                    if (response.data) {
                        return URL.createObjectURL(response.data as Blob);
                    }
                    return null;
                } catch (error) {
                    customLogger.error("Failed to fetch user signature:", error);
                    return null;
                }
            };

            /**
             * Load users from the same school for "noted by" selection
             * Using the simplified user endpoint to avoid permission errors
             * Reason: Allow selection of any user from the same school for report approval
             */
            const loadSchoolUsers = async () => {
                if (!userCtx.userInfo?.schoolId) return;

                try {
                    const response = await csclient.getUsersSimpleEndpointV1UsersSimpleGet();

                    if (response.data) {
                        // Note: The simple endpoint already filters users to the current user's school
                        // so we don't need to filter by schoolId here
                        setSchoolUsers(response.data);
                    }
                } catch (error) {
                    customLogger.error("Failed to load school users:", error);
                    notifications.show({
                        title: "Error",
                        message: "Failed to load users from your school.",
                        color: "red",
                    });
                }
            };

            // Set prepared by to current user ID (ensure we store user ID, not name)
            setPreparedBy(userCtx.userInfo.id);

            // Load current user's signature if available
            if (userCtx.userInfo.signatureUrn) {
                try {
                    const signatureUrl = await fetchUserSignature(userCtx.userInfo.signatureUrn);
                    if (signatureUrl) {
                        setPreparedBySignatureUrl(signatureUrl);
                    }
                } catch (error) {
                    customLogger.error("Failed to load user signature:", error);
                }
            }

            // Load school users for noted by selection
            await loadSchoolUsers();
        };

        initializeSignatures();
    }, [userCtx.userInfo]);

    // Effect to match loaded notedBy ID with actual user and load their signature
    useEffect(() => {
        const loadNotedBySignature = async () => {
            // If we have a notedBy ID from a loaded report but no selected user yet
            if (notedBy && !selectedNotedByUser && schoolUsers.length > 0) {
                // Try to find the user by matching their ID
                const matchingUser = schoolUsers.find((user) => user.id === notedBy);

                if (matchingUser) {
                    setSelectedNotedByUser(matchingUser);

                    // Load the user's signature if available
                    // Only mark as approved if the report status is actually "approved"
                    if (matchingUser.signatureUrn && reportStatus === "approved") {
                        try {
                            const response = await csclient.getUserSignatureEndpointV1UsersSignatureGet({
                                query: { fn: matchingUser.signatureUrn },
                            });

                            if (response.data) {
                                const signatureUrl = URL.createObjectURL(response.data as Blob);
                                setNotedBySignatureUrl(signatureUrl);
                                // Don't automatically set approval - this should be based on reportStatus
                            }
                        } catch (error) {
                            customLogger.error("Failed to load noted by user signature:", error);
                        }
                    }
                }
            }
        };

        loadNotedBySignature();
    }, [notedBy, selectedNotedByUser, schoolUsers, reportStatus]);

    // Effect to handle report status changes - clear signatures if not approved
    useEffect(() => {
        if (reportStatus && reportStatus !== "approved") {
            // Clear noted by signature if report is not approved
            if (notedBySignatureUrl) {
                URL.revokeObjectURL(notedBySignatureUrl);
                setNotedBySignatureUrl(null);
            }
        }
    }, [reportStatus, notedBySignatureUrl]);

    // Validate category parameter
    if (!category || !report_type[category as keyof typeof report_type]) {
        return (
            <div className="max-w-7xl mx-auto p-4 sm:p-6">
                <Stack gap="lg">
                    <Flex justify="space-between" align="center">
                        <Group gap="md">
                            <div className="p-2 bg-red-100 rounded-lg">
                                <IconHistory size={28} />
                            </div>
                            <div>
                                <Title order={2} className="text-gray-800">
                                    Invalid Report Category
                                </Title>
                                <Text size="sm" c="dimmed">
                                    The report category is missing or invalid.
                                </Text>
                            </div>
                        </Group>
                        <ActionIcon
                            variant="subtle"
                            color="gray"
                            size="lg"
                            onClick={() => router.push("/reports")}
                            className="hover:bg-gray-100"
                        >
                            <IconX size={20} />
                        </ActionIcon>
                    </Flex>
                    <Button onClick={() => router.push("/reports")}>Back to Reports</Button>
                </Stack>
            </div>
        );
    }

    const handleClose = () => {
        router.push("/reports");
    };

    /**
     * Handle selection of a user for the "noted by" field
     * Ensures user ID (not name) is stored for the notedBy field
     */
    const handleNotedByUserSelect = async (user: csclient.UserSimple) => {
        setNotedBy(user.id); // Store user ID, not name - this is critical for backend consistency
        setSelectedNotedByUser(user);

        // Reset approval state when changing the noted by user
        setApprovalCheckbox(false);
        setNotedBySignatureUrl(null);

        setUserSelectModalOpened(false);
    };

    /**
     * Clear the noted by user selection
     * Reason: Allow user to remove the noted by selection and signature
     */
    const handleClearNotedBy = () => {
        setNotedBy(null);
        setSelectedNotedByUser(null);
        setApprovalCheckbox(false);
        if (notedBySignatureUrl) {
            URL.revokeObjectURL(notedBySignatureUrl);
            setNotedBySignatureUrl(null);
        }
    };

    const openApprovalModal = () => {
        setApprovalCheckbox(false);
        setApprovalModalOpened(true);
    };

    const handleApprovalConfirm = async () => {
        if (!approvalCheckbox || !selectedNotedByUser?.signatureUrn) return;

        try {
            const response = await csclient.getUserSignatureEndpointV1UsersSignatureGet({
                query: { fn: selectedNotedByUser.signatureUrn },
            });

            if (response.data) {
                const signatureUrl = URL.createObjectURL(response.data as Blob);
                setNotedBySignatureUrl(signatureUrl);
                // Note: Report status should be updated through a separate API call for approval
                // For now, we just update the local state. The actual approval should happen
                // through the proper approval workflow.
            }
        } catch (error) {
            customLogger.error("Failed to load noted by user signature:", error);
            notifications.show({
                title: "Error",
                message: "Failed to load signature.",
                color: "red",
            });
        }

        setApprovalModalOpened(false);
    };

    const addNewItem = () => {
        const newItem: ExpenseDetails = {
            id: new Date(),
            date: new Date(),
            particulars: "",
            receiptNumber: hasReceiptVoucher ? "" : undefined,
            quantity: hasQtyUnit ? 1 : undefined,
            unit: hasQtyUnit ? "" : undefined,
            unitPrice: 0,
        };
        setExpenseItems([...expenseItems, newItem]);
    };

    const removeItem = (id: Date) => {
        if (expenseItems.length > 1) {
            setExpenseItems(expenseItems.filter((item) => item.id !== id));
        }
    };

    const updateItem = (id: Date, field: keyof ExpenseDetails, value: string | number | Date) => {
        setExpenseItems(
            expenseItems.map((item) => {
                if (item.id === id) {
                    const updatedItem = { ...item, [field]: value };
                    return updatedItem;
                }
                return item;
            })
        );
    };

    const addUnitOption = (newUnit: string) => {
        if (!unitOptions.includes(newUnit)) {
            setUnitOptions([...unitOptions, newUnit]);
        }
    };

    const calculateTotalAmount = () => {
        return expenseItems.reduce((sum, item) => {
            if (hasQtyUnit) {
                return sum + (item.quantity || 1) * item.unitPrice;
            } else {
                return sum + item.unitPrice;
            }
        }, 0);
    };

    const calculateItemTotal = (item: ExpenseDetails) => {
        if (hasQtyUnit) {
            return (item.quantity || 1) * item.unitPrice;
        } else {
            return item.unitPrice;
        }
    };

    const handleSubmitReport = async () => {
        if (!userCtx.userInfo?.schoolId || !reportPeriod || !category) {
            notifications.show({
                title: "Error",
                message:
                    "Missing required information. Please ensure you're logged in and have selected a report period.",
                color: "red",
            });
            return;
        }

        // Validate that all required fields are filled
        const hasEmptyFields = expenseItems.some(
            (item) =>
                !item.particulars ||
                !item.date ||
                item.unitPrice <= 0 ||
                (hasQtyUnit && (!item.quantity || item.quantity <= 0 || !item.unit))
        );

        if (hasEmptyFields) {
            notifications.show({
                title: "Validation Error",
                message: "Please fill in all required fields for each expense item.",
                color: "red",
            });
            return;
        }

        setIsSubmitting(true);
        try {
            const year = reportPeriod.getFullYear();
            const month = reportPeriod.getMonth() + 1;

            // Prepare the entries data
            // Combine receipt attachment URNs with general report attachment URNs
            const allAttachmentUrns = [...receiptAttachmentUrns, ...reportAttachments.map((att) => att.file_urn)];
            const receiptUrnString = allAttachmentUrns.length > 0 ? JSON.stringify(allAttachmentUrns) : null;

            const entries: csclient.LiquidationReportEntryData[] = expenseItems.map((item) => {
                const isAmountOnly = AMOUNT_ONLY_FIELDS.includes(category || "");
                return {
                    date: dayjs(item.date).format("YYYY-MM-DD"),
                    particulars: item.particulars,
                    receiptNumber: item.receiptNumber || null,
                    quantity: item.quantity || null,
                    unit: item.unit || null,
                    // Use amount field for amount-only categories, unitPrice for others
                    ...(isAmountOnly
                        ? { amount: item.unitPrice, unitPrice: null }
                        : { unitPrice: item.unitPrice, amount: null }),
                    receipt_attachment_urns: receiptUrnString,
                };
            });

            // Prepare the report data
            const reportData: csclient.LiquidationReportCreateRequest = {
                entries,
                notedBy: notedBy || null, // Use user ID - ensure it's a valid user ID
                preparedBy: preparedBy || null, // Use user ID - ensure it's a valid user ID
                teacherInCharge: userCtx.userInfo.id, // Current user ID
                certifiedBy: [], // Can be set later
                memo: notes || null, // Add memo field
            };

            // Validate that notedBy and preparedBy are valid user IDs (not names)
            if (notedBy && typeof notedBy !== "string") {
                throw new Error("Invalid notedBy user ID");
            }
            if (preparedBy && typeof preparedBy !== "string") {
                throw new Error("Invalid preparedBy user ID");
            }

            await csclient.createOrUpdateLiquidationReportV1ReportsLiquidationSchoolIdYearMonthCategoryPatch({
                path: {
                    school_id: userCtx.userInfo.schoolId,
                    year,
                    month,
                    category,
                },
                body: reportData,
            });

            notifications.show({
                title: "Success",
                message: "Liquidation report submitted successfully!",
                color: "green",
            });

            // Navigate back to reports page
            router.push("/reports");
        } catch {
            notifications.show({
                title: "Error",
                message: "Failed to submit liquidation report. Please try again.",
                color: "red",
            });
        }
        setIsSubmitting(false);
    };

    const handleSaveDraft = async () => {
        if (!userCtx.userInfo?.schoolId || !reportPeriod || !category) {
            notifications.show({
                title: "Error",
                message:
                    "Missing required information. Please ensure you're logged in and have selected a report period.",
                color: "red",
            });
            return;
        }

        setIsSubmitting(true);
        try {
            const year = reportPeriod.getFullYear();
            const month = reportPeriod.getMonth() + 1;

            // Prepare the entries data (even if some fields are empty for draft)
            // Combine receipt attachment URNs with general report attachment URNs
            const allAttachmentUrns = [...receiptAttachmentUrns, ...reportAttachments.map((att) => att.file_urn)];
            const receiptUrnString = allAttachmentUrns.length > 0 ? JSON.stringify(allAttachmentUrns) : null;

            const entries: csclient.LiquidationReportEntryData[] = expenseItems
                .filter((item) => item.particulars || item.unitPrice > 0) // Only include items with some data
                .map((item) => {
                    const isAmountOnly = AMOUNT_ONLY_FIELDS.includes(category || "");
                    return {
                        date: dayjs(item.date).format("YYYY-MM-DD"),
                        particulars: item.particulars || "",
                        receiptNumber: item.receiptNumber || null,
                        quantity: item.quantity || null,
                        unit: item.unit || null,
                        // Use amount field for amount-only categories, unitPrice for others
                        ...(isAmountOnly
                            ? { amount: item.unitPrice, unitPrice: null }
                            : { unitPrice: item.unitPrice, amount: null }),
                        receipt_attachment_urns: receiptUrnString,
                    };
                });

            // Prepare the report data
            const reportData: csclient.LiquidationReportCreateRequest = {
                entries,
                notedBy: notedBy || null, // Use user ID - ensure it's a valid user ID
                preparedBy: preparedBy || null, // Use user ID - ensure it's a valid user ID
                teacherInCharge: userCtx.userInfo.id,
                certifiedBy: [],
                memo: notes || null, // Add memo field
            };

            // Validate that notedBy and preparedBy are valid user IDs (not names)
            if (notedBy && typeof notedBy !== "string") {
                throw new Error("Invalid notedBy user ID");
            }
            if (preparedBy && typeof preparedBy !== "string") {
                throw new Error("Invalid preparedBy user ID");
            }

            await csclient.createOrUpdateLiquidationReportV1ReportsLiquidationSchoolIdYearMonthCategoryPatch({
                path: {
                    school_id: userCtx.userInfo.schoolId,
                    year,
                    month,
                    category,
                },
                body: reportData,
            });

            notifications.show({
                title: "Draft Saved",
                message: "Your liquidation report draft has been saved successfully!",
                color: "blue",
            });
        } catch {
            notifications.show({
                title: "Error",
                message: "Failed to save draft. Please try again.",
                color: "red",
            });
        }
        setIsSubmitting(false);
    };

    const handlePreview = () => {
        // For now, just show a notification. Later this could open a preview modal
        notifications.show({
            title: "Preview",
            message: "Preview functionality will be implemented soon.",
            color: "blue",
        });
    };

    const getDateRange = () => {
        if (!reportPeriod) return { minDate: undefined, maxDate: undefined };

        const startOfMonth = dayjs(reportPeriod).startOf("month").toDate();
        const endOfMonth = dayjs(reportPeriod).endOf("month").toDate();

        return { minDate: startOfMonth, maxDate: endOfMonth };
    };

    const { minDate, maxDate } = getDateRange();

    if (isLoading) {
        return <LoadingComponent message="Loading liquidation report..." />;
    }

    // Check if category is valid
    if (!category || !report_type[category as keyof typeof report_type]) {
        return (
            <div className="max-w-7xl mx-auto p-4 sm:p-6">
                <Stack gap="lg" align="center">
                    <div className="p-4 bg-red-50 rounded-lg">
                        <IconHistory size={48} className="text-red-500" />
                    </div>
                    <div className="text-center">
                        <Title order={2} className="text-red-600">
                            Invalid Report Category
                        </Title>
                        <Text size="sm" c="dimmed" mb="lg">
                            The report category is missing or invalid.
                        </Text>
                        <Button onClick={() => router.push("/reports")} variant="outline">
                            Back to Reports
                        </Button>
                    </div>
                </Stack>
            </div>
        );
    }

    return (
        <div className="max-w-7xl mx-auto p-4 sm:p-6">
            <Stack gap="lg">
                {/* Header */}
                <Flex justify="space-between" align="center" className="flex-col sm:flex-row gap-4">
                    <Group gap="md">
                        <div className="p-2 bg-blue-100 rounded-lg">
                            <IconHistory size={28} />
                        </div>
                        <div>
                            <Title order={2} className="text-gray-800">
                                {report_type[category as keyof typeof report_type] || "Report Category Not Found"}
                            </Title>
                            <Text size="sm" c="dimmed">
                                Create and manage expense liquidation for {dayjs(reportPeriod).format("MMMM YYYY")}
                            </Text>
                        </div>
                    </Group>
                    <Group gap="md">
                        <ActionIcon
                            variant="subtle"
                            color="gray"
                            size="lg"
                            onClick={handleClose}
                            className="hover:bg-gray-100"
                        >
                            <IconX size={20} />
                        </ActionIcon>
                    </Group>
                </Flex>
                {/* Month Selection */}
                <Card withBorder>
                    <Group justify="space-between" align="center" className="flex-col sm:flex-row gap-4">
                        <Text fw={500}>Report Period</Text>
                        <MonthPickerInput
                            placeholder="Select month"
                            value={reportPeriod}
                            onChange={(value) => setReportPeriod(value ? new Date(value) : null)}
                            leftSection={<IconCalendar size={16} />}
                            className="w-full sm:w-64"
                            valueFormat="MMMM YYYY"
                            required
                        />
                    </Group>
                </Card>
                {/* Item Details Table */}
                <Card withBorder>
                    <Group justify="space-between" align="center" mb="md">
                        <Text fw={500}>Item Details</Text>
                        <Button
                            leftSection={<IconPlus size={16} />}
                            onClick={addNewItem}
                            variant="light"
                            className="bg-blue-50 hover:bg-blue-100"
                        >
                            Add Item
                        </Button>
                    </Group>
                    <div className="overflow-x-auto">
                        <ScrollArea>
                            <Table striped highlightOnHover>
                                <Table.Thead>
                                    <Table.Tr>
                                        <Table.Th className="w-44">Date</Table.Th>
                                        {hasReceiptVoucher && <Table.Th className="w-40">Receipt/Voucher No.</Table.Th>}
                                        <Table.Th>{hasReceiptVoucher ? "Item" : "Particulars"}</Table.Th>
                                        {hasQtyUnit && (
                                            <>
                                                <Table.Th className="w-32">Quantity</Table.Th>
                                                <Table.Th className="w-32">Unit</Table.Th>
                                            </>
                                        )}
                                        <Table.Th className="w-36">Amount</Table.Th>
                                        {hasQtyUnit && <Table.Th className="w-36">Total</Table.Th>}
                                        <Table.Th className="w-16"></Table.Th>
                                    </Table.Tr>
                                </Table.Thead>
                                <Table.Tbody>
                                    {expenseItems.map((item) => (
                                        <Table.Tr key={item.id.toISOString()}>
                                            <Table.Td>
                                                <DateInput
                                                    className="w-full"
                                                    placeholder="Select date"
                                                    value={item.date}
                                                    onChange={(date) => updateItem(item.id, "date", date || new Date())}
                                                    minDate={minDate}
                                                    maxDate={maxDate}
                                                    date={reportPeriod || new Date()}
                                                    required
                                                />
                                            </Table.Td>
                                            {hasReceiptVoucher && (
                                                <Table.Td>
                                                    <TextInput
                                                        className="w-full"
                                                        placeholder="Enter receipt/voucher no."
                                                        value={item.receiptNumber || ""}
                                                        onChange={(e) =>
                                                            updateItem(item.id, "receiptNumber", e.currentTarget.value)
                                                        }
                                                    />
                                                </Table.Td>
                                            )}
                                            <Table.Td>
                                                <TextInput
                                                    className="w-full"
                                                    placeholder="Enter item description"
                                                    value={item.particulars}
                                                    onChange={(e) =>
                                                        updateItem(item.id, "particulars", e.currentTarget.value)
                                                    }
                                                    required
                                                />
                                            </Table.Td>
                                            {hasQtyUnit && (
                                                <>
                                                    <Table.Td>
                                                        <NumberInput
                                                            className="w-full"
                                                            placeholder="Qty"
                                                            value={item.quantity}
                                                            onChange={(value) =>
                                                                updateItem(item.id, "quantity", Number(value) || 1)
                                                            }
                                                            min={1}
                                                        />
                                                    </Table.Td>
                                                    <Table.Td>
                                                        <CreatableUnitSelect
                                                            value={item.unit}
                                                            onChange={(value) => updateItem(item.id, "unit", value)}
                                                            unitOptions={unitOptions}
                                                            onAddUnit={addUnitOption}
                                                        />
                                                    </Table.Td>
                                                </>
                                            )}
                                            <Table.Td>
                                                <NumberInput
                                                    className="w-full"
                                                    placeholder=""
                                                    value={item.unitPrice}
                                                    onChange={(value) =>
                                                        updateItem(item.id, "unitPrice", Number(value) || 0)
                                                    }
                                                    min={0}
                                                    leftSection="₱"
                                                    hideControls
                                                />
                                            </Table.Td>
                                            {hasQtyUnit && (
                                                <Table.Td>
                                                    <Text fw={500}>₱{calculateItemTotal(item).toFixed(2)}</Text>
                                                </Table.Td>
                                            )}
                                            <Table.Td>
                                                <ActionIcon
                                                    color="red"
                                                    variant="subtle"
                                                    onClick={() => removeItem(item.id)}
                                                    disabled={expenseItems.length === 1}
                                                    className="hover:bg-red-50"
                                                >
                                                    <IconTrash size={16} />
                                                </ActionIcon>
                                            </Table.Td>
                                        </Table.Tr>
                                    ))}
                                </Table.Tbody>
                            </Table>
                        </ScrollArea>
                    </div>

                    <Divider my="md" />

                    <Group justify="flex-end">
                        <div className="bg-gray-50 p-4 rounded-lg">
                            <Text size="lg" fw={700} className="text-gray-800">
                                Total Amount: ₱{calculateTotalAmount().toFixed(2)}
                            </Text>
                        </div>
                    </Group>
                </Card>

                {/* Notes Section */}
                <Card withBorder>
                    <Stack gap="md">
                        <Text fw={500}>Memo</Text>
                        <Textarea
                            placeholder="Add note"
                            value={notes}
                            onChange={(e) => setNotes(e.currentTarget.value)}
                            minRows={3}
                            maxRows={6}
                        />
                    </Stack>
                </Card>

                {/* Report Attachments */}
                <ReportAttachmentManager
                    attachments={reportAttachments}
                    onAttachmentsChange={setReportAttachments}
                    initialAttachmentUrns={receiptAttachmentUrns}
                    maxFiles={10}
                    maxFileSize={5 * 1024 * 1024} // 5MB
                    disabled={isSubmitting}
                    title="Supporting Documents"
                    description="Upload receipts, invoices, and other supporting documents for this liquidation report"
                />

                {/* Signature Cards */}
                <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md" mt="xl">
                    {/* Prepared By */}
                    <Card withBorder p="md">
                        <Stack gap="sm" align="center">
                            <Text size="sm" c="dimmed" fw={500} style={{ alignSelf: "flex-start" }}>
                                Prepared by
                            </Text>
                            <Box
                                w={200}
                                h={80}
                                style={{
                                    border: "1px solid #dee2e6",
                                    borderRadius: "8px",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    backgroundColor: "#f8f9fa",
                                    overflow: "hidden",
                                }}
                            >
                                {preparedBySignatureUrl ? (
                                    <Image
                                        src={preparedBySignatureUrl}
                                        alt="Prepared by signature"
                                        fit="contain"
                                        w="100%"
                                        h="100%"
                                    />
                                ) : (
                                    <Text size="xs" c="dimmed">
                                        Signature
                                    </Text>
                                )}
                            </Box>
                            <div style={{ textAlign: "center" }}>
                                <Text fw={600} size="sm">
                                    {userCtx.userInfo
                                        ? `${userCtx.userInfo.nameFirst} ${userCtx.userInfo.nameLast}`.trim()
                                        : "N/A"}
                                </Text>
                                <Text size="xs" c="dimmed">
                                    {userCtx.userInfo?.position || "Position"}
                                </Text>
                            </div>
                        </Stack>
                    </Card>

                    {/* Noted By */}
                    <Card withBorder p="md">
                        <Stack gap="sm" align="center">
                            <Group justify="space-between" w="100%" align="center">
                                <Group gap="xs" align="center">
                                    <Text size="sm" c="dimmed" fw={500}>
                                        Noted by
                                    </Text>
                                    <Badge
                                        size="sm"
                                        color={
                                            reportStatus === "approved"
                                                ? "green"
                                                : selectedNotedByUser
                                                ? "yellow"
                                                : "gray"
                                        }
                                        variant="light"
                                    >
                                        {reportStatus === "approved"
                                            ? "Approved"
                                            : selectedNotedByUser
                                            ? "Pending Approval"
                                            : "Not Selected"}
                                    </Badge>
                                </Group>
                                {selectedNotedByUser ? (
                                    <Button size="xs" variant="subtle" color="red" onClick={handleClearNotedBy}>
                                        Clear
                                    </Button>
                                ) : (
                                    <Button size="xs" variant="light" onClick={() => setUserSelectModalOpened(true)}>
                                        Select User
                                    </Button>
                                )}
                            </Group>
                            <Box
                                w={200}
                                h={80}
                                style={{
                                    border: "1px solid #dee2e6",
                                    borderRadius: "8px",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    backgroundColor: "#f8f9fa",
                                    overflow: "hidden",
                                }}
                            >
                                {notedBySignatureUrl && reportStatus === "approved" ? (
                                    <Image
                                        src={notedBySignatureUrl}
                                        alt="Noted by signature"
                                        fit="contain"
                                        w="100%"
                                        h="100%"
                                    />
                                ) : (
                                    <Text size="xs" c="dimmed">
                                        Signature
                                    </Text>
                                )}
                            </Box>
                            <div style={{ textAlign: "center" }}>
                                <Text fw={600} size="sm">
                                    {selectedNotedByUser
                                        ? `${selectedNotedByUser.nameFirst} ${selectedNotedByUser.nameLast}`.trim()
                                        : "N/A"}
                                </Text>
                                <Text size="xs" c="dimmed">
                                    {selectedNotedByUser?.position || "Position"}
                                </Text>
                            </div>
                            {/* Approval Section */}
                            {selectedNotedByUser && (
                                <div style={{ textAlign: "center", marginTop: "8px" }}>
                                    {/* Show "Approved" badge only when report status is actually "approved" by principal */}
                                    {reportStatus === "approved" ? (
                                        <Badge color="green" variant="light">
                                            Approved
                                        </Badge>
                                    ) : (
                                        /* Only show approve button if the logged-in user is the same as the notedBy user */
                                        selectedNotedByUser.id === userCtx.userInfo?.id && (
                                            <Button
                                                size="xs"
                                                variant="light"
                                                color="blue"
                                                onClick={openApprovalModal}
                                                disabled={!selectedNotedByUser.signatureUrn}
                                            >
                                                Approve Report
                                            </Button>
                                        )
                                    )}
                                </div>
                            )}
                        </Stack>
                    </Card>
                </SimpleGrid>

                {/* Action Buttons */}
                <Stack gap="md">
                    {/* Disbursement Voucher Button */}
                    <Group justify="flex-end">
                        <Button
                            leftSection={<IconFileText size={16} />}
                            variant="light"
                            onClick={() => router.push(`/reports/disbursement-voucher?category=${category}`)}
                            className="bg-blue-600 hover:bg-blue-700"
                            style={{ width: "270px" }}
                        >
                            Create Disbursement Voucher
                        </Button>
                    </Group>

                    {/* Main Action Buttons */}
                    <Group justify="flex-end" gap="md">
                        <SubmitForReviewButton
                            reportType="liquidation"
                            reportPeriod={{
                                schoolId: userCtx.userInfo?.schoolId || 0,
                                year: reportPeriod?.getFullYear() || new Date().getFullYear(),
                                month: reportPeriod?.getMonth()
                                    ? reportPeriod.getMonth() + 1
                                    : new Date().getMonth() + 1,
                                category: category || "",
                            }}
                            onSuccess={() => {
                                notifications.show({
                                    title: "Status Updated",
                                    message: "Report status has been updated to 'Review'.",
                                    color: "green",
                                });
                            }}
                        />
                        <Button
                            variant="outline"
                            onClick={handleClose}
                            className="hover:bg-gray-100"
                            disabled={isSubmitting}
                        >
                            Cancel
                        </Button>
                        <SplitButton
                            onSubmit={handleSubmitReport}
                            onSaveDraft={handleSaveDraft}
                            onPreview={handlePreview}
                            className="bg-blue-600 hover:bg-blue-700"
                            disabled={
                                isSubmitting ||
                                !reportPeriod ||
                                !category ||
                                expenseItems.some((item) => !item.date || !item.particulars) ||
                                expenseItems.every((item) => !item.particulars && item.unitPrice === 0)
                            }
                        >
                            {isSubmitting ? "Submitting..." : "Submit Report"}
                        </SplitButton>
                    </Group>
                </Stack>

                {/* User Selection Modal for "Noted By" */}
                <Modal
                    opened={userSelectModalOpened}
                    onClose={() => setUserSelectModalOpened(false)}
                    title="Select User for 'Noted By'"
                    size="md"
                    centered
                >
                    <Stack gap="md">
                        <Text size="sm" c="dimmed">
                            Select a user from your school to be noted by on this report:
                        </Text>

                        {schoolUsers.length === 0 ? (
                            <Text c="dimmed" ta="center">
                                No users found from your school.
                            </Text>
                        ) : (
                            <Stack gap="xs">
                                {schoolUsers.map((user) => (
                                    <Card
                                        key={user.id}
                                        p="sm"
                                        withBorder
                                        style={{ cursor: "pointer" }}
                                        onClick={() => handleNotedByUserSelect(user)}
                                        className="hover:bg-gray-50"
                                    >
                                        <Group justify="space-between">
                                            <div>
                                                <Text fw={500}>
                                                    {user.nameFirst} {user.nameLast}
                                                </Text>
                                                <Text size="sm" c="dimmed">
                                                    {user.position || "No position specified"}
                                                </Text>
                                            </div>
                                            {user.signatureUrn && (
                                                <Badge size="sm" color="green" variant="light">
                                                    Has Signature
                                                </Badge>
                                            )}
                                        </Group>
                                    </Card>
                                ))}
                            </Stack>
                        )}

                        <Group justify="flex-end" mt="md">
                            <Button variant="outline" onClick={() => setUserSelectModalOpened(false)}>
                                Cancel
                            </Button>
                        </Group>
                    </Stack>
                </Modal>

                {/* Approval Modal */}
                <Modal
                    opened={approvalModalOpened}
                    onClose={() => setApprovalModalOpened(false)}
                    title="Confirm Report Approval"
                    centered
                    size="md"
                >
                    <Stack gap="md">
                        <Text size="sm">
                            Are you sure you want to approve this liquidation report as{" "}
                            <strong>
                                {selectedNotedByUser?.nameFirst} {selectedNotedByUser?.nameLast}
                            </strong>
                            ?
                        </Text>

                        <Text size="sm" c="dimmed">
                            This action will add your signature to the report and mark it as approved.
                        </Text>

                        <Checkbox
                            label="I confirm that I have reviewed this report and approve it"
                            checked={approvalCheckbox}
                            onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                                setApprovalCheckbox(event.currentTarget.checked)
                            }
                        />

                        <Group justify="flex-end" mt="md">
                            <Button variant="outline" onClick={() => setApprovalModalOpened(false)}>
                                Cancel
                            </Button>
                            <Button onClick={handleApprovalConfirm} disabled={!approvalCheckbox} color="green">
                                Confirm Approval
                            </Button>
                        </Group>
                    </Stack>
                </Modal>
            </Stack>
        </div>
    );
}

export default function LiquidationReportPage(): React.ReactElement {
    return (
        <Suspense fallback={<LoadingComponent message="Please wait..." />}>
            <LiquidationReportContent />
        </Suspense>
    );
}
