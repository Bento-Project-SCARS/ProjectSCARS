"use client";

import { LoadingComponent } from "@/components/LoadingComponent/LoadingComponent";
import { SplitButton } from "@/components/SplitButton/SplitButton";
import { SubmitForReviewButton } from "@/components/SubmitForReview";
import * as csclient from "@/lib/api/csclient";
import { customLogger } from "@/lib/api/customLogger";
import { useUser } from "@/lib/providers/user";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import {
    ActionIcon,
    Alert,
    Badge,
    Box,
    Button,
    Card,
    Checkbox,
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
} from "@mantine/core";
import { DatePickerInput, MonthPickerInput } from "@mantine/dates";
import "@mantine/dates/styles.css";
import { notifications } from "@mantine/notifications";
import { IconAlertCircle, IconCalendar, IconDownload, IconFileTypePdf, IconHistory, IconX } from "@tabler/icons-react";
import dayjs from "dayjs";
import { useRouter } from "next/navigation";
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
    const userCtx = useUser();
    const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());
    const [currentMonth, setCurrentMonth] = useState<Date>(new Date());
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
    const [schoolUsers, setSchoolUsers] = useState<csclient.UserSimple[]>([]);
    const [selectedNotedByUser, setSelectedNotedByUser] = useState<csclient.UserSimple | null>(null);
    const [userSelectModalOpened, setUserSelectModalOpened] = useState(false);
    const [approvalModalOpened, setApprovalModalOpened] = useState(false);
    const [approvalConfirmed, setApprovalConfirmed] = useState(false);
    const [approvalCheckbox, setApprovalCheckbox] = useState(false);

    // Report status state
    const [reportStatus, setReportStatus] = useState<string | null>(null);

    const [schoolData, setSchoolData] = useState<csclient.School | null>(null);
    const [logoUrl, setLogoUrl] = useState<string | null>(null);
    const [pdfModalOpened, setPdfModalOpened] = useState(false);

    // Fetch entries for the current month
    useEffect(() => {
        const fetchEntries = async () => {
            if (userCtx.userInfo?.schoolId) {
                try {
                    const res = await csclient.getSchoolDailyReportEntriesV1ReportsDailySchoolIdYearMonthEntriesGet({
                        path: {
                            school_id: userCtx.userInfo.schoolId,
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
    }, [currentMonth, userCtx.userInfo?.schoolId]);

    // Load daily report data after school users are loaded
    useEffect(() => {
        const loadDailyReportData = async () => {
            if (!userCtx.userInfo?.schoolId || schoolUsers.length === 0) return;

            try {
                const reportRes = await csclient.getSchoolDailyReportV1ReportsDailySchoolIdYearMonthGet({
                    path: {
                        school_id: userCtx.userInfo.schoolId,
                        year: currentMonth.getFullYear(),
                        month: currentMonth.getMonth() + 1,
                    },
                });

                if (reportRes?.data) {
                    const report = reportRes.data as csclient.DailyFinancialReport;

                    // Set the report status
                    setReportStatus(report.reportStatus || null);

                    // Set the prepared by from the report (get user name from user ID)
                    if (report.preparedBy) {
                        // Find the user in schoolUsers to get their name
                        const preparedByUser = schoolUsers.find((user) => user.id === report.preparedBy);
                        if (preparedByUser) {
                            const preparedByName = `${preparedByUser.nameFirst} ${preparedByUser.nameLast}`.trim();
                            setPreparedBy(preparedByName);
                            setPreparedByPosition(preparedByUser.position || null);
                            // Load the preparedBy user's signature
                            if (preparedByUser.signatureUrn) {
                                try {
                                    const response = await csclient.getUserSignatureEndpointV1UsersSignatureGet({
                                        query: { fn: preparedByUser.signatureUrn },
                                    });
                                    if (response.data) {
                                        const signatureUrl = URL.createObjectURL(response.data as Blob);
                                        setPreparedBySignatureUrl(signatureUrl);
                                    }
                                } catch (error) {
                                    customLogger.error("Failed to load prepared by user signature:", error);
                                }
                            }
                        } else {
                            // If user not found in schoolUsers, try to get from current user if it's the same
                            if (report.preparedBy === userCtx.userInfo?.id) {
                                const currentUserName =
                                    `${userCtx.userInfo.nameFirst} ${userCtx.userInfo.nameLast}`.trim();
                                setPreparedBy(currentUserName);
                                setPreparedByPosition(userCtx.userInfo.position || null);
                                // Load current user's signature for preparedBy
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
                                        customLogger.error(
                                            "Failed to load current user signature for preparedBy:",
                                            error
                                        );
                                    }
                                }
                            }
                        }
                    }
                    // Set the noted by from the report (get user name from user ID)
                    if (report.notedBy) {
                        // Find the user in schoolUsers to get their name
                        const notedByUser = schoolUsers.find((user) => user.id === report.notedBy);
                        if (notedByUser) {
                            const notedByName = `${notedByUser.nameFirst} ${notedByUser.nameLast}`.trim();
                            setNotedBy(notedByName);
                            setSelectedNotedByUser(notedByUser);
                            // Load the notedBy user's signature if they have approved the report
                            if (notedByUser.signatureUrn && report.reportStatus === "approved") {
                                try {
                                    const response = await csclient.getUserSignatureEndpointV1UsersSignatureGet({
                                        query: { fn: notedByUser.signatureUrn },
                                    });
                                    if (response.data) {
                                        const signatureUrl = URL.createObjectURL(response.data as Blob);
                                        setNotedBySignatureUrl(signatureUrl);
                                        setApprovalConfirmed(true); // Mark as approved since we loaded their signature
                                    }
                                } catch (error) {
                                    customLogger.error("Failed to load noted by user signature:", error);
                                }
                            }
                        } else {
                            // If user not found in schoolUsers, try to get from current user if it's the same
                            if (report.notedBy === userCtx.userInfo?.id) {
                                const currentUserName =
                                    `${userCtx.userInfo.nameFirst} ${userCtx.userInfo.nameLast}`.trim();
                                setNotedBy(currentUserName);
                                // Find current user in schoolUsers to set as selectedNotedByUser
                                const currentUser = schoolUsers.find((user) => user.id === userCtx.userInfo?.id);
                                if (currentUser) {
                                    setSelectedNotedByUser(currentUser);
                                    // Load current user's signature for notedBy if available
                                    if (currentUser.signatureUrn && report.reportStatus === "approved") {
                                        try {
                                            const response = await csclient.getUserSignatureEndpointV1UsersSignatureGet(
                                                {
                                                    query: { fn: currentUser.signatureUrn },
                                                }
                                            );
                                            if (response.data) {
                                                const signatureUrl = URL.createObjectURL(response.data as Blob);
                                                setNotedBySignatureUrl(signatureUrl);
                                                setApprovalConfirmed(true); // Mark as approved since we loaded their signature
                                            }
                                        } catch (error) {
                                            customLogger.error(
                                                "Failed to load current user signature for notedBy:",
                                                error
                                            );
                                        }
                                    }
                                }
                            }
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
        userCtx.userInfo?.schoolId,
        schoolUsers,
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

            // Load school users for noted by selection
            await loadSchoolUsers();
        };

        initializeSignatures();
    }, [userCtx.userInfo]);

    // Initialize prepared by for new reports only
    useEffect(() => {
        const initializePreparedBy = async () => {
            if (!userCtx.userInfo) return;

            // Only set prepared by to current user if it hasn't been set yet (i.e., for new reports)
            if (!preparedBy && !preparedBySignatureUrl) {
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
    }, [userCtx.userInfo, preparedBy, preparedBySignatureUrl]);

    // Effect to match loaded notedBy name with actual user and load their signature
    useEffect(() => {
        const loadNotedBySignature = async () => {
            // If we have a notedBy name from a loaded report but no selected user yet
            if (notedBy && !selectedNotedByUser && schoolUsers.length > 0) {
                // Try to find the user by matching their name
                const matchingUser = schoolUsers.find((user) => {
                    const userName = `${user.nameFirst} ${user.nameLast}`.trim();
                    return userName === notedBy;
                });

                if (matchingUser) {
                    setSelectedNotedByUser(matchingUser);

                    // Load the user's signature if available and report is approved
                    if (matchingUser.signatureUrn && reportStatus === "approved") {
                        try {
                            const response = await csclient.getUserSignatureEndpointV1UsersSignatureGet({
                                query: { fn: matchingUser.signatureUrn },
                            });

                            if (response.data) {
                                const signatureUrl = URL.createObjectURL(response.data as Blob);
                                setNotedBySignatureUrl(signatureUrl);
                                setApprovalConfirmed(true);
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

    useEffect(() => {
        const loadSchoolData = async () => {
            if (!userCtx.userInfo?.schoolId) return;

            try {
                // Get school details using the school ID
                const schoolResponse = await csclient.getSchoolEndpointV1SchoolsGet({
                    query: {
                        school_id: userCtx.userInfo.schoolId,
                    },
                });
                if (schoolResponse.data) {
                    setSchoolData(schoolResponse.data);
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
    }, [userCtx.userInfo?.schoolId]);

    const handleClose = () => {
        router.push("/reports");
    };

    const handleNotedByUserSelect = async (user: csclient.UserSimple) => {
        const userName = `${user.nameFirst} ${user.nameLast}`.trim();
        setNotedBy(userName);
        setSelectedNotedByUser(user);

        setApprovalConfirmed(false);
        setApprovalCheckbox(false);
        setNotedBySignatureUrl(null);

        setUserSelectModalOpened(false);
    };

    const openApprovalModal = () => {
        setApprovalCheckbox(false);
        setApprovalModalOpened(true);
    };

    const handleClearNotedBy = () => {
        setNotedBy(null);
        setSelectedNotedByUser(null);
        setApprovalConfirmed(false);
        setApprovalCheckbox(false);
        if (notedBySignatureUrl) {
            URL.revokeObjectURL(notedBySignatureUrl);
            setNotedBySignatureUrl(null);
        }
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
                setApprovalConfirmed(true);
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
        [currentMonth, dailyEntries]
    );

    const handleSaveEntry = async () => {
        if (!editingEntry) return;
        if (!userCtx.userInfo?.schoolId) {
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
                        school_id: userCtx.userInfo.schoolId,
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
                        school_id: userCtx.userInfo.schoolId,
                        year: dayjs(editingEntry.date).year(),
                        month: dayjs(editingEntry.date).month() + 1,
                    },
                    body: [
                        {
                            day: editingEntry.day,
                            sales: modalSales,
                            purchases: modalPurchases,
                        },
                    ],
                });
            }
            // Re-fetch entries after save
            const res = await csclient.getSchoolDailyReportEntriesV1ReportsDailySchoolIdYearMonthEntriesGet({
                path: {
                    school_id: userCtx.userInfo.schoolId,
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
        if (!userCtx.userInfo?.schoolId) {
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
                    school_id: userCtx.userInfo.schoolId,
                    year: dayjs(entry.date).year(),
                    month: dayjs(entry.date).month() + 1,
                    day: entry.day,
                },
            });
            // Re-fetch entries after delete
            const res = await csclient.getSchoolDailyReportEntriesV1ReportsDailySchoolIdYearMonthEntriesGet({
                path: {
                    school_id: userCtx.userInfo.schoolId,
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
    const handleSubmit = async () => {
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
                title: "Submission",
                message: "Your entries have been submitted successfully.",
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
                message: "Failed to submit entries.",
                color: "red",
            });
        }
    };

    const getFileName = () => {
        const monthYear = dayjs(currentMonth).format("MMMM-YYYY");
        const schoolName = schoolData?.name || userCtx.userInfo?.schoolId || "School";
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
                background: "#ffffff",
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
            const schoolName = userCtx.userInfo?.schoolId || "School";
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
                            <div
                                style={{
                                    width: "100%",
                                    height: "100%",
                                    border: "1px solid #ccc",
                                    borderRadius: "50%",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    fontSize: "10px",
                                    color: "#666",
                                }}
                            >
                                DepEd
                            </div>
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
                        <div style={{ fontSize: "10px" }}>{userCtx.userInfo?.position || "Position"}</div>
                    </div>

                    <div style={{ textAlign: "center" }}>
                        <div style={{ fontSize: "12px", marginBottom: "5px" }}>Noted:</div>
                        <div
                            style={{
                                width: "200px",
                                height: "60px",
                                border: notedBySignatureUrl && approvalConfirmed ? "none" : "1px solid #ccc",
                                marginBottom: "10px",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                            }}
                        >
                            {notedBySignatureUrl && approvalConfirmed && reportStatus === "approved" ? (
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
                    // Sort by YYYY-MM (from date) then by day
                    const aMonth = dayjs(a.date).format("YYYY-MM");
                    const bMonth = dayjs(b.date).format("YYYY-MM");
                    if (aMonth !== bMonth) {
                        return aMonth.localeCompare(bMonth);
                    }
                    return a.day - b.day;
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
                            </Group>
                        </Table.Td>
                    </Table.Tr>
                )),
        [dailyEntries]
    );

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
                                Financial Report for the Month of {dayjs(currentMonth).format("MMMM YYYY")}
                            </Title>
                            <Text size="sm" c="dimmed">
                                Record daily sales and purchases
                            </Text>
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

                {!userCtx.userInfo?.schoolId && (
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
                        <Text fw={500}>Select Date to Record</Text>
                        <Group gap="md">
                            <MonthPickerInput
                                placeholder="Select month"
                                value={currentMonth}
                                onChange={async (value) => {
                                    if (value) {
                                        const newMonth = new Date(value);
                                        setCurrentMonth(newMonth);
                                        setSelectedDate(null);
                                    }
                                }}
                                leftSection={<IconCalendar size={16} />}
                                className="w-64"
                            />
                            <DatePickerInput
                                placeholder="Select date"
                                value={selectedDate}
                                onChange={(value) => {
                                    if (value) {
                                        const date = new Date(value);
                                        if (!isNaN(date.getTime())) {
                                            handleDateSelect(date);
                                        }
                                    } else {
                                        handleDateSelect(null);
                                    }
                                }}
                                leftSection={<IconCalendar size={16} />}
                                className="w-64"
                                minDate={currentMonth ? dayjs(currentMonth).startOf("month").toDate() : undefined}
                                maxDate={currentMonth ? dayjs(currentMonth).endOf("month").toDate() : new Date()}
                                getDayProps={(date) => {
                                    // e.date is always the first of the month (YYYY-MM-01), but e.day is the actual day
                                    // So reconstruct the real date string for comparison
                                    const dateStr = dayjs(date).format("YYYY-MM-DD");
                                    if (
                                        dailyEntries.some((e) => {
                                            // Compose the real date from e.date (month) and e.day
                                            const entryDate = dayjs(e.date).date(e.day).format("YYYY-MM-DD");
                                            return entryDate === dateStr;
                                        })
                                    ) {
                                        return {
                                            style: {
                                                backgroundColor: "#d1fadf", // light green
                                            },
                                        };
                                    }
                                    return {};
                                }}
                            />
                            <ActionIcon
                                variant="outline"
                                color="blue"
                                size="lg"
                                onClick={() => handleDateSelect(new Date())}
                                title="Select today"
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
                                Select a date above to add your first daily sales and purchases entry
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
                                <Group gap="sm">
                                    <Text size="sm" c="dimmed" fw={500}>
                                        Noted by
                                    </Text>
                                    <Badge
                                        size="sm"
                                        color={
                                            approvalConfirmed && reportStatus === "approved"
                                                ? "green"
                                                : selectedNotedByUser
                                                ? "yellow"
                                                : "gray"
                                        }
                                        variant="light"
                                    >
                                        {approvalConfirmed && reportStatus === "approved"
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
                                {notedBySignatureUrl && approvalConfirmed && reportStatus === "approved" ? (
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
                                {selectedNotedByUser &&
                                    !approvalConfirmed &&
                                    selectedNotedByUser.id === userCtx.userInfo?.id && (
                                        <Button
                                            size="xs"
                                            variant="light"
                                            color="blue"
                                            onClick={openApprovalModal}
                                            disabled={!selectedNotedByUser.signatureUrn}
                                            mt="xs"
                                            mb="xs"
                                        >
                                            Approve Report
                                        </Button>
                                    )}
                            </div>
                        </Stack>
                    </Card>
                </SimpleGrid>

                {/* Action Buttons */}
                <Group justify="flex-end" gap="md">
                    <SubmitForReviewButton
                        reportType="daily"
                        reportPeriod={{
                            schoolId: userCtx.userInfo?.schoolId || 0,
                            year: currentMonth.getFullYear(),
                            month: currentMonth.getMonth() + 1,
                        }}
                        onSuccess={() => {
                            // Optionally refresh data or update UI after successful submission
                            notifications.show({
                                title: "Status Updated",
                                message: "Report status has been updated to 'Review'.",
                                color: "green",
                            });
                        }}
                    />
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
                    <SplitButton onSubmit={handleSubmit} className="hide-in-pdf">
                        Submit
                    </SplitButton>
                </Group>

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
                            ? `Entry for ${dayjs(editingEntry.date).date(editingEntry.day).format("MMMM DD, YYYY")}`
                            : "Edit Entry"
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
                            />
                        </Stack>
                        <Text size="sm" c="dimmed">
                            Net Income: ₱
                            {(modalSales - modalPurchases).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </Text>
                        <Group justify="end" gap="sm" mt="md">
                            <Button variant="subtle" onClick={() => setModalOpened(false)} color="gray" size="md">
                                Cancel
                            </Button>
                            <Button onClick={handleSaveEntry}>Save Entry</Button>
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
        </div>
    );
}

export default function SalesandPurchasesPage(): React.ReactElement {
    return (
        <Suspense fallback={<LoadingComponent message="Please wait..." />}>
            <SalesandPurchasesContent />
        </Suspense>
    );
}
