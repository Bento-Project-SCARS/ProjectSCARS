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
import { ReportAttachmentManager } from "@/components/Reports/ReportAttachmentManager";
import * as csclient from "@/lib/api/csclient";
import { customLogger } from "@/lib/api/customLogger";
import { useUser } from "@/lib/providers/user";
import {
    ActionIcon,
    Badge,
    Box,
    Button,
    Card,
    Checkbox,
    Container,
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
import {
    IconAlertCircle,
    IconCalendar,
    IconDownload,
    IconFileTypePdf,
    IconHistory,
    IconPlus,
    IconTrash,
    IconX,
} from "@tabler/icons-react";
import dayjs from "dayjs";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";

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

    // Get school ID from URL parameters if user is admin/superintendent, otherwise use user's school
    const getEffectiveSchoolId = useCallback(() => {
        const userRoleId = userCtx.userInfo?.roleId;
        const isAdminOrSuperintendent = userRoleId === 2 || userRoleId === 3; // Superintendent or Administrator

        if (isAdminOrSuperintendent) {
            // For admin/superintendent, get school ID from URL parameter
            const schoolIdParam = searchParams.get("schoolId");
            return schoolIdParam ? parseInt(schoolIdParam, 10) : null;
        } else {
            // For regular users (principals, canteen managers), use their assigned school
            return userCtx.userInfo?.schoolId || null;
        }
    }, [userCtx.userInfo?.roleId, userCtx.userInfo?.schoolId, searchParams]);

    const effectiveSchoolId = getEffectiveSchoolId();

    // Helper function to get initial period from URL parameters or default to current month
    const getInitialReportPeriod = useCallback(() => {
        const yearParam = searchParams.get("year");
        const monthParam = searchParams.get("month");

        if (yearParam && monthParam) {
            const year = parseInt(yearParam, 10);
            const month = parseInt(monthParam, 10);

            // Validate year and month
            if (!isNaN(year) && !isNaN(month) && month >= 1 && month <= 12) {
                return new Date(year, month - 1); // month is 0-indexed in Date constructor
            }
        }

        return new Date(); // Default to current month
    }, [searchParams]);

    const [reportPeriod, setReportPeriod] = useState<Date | null>(getInitialReportPeriod());
    const [unitOptions, setUnitOptions] = useState<string[]>(defaultUnitOptions);
    const [expenseItems, setExpenseItems] = useState<ExpenseDetails[]>([
        {
            id: new Date(),
            date: new Date(), // Will be updated to proper date in useEffect
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
    const [isSaving, setIsSaving] = useState(false);

    // Receipt attachment state management
    const [receiptAttachmentUrns, setReceiptAttachmentUrns] = useState<string[]>([]);

    // Signature state management
    // Reason: Track prepared by (current user) and noted by (selected user) for report signatures
    const [preparedBy, setPreparedBy] = useState<string | null>(null);
    const [preparedByPosition, setPreparedByPosition] = useState<string | null>(null);
    const [preparedById, setPreparedById] = useState<string | null>(null); // Store the user ID for API calls
    const [notedBy, setNotedBy] = useState<string | null>(null);
    const [preparedBySignatureUrl, setPreparedBySignatureUrl] = useState<string | null>(null);
    const [notedBySignatureUrl, setNotedBySignatureUrl] = useState<string | null>(null);

    // User selection state for "noted by" field
    const [schoolUsers, setSchoolUsers] = useState<csclient.UserSimple[]>([]);
    const [selectedNotedByUser, setSelectedNotedByUser] = useState<csclient.UserSimple | null>(null);

    // Approval state management
    const [approvalModalOpened, setApprovalModalOpened] = useState(false);
    const [approvalCheckbox, setApprovalCheckbox] = useState(false);

    // Report status tracking
    const [reportStatus, setReportStatus] = useState<string | null>(null);

    // School data for automatic principal assignment
    const [schoolData, setSchoolData] = useState<csclient.School | null>(null);
    const [logoUrl, setLogoUrl] = useState<string | null>(null);
    const [pdfModalOpened, setPdfModalOpened] = useState(false);

    // Helper function to check if the report is read-only
    const isReadOnly = useCallback(() => {
        return reportStatus === "review" || reportStatus === "approved";
    }, [reportStatus]);

    // Helper function to check if a date is a weekend (Saturday or Sunday)
    const isWeekend = useCallback((date: Date) => {
        const dayOfWeek = dayjs(date).day(); // 0 = Sunday, 6 = Saturday
        return dayOfWeek === 0 || dayOfWeek === 6;
    }, []);

    // Helper function to get previous weekday within the report month (for new item defaults)
    const getPreviousWeekdayInReportMonth = useCallback(() => {
        if (!reportPeriod) return new Date();

        const endOfMonth = dayjs(reportPeriod).endOf("month");
        let date = endOfMonth.toDate();

        // Find the last weekday of the report month
        while (isWeekend(date)) {
            date = dayjs(date).subtract(1, "day").toDate();
        }

        return date;
    }, [reportPeriod, isWeekend]);

    // Update report period when URL parameters change
    useEffect(() => {
        const newPeriod = getInitialReportPeriod();
        setReportPeriod((prev) => {
            if (newPeriod.getTime() !== (prev?.getTime() || 0)) {
                return newPeriod;
            }
            return prev;
        });
    }, [getInitialReportPeriod]);

    // Update initial expense item when report period changes
    useEffect(() => {
        setExpenseItems((prev) => {
            if (prev.length === 1 && prev[0].particulars === "" && prev[0].unitPrice === 0) {
                // Always update the initial item to use a date within the report month
                return [
                    {
                        ...prev[0],
                        date: getPreviousWeekdayInReportMonth(),
                    },
                ];
            }
            return prev; // Return unchanged if conditions not met
        });
    }, [reportPeriod, getPreviousWeekdayInReportMonth]);

    const hasQtyUnit = QTY_FIELDS_REQUIRED.includes(category || "");
    const hasReceiptVoucher = RECEIPT_FIELDS_REQUIRED.includes(category || "");

    // Load existing report data
    useEffect(() => {
        const loadExistingReport = async () => {
            if (!effectiveSchoolId || !reportPeriod || !category) return;

            setIsLoading(true);
            try {
                const year = reportPeriod.getFullYear();
                const month = reportPeriod.getMonth() + 1;

                const response = await csclient.getLiquidationReportV1ReportsLiquidationSchoolIdYearMonthCategoryGet({
                    path: {
                        school_id: effectiveSchoolId,
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
                        console.log("Loading preparedBy user for ID:", report.preparedBy);
                        setPreparedById(report.preparedBy); // Store the user ID for API calls
                        try {
                            // Get the user details for the preparedBy user using simple endpoint
                            const userResponse = await csclient.getUsersSimpleEndpointV1UsersSimpleGet();

                            if (userResponse.data) {
                                // Find the user with the matching ID
                                const preparedByUser = userResponse.data.find((user) => user.id === report.preparedBy);

                                if (preparedByUser) {
                                    const userName = `${preparedByUser.nameFirst} ${preparedByUser.nameLast}`.trim();
                                    console.log("Setting preparedBy to:", userName);
                                    setPreparedBy(userName);
                                    setPreparedByPosition(preparedByUser.position || null);

                                    // Load user's signature for preparedBy (load the actual preparedBy user's signature)
                                    if (preparedByUser.signatureUrn) {
                                        try {
                                            const response = await csclient.getUserSignatureEndpointV1UsersSignatureGet(
                                                {
                                                    query: { fn: preparedByUser.signatureUrn },
                                                }
                                            );
                                            if (response.data) {
                                                const signatureUrl = URL.createObjectURL(response.data as Blob);
                                                setPreparedBySignatureUrl(signatureUrl);
                                            }
                                        } catch (error) {
                                            customLogger.error("Failed to load preparedBy user signature:", error);
                                        }
                                    }
                                }
                            }
                        } catch (error) {
                            customLogger.error("Failed to load preparedBy user details:", error);
                        }
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

                        // Load receipt attachments if available (only from the first entry to avoid duplication)
                        const allAttachmentUrns: string[] = [];

                        // Only check the first entry for attachments since that's where we store them
                        if (report.entries.length > 0 && report.entries[0].receipt_attachment_urns) {
                            try {
                                const urns = JSON.parse(report.entries[0].receipt_attachment_urns);
                                if (Array.isArray(urns)) {
                                    allAttachmentUrns.push(...urns);
                                }
                            } catch (error) {
                                customLogger.error("Failed to parse receipt attachment URNs:", error);
                            }
                        }
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
    }, [effectiveSchoolId, reportPeriod, category]);

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

            // Set prepared by to current user ID only for new reports (not when loading existing reports)
            // This should only run if there's no existing report with preparedBy data
            if (!preparedBy && !preparedBySignatureUrl && reportStatus === null) {
                const currentUserName = `${userCtx.userInfo.nameFirst} ${userCtx.userInfo.nameLast}`.trim();
                setPreparedBy(currentUserName);
                setPreparedByPosition(userCtx.userInfo.position || null);
                setPreparedById(userCtx.userInfo.id); // Set the user ID for API calls

                // Load current user's signature for preparedBy only if preparedBy is not set yet
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
            }

            // Load school users for noted by selection
            await loadSchoolUsers();
        };

        initializeSignatures();
    }, [userCtx.userInfo, preparedBy, preparedBySignatureUrl, reportStatus]);

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

    // Load school data and automatically assign principal
    useEffect(() => {
        const loadSchoolData = async () => {
            if (!effectiveSchoolId) return;

            try {
                // Get school details using the school ID
                const schoolResponse = await csclient.getSchoolEndpointV1SchoolsGet({
                    query: {
                        school_id: effectiveSchoolId,
                    },
                });

                if (schoolResponse.data) {
                    setSchoolData(schoolResponse.data);

                    // Load school logo if available
                    if (schoolResponse.data.logoUrn) {
                        try {
                            const logoResponse = await csclient.getSchoolLogoEndpointV1SchoolsLogoGet({
                                query: { fn: schoolResponse.data.logoUrn },
                            });
                            if (logoResponse.data) {
                                const logoUrl = URL.createObjectURL(logoResponse.data as Blob);
                                setLogoUrl(logoUrl);
                            }
                        } catch (error) {
                            customLogger.error("Failed to load school logo:", error);
                        }
                    }

                    // Automatically assign the principal as notedBy if not already set
                    if (!notedBy && !selectedNotedByUser && schoolResponse.data.assignedNotedBy) {
                        console.log("Auto-assigning principal as notedBy:", schoolResponse.data.assignedNotedBy);

                        // Set the notedBy to the assigned principal's ID
                        setNotedBy(schoolResponse.data.assignedNotedBy);

                        // Find the principal user from schoolUsers if available
                        if (schoolUsers.length > 0) {
                            const principalUser = schoolUsers.find(
                                (user) => user.id === schoolResponse.data.assignedNotedBy
                            );
                            if (principalUser) {
                                setSelectedNotedByUser(principalUser);

                                // Load the principal's signature if available and report is approved
                                if (principalUser.signatureUrn && reportStatus === "approved") {
                                    try {
                                        const response = await csclient.getUserSignatureEndpointV1UsersSignatureGet({
                                            query: { fn: principalUser.signatureUrn },
                                        });

                                        if (response.data) {
                                            const signatureUrl = URL.createObjectURL(response.data as Blob);
                                            setNotedBySignatureUrl(signatureUrl);
                                        }
                                    } catch (error) {
                                        customLogger.error("Failed to load principal signature:", error);
                                    }
                                }
                            }
                        }
                    }
                }
            } catch (error) {
                console.error("Failed to load school data:", error);
            }
        };

        loadSchoolData();
    }, [effectiveSchoolId, notedBy, selectedNotedByUser, schoolUsers, reportStatus]);

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
                        <ActionIcon variant="subtle" color="gray" onClick={() => router.push("/reports")} size="lg">
                            <IconX size={20} />
                        </ActionIcon>
                    </Flex>
                </Stack>
            </div>
        );
    }

    // Validate that school ID is available
    if (!effectiveSchoolId) {
        const userRoleId = userCtx.userInfo?.roleId;
        const isAdminOrSuperintendent = userRoleId === 2 || userRoleId === 3;

        return (
            <div className="max-w-7xl mx-auto p-4 sm:p-6">
                <Stack gap="lg">
                    <Flex justify="space-between" align="center">
                        <Group gap="md">
                            <div className="p-2 bg-red-100 rounded-lg">
                                <IconAlertCircle size={28} />
                            </div>
                            <div>
                                <Title order={2} className="text-gray-800">
                                    {isAdminOrSuperintendent ? "School Not Specified" : "No School Assignment"}
                                </Title>
                                <Text size="sm" c="dimmed">
                                    {isAdminOrSuperintendent
                                        ? "Please specify a school ID in the URL to view this report."
                                        : "You are not assigned to a school. Please contact your administrator."}
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
        router.back();
    };

    const handleApprovalConfirm = async () => {
        if (!approvalCheckbox || !selectedNotedByUser?.signatureUrn) return;

        try {
            // First, load the signature
            const response = await csclient.getUserSignatureEndpointV1UsersSignatureGet({
                query: { fn: selectedNotedByUser.signatureUrn },
            });

            if (response.data) {
                const signatureUrl = URL.createObjectURL(response.data as Blob);
                setNotedBySignatureUrl(signatureUrl);

                // Update the report status to "approved" on the backend
                if (userCtx.userInfo?.schoolId && reportPeriod && category) {
                    const year = reportPeriod.getFullYear();
                    const month = reportPeriod.getMonth() + 1;

                    await csclient.changeLiquidationReportStatusV1ReportsLiquidationSchoolIdYearMonthCategoryStatusPatch(
                        {
                            path: {
                                school_id: effectiveSchoolId,
                                year,
                                month,
                                category,
                            },
                            body: {
                                new_status: "approved",
                                comments: "Liquidation report approved by principal",
                            },
                        }
                    );

                    // Update the local state
                    setReportStatus("approved");

                    notifications.show({
                        title: "Report Approved",
                        message: "The liquidation report has been approved successfully.",
                        color: "green",
                    });
                }
            }
        } catch (error) {
            customLogger.error("Failed to approve liquidation report:", error);
            notifications.show({
                title: "Error",
                message: "Failed to approve the report. Please try again.",
                color: "red",
            });
        }

        setApprovalModalOpened(false);
    };

    const addNewItem = () => {
        const newItem: ExpenseDetails = {
            id: new Date(),
            date: getPreviousWeekdayInReportMonth(), // Use previous weekday within the report month
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
        // Prevent setting weekend dates
        if (field === "date" && value instanceof Date && isWeekend(value)) {
            notifications.show({
                title: "Weekend Not Allowed",
                message:
                    "Expense dates cannot be set to weekends (Saturday and Sunday). The canteen is closed on weekends.",
                color: "orange",
            });
            return;
        }

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

    const handleSaveDraft = async () => {
        if (!effectiveSchoolId || !reportPeriod || !category) {
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

        setIsSaving(true);
        try {
            const year = reportPeriod.getFullYear();
            const month = reportPeriod.getMonth() + 1;

            // Prepare the entries data
            // Store attachments only in the first entry to avoid duplication
            const allAttachmentUrns = [...receiptAttachmentUrns, ...reportAttachments.map((att) => att.file_urn)];
            const receiptUrnString = allAttachmentUrns.length > 0 ? JSON.stringify(allAttachmentUrns) : null;

            const entries: csclient.LiquidationReportEntryData[] = expenseItems.map((item, index) => {
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
                    // Only store attachments in the first entry to avoid duplication
                    receipt_attachment_urns: index === 0 ? receiptUrnString : null,
                };
            });

            // Prepare the report data
            const reportData: csclient.LiquidationReportCreateRequest = {
                schoolId: effectiveSchoolId,
                entries,
                notedBy: notedBy || null, // Use user ID - ensure it's a valid user ID
                preparedBy: preparedById || null, // Use user ID - ensure it's a valid user ID
                teacherInCharge: userCtx.userInfo?.id || null, // Current user ID
                certifiedBy: [], // Can be set later
                memo: notes || null, // Add memo field
            };

            // Validate that notedBy and preparedBy are valid user IDs (not names)
            if (notedBy && typeof notedBy !== "string") {
                throw new Error("Invalid notedBy user ID");
            }
            if (preparedById && typeof preparedById !== "string") {
                throw new Error("Invalid preparedBy user ID");
            }

            await csclient.createOrUpdateLiquidationReportV1ReportsLiquidationSchoolIdYearMonthCategoryPatch({
                path: {
                    school_id: effectiveSchoolId,
                    year,
                    month,
                    category,
                },
                body: reportData,
            });

            notifications.show({
                title: "Saved",
                message: "Liquidation report has been saved successfully!",
                color: "green",
            });

            // Navigate back to reports page
            router.push("/reports");
        } catch {
            notifications.show({
                title: "Error",
                message: "Failed to save liquidation report. Please try again.",
                color: "red",
            });
        }
        setIsSaving(false);
    };

    const getFileName = () => {
        const monthYear = dayjs(reportPeriod).format("MMMM-YYYY");
        const categoryName = report_type[category as keyof typeof report_type] || "Report";
        const schoolName = schoolData?.name || userCtx.userInfo?.schoolId || "School";
        return `${categoryName}-${schoolName}-${monthYear}.pdf`;
    };

    const exportToPDF = async () => {
        const element = document.getElementById("liquidation-report-content");
        if (!element) return;

        try {
            // Hide action buttons during export
            const actionButtons = document.querySelectorAll(".hide-in-pdf");
            actionButtons.forEach((btn) => ((btn as HTMLElement).style.display = "none"));

            const canvas = await html2canvas(element, {
                useCORS: true,
                allowTaint: true,
                backgroundColor: "#ffffff",
            });

            const imgData = canvas.toDataURL("image/png");
            const pdf = new jsPDF({
                orientation: "portrait",
                unit: "mm",
                format: "a4",
            });

            const imgWidth = 210;
            const pageHeight = 295;
            const imgHeight = (canvas.height * imgWidth) / canvas.width;
            let heightLeft = imgHeight;

            let position = 0;

            pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
            heightLeft -= pageHeight;

            while (heightLeft >= 0) {
                position = heightLeft - imgHeight;
                pdf.addPage();
                pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
                heightLeft -= pageHeight;
            }

            pdf.save(getFileName());

            // Show action buttons again
            actionButtons.forEach((btn) => ((btn as HTMLElement).style.display = ""));

            notifications.show({
                title: "Success",
                message: "PDF exported successfully",
                color: "green",
            });
        } catch (error) {
            console.error("Error exporting PDF:", error);
            notifications.show({
                title: "Error",
                message: "Failed to export PDF",
                color: "red",
            });
        }
    };

    const PDFReportTemplate = () => {
        const totalAmount = calculateTotalAmount();

        return (
            <div
                id="liquidation-report-content"
                style={{
                    backgroundColor: "white",
                    padding: "40px",
                    fontFamily: "Arial, sans-serif",
                    minHeight: "100vh",
                }}
            >
                {/* Header with logos and school info */}
                <div style={{ textAlign: "center", marginBottom: "30px" }}>
                    <div
                        style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            marginBottom: "20px",
                        }}
                    >
                        <div style={{ width: "80px", height: "80px" }}>
                            {/* School Logo */}
                            {logoUrl ? (
                                <Image
                                    src={logoUrl}
                                    alt="School Logo"
                                    style={{
                                        width: "100%",
                                        height: "100%",
                                        objectFit: "cover",
                                        borderRadius: "50%",
                                    }}
                                />
                            ) : (
                                <div
                                    style={{
                                        width: "100%",
                                        height: "100%",
                                        border: "1px solid #ccc",
                                        borderRadius: "50%",
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        fontSize: "12px",
                                        color: "#666",
                                    }}
                                >
                                    LOGO
                                </div>
                            )}
                        </div>

                        <div style={{ textAlign: "center", flex: 1 }}>
                            <div style={{ fontSize: "14px", fontWeight: "bold" }}>Republic of the Philippines</div>
                            <div style={{ fontSize: "14px", fontWeight: "bold" }}>Department of Education</div>
                            <div style={{ fontSize: "14px", fontWeight: "bold" }}>Region III- Central Luzon</div>
                            <div style={{ fontSize: "14px", fontWeight: "bold" }}>
                                SCHOOLS DIVISION OF CITY OF BALIWAG
                            </div>
                            <div style={{ fontSize: "16px", fontWeight: "bold", marginTop: "5px" }}>
                                {schoolData?.name.toUpperCase() || "SCHOOL NAME"}
                            </div>
                            <div style={{ fontSize: "12px" }}>{schoolData?.address || "School Address"}</div>
                        </div>

                        <div style={{ width: "80px", height: "80px" }}>
                            {/* DepEd Logo */}
                            <Image
                                src="/assets/logos/deped.svg"
                                alt="Deped Logo"
                                style={{
                                    width: "100%",
                                    height: "100%",
                                    objectFit: "cover",
                                    borderRadius: "50%",
                                }}
                            />
                        </div>
                    </div>

                    <div
                        style={{
                            fontSize: "18px",
                            fontWeight: "bold",
                            marginTop: "30px",
                            textDecoration: "underline",
                        }}
                    >
                        LIQUIDATION REPORT
                    </div>
                    <div style={{ fontSize: "16px", fontWeight: "bold", marginTop: "10px" }}>
                        {report_type[category as keyof typeof report_type]}
                    </div>
                    <div style={{ fontSize: "14px", marginTop: "5px" }}>
                        For the Month of {dayjs(reportPeriod).format("MMMM, YYYY").toUpperCase()}
                    </div>
                </div>

                {/* Table */}
                <table
                    style={{
                        width: "100%",
                        borderCollapse: "collapse",
                        margin: "20px 0",
                        fontSize: "11px",
                    }}
                >
                    <thead>
                        <tr style={{ backgroundColor: "#f5f5f5" }}>
                            <th
                                style={{ border: "1px solid #000", padding: "8px", textAlign: "center", width: "80px" }}
                            >
                                Date
                            </th>
                            <th
                                style={{
                                    border: "1px solid #000",
                                    padding: "8px",
                                    textAlign: "center",
                                    width: "200px",
                                }}
                            >
                                Particulars
                            </th>
                            {hasReceiptVoucher && (
                                <th
                                    style={{
                                        border: "1px solid #000",
                                        padding: "8px",
                                        textAlign: "center",
                                        width: "100px",
                                    }}
                                >
                                    Receipt/Voucher No.
                                </th>
                            )}
                            {hasQtyUnit && (
                                <>
                                    <th
                                        style={{
                                            border: "1px solid #000",
                                            padding: "8px",
                                            textAlign: "center",
                                            width: "60px",
                                        }}
                                    >
                                        Qty
                                    </th>
                                    <th
                                        style={{
                                            border: "1px solid #000",
                                            padding: "8px",
                                            textAlign: "center",
                                            width: "60px",
                                        }}
                                    >
                                        Unit
                                    </th>
                                    <th
                                        style={{
                                            border: "1px solid #000",
                                            padding: "8px",
                                            textAlign: "center",
                                            width: "80px",
                                        }}
                                    >
                                        Unit Price
                                    </th>
                                </>
                            )}
                            <th
                                style={{
                                    border: "1px solid #000",
                                    padding: "8px",
                                    textAlign: "center",
                                    width: "100px",
                                }}
                            >
                                {hasQtyUnit ? "Total Amount" : "Amount"}
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {expenseItems.map((item, index) => (
                            <tr key={index}>
                                <td style={{ border: "1px solid #000", padding: "8px", textAlign: "center" }}>
                                    {dayjs(item.date).format("DD-MMM-YY")}
                                </td>
                                <td style={{ border: "1px solid #000", padding: "8px" }}>{item.particulars}</td>
                                {hasReceiptVoucher && (
                                    <td style={{ border: "1px solid #000", padding: "8px", textAlign: "center" }}>
                                        {item.receiptNumber || ""}
                                    </td>
                                )}
                                {hasQtyUnit && (
                                    <>
                                        <td style={{ border: "1px solid #000", padding: "8px", textAlign: "center" }}>
                                            {item.quantity || ""}
                                        </td>
                                        <td style={{ border: "1px solid #000", padding: "8px", textAlign: "center" }}>
                                            {item.unit || ""}
                                        </td>
                                        <td style={{ border: "1px solid #000", padding: "8px", textAlign: "right" }}>
                                            ₱{item.unitPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                        </td>
                                    </>
                                )}
                                <td style={{ border: "1px solid #000", padding: "8px", textAlign: "right" }}>
                                    ₱{calculateItemTotal(item).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </td>
                            </tr>
                        ))}
                        <tr style={{ backgroundColor: "#f5f5f5", fontWeight: "bold" }}>
                            <td
                                style={{
                                    border: "1px solid #000",
                                    padding: "8px",
                                    textAlign: "center",
                                }}
                                colSpan={
                                    hasQtyUnit && hasReceiptVoucher ? 6 : hasQtyUnit ? 5 : hasReceiptVoucher ? 3 : 2
                                }
                            >
                                TOTAL
                            </td>
                            <td style={{ border: "1px solid #000", padding: "8px", textAlign: "right" }}>
                                ₱{totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </td>
                        </tr>
                    </tbody>
                </table>

                {/* Notes section */}
                {notes && (
                    <div style={{ marginTop: "20px" }}>
                        <div style={{ fontSize: "14px", fontWeight: "bold", marginBottom: "10px" }}>Notes/Remarks:</div>
                        <div style={{ fontSize: "12px", border: "1px solid #ccc", padding: "10px", minHeight: "60px" }}>
                            {notes}
                        </div>
                    </div>
                )}

                {/* Signatures */}
                <div
                    style={{
                        marginTop: "40px",
                        display: "flex",
                        justifyContent: "space-between",
                    }}
                >
                    <div style={{ textAlign: "center" }}>
                        <div style={{ fontSize: "12px", marginBottom: "5px" }}>Prepared by:</div>
                        <div
                            style={{
                                width: "200px",
                                height: "60px",
                                border: preparedBySignatureUrl ? "none" : "1px solid #ccc",
                                marginBottom: "10px",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                            }}
                        >
                            {preparedBySignatureUrl ? (
                                <Image
                                    src={preparedBySignatureUrl}
                                    alt="Prepared by signature"
                                    style={{ maxWidth: "100%", maxHeight: "100%" }}
                                />
                            ) : (
                                <div style={{ fontSize: "10px", color: "#666" }}>Signature</div>
                            )}
                        </div>
                        <div style={{ borderBottom: "1px solid #000", width: "200px", marginBottom: "5px" }}></div>
                        <div style={{ fontSize: "12px", fontWeight: "bold" }}>{preparedBy || "NAME"}</div>
                        <div style={{ fontSize: "10px" }}>{preparedByPosition || "Position"}</div>
                    </div>

                    <div style={{ textAlign: "center" }}>
                        <div style={{ fontSize: "12px", marginBottom: "5px" }}>Noted:</div>
                        <div
                            style={{
                                width: "200px",
                                height: "60px",
                                border:
                                    notedBySignatureUrl &&
                                    (reportStatus === "approved" ||
                                        reportStatus === "received" ||
                                        reportStatus === "archived")
                                        ? "none"
                                        : "1px solid #ccc",
                                marginBottom: "10px",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                            }}
                        >
                            {notedBySignatureUrl &&
                            (reportStatus === "approved" ||
                                reportStatus === "received" ||
                                reportStatus === "archived") ? (
                                <Image
                                    src={notedBySignatureUrl}
                                    alt="Noted by signature"
                                    style={{ maxWidth: "100%", maxHeight: "100%" }}
                                />
                            ) : (
                                <div style={{ fontSize: "10px", color: "#666" }}>Signature</div>
                            )}
                        </div>
                        <div style={{ borderBottom: "1px solid #000", width: "200px", marginBottom: "5px" }}></div>
                        <div style={{ fontSize: "12px", fontWeight: "bold" }}>
                            {selectedNotedByUser
                                ? `${selectedNotedByUser.nameFirst} ${selectedNotedByUser.nameLast}`.trim()
                                : "NAME"}
                        </div>
                        <div style={{ fontSize: "10px" }}>{selectedNotedByUser?.position || "Position"}</div>
                    </div>
                </div>
            </div>
        );
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
        <Container size="xl" py={{ base: "sm", sm: "md", lg: "xl" }}>
            <div className="max-w-7xl mx-auto p-4 sm:p-6">
                <Stack gap="lg">
                    {/* Header */}
                    <Flex justify="space-between" align="center" direction={{ base: "column", sm: "row" }} gap="md">
                        <Group gap="md">
                            <div className="p-2 bg-blue-100 rounded-lg">
                                <IconHistory size={28} />
                            </div>
                            <div>
                                <Group gap="sm" align="center">
                                    <Title order={2} className="text-gray-800">
                                        {report_type[category as keyof typeof report_type] ||
                                            "Report Category Not Found"}
                                    </Title>
                                    {isReadOnly() && (
                                        <Badge color="blue" variant="light" size="sm">
                                            {reportStatus === "approved" ? "Approved" : "Under Review"}
                                        </Badge>
                                    )}
                                </Group>
                                <Text size="sm" c="dimmed">
                                    {isReadOnly() ? "Viewing" : "Create and manage"} expense liquidation for{" "}
                                    {dayjs(reportPeriod).format("MMMM YYYY")}
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
                                onChange={(value) => {
                                    const newDate = value ? new Date(value) : null;
                                    setReportPeriod(newDate);

                                    // Clear state when month changes
                                    setExpenseItems([
                                        {
                                            id: new Date(),
                                            date: getPreviousWeekdayInReportMonth(), // Use previous weekday within the report month
                                            particulars: "",
                                            receiptNumber: RECEIPT_FIELDS_REQUIRED.includes(category || "")
                                                ? ""
                                                : undefined,
                                            quantity: QTY_FIELDS_REQUIRED.includes(category || "") ? 1 : undefined,
                                            unit: QTY_FIELDS_REQUIRED.includes(category || "") ? "" : undefined,
                                            unitPrice: 0,
                                        },
                                    ]);
                                    setNotes("");
                                    setReportAttachments([]);
                                    setReceiptAttachmentUrns([]);
                                    setReportStatus(null);
                                    setNotedBy(null);
                                    setSelectedNotedByUser(null);
                                    setNotedBySignatureUrl(null);
                                    setPreparedBy(null);
                                    setPreparedBySignatureUrl(null);
                                }}
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
                                disabled={isReadOnly()}
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
                                            {hasReceiptVoucher && (
                                                <Table.Th className="w-40">Receipt/Voucher No.</Table.Th>
                                            )}
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
                                                        onChange={(date) =>
                                                            updateItem(item.id, "date", date || new Date())
                                                        }
                                                        minDate={minDate}
                                                        maxDate={maxDate}
                                                        date={reportPeriod || new Date()}
                                                        required
                                                        readOnly={isReadOnly()}
                                                        disabled={isReadOnly()}
                                                        getDayProps={(date) => {
                                                            const dayOfWeek = dayjs(date).day(); // 0 = Sunday, 6 = Saturday

                                                            // Check if the date is within the current report month
                                                            const isCurrentMonth = reportPeriod
                                                                ? dayjs(date).isSame(reportPeriod, "month")
                                                                : false;

                                                            // Disable weekends (Saturday and Sunday)
                                                            const isWeekendDay = dayOfWeek === 0 || dayOfWeek === 6;

                                                            // Disable future dates (after today)
                                                            const isFutureDate = dayjs(date).isAfter(dayjs(), "day");

                                                            // Disable if not in current month, is weekend, or is future date
                                                            const shouldDisable =
                                                                !isCurrentMonth || isWeekendDay || isFutureDate;

                                                            return {
                                                                disabled: shouldDisable,
                                                                style: {
                                                                    color: shouldDisable ? "#adb5bd" : undefined, // gray out disabled days
                                                                },
                                                            };
                                                        }}
                                                    />
                                                </Table.Td>
                                                {hasReceiptVoucher && (
                                                    <Table.Td>
                                                        <TextInput
                                                            className="w-full"
                                                            placeholder="Enter receipt/voucher no."
                                                            value={item.receiptNumber || ""}
                                                            onChange={(e) =>
                                                                updateItem(
                                                                    item.id,
                                                                    "receiptNumber",
                                                                    e.currentTarget.value
                                                                )
                                                            }
                                                            readOnly={isReadOnly()}
                                                            disabled={isReadOnly()}
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
                                                        readOnly={isReadOnly()}
                                                        disabled={isReadOnly()}
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
                                                                readOnly={isReadOnly()}
                                                                disabled={isReadOnly()}
                                                            />
                                                        </Table.Td>
                                                        <Table.Td>
                                                            <CreatableUnitSelect
                                                                value={item.unit}
                                                                onChange={(value) => updateItem(item.id, "unit", value)}
                                                                unitOptions={unitOptions}
                                                                onAddUnit={addUnitOption}
                                                                disabled={isReadOnly()}
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
                                                        readOnly={isReadOnly()}
                                                        disabled={isReadOnly()}
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
                                                        disabled={expenseItems.length === 1 || isReadOnly()}
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
                                readOnly={isReadOnly()}
                                disabled={isReadOnly()}
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
                        disabled={isSaving || isReadOnly()}
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
                                        {preparedBy || "NAME"}
                                    </Text>
                                    <Text size="xs" c="dimmed">
                                        {preparedByPosition || "Position"}
                                    </Text>
                                </div>
                            </Stack>
                        </Card>

                        {/* Noted By */}
                        <Card withBorder p="md">
                            <Stack gap="sm" align="center">
                                <Group justify="space-between" w="100%" align="center">
                                    <Text size="sm" c="dimmed" fw={500}>
                                        Noted by
                                    </Text>
                                    <Badge
                                        size="sm"
                                        color={
                                            reportStatus === "approved" ||
                                            reportStatus === "received" ||
                                            reportStatus === "archived"
                                                ? "green"
                                                : selectedNotedByUser
                                                ? "yellow"
                                                : "gray"
                                        }
                                        variant="light"
                                    >
                                        {reportStatus === "approved"
                                            ? "Approved"
                                            : reportStatus === "received"
                                            ? "Received"
                                            : reportStatus === "archived"
                                            ? "Archived"
                                            : selectedNotedByUser
                                            ? "Pending Approval"
                                            : "Not Assigned"}
                                    </Badge>
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
                                    {notedBySignatureUrl &&
                                    (reportStatus === "approved" ||
                                        reportStatus === "received" ||
                                        reportStatus === "archived") ? (
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
                            </Stack>
                        </Card>
                    </SimpleGrid>

                    {/* Action Buttons */}
                    <Stack gap="md">
                        {/* Disbursement Voucher Button */}
                        <Group justify="flex-end">
                            {/* FIXME: Implement this */}
                            {/* <Button
                            leftSection={<IconFileText size={16} />}
                            variant="light"
                            onClick={() => router.push(`/reports/disbursement-voucher?category=${category}`)}
                            className="bg-blue-600 hover:bg-blue-700"
                            style={{ width: "270px" }}
                            disabled={isSaving || isReadOnly() || !reportPeriod || !category}
                        >
                            Create Disbursement Voucher
                        </Button> */}
                        </Group>
                        <Group justify="flex-end" gap="md">
                            <Button
                                variant="outline"
                                onClick={handleClose}
                                className="hover:bg-gray-100 hide-in-pdf"
                                disabled={isSaving}
                            >
                                Cancel
                            </Button>
                            <Button
                                variant="outline"
                                onClick={() => setPdfModalOpened(true)}
                                className="hide-in-pdf"
                                leftSection={<IconFileTypePdf size={16} />}
                            >
                                Export PDF
                            </Button>
                            <SplitButton
                                onSaveReport={handleSaveDraft}
                                disabled={
                                    isSaving ||
                                    !reportPeriod ||
                                    !category ||
                                    expenseItems.some((item) => !item.date || !item.particulars) ||
                                    expenseItems.every((item) => !item.particulars && item.unitPrice === 0) ||
                                    isReadOnly()
                                }
                                className="bg-blue-600 hover:bg-blue-700 hide-in-pdf"
                                showPreview={false}
                                reportType="liquidation"
                                reportPeriod={{
                                    schoolId: effectiveSchoolId || 0,
                                    year: reportPeriod?.getFullYear() || new Date().getFullYear(),
                                    month: reportPeriod?.getMonth()
                                        ? reportPeriod.getMonth() + 1
                                        : new Date().getMonth() + 1,
                                    category: category || "",
                                }}
                                onSubmitForReviewSuccess={() => {
                                    notifications.show({
                                        title: "Status Updated",
                                        message: "Report status has been updated to 'Review'.",
                                        color: "green",
                                    });
                                    // Redirect to reports page after successful submission
                                    setTimeout(() => {
                                        router.push("/reports");
                                    }, 1000);
                                }}
                            >
                                {isSaving ? "Saving..." : "Save Report"}
                            </SplitButton>
                        </Group>
                    </Stack>

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

                    {/* PDF Export Modal */}
                    <Modal
                        opened={pdfModalOpened}
                        onClose={() => setPdfModalOpened(false)}
                        title={getFileName()}
                        size="90%"
                        centered
                        padding="sm"
                    >
                        <Stack gap="xs">
                            <div
                                style={{
                                    maxHeight: "70vh",
                                    overflowY: "auto",
                                    border: "1px solid #e0e0e0",
                                    borderRadius: "8px",
                                }}
                            >
                                <PDFReportTemplate />
                            </div>

                            <Group justify="flex-end" gap="md">
                                <Button variant="outline" onClick={() => setPdfModalOpened(false)}>
                                    Cancel
                                </Button>
                                <Button onClick={exportToPDF} leftSection={<IconDownload size={16} />}>
                                    Download
                                </Button>
                            </Group>
                        </Stack>
                    </Modal>
                </Stack>
            </div>
        </Container>
    );
}

export default function LiquidationReportPage(): React.ReactElement {
    return (
        <Suspense fallback={<LoadingComponent message="Please wait..." />}>
            <LiquidationReportContent />
        </Suspense>
    );
}
