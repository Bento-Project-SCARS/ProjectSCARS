"use client";

import { LoadingComponent } from "@/components/LoadingComponent/LoadingComponent";
import { SubmitForReviewButton } from "@/components/SubmitForReview";
import * as csclient from "@/lib/api/csclient";
import { customLogger } from "@/lib/api/customLogger";
import { useUser } from "@/lib/providers/user";
import {
    ActionIcon,
    Alert,
    Badge,
    Box,
    Button,
    Card,
    Checkbox,
    Container,
    Flex,
    Group,
    Image,
    Modal,
    NumberInput,
    SimpleGrid,
    Stack,
    Table,
    Text,
    Title,
    Tooltip,
} from "@mantine/core";
import { DatePickerInput, MonthPickerInput } from "@mantine/dates";
import "@mantine/dates/styles.css";
import { notifications } from "@mantine/notifications";
import {
    IconAlertCircle,
    IconCalendar,
    IconDownload,
    IconDeviceFloppy,
    IconFileTypePdf,
    IconHistory,
    IconX,
} from "@tabler/icons-react";
import dayjs from "dayjs";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";

interface DailyEntry {
    date: string;
    day: number;
    sales: number;
    purchases: number;
    netIncome: number;
}

function SalesandPurchasesContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
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

    // Helper function to get initial month from URL parameters or default to current month
    const getInitialMonth = useCallback(() => {
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

    const [selectedDate, setSelectedDate] = useState<Date | null>(null);
    const [currentMonth, setCurrentMonth] = useState<Date>(getInitialMonth());
    const [dailyEntries, setDailyEntries] = useState<DailyEntry[]>([]);
    const [originalEntries, setOriginalEntries] = useState<DailyEntry[]>([]);
    const [editingEntry, setEditingEntry] = useState<DailyEntry | null>(null);
    const [entryToDelete, setEntryToDelete] = useState<DailyEntry | null>(null);
    const [modalOpened, setModalOpened] = useState(false);
    const [modalSales, setModalSales] = useState<number>(0);
    const [modalPurchases, setModalPurchases] = useState<number>(0);
    const [deleteModalOpened, setDeleteModalOpened] = useState(false);

    // Signature state management
    // Reason: Track prepared by (current user) and noted by (selected user) for report signatures
    const [preparedBy, setPreparedBy] = useState<string | null>(null);
    const [preparedByPosition, setPreparedByPosition] = useState<string | null>(null);
    const [notedBy, setNotedBy] = useState<string | null>(null);
    const [preparedBySignatureUrl, setPreparedBySignatureUrl] = useState<string | null>(null);
    const [notedBySignatureUrl, setNotedBySignatureUrl] = useState<string | null>(null);

    // User selection state for "noted by" field
    const [selectedNotedByUser, setSelectedNotedByUser] = useState<csclient.UserSimple | null>(null);
    const [approvalModalOpened, setApprovalModalOpened] = useState(false);
    const [approvalCheckbox, setApprovalCheckbox] = useState(false);

    // Report status state
    const [reportStatus, setReportStatus] = useState<string | null>(null);

    const [schoolData, setSchoolData] = useState<csclient.School | null>(null);
    const [logoUrl, setLogoUrl] = useState<string | null>(null);
    const [pdfModalOpened, setPdfModalOpened] = useState(false);

    // Helper function to check if the report is read-only
    const isReadOnly = useCallback(() => {
        return (
            reportStatus === "review" ||
            reportStatus === "approved" ||
            reportStatus === "received" ||
            reportStatus === "archived"
        );
    }, [reportStatus]);

    // Helper function to check if a date is a weekend (Saturday or Sunday)
    const isWeekend = useCallback((date: Date) => {
        const dayOfWeek = dayjs(date).day(); // 0 = Sunday, 6 = Saturday
        return dayOfWeek === 0 || dayOfWeek === 6;
    }, []);

    // Helper function to check if today is a weekend
    const isTodayWeekend = useCallback(() => {
        return isWeekend(new Date());
    }, [isWeekend]);

    // Update current month when URL parameters change
    useEffect(() => {
        const newMonth = getInitialMonth();
        setCurrentMonth((prev) => {
            if (newMonth.getTime() !== prev.getTime()) {
                return newMonth;
            }
            return prev;
        });
    }, [getInitialMonth]);

    // Fetch entries for the current month
    useEffect(() => {
        const fetchEntries = async () => {
            if (effectiveSchoolId) {
                try {
                    const res = await csclient.getSchoolDailyReportEntriesV1ReportsDailySchoolIdYearMonthEntriesGet({
                        path: {
                            school_id: effectiveSchoolId,
                            year: currentMonth.getFullYear(),
                            month: currentMonth.getMonth() + 1,
                        },
                    });
                    const entries = (res?.data || []) as csclient.DailyFinancialReportEntry[];
                    if (entries.length === 0) {
                        setDailyEntries([]);
                        setOriginalEntries([]);
                    } else {
                        const mapped = entries.map((entry) => ({
                            date: entry.parent,
                            day: entry.day,
                            sales: entry.sales,
                            purchases: entry.purchases,
                            netIncome: entry.sales - entry.purchases,
                        }));
                        setDailyEntries(mapped);
                        setOriginalEntries(mapped); // Track original entries for diffing
                    }
                } catch {
                    setDailyEntries([]);
                    setOriginalEntries([]);
                }
            } else {
                setDailyEntries([]);
                setOriginalEntries([]);
            }
        };
        fetchEntries();
    }, [currentMonth, effectiveSchoolId]);

    // Load daily report data after school users are loaded
    useEffect(() => {
        const loadDailyReportData = async () => {
            if (!effectiveSchoolId) return;

            try {
                const reportRes = await csclient.getSchoolDailyReportV1ReportsDailySchoolIdYearMonthGet({
                    path: {
                        school_id: effectiveSchoolId,
                        year: currentMonth.getFullYear(),
                        month: currentMonth.getMonth() + 1,
                    },
                });

                if (reportRes?.data) {
                    const report = reportRes.data as csclient.DailyFinancialReport;

                    console.log("Loaded report:", report);
                    console.log("Report notedBy:", report.notedBy);

                    // Set the report status
                    setReportStatus(report.reportStatus || null);

                    // Set the prepared by from the report (load the actual user who prepared it)
                    if (report.preparedBy) {
                        console.log("Loading preparedBy user for ID:", report.preparedBy);
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
                    } // Set the noted by from the report (for any user)
                    if (report.notedBy) {
                        console.log("Loading notedBy user for ID:", report.notedBy);
                        try {
                            // Get the user details for the notedBy user using simple endpoint
                            const userResponse = await csclient.getUsersSimpleEndpointV1UsersSimpleGet();

                            console.log("User response:", userResponse.data);

                            if (userResponse.data) {
                                // Find the user with the matching ID
                                const notedByUser = userResponse.data.find((user) => user.id === report.notedBy);

                                if (notedByUser) {
                                    const userName = `${notedByUser.nameFirst} ${notedByUser.nameLast}`.trim();
                                    console.log("Setting notedBy to:", userName);
                                    setNotedBy(userName);
                                    setSelectedNotedByUser(notedByUser);

                                    // Load user's signature for notedBy (always load if available)
                                    if (notedByUser.signatureUrn) {
                                        try {
                                            const response = await csclient.getUserSignatureEndpointV1UsersSignatureGet(
                                                {
                                                    query: { fn: notedByUser.signatureUrn },
                                                }
                                            );
                                            if (response.data) {
                                                const signatureUrl = URL.createObjectURL(response.data as Blob);
                                                setNotedBySignatureUrl(signatureUrl);
                                            }
                                        } catch (error) {
                                            customLogger.error("Failed to load noted by user signature:", error);
                                        }
                                    }
                                }
                            }
                        } catch (error) {
                            customLogger.error("Failed to load noted by user details:", error);
                        }
                    }
                }
            } catch {
                // If report doesn't exist yet, that's fine - we'll create it later
                customLogger.debug("Daily report not found, will create new one");
            }
        };

        loadDailyReportData();
    }, [
        currentMonth,
        effectiveSchoolId,
        userCtx.userInfo?.id,
        userCtx.userInfo?.nameFirst,
        userCtx.userInfo?.nameLast,
        userCtx.userInfo?.signatureUrn,
        userCtx.userInfo?.position,
    ]);

    // Initialize signature data and load school users
    useEffect(() => {
        const initializeSignatures = async () => {
            if (!userCtx.userInfo) return;
        };

        initializeSignatures();
    }, [userCtx.userInfo]);

    // Initialize prepared by for new reports only
    useEffect(() => {
        const initializePreparedBy = async () => {
            if (!userCtx.userInfo) return;

            // Only set prepared by to current user if it hasn't been set yet (i.e., for new reports)
            // This should only run if there's no existing report with preparedBy data
            if (!preparedBy && !preparedBySignatureUrl && reportStatus === null) {
                const currentUserName = `${userCtx.userInfo.nameFirst} ${userCtx.userInfo.nameLast}`.trim();
                setPreparedBy(currentUserName);
                setPreparedByPosition(userCtx.userInfo.position || null);

                // Load current user's signature for preparedBy only if preparedBy is not set yet
                if (userCtx.userInfo.signatureUrn) {
                    try {
                        const response = await csclient.getUserSignatureEndpointV1UsersSignatureGet({
                            query: { fn: userCtx.userInfo.signatureUrn },
                        });

                        // Response data is already a blob, create object URL for display
                        if (response.data) {
                            const signatureUrl = URL.createObjectURL(response.data as Blob);
                            setPreparedBySignatureUrl(signatureUrl);
                        }
                    } catch (error) {
                        customLogger.error("Failed to load user signature:", error);
                    }
                }
            }
        };

        initializePreparedBy();
    }, [userCtx.userInfo, preparedBy, preparedBySignatureUrl, reportStatus]);

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

                    // Auto-assign the principal as the notedBy user if not already set
                    if (!notedBy && !selectedNotedByUser && schoolResponse.data.assignedNotedBy) {
                        console.log("Auto-assigning principal as notedBy:", schoolResponse.data.assignedNotedBy);
                        try {
                            const usersResponse = await csclient.getUsersSimpleEndpointV1UsersSimpleGet();

                            if (usersResponse.data) {
                                // Find the principal user by ID
                                const principalUser = usersResponse.data.find(
                                    (user) => user.id === schoolResponse.data.assignedNotedBy
                                );

                                if (principalUser) {
                                    const principalName = `${principalUser.nameFirst} ${principalUser.nameLast}`.trim();
                                    console.log("Setting principal as notedBy:", principalName);
                                    setNotedBy(principalName);
                                    setSelectedNotedByUser(principalUser);

                                    // Load principal's signature
                                    if (principalUser.signatureUrn) {
                                        try {
                                            const signatureResponse =
                                                await csclient.getUserSignatureEndpointV1UsersSignatureGet({
                                                    query: { fn: principalUser.signatureUrn },
                                                });
                                            if (signatureResponse.data) {
                                                const signatureUrl = URL.createObjectURL(
                                                    signatureResponse.data as Blob
                                                );
                                                setNotedBySignatureUrl(signatureUrl);
                                            }
                                        } catch (signatureError) {
                                            console.error("Failed to load principal signature:", signatureError);
                                        }
                                    }
                                }
                            }
                        } catch (principalError) {
                            console.error("Failed to load principal user details:", principalError);
                        }
                    }

                    // Load school logo if available
                    if (schoolResponse.data.logoUrn) {
                        try {
                            const logoResponse = await csclient.getSchoolLogoEndpointV1SchoolsLogoGet({
                                query: {
                                    fn: schoolResponse.data.logoUrn,
                                },
                            });
                            if (logoResponse.data) {
                                const logoUrl = URL.createObjectURL(logoResponse.data as Blob);
                                setLogoUrl(logoUrl);
                            }
                        } catch (logoError) {
                            console.error("Failed to load school logo:", logoError);
                        }
                    }
                }
            } catch (error) {
                console.error("Failed to load school data:", error);
            }
        };

        loadSchoolData();
    }, [effectiveSchoolId, notedBy, selectedNotedByUser]);

    const handleClose = () => {
        router.back();
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

    const handleDateSelect = useCallback(
        (date: Date | null) => {
            if (!date) return;

            // Prevent creating entries for weekends (Saturday and Sunday)
            if (isWeekend(date)) {
                notifications.show({
                    title: "Weekend Not Allowed",
                    message:
                        "Daily sales and purchases reports can only be created for weekdays (Monday to Friday). The canteen is closed on weekends.",
                    color: "orange",
                });
                return;
            }

            setSelectedDate(date);
            const dateObj = dayjs(date);
            if (!dateObj.isSame(currentMonth, "month")) {
                setCurrentMonth(date);
            }
            setSelectedDate(date);
            const selectedDay = dateObj.date();
            const selectedMonth = dateObj.format("YYYY-MM");
            const existingEntry = dailyEntries.find((e) => {
                return e.day === selectedDay && e.date.startsWith(selectedMonth);
            });
            if (existingEntry) {
                setEditingEntry(existingEntry);
                setModalSales(existingEntry.sales);
                setModalPurchases(existingEntry.purchases);
            } else {
                const dateStr = dateObj.format("YYYY-MM-DD");
                const newEntry: DailyEntry = {
                    date: dateStr,
                    day: selectedDay,
                    sales: 0,
                    purchases: 0,
                    netIncome: 0,
                };
                setEditingEntry(newEntry);
                setModalSales(0);
                setModalPurchases(0);
            }
            setModalOpened(true);
        },
        [currentMonth, dailyEntries, isWeekend]
    );

    const handleSaveEntry = async () => {
        if (!editingEntry) return;
        if (!effectiveSchoolId) {
            notifications.show({
                title: "Error",
                message: "You are not yet assigned to a school.",
                color: "red",
            });
            return;
        }
        const existingIndex = dailyEntries.findIndex((entry) => entry.date === editingEntry.date);
        try {
            if (existingIndex >= 0) {
                // Update existing entry in backend
                await csclient.updateDailySalesAndPurchasesEntryV1ReportsDailySchoolIdYearMonthEntriesDayPut({
                    path: {
                        school_id: effectiveSchoolId,
                        year: dayjs(editingEntry.date).year(),
                        month: dayjs(editingEntry.date).month() + 1,
                        day: editingEntry.day,
                    },
                    query: {
                        sales: modalSales,
                        purchases: modalPurchases,
                    },
                });
            } else {
                // Create new entry in backend
                await csclient.createBulkDailySalesAndPurchasesEntriesV1ReportsDailySchoolIdYearMonthEntriesBulkPost({
                    path: {
                        school_id: effectiveSchoolId,
                        year: dayjs(editingEntry.date).year(),
                        month: dayjs(editingEntry.date).month() + 1,
                    },
                    body: [
                        {
                            day: editingEntry.day,
                            sales: modalSales,
                            purchases: modalPurchases,
                            schoolId: effectiveSchoolId || 0,
                        },
                    ],
                });
            }
            // Re-fetch entries after save
            const res = await csclient.getSchoolDailyReportEntriesV1ReportsDailySchoolIdYearMonthEntriesGet({
                path: {
                    school_id: effectiveSchoolId,
                    year: dayjs(editingEntry.date).year(),
                    month: dayjs(editingEntry.date).month() + 1,
                },
            });
            const entries = (res?.data || []) as csclient.DailyFinancialReportEntry[];
            const mapped = entries.map((entry) => ({
                date: entry.parent,
                day: entry.day,
                sales: entry.sales,
                purchases: entry.purchases,
                netIncome: entry.sales - entry.purchases,
            }));
            setDailyEntries(mapped);
            setOriginalEntries(mapped);
            // notifications.show({
            //     title: "Success",
            //     message: "Entry saved successfully.",
            //     color: "green",
            // });
        } catch (err: unknown) {
            if (err instanceof Error && err.message.includes("404 Not Found")) {
                return;
            }
            notifications.show({
                title: "Error",
                message: err instanceof Error ? err.message : "Failed to save entry.",
                color: "red",
            });
        }
        setModalOpened(false);
        setEditingEntry(null);
    };

    const handleDeleteEntry = async (entry: DailyEntry) => {
        if (!effectiveSchoolId) {
            notifications.show({
                title: "Error",
                message: "You are not yet assigned to a school.",
                color: "red",
            });
            return;
        }
        try {
            await csclient.deleteDailySalesAndPurchasesEntryV1ReportsDailySchoolIdYearMonthEntriesDayDelete({
                path: {
                    school_id: effectiveSchoolId,
                    year: dayjs(entry.date).year(),
                    month: dayjs(entry.date).month() + 1,
                    day: entry.day,
                },
            });
            // Re-fetch entries after delete
            const res = await csclient.getSchoolDailyReportEntriesV1ReportsDailySchoolIdYearMonthEntriesGet({
                path: {
                    school_id: effectiveSchoolId,
                    year: dayjs(entry.date).year(),
                    month: dayjs(entry.date).month() + 1,
                },
            });
            const entries = (res?.data || []) as csclient.DailyFinancialReportEntry[];
            const mapped = entries.map((entry) => ({
                date: entry.parent,
                day: entry.day,
                sales: entry.sales,
                purchases: entry.purchases,
                netIncome: entry.sales - entry.purchases,
            }));
            setDailyEntries(mapped);
            setOriginalEntries(mapped);
            notifications.show({
                title: "Deleted",
                message: "Entry deleted successfully.",
                color: "green",
            });
        } catch (err: unknown) {
            if (err instanceof Error && err.message.includes("404")) {
                return;
            }
            customLogger.error(err instanceof Error ? err.message : String(err));
            notifications.show({
                title: "Error",
                message: "Failed to delete entry.",
                color: "red",
            });
        }
        setDeleteModalOpened(false);
        setEntryToDelete(null);
    };

    const confirmDeleteEntry = () => {
        if (entryToDelete) {
            handleDeleteEntry(entryToDelete);
        }
    };

    const calculateTotals = () => {
        return dailyEntries.reduce(
            (acc, entry) => ({
                sales: acc.sales + entry.sales,
                purchases: acc.purchases + entry.purchases,
                netIncome: acc.netIncome + entry.netIncome,
            }),
            { sales: 0, purchases: 0, netIncome: 0 }
        );
    };
    const totals = calculateTotals();

    // Bulk submit all entries for the month
    const handleSave = async () => {
        if (!userCtx.userInfo) {
            notifications.show({
                title: "Error",
                message: "You must be logged in to submit entries.",
                color: "red",
            });
            return;
        }
        if (!userCtx.userInfo.schoolId) {
            notifications.show({
                title: "Error",
                message: "You are not yet assigned to a school.",
                color: "red",
            });
            return;
        }
        try {
            // Find new entries (not in originalEntries)
            const originalDays = new Set(originalEntries.map((e) => e.day));
            const newEntries = dailyEntries.filter((e) => !originalDays.has(e.day));
            // Find updated entries (in both, but values changed)
            const updatedEntries = dailyEntries.filter((e) => {
                const orig = originalEntries.find((o) => o.day === e.day);
                return orig && (orig.sales !== e.sales || orig.purchases !== e.purchases);
            });
            // Find deleted entries (in originalEntries but not in dailyEntries)
            const deletedEntries = originalEntries.filter((e) => !dailyEntries.some((d) => d.day === e.day));

            // Bulk create new entries
            if (newEntries.length > 0) {
                await csclient.createBulkDailySalesAndPurchasesEntriesV1ReportsDailySchoolIdYearMonthEntriesBulkPost({
                    path: {
                        school_id: userCtx.userInfo.schoolId,
                        year: currentMonth.getFullYear(),
                        month: currentMonth.getMonth() + 1,
                    },
                    body: newEntries.map((entry) => ({
                        day: entry.day,
                        sales: entry.sales,
                        purchases: entry.purchases,
                        schoolId: effectiveSchoolId || 0,
                    })),
                });
            }

            // Update changed entries
            for (const entry of updatedEntries) {
                await csclient.updateDailySalesAndPurchasesEntryV1ReportsDailySchoolIdYearMonthEntriesDayPut({
                    path: {
                        school_id: userCtx.userInfo.schoolId,
                        year: currentMonth.getFullYear(),
                        month: currentMonth.getMonth() + 1,
                        day: entry.day,
                    },
                    query: {
                        sales: entry.sales,
                        purchases: entry.purchases,
                    },
                });
            }

            // Delete removed entries
            for (const entry of deletedEntries) {
                await csclient.deleteDailySalesAndPurchasesEntryV1ReportsDailySchoolIdYearMonthEntriesDayDelete({
                    path: {
                        school_id: userCtx.userInfo.schoolId,
                        year: currentMonth.getFullYear(),
                        month: currentMonth.getMonth() + 1,
                        day: entry.day,
                    },
                });
            }

            // Create or update the daily financial report with proper preparedBy and notedBy
            // preparedBy should be the current logged-in user ID
            // notedBy should be the selected user ID (if any)
            const currentUserName = `${userCtx.userInfo.nameFirst} ${userCtx.userInfo.nameLast}`.trim();
            await csclient.createSchoolDailyReportV1ReportsDailySchoolIdYearMonthPatch({
                path: {
                    school_id: userCtx.userInfo.schoolId,
                    year: currentMonth.getFullYear(),
                    month: currentMonth.getMonth() + 1,
                },
                query: {
                    noted_by: selectedNotedByUser?.id || null,
                },
            });

            notifications.show({
                title: "Saved",
                message: "Your entries have been saved successfully.",
                color: "green",
            });

            // Refresh data after submit
            const res = await csclient.getSchoolDailyReportEntriesV1ReportsDailySchoolIdYearMonthEntriesGet({
                path: {
                    school_id: userCtx.userInfo.schoolId,
                    year: currentMonth.getFullYear(),
                    month: currentMonth.getMonth() + 1,
                },
            });
            const entries = (res?.data || []) as csclient.DailyFinancialReportEntry[];
            const mapped = entries.map((entry) => ({
                date: entry.parent,
                day: entry.day,
                sales: entry.sales,
                purchases: entry.purchases,
                netIncome: entry.sales - entry.purchases,
            }));
            setDailyEntries(mapped);
            setOriginalEntries(mapped);

            // Update the preparedBy to current user since this is a new submission
            setPreparedBy(currentUserName);
            setPreparedByPosition(userCtx.userInfo.position || null);

            // Update the preparedBy signature to current user's signature
            if (userCtx.userInfo.signatureUrn) {
                try {
                    const response = await csclient.getUserSignatureEndpointV1UsersSignatureGet({
                        query: { fn: userCtx.userInfo.signatureUrn },
                    });
                    if (response.data) {
                        const signatureUrl = URL.createObjectURL(response.data as Blob);
                        setPreparedBySignatureUrl(signatureUrl);
                    }
                } catch (error) {
                    customLogger.error("Failed to load current user signature for preparedBy:", error);
                }
            }

            router.push("/reports");
        } catch (err: unknown) {
            if (err instanceof Error && err.message.includes("404 Not Found")) {
                return;
            }
            customLogger.error(err instanceof Error ? err.message : String(err));
            notifications.show({
                title: "Error",
                message: "Failed to save entries.",
                color: "red",
            });
        }
    };

    const getFileName = () => {
        const monthYear = dayjs(currentMonth).format("MMMM-YYYY");
        const schoolName = schoolData?.name || "School";
        return `Financial-Report-${schoolName}-${monthYear}.pdf`;
    };

    const exportToPDF = async () => {
        const element = document.getElementById("financial-report-content");
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

            const monthYear = dayjs(currentMonth).format("MMMM-YYYY");
            const schoolName = schoolData?.name || "School";
            pdf.save(`Financial-Report-${schoolName}-${monthYear}.pdf`);

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
        return (
            <div
                id="financial-report-content"
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
                        Financial Report for the Month of {dayjs(currentMonth).format("MMMM, YYYY").toUpperCase()}
                    </div>
                </div>

                {/* Table */}
                <table
                    style={{
                        width: "100%",
                        borderCollapse: "collapse",
                        margin: "20px 0",
                        fontSize: "12px",
                    }}
                >
                    <thead>
                        <tr style={{ backgroundColor: "#f5f5f5" }}>
                            <th style={{ border: "1px solid #000", padding: "8px", textAlign: "center" }}>Date</th>
                            <th style={{ border: "1px solid #000", padding: "8px", textAlign: "center" }}>Sales</th>
                            <th style={{ border: "1px solid #000", padding: "8px", textAlign: "center" }}>Purchases</th>
                            <th style={{ border: "1px solid #000", padding: "8px", textAlign: "center" }}>
                                Net Income
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {dailyEntries
                            .slice()
                            .sort((a, b) => a.day - b.day)
                            .map((entry) => (
                                <tr key={`${entry.date}-${entry.day}`}>
                                    <td style={{ border: "1px solid #000", padding: "8px", textAlign: "center" }}>
                                        {dayjs(entry.date).date(entry.day).format("DD-MMM-YY")}
                                    </td>
                                    <td style={{ border: "1px solid #000", padding: "8px", textAlign: "right" }}>
                                        {entry.sales.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </td>
                                    <td style={{ border: "1px solid #000", padding: "8px", textAlign: "right" }}>
                                        {entry.purchases.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </td>
                                    <td style={{ border: "1px solid #000", padding: "8px", textAlign: "right" }}>
                                        {entry.netIncome.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </td>
                                </tr>
                            ))}
                        <tr style={{ backgroundColor: "#f5f5f5", fontWeight: "bold" }}>
                            <td style={{ border: "1px solid #000", padding: "8px", textAlign: "center" }}>TOTAL</td>
                            <td style={{ border: "1px solid #000", padding: "8px", textAlign: "right" }}>
                                {totals.sales.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </td>
                            <td style={{ border: "1px solid #000", padding: "8px", textAlign: "right" }}>
                                {totals.purchases.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </td>
                            <td style={{ border: "1px solid #000", padding: "8px", textAlign: "right" }}>
                                {totals.netIncome.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </td>
                        </tr>
                    </tbody>
                </table>

                {/* Summary box */}
                <div
                    style={{
                        marginTop: "20px",
                        border: "1px solid #000",
                        padding: "10px",
                        width: "200px",
                    }}
                >
                    <table style={{ width: "100%", fontSize: "12px" }}>
                        <tbody>
                            <tr>
                                <td style={{ border: "1px solid #000", padding: "5px", fontWeight: "bold" }}>Sales</td>
                                <td style={{ border: "1px solid #000", padding: "5px", textAlign: "right" }}>
                                    {totals.sales.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </td>
                            </tr>
                            <tr>
                                <td style={{ border: "1px solid #000", padding: "5px", fontWeight: "bold" }}>
                                    Purchase
                                </td>
                                <td style={{ border: "1px solid #000", padding: "5px", textAlign: "right" }}>
                                    {totals.purchases.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </td>
                            </tr>
                            <tr>
                                <td style={{ border: "1px solid #000", padding: "5px", fontWeight: "bold" }}>
                                    Gross Income
                                </td>
                                <td style={{ border: "1px solid #000", padding: "5px", textAlign: "right" }}>
                                    {totals.netIncome.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>

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
                        <div style={{ fontSize: "12px", fontWeight: "bold" }}>{notedBy || "NAME"}</div>
                        <div style={{ fontSize: "10px" }}>{selectedNotedByUser?.position || "Position"}</div>
                    </div>
                </div>
            </div>
        );
    };

    const tableRows = useMemo(
        () =>
            dailyEntries
                .slice()
                .sort((a, b) => {
                    // Sort by YYYY-MM (from date) then by day - DESCENDING for table display (latest first)
                    const aMonth = dayjs(a.date).format("YYYY-MM");
                    const bMonth = dayjs(b.date).format("YYYY-MM");
                    if (aMonth !== bMonth) {
                        return bMonth.localeCompare(aMonth); // Reversed for descending
                    }
                    return b.day - a.day; // Reversed for descending
                })
                .map((entry) => (
                    <Table.Tr key={`${entry.date}-${entry.day}`}>
                        <Table.Td className="text-center">
                            <Group justify="left" gap="xs">
                                {(() => {
                                    const dateObj = dayjs(entry.date).date(entry.day);
                                    return (
                                        <>
                                            <Text size="sm">{dateObj.format("MMM DD, YYYY")}</Text>
                                            {dateObj.isSame(dayjs(), "day") && (
                                                <Badge color="blue" size="xs">
                                                    Today
                                                </Badge>
                                            )}
                                        </>
                                    );
                                })()}
                            </Group>
                        </Table.Td>
                        <Table.Td className="text-center">
                            <Text>₱{entry.sales.toLocaleString(undefined, { minimumFractionDigits: 2 })}</Text>
                        </Table.Td>
                        <Table.Td className="text-center">
                            <Text>₱{entry.purchases.toLocaleString(undefined, { minimumFractionDigits: 2 })}</Text>
                        </Table.Td>
                        <Table.Td className="text-center">
                            <Text>₱{entry.netIncome.toLocaleString(undefined, { minimumFractionDigits: 2 })}</Text>
                        </Table.Td>
                        <Table.Td className="text-center">
                            <Group gap="xs">
                                {!isReadOnly() && (
                                    <>
                                        <Button
                                            size="xs"
                                            variant="light"
                                            onClick={() => {
                                                const entryDate = dayjs(entry.date).date(entry.day).toDate();
                                                setCurrentMonth(entryDate);
                                                setSelectedDate(entryDate);
                                                setEditingEntry(entry);
                                                setModalSales(entry.sales);
                                                setModalPurchases(entry.purchases);
                                                setModalOpened(true);
                                            }}
                                            disabled={isReadOnly()}
                                        >
                                            Edit
                                        </Button>
                                        <Button
                                            size="xs"
                                            color="red"
                                            variant="light"
                                            onClick={() => {
                                                setEntryToDelete(entry);
                                                setDeleteModalOpened(true);
                                            }}
                                        >
                                            Delete
                                        </Button>
                                    </>
                                )}
                            </Group>
                        </Table.Td>
                    </Table.Tr>
                )),
        [dailyEntries, isReadOnly]
    );

    return (
        <Container size="xl" py={{ base: "sm", md: "md" }}>
            <Stack gap="lg">
                {/* Header */}
                <Flex justify="space-between" align="center" wrap="wrap" gap="md">
                    <Group gap="md">
                        <div className="p-2 bg-blue-100 rounded-lg">
                            <IconHistory size={28} />
                        </div>
                        <div>
                            <Title order={2} className="text-gray-800">
                                Financial Report for the Month of {dayjs(currentMonth).format("MMMM YYYY")}
                            </Title>
                            {isReadOnly() ? (
                                <Text size="sm" color="orange" fw={500}>
                                    Read-only mode - Report is {reportStatus === "review" ? "under review" : "approved"}
                                </Text>
                            ) : (
                                <Text size="sm" c="dimmed">
                                    Record daily sales and purchases
                                </Text>
                            )}
                        </div>
                    </Group>
                    <ActionIcon
                        variant="subtle"
                        color="gray"
                        size="lg"
                        onClick={handleClose}
                        className="hover:bg-gray-100"
                    >
                        <IconX size={20} />
                    </ActionIcon>
                </Flex>

                {!effectiveSchoolId && (
                    <Alert
                        variant="light"
                        color="yellow"
                        withCloseButton
                        title="Warning"
                        icon={<IconAlertCircle size={16} />}
                    >
                        You are not yet assigned to a school! Reports you create will fail to submit.
                    </Alert>
                )}

                {/* Date Selection */}
                <Card withBorder>
                    <Group justify="space-between" align="center" className="flex-col sm:flex-row gap-4">
                        <Text fw={500}>{isReadOnly() ? "View Report Data" : "Select Date to Record"}</Text>
                        <Group gap="md">
                            <MonthPickerInput
                                placeholder="Select month"
                                value={currentMonth}
                                onChange={async (value) => {
                                    if (value) {
                                        const newMonth = new Date(value);
                                        setCurrentMonth(newMonth);
                                        setSelectedDate(null);

                                        // Clear report-specific state when changing months
                                        setReportStatus(null);
                                        setPreparedBy(null);
                                        setPreparedByPosition(null);
                                        setNotedBy(null);
                                        setPreparedBySignatureUrl(null);
                                        setNotedBySignatureUrl(null);
                                        setSelectedNotedByUser(null);
                                    }
                                }}
                                leftSection={<IconCalendar size={16} />}
                                className="w-64"
                                maxDate={new Date()}
                            />
                            <DatePickerInput
                                placeholder="Select date"
                                value={selectedDate}
                                onChange={(value) => {
                                    if (!isReadOnly()) {
                                        if (value) {
                                            const date = new Date(value);
                                            if (!isNaN(date.getTime())) {
                                                handleDateSelect(date);
                                            }
                                        } else {
                                            handleDateSelect(null);
                                        }
                                    }
                                }}
                                leftSection={<IconCalendar size={16} />}
                                className="w-64"
                                minDate={dayjs(currentMonth).startOf("month").toDate()}
                                maxDate={
                                    dayjs(currentMonth).isSame(dayjs(), "month")
                                        ? new Date() // Limit to today if current month is this month
                                        : dayjs(currentMonth).endOf("month").toDate() // Otherwise allow full month
                                }
                                disabled={isReadOnly()}
                                getDayProps={(date) => {
                                    // e.date is always the first of the month (YYYY-MM-01), but e.day is the actual day
                                    // So reconstruct the real date string for comparison
                                    const dateStr = dayjs(date).format("YYYY-MM-DD");
                                    const dayOfWeek = dayjs(date).day(); // 0 = Sunday, 6 = Saturday

                                    // Check if the date is within the current month
                                    const isCurrentMonth = dayjs(date).isSame(currentMonth, "month");

                                    // Disable weekends (Saturday and Sunday)
                                    const isWeekendDay = dayOfWeek === 0 || dayOfWeek === 6;

                                    // Disable future dates (after today)
                                    const isFutureDate = dayjs(date).isAfter(dayjs(), "day");

                                    // Disable if not in current month, is weekend, or is future date
                                    const shouldDisable = !isCurrentMonth || isWeekendDay || isFutureDate;

                                    const hasEntry = dailyEntries.some((e) => {
                                        // Compose the real date from e.date (month) and e.day
                                        const entryDate = dayjs(e.date).date(e.day).format("YYYY-MM-DD");
                                        return entryDate === dateStr;
                                    });

                                    return {
                                        disabled: shouldDisable,
                                        style: {
                                            backgroundColor: hasEntry ? "#d1fadf" : undefined, // light green for entries
                                            color: shouldDisable ? "#adb5bd" : undefined, // gray out disabled days
                                        },
                                    };
                                }}
                            />
                            <ActionIcon
                                variant="outline"
                                color="blue"
                                size="lg"
                                onClick={() => {
                                    const today = new Date();
                                    const isTodayInCurrentMonth = dayjs(today).isSame(currentMonth, "month");
                                    if (!isReadOnly() && !isTodayWeekend() && isTodayInCurrentMonth) {
                                        handleDateSelect(today);
                                    }
                                }}
                                title={
                                    isTodayWeekend()
                                        ? "Cannot select today - weekends not allowed"
                                        : !dayjs().isSame(currentMonth, "month")
                                        ? "Cannot select today - not in current month"
                                        : "Select today"
                                }
                                disabled={isReadOnly() || isTodayWeekend() || !dayjs().isSame(currentMonth, "month")}
                            >
                                <IconCalendar size={16} />
                            </ActionIcon>
                        </Group>
                    </Group>
                </Card>

                {/* Entries Table */}
                <Card withBorder>
                    {dailyEntries.length === 0 ? (
                        <div className="text-center py-8">
                            <Text size="lg" c="dimmed" mb="md">
                                No entries recorded yet
                            </Text>
                            <Text size="sm" c="dimmed">
                                {isReadOnly()
                                    ? "No financial data available for this month"
                                    : "Select a date above to add your first daily sales and purchases entry"}
                            </Text>
                        </div>
                    ) : (
                        <Table striped highlightOnHover>
                            <Table.Thead>
                                <Table.Tr>
                                    <Table.Th className="text-center">Date</Table.Th>
                                    <Table.Th className="text-center">Sales</Table.Th>
                                    <Table.Th className="text-center">Purchases</Table.Th>
                                    <Table.Th className="text-center">Net Income</Table.Th>
                                    <Table.Th className="text-center"></Table.Th>
                                </Table.Tr>
                            </Table.Thead>
                            <Table.Tbody>{tableRows}</Table.Tbody>
                        </Table>
                    )}
                </Card>

                {/* Summary Cards */}
                <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
                    {/*Total Sales */}
                    <Card withBorder>
                        <Group justify="space-between" align="flex-start">
                            <div>
                                <Text size="sm" c="dimmed" fw={500}>
                                    Total Sales
                                </Text>
                                <Text size="xl" fw={700} c="blue">
                                    ₱{totals.sales.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </Text>
                            </div>
                        </Group>
                    </Card>

                    {/*Total Purchases */}
                    <Card withBorder>
                        <Group justify="space-between" align="flex-start">
                            <div>
                                <Text size="sm" c="dimmed" fw={500}>
                                    Total Purchases
                                </Text>
                                <Text size="xl" fw={700} c="orange">
                                    ₱{totals.purchases.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </Text>
                            </div>
                        </Group>
                    </Card>

                    {/*Gross Income */}
                    <Card withBorder>
                        <Group justify="space-between" align="flex-start">
                            <div>
                                <Text size="sm" c="dimmed" fw={500}>
                                    Gross Income
                                </Text>
                                <Text size="xl" fw={700} c="green">
                                    ₱{totals.netIncome.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </Text>
                            </div>
                        </Group>
                    </Card>
                </SimpleGrid>

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

                    {/* Noted by */}
                    <Card withBorder p="md">
                        <Stack gap="sm" align="center">
                            <Group justify="space-between" w="100%">
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
                                        : "Not Selected"}
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
                                    <Stack align="center" gap="xs">
                                        <Text size="xs" c="dimmed">
                                            {selectedNotedByUser ? "Awaiting Approval" : "Signature"}
                                        </Text>
                                    </Stack>
                                )}
                            </Box>
                            <div style={{ textAlign: "center" }}>
                                <Text fw={600} size="sm">
                                    {notedBy || "NAME"}
                                </Text>
                                <Text size="xs" c="dimmed">
                                    {selectedNotedByUser?.position || "Position"}
                                </Text>
                            </div>
                        </Stack>
                    </Card>
                </SimpleGrid>

                {/* Action Buttons */}
                <Group justify="flex-end" gap="md">
                    <Button variant="outline" onClick={handleClose} className="hover:bg-gray-100 hide-in-pdf">
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
                    <Tooltip
                        label={
                            isReadOnly()
                                ? "Submission is disabled in read-only mode"
                                : dailyEntries.length === 0
                                ? "Add sales and purchase entries"
                                : "Submit for review"
                        }
                        disabled={!isReadOnly() && dailyEntries.length > 0}
                    >
                        <div>
                            <SubmitForReviewButton
                                reportType="daily"
                                reportPeriod={{
                                    schoolId: effectiveSchoolId || 0,
                                    year: currentMonth.getFullYear(),
                                    month: currentMonth.getMonth() + 1,
                                }}
                                disabled={isReadOnly() || dailyEntries.length === 0}
                                onSuccess={() => {
                                    // Redirect to reports page after successful submission
                                    notifications.show({
                                        title: "Status Updated",
                                        message: "Report has been submitted for review.",
                                        color: "green",
                                    });
                                    router.push("/reports");
                                }}
                            />
                        </div>
                    </Tooltip>
                    <Tooltip
                        label={
                            isReadOnly()
                                ? "Edits are disabled in read-only mode"
                                : dailyEntries.length === 0
                                ? "Add sales and purchase entries"
                                : "Save report"
                        }
                        disabled={!isReadOnly() && dailyEntries.length > 0}
                    >
                        <Button
                            disabled={isReadOnly() || dailyEntries.length === 0}
                            onClick={handleSave}
                            className="hide-in-pdf"
                            leftSection={<IconDeviceFloppy size={16} />}
                        >
                            Save
                        </Button>
                    </Tooltip>
                </Group>

                {/* Approval Confirmation Modal */}
                <Modal
                    opened={approvalModalOpened}
                    onClose={() => setApprovalModalOpened(false)}
                    title="Confirm Report Approval"
                    centered
                    size="md"
                >
                    <Stack gap="md">
                        <Alert
                            variant="light"
                            color="blue"
                            title="Important Notice"
                            icon={<IconAlertCircle size={16} />}
                        >
                            You are about to approve this financial report as{" "}
                            <strong>
                                {selectedNotedByUser?.nameFirst} {selectedNotedByUser?.nameLast}
                            </strong>
                            . This action will apply your digital signature to the document.
                        </Alert>

                        <Text size="sm">By approving this report, you confirm that:</Text>

                        <Stack gap="xs" pl="md">
                            <Text size="sm">• You have reviewed all entries and data</Text>
                            <Text size="sm">• The information is accurate and complete</Text>
                            <Text size="sm">• You authorize the use of the digital signature</Text>
                        </Stack>

                        <Checkbox
                            label="I confirm that I have the authority to approve this report and apply the digital signature"
                            checked={approvalCheckbox}
                            onChange={(event) => setApprovalCheckbox(event.currentTarget.checked)}
                        />

                        <Group justify="flex-end" gap="sm">
                            <Button variant="outline" onClick={() => setApprovalModalOpened(false)}>
                                Cancel
                            </Button>
                            <Button onClick={handleApprovalConfirm} disabled={!approvalCheckbox} color="green">
                                Approve & Sign
                            </Button>
                        </Group>
                    </Stack>
                </Modal>

                {/* Edit Modal */}
                <Modal
                    opened={modalOpened}
                    onClose={() => setModalOpened(false)}
                    title={
                        editingEntry
                            ? `${isReadOnly() ? "View" : "Edit"} Entry for ${dayjs(editingEntry.date)
                                  .date(editingEntry.day)
                                  .format("MMMM DD, YYYY")}`
                            : `${isReadOnly() ? "View" : "Edit"} Entry`
                    }
                    centered
                    size="md"
                    padding="xl"
                >
                    <Stack gap="lg">
                        <Stack gap="md">
                            <NumberInput
                                label="Sales"
                                placeholder="Enter sales amount"
                                value={modalSales === 0 ? "" : modalSales}
                                onChange={(value) => setModalSales(Number(value) || 0)}
                                onFocus={(event) => event.target.select()}
                                min={0}
                                decimalScale={2}
                                fixedDecimalScale
                                thousandSeparator=","
                                prefix="₱"
                                size="md"
                                readOnly={isReadOnly()}
                                disabled={isReadOnly()}
                            />
                            <NumberInput
                                label="Purchases"
                                placeholder="Enter purchases amount"
                                value={modalPurchases === 0 ? "" : modalPurchases}
                                onChange={(value) => setModalPurchases(Number(value) || 0)}
                                onFocus={(event) => event.target.select()}
                                min={0}
                                decimalScale={2}
                                fixedDecimalScale
                                thousandSeparator=","
                                prefix="₱"
                                size="md"
                                readOnly={isReadOnly()}
                                disabled={isReadOnly()}
                            />
                        </Stack>
                        <Text size="sm" c="dimmed">
                            Net Income: ₱
                            {(modalSales - modalPurchases).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </Text>
                        <Group justify="end" gap="sm" mt="md">
                            <Button variant="subtle" onClick={() => setModalOpened(false)} color="gray" size="md">
                                {isReadOnly() ? "Close" : "Cancel"}
                            </Button>
                            {!isReadOnly() && <Button onClick={handleSaveEntry}>Save Entry</Button>}
                        </Group>
                    </Stack>
                </Modal>

                {/* Delete Confirmation Modal */}
                <Modal
                    opened={deleteModalOpened}
                    onClose={() => setDeleteModalOpened(false)}
                    title="Confirm Deletion"
                    centered
                    size="sm"
                >
                    <Text size="sm" c="dimmed">
                        Are you sure you want to delete the entry for{" "}
                        {entryToDelete
                            ? `${entryToDelete.day} ${dayjs(entryToDelete.date).format("MMMM YYYY")}`
                            : "this date"}
                        ?
                    </Text>
                    <Group justify="end" mt="md">
                        <Button variant="subtle" onClick={() => setDeleteModalOpened(false)}>
                            Cancel
                        </Button>
                        <Button color="red" onClick={confirmDeleteEntry}>
                            Delete
                        </Button>
                    </Group>
                </Modal>

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
        </Container>
    );
}

export default function SalesandPurchasesPage(): React.ReactElement {
    return (
        <Suspense fallback={<LoadingComponent message="Please wait..." />}>
            <SalesandPurchasesContent />
        </Suspense>
    );
}
