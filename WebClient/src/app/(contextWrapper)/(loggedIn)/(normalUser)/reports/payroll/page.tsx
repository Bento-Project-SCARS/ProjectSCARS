"use client";

import { LoadingComponent } from "@/components/LoadingComponent/LoadingComponent";
import { SignatureCanvas } from "@/components/SignatureCanvas/SignatureCanvas";
import { SplitButton } from "@/components/SplitButton/SplitButton";
import { SubmitForReviewButton } from "@/components/SubmitForReview";
import * as csclient from "@/lib/api/csclient";
import {
    changePayrollReportStatusV1ReportsPayrollSchoolIdYearMonthStatusPatch,
    createBulkPayrollReportEntriesV1ReportsPayrollSchoolIdYearMonthEntriesBulkPost,
    createSchoolPayrollReportV1ReportsPayrollSchoolIdYearMonthPatch,
    getSchoolPayrollReportEntriesV1ReportsPayrollSchoolIdYearMonthEntriesGet,
    getSchoolPayrollReportV1ReportsPayrollSchoolIdYearMonthGet,
} from "@/lib/api/csclient/sdk.gen";
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
    Divider,
    Flex,
    Group,
    Image,
    Loader,
    Modal,
    NumberInput,
    Paper,
    ScrollArea,
    SimpleGrid,
    Stack,
    Table,
    Text,
    TextInput,
    Title,
} from "@mantine/core";
import { MonthPickerInput } from "@mantine/dates";
import "@mantine/dates/styles.css";
import { notifications } from "@mantine/notifications";
import {
    IconAlertCircle,
    IconCalendar,
    IconCalendarWeek,
    IconCheck,
    IconDownload,
    IconEdit,
    IconFileTypePdf,
    IconReceipt2,
    IconTrash,
    IconUser,
    IconUsers,
    IconX,
} from "@tabler/icons-react";
import dayjs from "dayjs";
import isoWeek from "dayjs/plugin/isoWeek";
import isSameOrAfter from "dayjs/plugin/isSameOrAfter";
import isSameOrBefore from "dayjs/plugin/isSameOrBefore";
import weekOfYear from "dayjs/plugin/weekOfYear";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";

dayjs.extend(weekOfYear);
dayjs.extend(isoWeek);
dayjs.extend(isSameOrAfter);
dayjs.extend(isSameOrBefore);

interface Employee {
    id: string;
    name: string;
    defaultDailyRate: number;
}

interface AttendanceRecord {
    employeeId: string;
    date: string;
    isPresent: boolean;
    customDailyRate?: number;
}

interface WeekPeriod {
    id: string;
    label: string;
    startDate: Date;
    endDate: Date;
    workingDays: Date[];
    isCompleted: boolean;
}

interface EmployeeSignature {
    employeeId: string;
    signatureData: string;
}

function PayrollPageContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const userCtx = useUser();

    // Get effective school ID - for administrators/superintendents, get from URL parameter
    // For regular users (principals, canteen managers), use their assigned school
    const getEffectiveSchoolId = useCallback(() => {
        const isAdminOrSuperintendent = userCtx.userInfo?.roleId === 2 || userCtx.userInfo?.roleId === 3;

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

    const [employees, setEmployees] = useState<Employee[]>([]);
    const [weekPeriods, setWeekPeriods] = useState<WeekPeriod[]>([]);
    const [attendanceRecords, setAttendanceRecords] = useState<AttendanceRecord[]>([]);
    const [selectedWeekId, setSelectedWeekId] = useState<string | null>(null);
    const [selectedMonth, setSelectedMonth] = useState<Date | null>(getInitialMonth());
    const [workingDaysSchedule, setworkingDaysSchedule] = useState<number[]>([1, 2, 3, 4, 5]); // Monday to Friday by default

    const [employeeModalOpened, setEmployeeModalOpened] = useState(false);
    const [editingEmployeeId, setEditingEmployeeId] = useState<string | null>(null);
    const [newEmployeeName, setNewEmployeeName] = useState("");
    const [newEmployeeDailyRate, setNewEmployeeDailyRate] = useState<number>(0);
    const [deleteEmployeeModalOpened, setDeleteEmployeeModalOpened] = useState(false);
    const [employeeToDelete, setEmployeeToDelete] = useState<string | null>(null);

    const [customRateModalOpened, setCustomRateModalOpened] = useState(false);
    const [customRateEmployee, setCustomRateEmployee] = useState<{ employeeId: string; date: Date } | null>(null);
    const [customRateValue, setCustomRateValue] = useState<number>(0);

    const [employeeSignatures, setEmployeeSignatures] = useState<EmployeeSignature[]>([]);
    const [signatureModalOpened, setSignatureModalOpened] = useState(false);
    const [currentSigningEmployee, setCurrentSigningEmployee] = useState<string | null>(null);

    // Approval state management
    const [approvalModalOpened, setApprovalModalOpened] = useState(false);
    const [approvalCheckbox, setApprovalCheckbox] = useState(false);

    // Preview state management
    const [previewModalOpened, setPreviewModalOpened] = useState(false);

    // Loading state for existing reports
    const [isLoadingExistingReport, setIsLoadingExistingReport] = useState(false);

    // Signature state management for report approval
    // Reason: Track prepared by (actual user from DB) and noted by (selected user) for report signatures
    const [notedBy, setNotedBy] = useState<string | null>(null);
    const [preparedBy, setPreparedBy] = useState<string | null>(null);
    const [preparedById, setPreparedById] = useState<string | null>(null);
    const [preparedByPosition, setPreparedByPosition] = useState<string | null>(null);
    const [preparedBySignatureUrl, setPreparedBySignatureUrl] = useState<string | null>(null);
    const [notedBySignatureUrl, setNotedBySignatureUrl] = useState<string | null>(null);

    // User selection state for "noted by" field
    const [schoolUsers, setSchoolUsers] = useState<csclient.UserSimple[]>([]);
    const [selectedNotedByUser, setSelectedNotedByUser] = useState<csclient.UserSimple | null>(null);
    const [reportApprovalModalOpened, setReportApprovalModalOpened] = useState(false);
    const [reportApprovalCheckbox, setReportApprovalCheckbox] = useState(false);

    // Report status tracking
    const [reportStatus, setReportStatus] = useState<string | null>(null);

    // School data for automatic principal assignment
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

    // Helper function to check if the report should show as "under review"
    const isUnderReview = useCallback(() => {
        return reportStatus === "review";
    }, [reportStatus]);

    // Helper function to check if a date is a weekend (Saturday or Sunday)
    const isWeekend = useCallback((date: Date) => {
        const dayOfWeek = dayjs(date).day(); // 0 = Sunday, 6 = Saturday
        return dayOfWeek === 0 || dayOfWeek === 6;
    }, []);

    // Update selected month when URL parameters change
    useEffect(() => {
        const newMonth = getInitialMonth();
        setSelectedMonth((prev) => {
            if (newMonth.getTime() !== (prev?.getTime() || 0)) {
                return newMonth;
            }
            return prev;
        });
    }, [getInitialMonth]);

    useEffect(() => {
        if (weekPeriods.length > 0 && !selectedWeekId) {
            setSelectedWeekId(weekPeriods[0].id);
        }
    }, [weekPeriods, selectedWeekId]);

    // Auto-generate weeks when month or selected working days changes
    useEffect(() => {
        if (selectedMonth) {
            const generatedWeeks = generateWeeksForMonth(selectedMonth, workingDaysSchedule);
            setWeekPeriods(generatedWeeks);
            setSelectedWeekId(generatedWeeks.length > 0 ? generatedWeeks[0].id : null);
            // Clear attendance records when changing months
            setAttendanceRecords([]);
        }
    }, [selectedMonth, workingDaysSchedule]);

    // Load existing payroll report when month changes
    useEffect(() => {
        const loadExistingPayrollReport = async () => {
            if (!selectedMonth || !effectiveSchoolId) {
                return;
            }

            setIsLoadingExistingReport(true);

            try {
                const year = selectedMonth.getFullYear();
                const month = selectedMonth.getMonth() + 1;
                const schoolId = effectiveSchoolId;

                // Try to fetch existing payroll report
                const reportResponse = await getSchoolPayrollReportV1ReportsPayrollSchoolIdYearMonthGet({
                    path: {
                        school_id: schoolId,
                        year: year,
                        month: month,
                    },
                });

                // Try to fetch existing payroll entries
                const entriesResponse = await getSchoolPayrollReportEntriesV1ReportsPayrollSchoolIdYearMonthEntriesGet({
                    path: {
                        school_id: schoolId,
                        year: year,
                        month: month,
                    },
                });

                if (reportResponse.data && entriesResponse.data) {
                    // Set report status from the loaded report
                    setReportStatus(reportResponse.data.reportStatus || "draft");

                    // Store the notedBy user ID from the loaded report
                    // Note: This will be converted to a user name once school users are loaded
                    if (reportResponse.data.notedBy) {
                        setNotedBy(reportResponse.data.notedBy);
                    }

                    // Store the preparedBy user ID from the loaded report
                    if (reportResponse.data.preparedBy) {
                        setPreparedById(reportResponse.data.preparedBy);
                    }

                    // Parse the entries and convert them back to our internal format
                    const loadedEmployees: Employee[] = [];
                    const loadedAttendanceRecords: AttendanceRecord[] = [];
                    const loadedSignatures: EmployeeSignature[] = [];

                    // Group entries by employee name to rebuild our employee list
                    const employeeMap = new Map<
                        string,
                        {
                            totalPay: number;
                            daysWorked: number;
                            signature?: string;
                        }
                    >();

                    entriesResponse.data.forEach((entry) => {
                        const employeeName = entry.employeeName;

                        if (!employeeMap.has(employeeName)) {
                            employeeMap.set(employeeName, {
                                totalPay: 0,
                                daysWorked: 0,
                                signature: entry.signature || undefined,
                            });
                        }

                        const empData = employeeMap.get(employeeName)!;

                        // Calculate daily pay and working days from the entry
                        const dailyAmounts = [
                            entry.sun || 0,
                            entry.mon || 0,
                            entry.tue || 0,
                            entry.wed || 0,
                            entry.thu || 0,
                            entry.fri || 0,
                            entry.sat || 0,
                        ];

                        dailyAmounts.forEach((amount, dayIndex) => {
                            if (amount > 0) {
                                empData.totalPay += amount;
                                empData.daysWorked += 1;

                                // Generate attendance record for this day
                                const weekNumber = entry.weekNumber;
                                const weekPeriod = weekPeriods.find((w) => w.id.endsWith(`-week-${weekNumber}`));

                                if (weekPeriod) {
                                    // Find the corresponding date based on day of week
                                    const correspondingDate = weekPeriod.workingDays.find(
                                        (date) => dayjs(date).day() === dayIndex
                                    );

                                    if (correspondingDate) {
                                        loadedAttendanceRecords.push({
                                            employeeId: employeeName, // Using name as ID for now
                                            date: dayjs(correspondingDate).format("YYYY-MM-DD"),
                                            isPresent: true,
                                            customDailyRate: amount,
                                        });
                                    }
                                }
                            }
                        });

                        if (entry.signature) {
                            empData.signature = entry.signature;
                        }
                    });

                    // Convert employee map to employee array
                    employeeMap.forEach((data, employeeName) => {
                        const averageRate = data.daysWorked > 0 ? data.totalPay / data.daysWorked : 0;

                        loadedEmployees.push({
                            id: employeeName, // Using name as ID
                            name: employeeName,
                            defaultDailyRate: Math.round(averageRate), // Estimate default rate
                        });

                        if (data.signature) {
                            loadedSignatures.push({
                                employeeId: employeeName,
                                signatureData: data.signature,
                            });
                        }
                    });

                    // Update state with loaded data
                    setEmployees(loadedEmployees);
                    setAttendanceRecords(loadedAttendanceRecords);
                    setEmployeeSignatures(loadedSignatures);

                    // notifications.show({
                    //     title: "Report Loaded",
                    //     message: `Existing payroll report for ${dayjs(selectedMonth).format(
                    //         "MMMM YYYY"
                    //     )} has been loaded.`,
                    //     color: "blue",
                    //     icon: <IconCheck size={18} />,
                    // });
                }
            } catch {
                // If 404, it means no existing report - this is fine
                // if ((error as { status?: number })?.status !== 404) {
                //     customLogger.error("Error loading existing payroll report:", error);
                //     notifications.show({
                //         title: "Notice",
                //         message: "No existing payroll report found for this month. Starting with a blank report.",
                //         color: "yellow",
                //     });
                // }
                // Clear data for fresh start
                setEmployees([]);
                setAttendanceRecords([]);
                setEmployeeSignatures([]);
            } finally {
                setIsLoadingExistingReport(false);
            }
        };

        // Only load if we have both month and user info, and week periods are generated
        if (selectedMonth && effectiveSchoolId && weekPeriods.length > 0) {
            loadExistingPayrollReport();
        }
    }, [selectedMonth, effectiveSchoolId, weekPeriods]);

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
                if (!effectiveSchoolId) return;

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

            // Load current user's signature if available and no preparedBy user is set
            if (userCtx.userInfo.signatureUrn && !preparedById) {
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

            // Load school users for noted by selection
            await loadSchoolUsers();
        };

        initializeSignatures();
    }, [userCtx.userInfo, preparedById, effectiveSchoolId]);

    // Load school data and auto-assign principal
    useEffect(() => {
        const loadSchoolData = async () => {
            if (!effectiveSchoolId) return;

            try {
                const response = await csclient.getSchoolEndpointV1SchoolsGet({
                    query: { school_id: effectiveSchoolId },
                });

                if (response.data) {
                    setSchoolData(response.data);

                    // Load school logo if available
                    if (response.data.logoUrn) {
                        try {
                            const logoResponse = await csclient.getSchoolLogoEndpointV1SchoolsLogoGet({
                                query: { fn: response.data.logoUrn },
                            });
                            if (logoResponse.data) {
                                const logoUrl = URL.createObjectURL(logoResponse.data as Blob);
                                setLogoUrl(logoUrl);
                            }
                        } catch (error) {
                            customLogger.error("Failed to load school logo:", error);
                        }
                    }

                    // Auto-assign principal when loading school data
                    if (response.data.assignedNotedBy) {
                        const principalId = response.data.assignedNotedBy;

                        // Load principal's user info
                        try {
                            const principalResponse = await csclient.getUsersSimpleEndpointV1UsersSimpleGet();

                            if (principalResponse.data) {
                                const principal = principalResponse.data.find((user) => user.id === principalId);
                                if (principal) {
                                    setSelectedNotedByUser(principal);

                                    // Set the notedBy name
                                    const principalName = `${principal.nameFirst} ${principal.nameLast}`.trim();
                                    setNotedBy(principalName);

                                    // Load principal's signature if available
                                    if (principal.signatureUrn) {
                                        try {
                                            const sigResponse =
                                                await csclient.getUserSignatureEndpointV1UsersSignatureGet({
                                                    query: { fn: principal.signatureUrn },
                                                });

                                            if (sigResponse.data) {
                                                const signatureUrl = URL.createObjectURL(sigResponse.data as Blob);
                                                setNotedBySignatureUrl(signatureUrl);
                                            }
                                        } catch (error) {
                                            customLogger.error("Failed to load principal signature:", error);
                                        }
                                    }
                                }
                            }
                        } catch (error) {
                            customLogger.error("Failed to load principal info:", error);
                        }
                    }
                }
            } catch (error) {
                customLogger.error("Failed to load school data:", error);
            }
        };

        loadSchoolData();
    }, [effectiveSchoolId]);

    // Load preparedBy user's signature when preparedById is available
    useEffect(() => {
        const loadPreparedBySignature = async () => {
            if (preparedById && schoolUsers.length > 0) {
                // Find the preparedBy user
                const preparedByUser = schoolUsers.find((user) => user.id === preparedById);
                if (preparedByUser) {
                    // Set the preparedBy display name and position
                    const userName = `${preparedByUser.nameFirst} ${preparedByUser.nameLast}`.trim();
                    setPreparedBy(userName);
                    setPreparedByPosition(preparedByUser.position || "Position");

                    // Load the preparedBy user's signature if available
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
                            customLogger.error("Failed to load preparedBy user signature:", error);
                        }
                    }
                }
            }
        };

        loadPreparedBySignature();
    }, [preparedById, schoolUsers]);

    // Effect to match loaded notedBy ID with actual user and load their signature
    useEffect(() => {
        const loadNotedBySignature = async () => {
            // If we have a notedBy value from a loaded report but no selected user yet
            if (notedBy && !selectedNotedByUser && schoolUsers.length > 0) {
                // Try to find the user by matching their ID first (for loaded reports)
                let matchingUser = schoolUsers.find((user) => user.id === notedBy);

                // If not found by ID, try to find by name (for backward compatibility)
                if (!matchingUser) {
                    matchingUser = schoolUsers.find((user) => {
                        const userName = `${user.nameFirst} ${user.nameLast}`.trim();
                        return userName === notedBy;
                    });
                }

                if (matchingUser) {
                    setSelectedNotedByUser(matchingUser);

                    // Convert the user ID to the user's display name
                    const userName = `${matchingUser.nameFirst} ${matchingUser.nameLast}`.trim();
                    setNotedBy(userName);

                    // Load the user's signature if available and report is approved
                    if (matchingUser.signatureUrn && reportStatus === "approved") {
                        try {
                            const response = await csclient.getUserSignatureEndpointV1UsersSignatureGet({
                                query: { fn: matchingUser.signatureUrn },
                            });

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

    const generateWeeksForMonth = (monthDate: Date, includedDays: number[] = [1, 2, 3, 4, 5]) => {
        const startOfMonth = dayjs(monthDate).startOf("month");
        const endOfMonth = dayjs(monthDate).endOf("month");

        const weeks: WeekPeriod[] = [];
        let currentDate = startOfMonth;
        let weekNumber = 1;

        // Group dates by week
        while (currentDate.isSameOrBefore(endOfMonth)) {
            const weekStart = currentDate.startOf("week").add(1, "day"); // Monday
            const weekEnd = weekStart.add(6, "days"); // Sunday

            // Generate working days for this week, only within the month
            const workingDays: Date[] = [];
            let dayInWeek = weekStart;

            for (let i = 0; i < 7; i++) {
                // Only include dates within the selected month and matching working days
                if (
                    dayInWeek.isSameOrAfter(startOfMonth) &&
                    dayInWeek.isSameOrBefore(endOfMonth) &&
                    includedDays.includes(dayInWeek.day())
                ) {
                    workingDays.push(dayInWeek.toDate());
                }
                dayInWeek = dayInWeek.add(1, "day");
            }

            // Only create week if it has working days
            if (workingDays.length > 0) {
                const newWeek: WeekPeriod = {
                    id: `${monthDate.getFullYear()}-${monthDate.getMonth()}-week-${weekNumber}`,
                    label: `WEEK ${weekNumber} /DATE COVERED: ${
                        workingDays[0] ? dayjs(workingDays[0]).format("M/D") : ""
                    }-${
                        workingDays[workingDays.length - 1]
                            ? dayjs(workingDays[workingDays.length - 1]).format("D")
                            : ""
                    }`,
                    startDate: workingDays[0] || weekStart.toDate(),
                    endDate: workingDays[workingDays.length - 1] || weekEnd.toDate(),
                    workingDays,
                    isCompleted: false,
                };

                weeks.push(newWeek);
                weekNumber++;
            }

            // Move to next week
            currentDate = weekEnd.add(1, "day");
        }

        return weeks;
    };

    const handleClose = () => {
        router.back();
    };

    // Signature management handlers
    const handleReportApprovalConfirm = async () => {
        if (!reportApprovalCheckbox || !selectedNotedByUser?.signatureUrn) return;

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

        setReportApprovalModalOpened(false);
    };

    const openEmployeeModal = (employee?: Employee) => {
        if (employee) {
            setEditingEmployeeId(employee.id);
            setNewEmployeeName(employee.name);
            setNewEmployeeDailyRate(employee.defaultDailyRate);
        } else {
            setEditingEmployeeId(null);
            setNewEmployeeName("");
            setNewEmployeeDailyRate(0);
        }
        setEmployeeModalOpened(true);
    };

    const saveEmployee = () => {
        if (newEmployeeName.trim() && newEmployeeDailyRate > 0) {
            if (editingEmployeeId) {
                // Update existing employee
                setEmployees(
                    employees.map((emp) =>
                        emp.id === editingEmployeeId
                            ? { ...emp, name: newEmployeeName.trim(), defaultDailyRate: newEmployeeDailyRate }
                            : emp
                    )
                );
            } else {
                // Add new employee
                const newEmployee: Employee = {
                    id: Date.now().toString(),
                    name: newEmployeeName.trim(),
                    defaultDailyRate: newEmployeeDailyRate,
                };
                setEmployees([...employees, newEmployee]);
            }

            // Reset form
            setNewEmployeeName("");
            setNewEmployeeDailyRate(0);
            setEditingEmployeeId(null);
        }
    };

    const confirmDeleteEmployee = () => {
        if (employeeToDelete) {
            removeEmployee(employeeToDelete);
            setDeleteEmployeeModalOpened(false);
            setEmployeeToDelete(null);
        }
    };

    const removeEmployee = (employeeId: string) => {
        setEmployees(employees.filter((emp) => emp.id !== employeeId));
        setAttendanceRecords(attendanceRecords.filter((record) => record.employeeId !== employeeId));
    };

    const toggleAttendance = (employeeId: string, date: Date) => {
        // Prevent attendance marking for weekends
        if (isWeekend(date)) {
            notifications.show({
                title: "Weekend Not Allowed",
                message:
                    "Attendance cannot be marked for weekends (Saturday and Sunday). The canteen is closed on weekends.",
                color: "orange",
            });
            return;
        }

        // Prevent attendance marking for future dates
        if (dayjs(date).isAfter(dayjs(), "day")) {
            notifications.show({
                title: "Future Date Not Allowed",
                message: "Attendance cannot be marked for future dates.",
                color: "orange",
            });
            return;
        }

        const dateKey = dayjs(date).format("YYYY-MM-DD");
        const existingRecord = attendanceRecords.find(
            (record) => record.employeeId === employeeId && record.date === dateKey
        );

        if (existingRecord) {
            // Toggle existing record
            setAttendanceRecords((records) =>
                records.map((record) =>
                    record.employeeId === employeeId && record.date === dateKey
                        ? { ...record, isPresent: !record.isPresent }
                        : record
                )
            );
        } else {
            // Create new record
            setAttendanceRecords((records) => [
                ...records,
                {
                    employeeId,
                    date: dateKey,
                    isPresent: true,
                },
            ]);
        }
    };

    const getAttendanceStatus = (employeeId: string, date: Date): boolean => {
        const dateKey = dayjs(date).format("YYYY-MM-DD");
        const record = attendanceRecords.find((record) => record.employeeId === employeeId && record.date === dateKey);
        return record?.isPresent || false;
    };

    const openCustomRateModal = (employeeId: string, date: Date) => {
        const employee = employees.find((emp) => emp.id === employeeId);
        if (employee) {
            setCustomRateEmployee({ employeeId, date });
            setCustomRateValue(employee.defaultDailyRate); // Set default value
            setCustomRateModalOpened(true);
        }
    };

    const saveCustomRate = () => {
        if (customRateEmployee && customRateValue > 0) {
            const dateKey = dayjs(customRateEmployee.date).format("YYYY-MM-DD");
            const existingRecord = attendanceRecords.find(
                (record) => record.employeeId === customRateEmployee.employeeId && record.date === dateKey
            );

            if (existingRecord) {
                // Update existing record with custom rate
                setAttendanceRecords((records) =>
                    records.map((record) =>
                        record.employeeId === customRateEmployee.employeeId && record.date === dateKey
                            ? { ...record, isPresent: true, customDailyRate: customRateValue }
                            : record
                    )
                );
            } else {
                // Create new record with custom rate
                setAttendanceRecords((records) => [
                    ...records,
                    {
                        employeeId: customRateEmployee.employeeId,
                        date: dateKey,
                        isPresent: true,
                        customDailyRate: customRateValue,
                    },
                ]);
            }

            setCustomRateModalOpened(false);
            setCustomRateEmployee(null);
            setCustomRateValue(0);
        }
    };

    const calculateWeeklyTotal = (employeeId: string, weekId: string): number => {
        const employee = employees.find((emp) => emp.id === employeeId);
        const week = weekPeriods.find((w) => w.id === weekId);

        if (!employee || !week) return 0;

        return week.workingDays.reduce((total, date) => {
            const record = attendanceRecords.find(
                (r) => r.employeeId === employeeId && r.date === dayjs(date).format("YYYY-MM-DD")
            );

            if (record?.isPresent) {
                return total + (record.customDailyRate || employee.defaultDailyRate);
            }
            return total;
        }, 0);
    };

    const calculateMonthlyTotal = (employeeId: string): number => {
        return weekPeriods.reduce((total, week) => {
            return total + calculateWeeklyTotal(employeeId, week.id);
        }, 0);
    };

    const calculateTotalAmountReceived = (): number => {
        return employees.reduce((total, employee) => {
            return total + calculateMonthlyTotal(employee.id);
        }, 0);
    };

    const saveEmployeeSignature = (signatureData: string) => {
        if (currentSigningEmployee) {
            const newSignature: EmployeeSignature = {
                employeeId: currentSigningEmployee,
                signatureData,
            };

            setEmployeeSignatures((prev) => [
                ...prev.filter((sig) => sig.employeeId !== currentSigningEmployee),
                newSignature,
            ]);

            setSignatureModalOpened(false);
            setCurrentSigningEmployee(null);
        }
    };

    // const getEmployeeSignature = (employeeId: string) => {
    //     return employeeSignatures.find((sig) => sig.employeeId === employeeId);
    // };

    const handleSubmitReport = async () => {
        if (!selectedMonth || !userCtx.userInfo?.schoolId) {
            notifications.show({
                title: "Error",
                message: "Please select a month and ensure you are logged in.",
                color: "red",
                icon: <IconX size={18} />,
            });
            return;
        }

        try {
            const year = selectedMonth.getFullYear();
            const month = selectedMonth.getMonth() + 1;
            const schoolId = userCtx.userInfo.schoolId;

            // First, create or ensure the payroll report exists
            await createSchoolPayrollReportV1ReportsPayrollSchoolIdYearMonthPatch({
                path: {
                    school_id: schoolId,
                    year: year,
                    month: month,
                },
                query: {
                    noted_by: schoolData?.assignedNotedBy || userCtx.userInfo.id, // Use school's assigned principal or current user as fallback
                },
            });

            // Convert our data to the format expected by the API
            const payrollEntries = [];
            for (const employee of employees) {
                for (const week of weekPeriods) {
                    const weekNumber = parseInt(week.id.split("-week-")[1]);

                    // Calculate daily amounts for each day of the week
                    const weeklyAmounts = { sun: 0, mon: 0, tue: 0, wed: 0, thu: 0, fri: 0, sat: 0 };

                    for (const workDay of week.workingDays) {
                        const dayOfWeek = dayjs(workDay).day(); // 0 = Sunday, 1 = Monday, etc.
                        const record = attendanceRecords.find(
                            (r) => r.employeeId === employee.id && r.date === dayjs(workDay).format("YYYY-MM-DD")
                        );

                        if (record?.isPresent) {
                            const amount = record.customDailyRate || employee.defaultDailyRate;

                            switch (dayOfWeek) {
                                case 0:
                                    weeklyAmounts.sun = amount;
                                    break;
                                case 1:
                                    weeklyAmounts.mon = amount;
                                    break;
                                case 2:
                                    weeklyAmounts.tue = amount;
                                    break;
                                case 3:
                                    weeklyAmounts.wed = amount;
                                    break;
                                case 4:
                                    weeklyAmounts.thu = amount;
                                    break;
                                case 5:
                                    weeklyAmounts.fri = amount;
                                    break;
                                case 6:
                                    weeklyAmounts.sat = amount;
                                    break;
                            }
                        }
                    }

                    // Get employee signature if available
                    const signature = employeeSignatures.find((sig) => sig.employeeId === employee.id);

                    payrollEntries.push({
                        week_number: weekNumber,
                        employee_name: employee.name,
                        sun: weeklyAmounts.sun,
                        mon: weeklyAmounts.mon,
                        tue: weeklyAmounts.tue,
                        wed: weeklyAmounts.wed,
                        thu: weeklyAmounts.thu,
                        fri: weeklyAmounts.fri,
                        sat: weeklyAmounts.sat,
                        signature: signature?.signatureData || null,
                    });
                }
            }

            // Create bulk payroll entries
            if (payrollEntries.length > 0) {
                await createBulkPayrollReportEntriesV1ReportsPayrollSchoolIdYearMonthEntriesBulkPost({
                    path: {
                        school_id: schoolId,
                        year: year,
                        month: month,
                    },
                    body: payrollEntries,
                });
            }

            // // Change status to submitted
            // await changePayrollReportStatusV1ReportsPayrollSchoolIdYearMonthStatusPatch({
            //     path: {
            //         school_id: schoolId,
            //         year: year,
            //         month: month,
            //     },
            //     body: {
            //         new_status: "review",
            //         comments: "Payroll report submitted from web client",
            //     },
            // });

            notifications.show({
                title: "Success",
                message: "Payroll report has been successfully submitted for review.",
                color: "green",
                icon: <IconCheck size={18} />,
            });

            // Redirect back to reports page
            router.push("/reports");
        } catch (error) {
            customLogger.error("Error submitting payroll report:", error);
            notifications.show({
                title: "Error",
                message: "Failed to submit the payroll report. Please try again.",
                color: "red",
                icon: <IconX size={18} />,
            });
        }
    };

    const handleSaveDraft = async () => {
        if (!selectedMonth || !userCtx.userInfo?.schoolId) {
            notifications.show({
                title: "Error",
                message: "Please select a month and ensure you are logged in.",
                color: "red",
                icon: <IconX size={18} />,
            });
            return;
        }

        try {
            const year = selectedMonth.getFullYear();
            const month = selectedMonth.getMonth() + 1;
            const schoolId = userCtx.userInfo.schoolId;

            // First, create or ensure the payroll report exists
            await createSchoolPayrollReportV1ReportsPayrollSchoolIdYearMonthPatch({
                path: {
                    school_id: schoolId,
                    year: year,
                    month: month,
                },
                query: {
                    noted_by: schoolData?.assignedNotedBy || userCtx.userInfo.id, // Use school's assigned principal or current user as fallback
                },
            });

            // Convert our data to the format expected by the API
            const payrollEntries = [];
            for (const employee of employees) {
                for (const week of weekPeriods) {
                    const weekNumber = parseInt(week.id.split("-week-")[1]);

                    // Calculate daily amounts for each day of the week
                    const weeklyAmounts = { sun: 0, mon: 0, tue: 0, wed: 0, thu: 0, fri: 0, sat: 0 };

                    for (const workDay of week.workingDays) {
                        const dayOfWeek = dayjs(workDay).day();
                        const record = attendanceRecords.find(
                            (r) => r.employeeId === employee.id && r.date === dayjs(workDay).format("YYYY-MM-DD")
                        );

                        if (record?.isPresent) {
                            const amount = record.customDailyRate || employee.defaultDailyRate;

                            switch (dayOfWeek) {
                                case 0:
                                    weeklyAmounts.sun = amount;
                                    break;
                                case 1:
                                    weeklyAmounts.mon = amount;
                                    break;
                                case 2:
                                    weeklyAmounts.tue = amount;
                                    break;
                                case 3:
                                    weeklyAmounts.wed = amount;
                                    break;
                                case 4:
                                    weeklyAmounts.thu = amount;
                                    break;
                                case 5:
                                    weeklyAmounts.fri = amount;
                                    break;
                                case 6:
                                    weeklyAmounts.sat = amount;
                                    break;
                            }
                        }
                    }

                    // Get employee signature if available
                    const signature = employeeSignatures.find((sig) => sig.employeeId === employee.id);

                    payrollEntries.push({
                        week_number: weekNumber,
                        employee_name: employee.name,
                        sun: weeklyAmounts.sun,
                        mon: weeklyAmounts.mon,
                        tue: weeklyAmounts.tue,
                        wed: weeklyAmounts.wed,
                        thu: weeklyAmounts.thu,
                        fri: weeklyAmounts.fri,
                        sat: weeklyAmounts.sat,
                        signature: signature?.signatureData || null,
                    });
                }
            }

            // Create bulk payroll entries
            if (payrollEntries.length > 0) {
                await createBulkPayrollReportEntriesV1ReportsPayrollSchoolIdYearMonthEntriesBulkPost({
                    path: {
                        school_id: schoolId,
                        year: year,
                        month: month,
                    },
                    body: payrollEntries,
                });
            }

            notifications.show({
                title: "Success",
                message: "Payroll report draft has been saved successfully.",
                color: "green",
                icon: <IconCheck size={18} />,
            });
        } catch (error) {
            customLogger.error("Error saving draft:", error);
            notifications.show({
                title: "Error",
                message: "Failed to save the draft. Please try again.",
                color: "red",
                icon: <IconX size={18} />,
            });
        }
    };

    // Helper functions for preview calculations
    const calculatePayrollSummary = () => {
        const totalEmployees = employees.length;
        const totalWorkingDays = weekPeriods.reduce((sum, week) => sum + week.workingDays.length, 0);

        let totalPayroll = 0;
        let totalAttendance = 0;

        employees.forEach((employee) => {
            const employeeRecords = attendanceRecords.filter((record) => record.employeeId === employee.id);
            const daysWorked = employeeRecords.filter((record) => record.isPresent).length;
            totalAttendance += daysWorked;

            employeeRecords.forEach((record) => {
                if (record.isPresent) {
                    const rate = record.customDailyRate || employee.defaultDailyRate;
                    totalPayroll += rate;
                }
            });
        });

        return {
            totalEmployees,
            totalWorkingDays,
            totalPayroll,
            totalAttendance,
        };
    };

    const calculateEmployeeSummary = (employeeId: string) => {
        const employee = employees.find((e) => e.id === employeeId);
        if (!employee) return { daysWorked: 0, averageRate: 0, totalSalary: 0 };

        const employeeRecords = attendanceRecords.filter((record) => record.employeeId === employeeId);
        const presentRecords = employeeRecords.filter((record) => record.isPresent);

        const daysWorked = presentRecords.length;
        let totalSalary = 0;
        let totalRates = 0;

        presentRecords.forEach((record) => {
            const rate = record.customDailyRate || employee.defaultDailyRate;
            totalSalary += rate;
            totalRates += rate;
        });

        const averageRate = daysWorked > 0 ? totalRates / daysWorked : 0;

        return {
            daysWorked,
            averageRate,
            totalSalary,
        };
    };

    const handlePreview = () => {
        setPreviewModalOpened(true);
    };

    const getFileName = () => {
        const monthYear = dayjs(selectedMonth).format("MMMM-YYYY");
        const schoolName = schoolData?.name || userCtx.userInfo?.schoolId || "School";
        return `Payroll-${schoolName}-${monthYear}.pdf`;
    };

    const exportToPDF = async () => {
        const element = document.getElementById("payroll-report-content");
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
        const totalAmountReceived = calculateTotalAmountReceived();

        return (
            <div
                id="payroll-report-content"
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
                        PAYROLL
                    </div>
                    <div style={{ fontSize: "16px", fontWeight: "bold", marginTop: "5px" }}>CANTEEN HELPER</div>
                    <div style={{ fontSize: "14px", marginTop: "10px" }}>
                        PERIOD COVERED: {dayjs(selectedMonth).format("MMMM YYYY").toUpperCase()}
                    </div>
                </div>

                {/* Week Tables */}
                {weekPeriods.map((week) => (
                    <div key={week.id} style={{ marginBottom: "30px" }}>
                        <div style={{ fontSize: "14px", fontWeight: "bold", marginBottom: "10px" }}>
                            {week.label} ({dayjs(week.startDate).format("M/D")} - {dayjs(week.endDate).format("M/D")})
                        </div>

                        <table
                            style={{
                                width: "100%",
                                borderCollapse: "collapse",
                                fontSize: "10px",
                                marginBottom: "10px",
                            }}
                        >
                            <thead>
                                <tr style={{ backgroundColor: "#f5f5f5" }}>
                                    <th style={{ border: "1px solid #000", padding: "6px", textAlign: "center" }}>
                                        NAME
                                    </th>
                                    {week.workingDays.map((day, dayIndex) => (
                                        <th
                                            key={dayIndex}
                                            style={{ border: "1px solid #000", padding: "6px", textAlign: "center" }}
                                        >
                                            {dayjs(day).format("ddd").toUpperCase()}
                                        </th>
                                    ))}
                                    <th style={{ border: "1px solid #000", padding: "6px", textAlign: "center" }}>
                                        TOTAL
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {employees.map((employee) => (
                                    <tr key={employee.id}>
                                        <td style={{ border: "1px solid #000", padding: "6px", fontWeight: "bold" }}>
                                            {employee.name}
                                        </td>
                                        {week.workingDays.map((day, dayIndex) => {
                                            const isPresent = getAttendanceStatus(employee.id, day);
                                            const dateKey = dayjs(day).format("YYYY-MM-DD");
                                            const record = attendanceRecords.find(
                                                (r) => r.employeeId === employee.id && r.date === dateKey
                                            );
                                            const dailyRate = record?.customDailyRate || employee.defaultDailyRate;

                                            return (
                                                <td
                                                    key={dayIndex}
                                                    style={{
                                                        border: "1px solid #000",
                                                        padding: "6px",
                                                        textAlign: "center",
                                                    }}
                                                >
                                                    {isPresent ? `₱${dailyRate.toFixed(2)}` : ""}
                                                </td>
                                            );
                                        })}
                                        <td
                                            style={{
                                                border: "1px solid #000",
                                                padding: "6px",
                                                textAlign: "center",
                                                fontWeight: "bold",
                                            }}
                                        >
                                            ₱{calculateWeeklyTotal(employee.id, week.id).toFixed(2)}
                                        </td>
                                    </tr>
                                ))}
                                <tr style={{ backgroundColor: "#f5f5f5", fontWeight: "bold" }}>
                                    <td style={{ border: "1px solid #000", padding: "6px", textAlign: "center" }}>
                                        Total Amount Received
                                    </td>
                                    <td
                                        style={{
                                            border: "1px solid #000",
                                            padding: "6px",
                                            textAlign: "center",
                                        }}
                                        colSpan={week.workingDays.length + 1}
                                    >
                                        ₱
                                        {weekPeriods
                                            .reduce(
                                                (sum, w) =>
                                                    sum +
                                                    employees.reduce(
                                                        (empSum, emp) => empSum + calculateWeeklyTotal(emp.id, w.id),
                                                        0
                                                    ),
                                                0
                                            )
                                            .toFixed(2)}
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                ))}

                {/* Monthly Summary */}
                <div style={{ marginTop: "30px", marginBottom: "30px" }}>
                    <div style={{ fontSize: "14px", fontWeight: "bold", marginBottom: "10px" }}>
                        MONTH OF {dayjs(selectedMonth).format("MMMM YYYY").toUpperCase()}
                    </div>

                    <table
                        style={{
                            width: "100%",
                            borderCollapse: "collapse",
                            fontSize: "11px",
                            marginBottom: "10px",
                        }}
                    >
                        <thead>
                            <tr style={{ backgroundColor: "#f5f5f5" }}>
                                <th style={{ border: "1px solid #000", padding: "8px", textAlign: "center" }}>NAME</th>
                                <th style={{ border: "1px solid #000", padding: "8px", textAlign: "center" }}>
                                    TOTAL AMOUNT RECEIVED
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {employees.map((employee) => (
                                <tr key={employee.id}>
                                    <td style={{ border: "1px solid #000", padding: "8px", fontWeight: "bold" }}>
                                        {employee.name}
                                    </td>
                                    <td style={{ border: "1px solid #000", padding: "8px", textAlign: "center" }}>
                                        ₱{calculateMonthlyTotal(employee.id).toFixed(2)}
                                    </td>
                                </tr>
                            ))}
                            <tr style={{ backgroundColor: "#f5f5f5", fontWeight: "bold" }}>
                                <td style={{ border: "1px solid #000", padding: "8px", textAlign: "center" }}>
                                    Total Amount Received
                                </td>
                                <td style={{ border: "1px solid #000", padding: "8px", textAlign: "center" }}>
                                    ₱{totalAmountReceived.toFixed(2)}
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
                        <div style={{ fontSize: "10px" }}>{preparedByPosition || "Canteen Manager"}</div>
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
                        <div style={{ fontSize: "10px" }}>{selectedNotedByUser?.position || "Principal III"}</div>
                    </div>
                </div>
            </div>
        );
    };

    const selectedWeek = weekPeriods.find((w) => w.id === selectedWeekId);

    return (
        <Container size="xl" py={{ base: "sm", sm: "md", lg: "xl" }}>
            <div className="max-w-7xl mx-auto p-4 sm:p-6">
                <Stack gap="lg">
                    {/* Header */}
                    <Flex justify="space-between" align="center" direction={{ base: "column", sm: "row" }} gap="md">
                        <Group gap="md" wrap="wrap">
                            <div className="p-2 bg-blue-100 rounded-lg">
                                <IconReceipt2 size={36} />
                            </div>
                            <div>
                                <Title order={2} className="text-gray-800">
                                    Payroll for {dayjs(selectedMonth).format("MMMM YYYY")}
                                </Title>
                                <Text size="sm" c="dimmed">
                                    Manage staff payroll
                                    {isLoadingExistingReport && " • Loading existing data..."}
                                </Text>
                                {isUnderReview() && (
                                    <Badge color="orange" variant="light" size="sm" mt="xs">
                                        Read-Only Mode - Report Under Review
                                    </Badge>
                                )}
                                {reportStatus === "approved" && (
                                    <Badge color="green" variant="light" size="sm" mt="xs">
                                        Report Approved
                                    </Badge>
                                )}
                            </div>
                        </Group>
                        <Group gap="md" wrap="wrap">
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

                    {/* Loading indicator */}
                    {isLoadingExistingReport && (
                        <Card withBorder>
                            <Group gap="md" justify="center" p="md">
                                <Loader size="sm" />
                                <Text size="sm" c="dimmed">
                                    Loading existing payroll data for {dayjs(selectedMonth).format("MMMM YYYY")}...
                                </Text>
                            </Group>
                        </Card>
                    )}

                    {/* Month Selection & Working Days */}
                    <Card withBorder>
                        <Stack gap="md">
                            <Group justify="space-between" align="center" className="flex-col sm:flex-row gap-4">
                                <Text fw={500}>Period Covered</Text>
                                <MonthPickerInput
                                    placeholder="Select month"
                                    value={selectedMonth}
                                    onChange={(value) => {
                                        setSelectedMonth(value ? dayjs(value).toDate() : null);
                                    }}
                                    leftSection={<IconCalendar size={16} />}
                                    className="w-full sm:w-64"
                                    valueFormat="MMMM YYYY"
                                    required
                                />
                            </Group>

                            <Divider />

                            <Group justify="space-between" align="center" className="flex-col sm:flex-row gap-4">
                                <Text fw={500} size="sm">
                                    Working Days
                                </Text>
                                <Group gap="xs">
                                    {[, "M", "T", "W", "T", "F"].map((day, index) => (
                                        <ActionIcon
                                            disabled={isReadOnly()}
                                            key={`${day}-${index}`}
                                            size="sm"
                                            variant={workingDaysSchedule.includes(index) ? "filled" : "outline"}
                                            color={workingDaysSchedule.includes(index) ? "blue" : "gray"}
                                            onClick={() => {
                                                if (workingDaysSchedule.includes(index)) {
                                                    setworkingDaysSchedule((prev) => prev.filter((d) => d !== index));
                                                } else {
                                                    setworkingDaysSchedule((prev) => [...prev, index].sort());
                                                }
                                            }}
                                            title={
                                                [
                                                    // "Sunday",
                                                    "Monday",
                                                    "Tuesday",
                                                    "Wednesday",
                                                    "Thursday",
                                                    "Friday",
                                                    // "Saturday",
                                                ][index]
                                            }
                                        >
                                            {day}
                                        </ActionIcon>
                                    ))}
                                </Group>
                            </Group>
                        </Stack>
                    </Card>

                    {/* Employees Management */}
                    <Card withBorder>
                        <Group justify="space-between" align="center">
                            <Group gap="sm">
                                <IconUsers size={20} />
                                <Text fw={500}>Canteen Helpers</Text>
                                <Badge variant="light" size="sm">
                                    {employees.length} employees
                                </Badge>
                            </Group>
                            <Button
                                leftSection={<IconUsers size={16} />}
                                onClick={() => setEmployeeModalOpened(true)}
                                variant="light"
                                className="bg-blue-50 hover:bg-blue-100"
                            >
                                Manage
                            </Button>
                        </Group>
                    </Card>

                    {/* Week Periods Management */}
                    <Card withBorder>
                        <Group justify="space-between" align="center" mb="md">
                            <Group gap="sm">
                                <IconCalendarWeek size={20} />
                                <Text fw={500}>Weekly Periods</Text>
                            </Group>
                        </Group>
                        <ScrollArea className="flex-1">
                            <Group gap="xs" wrap="nowrap" className="min-w-fit">
                                {weekPeriods.map((week) => (
                                    <Button
                                        key={week.id}
                                        variant={selectedWeekId === week.id ? "filled" : "outline"}
                                        color={
                                            week.isCompleted ? "green" : selectedWeekId === week.id ? "blue" : "gray"
                                        }
                                        size="sm"
                                        onClick={() => setSelectedWeekId(week.id)}
                                        className="whitespace-nowrap flex-shrink-0"
                                    >
                                        {week.label.replace("WEEK ", "W").split(" /")[0]}
                                    </Button>
                                ))}
                            </Group>
                        </ScrollArea>
                    </Card>

                    {/* Weekly Attendance Table */}
                    {selectedWeek && employees.length > 0 && (
                        <Card withBorder>
                            <Group justify="space-between" className="mb-4">
                                <Group gap="sm">
                                    <Text fw={500}>{selectedWeek.label}</Text>
                                </Group>
                                <Text className="text-right">
                                    <Text component="span" size="sm" c="dimmed">
                                        Total Week Amount: ₱
                                        {weekPeriods.find((w) => w.id === selectedWeekId)
                                            ? employees
                                                  .reduce(
                                                      (total, emp) =>
                                                          total + calculateWeeklyTotal(emp.id, selectedWeekId!),
                                                      0
                                                  )
                                                  .toLocaleString("en-US", {
                                                      minimumFractionDigits: 2,
                                                      maximumFractionDigits: 2,
                                                  })
                                            : "0.00"}
                                    </Text>
                                </Text>
                            </Group>
                            <Divider my="md" />
                            <ScrollArea>
                                <Table striped highlightOnHover style={{ minWidth: "600px" }}>
                                    <Table.Thead>
                                        <Table.Tr>
                                            <Table.Th>NAME</Table.Th>
                                            {selectedWeek.workingDays.map((date) => (
                                                <Table.Th key={date.toISOString()} className="text-center">
                                                    <div>
                                                        <Text size="xs" fw={600}>
                                                            {dayjs(date).format("ddd")}
                                                        </Text>
                                                        <Text size="xs" c="dimmed">
                                                            {dayjs(date).format("MM/DD")}
                                                        </Text>
                                                    </div>
                                                </Table.Th>
                                            ))}
                                            <Table.Th className="text-center">TOTAL</Table.Th>
                                        </Table.Tr>
                                    </Table.Thead>
                                    <Table.Tbody>
                                        {employees.map((employee) => (
                                            <Table.Tr key={employee.id}>
                                                <Table.Td>
                                                    <div>
                                                        <Text size="sm" fw={600}>
                                                            {employee.name}
                                                        </Text>
                                                        <Text size="xs" c="dimmed">
                                                            ₱{employee.defaultDailyRate}/day
                                                        </Text>
                                                    </div>
                                                </Table.Td>
                                                {selectedWeek.workingDays.map((date) => {
                                                    const isPresent = getAttendanceStatus(employee.id, date);
                                                    const dateKey = dayjs(date).format("YYYY-MM-DD");
                                                    const record = attendanceRecords.find(
                                                        (r) => r.employeeId === employee.id && r.date === dateKey
                                                    );
                                                    const displayRate =
                                                        record?.customDailyRate || employee.defaultDailyRate;
                                                    const hasCustomRate = record?.customDailyRate !== undefined;

                                                    // Check if this date should be disabled
                                                    const isWeekendDate = isWeekend(date);
                                                    const isFutureDate = dayjs(date).isAfter(dayjs(), "day");
                                                    const shouldDisableDate = isWeekendDate || isFutureDate;

                                                    return (
                                                        <Table.Td key={date.toISOString()} className="text-center">
                                                            <div className="flex flex-col gap-1">
                                                                <div className="relative">
                                                                    <Button
                                                                        size="xs"
                                                                        variant={isPresent ? "filled" : "outline"}
                                                                        color={
                                                                            shouldDisableDate
                                                                                ? "gray"
                                                                                : isPresent
                                                                                ? "green"
                                                                                : "gray"
                                                                        }
                                                                        onClick={() =>
                                                                            toggleAttendance(employee.id, date)
                                                                        }
                                                                        onContextMenu={(e) => {
                                                                            e.preventDefault();
                                                                            if (
                                                                                !selectedWeek.isCompleted &&
                                                                                !shouldDisableDate
                                                                            ) {
                                                                                openCustomRateModal(employee.id, date);
                                                                            }
                                                                        }}
                                                                        className="w-16"
                                                                        disabled={
                                                                            selectedWeek.isCompleted ||
                                                                            isReadOnly() ||
                                                                            shouldDisableDate
                                                                        }
                                                                        title={
                                                                            shouldDisableDate
                                                                                ? isWeekendDate
                                                                                    ? "Weekends not allowed"
                                                                                    : "Future dates not allowed"
                                                                                : "Left click: Mark attendance \nRight click: Set custom rate"
                                                                        }
                                                                    >
                                                                        {isPresent ? `₱${displayRate}` : " - "}
                                                                    </Button>
                                                                    {hasCustomRate && (
                                                                        <div className="absolute -top-1 -right-1 w-2 h-2 rounded-full"></div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </Table.Td>
                                                    );
                                                })}
                                                <Table.Td className="text-center">
                                                    <Text fw={500}>
                                                        ₱
                                                        {calculateWeeklyTotal(
                                                            employee.id,
                                                            selectedWeek.id
                                                        ).toLocaleString("en-US", {
                                                            minimumFractionDigits: 2,
                                                            maximumFractionDigits: 2,
                                                        })}
                                                    </Text>
                                                </Table.Td>
                                            </Table.Tr>
                                        ))}
                                    </Table.Tbody>
                                </Table>
                            </ScrollArea>
                        </Card>
                    )}

                    {/* Monthly Summary with Signatures */}
                    {employees.length > 0 && weekPeriods.length > 0 && (
                        <Card withBorder>
                            <Text fw={500}>
                                MONTH OF{" "}
                                {selectedMonth
                                    ? dayjs(selectedMonth).format("MMMM, YYYY").toUpperCase()
                                    : "SELECT MONTH"}
                            </Text>
                            <Divider my="md" />

                            <ScrollArea>
                                <Table striped highlightOnHover style={{ minWidth: "800px" }}>
                                    <Table.Thead>
                                        <Table.Tr>
                                            <Table.Th style={{ width: "50px" }}>#</Table.Th>
                                            <Table.Th style={{ width: "250px" }}>Name</Table.Th>
                                            <Table.Th style={{ width: "200px" }}>Total Amount Received</Table.Th>
                                            {/* <Table.Th style={{ width: "50px" }}>Signature</Table.Th> */}
                                        </Table.Tr>
                                    </Table.Thead>
                                    <Table.Tbody>
                                        {employees.map((employee, index) => {
                                            // const signature = getEmployeeSignature(employee.id);
                                            return (
                                                <Table.Tr key={employee.id}>
                                                    <Table.Td>
                                                        <Text size="sm" fw={500}>
                                                            {index + 1}.
                                                        </Text>
                                                    </Table.Td>
                                                    <Table.Td>
                                                        <Text size="sm" fw={500} className="uppercase">
                                                            {employee.name}
                                                        </Text>
                                                    </Table.Td>
                                                    <Table.Td>
                                                        <Text size="sm" fw={500}>
                                                            ₱
                                                            {calculateMonthlyTotal(employee.id).toLocaleString(
                                                                "en-US",
                                                                {
                                                                    minimumFractionDigits: 2,
                                                                    maximumFractionDigits: 2,
                                                                }
                                                            )}
                                                        </Text>
                                                    </Table.Td>
                                                    {/* <Table.Td>
                                                    <div className="flex items-center gap-2">
                                                        {signature ? (
                                                            <div className="flex items-center gap-2">
                                                                <Box
                                                                    w={120}
                                                                    h={40}
                                                                    style={{
                                                                        border: "1px solid #dee2e6",
                                                                        borderRadius: "4px",
                                                                        backgroundColor: "#f8f9fa",
                                                                        display: "flex",
                                                                        alignItems: "center",
                                                                        justifyContent: "center",
                                                                        overflow: "hidden",
                                                                    }}
                                                                >
                                                                    <Image
                                                                        src={signature.signatureData}
                                                                        alt="Employee signature"
                                                                        style={{
                                                                            maxWidth: "100%",
                                                                            maxHeight: "100%",
                                                                            objectFit: "contain",
                                                                        }}
                                                                    />
                                                                </Box>
                                                            </div>
                                                        ) : (
                                                            <Button
                                                                size="xs"
                                                                variant="outline"
                                                                onClick={() => openSignatureModal(employee.id)}
                                                                leftSection={<IconEdit size={14} />}
                                                            >
                                                                Sign
                                                            </Button>
                                                        )}
                                                    </div>
                                                </Table.Td> */}
                                                </Table.Tr>
                                            );
                                        })}
                                    </Table.Tbody>
                                </Table>
                            </ScrollArea>

                            <Divider my="md" />
                            <Group justify="space-between" className="border-t-2 border-gray-800 pt-2 mt-2">
                                <Text fw={700}>Total Amount Received:</Text>
                                <Text fw={700} size="lg">
                                    ₱
                                    {calculateTotalAmountReceived().toLocaleString("en-US", {
                                        minimumFractionDigits: 2,
                                        maximumFractionDigits: 2,
                                    })}
                                </Text>
                            </Group>
                        </Card>
                    )}
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
                                        {preparedBy ||
                                            (userCtx.userInfo
                                                ? `${userCtx.userInfo.nameFirst} ${userCtx.userInfo.nameLast}`.trim()
                                                : "N/A")}
                                    </Text>
                                    <Text size="xs" c="dimmed">
                                        {preparedByPosition || userCtx.userInfo?.position || "Position"}
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
                        <SubmitForReviewButton
                            reportType="payroll"
                            reportPeriod={{
                                schoolId: effectiveSchoolId || 0,
                                year: selectedMonth?.getFullYear() || new Date().getFullYear(),
                                month: selectedMonth ? selectedMonth.getMonth() + 1 : new Date().getMonth() + 1,
                            }}
                            disabled={reportStatus !== null && reportStatus !== "draft" && reportStatus !== "rejected"}
                            onSuccess={() => {
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
                        />
                        {/* Action Buttons */}
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
                        <SplitButton
                            onSubmit={handleSubmitReport}
                            onSaveDraft={handleSaveDraft}
                            onPreview={handlePreview}
                            className="bg-blue-600 hover:bg-blue-700 hide-in-pdf"
                            disabled={
                                !selectedMonth || weekPeriods.length === 0 || employees.length === 0 || isReadOnly()
                            }
                        >
                            Submit Report
                        </SplitButton>
                    </Group>
                </Stack>

                {/* Employee Management Modal */}
                <Modal
                    opened={employeeModalOpened}
                    onClose={() => {
                        setEmployeeModalOpened(false);
                        setEditingEmployeeId(null);
                        setNewEmployeeName("");
                        setNewEmployeeDailyRate(0);
                    }}
                    title={
                        <Group gap="sm">
                            <IconUsers size={20} />
                            <Text fw={500}>Manage Employees</Text>
                        </Group>
                    }
                    centered
                    size="lg"
                >
                    <Stack gap="md">
                        {/* Add New Employee Form */}
                        <Card withBorder p="md">
                            <Text fw={500} mb="md">
                                {editingEmployeeId ? "Edit Employee" : "Add New Employee"}
                            </Text>
                            <Group gap="md" align="end">
                                <TextInput
                                    label="Name"
                                    placeholder="Enter employee name"
                                    value={newEmployeeName}
                                    onChange={(e) => setNewEmployeeName(e.currentTarget.value)}
                                    style={{ flex: 1 }}
                                    readOnly={isReadOnly()}
                                />
                                <NumberInput
                                    label="Daily Rate"
                                    placeholder="Enter daily rate"
                                    value={newEmployeeDailyRate}
                                    onChange={(value) =>
                                        setNewEmployeeDailyRate(typeof value === "number" ? value : Number(value) || 0)
                                    }
                                    min={0}
                                    prefix="₱"
                                    w={120}
                                    readOnly={isReadOnly()}
                                />
                                <Button
                                    onClick={saveEmployee}
                                    disabled={!newEmployeeName.trim() || newEmployeeDailyRate <= 0 || isReadOnly()}
                                    className="bg-blue-600 hover:bg-blue-700"
                                >
                                    {editingEmployeeId ? "Update" : "Add"}
                                </Button>
                                {editingEmployeeId && (
                                    <Button
                                        variant="outline"
                                        onClick={() => {
                                            setEditingEmployeeId(null);
                                            setNewEmployeeName("");
                                            setNewEmployeeDailyRate(0);
                                        }}
                                        disabled={isReadOnly()}
                                    >
                                        Cancel
                                    </Button>
                                )}
                            </Group>
                        </Card>

                        {/* Employee List */}
                        <div className="max-h-60 overflow-y-auto">
                            {employees.length > 0 ? (
                                <div className="space-y-2">
                                    {employees.map((employee) => (
                                        <Paper withBorder key={employee.id} p="md">
                                            <Group justify="space-between">
                                                <div>
                                                    <Text fw={500}>{employee.name}</Text>
                                                    <Text size="sm" c="dimmed">
                                                        ₱{employee.defaultDailyRate}/day
                                                    </Text>
                                                </div>
                                                <Group gap="xs">
                                                    <ActionIcon
                                                        color="blue"
                                                        variant="subtle"
                                                        onClick={() => openEmployeeModal(employee)}
                                                        title="Edit employee"
                                                        disabled={isReadOnly()}
                                                    >
                                                        <IconEdit size={16} />
                                                    </ActionIcon>
                                                    <ActionIcon
                                                        color="red"
                                                        variant="subtle"
                                                        onClick={() => {
                                                            setEmployeeToDelete(employee.id);
                                                            setDeleteEmployeeModalOpened(true);
                                                        }}
                                                        title="Delete employee"
                                                        disabled={isReadOnly()}
                                                    >
                                                        <IconTrash size={16} />
                                                    </ActionIcon>
                                                </Group>
                                            </Group>
                                        </Paper>
                                    ))}
                                </div>
                            ) : (
                                <Text size="sm" c="dimmed" ta="center" py="xl">
                                    No employees added yet.
                                </Text>
                            )}
                        </div>
                    </Stack>
                </Modal>

                {/* Delete Employee Confirmation Modal */}
                <Modal
                    opened={deleteEmployeeModalOpened}
                    onClose={() => {
                        setDeleteEmployeeModalOpened(false);
                        setEmployeeToDelete(null);
                    }}
                    title="Confirm Delete"
                    centered
                    size="sm"
                >
                    <Stack gap="md">
                        <Text>
                            Are you sure you want to delete this employee? This will also remove all their attendance
                            records.
                        </Text>
                        <Group justify="flex-end" gap="md">
                            <Button
                                variant="outline"
                                onClick={() => {
                                    setDeleteEmployeeModalOpened(false);
                                    setEmployeeToDelete(null);
                                }}
                            >
                                Cancel
                            </Button>
                            <Button color="red" onClick={confirmDeleteEmployee}>
                                Delete
                            </Button>
                        </Group>
                    </Stack>
                </Modal>

                {/* Custom Rate Modal */}
                <Modal
                    opened={customRateModalOpened}
                    onClose={() => {
                        setCustomRateModalOpened(false);
                        setCustomRateEmployee(null);
                        setCustomRateValue(0);
                    }}
                    title={
                        <Group gap="sm">
                            <IconUser size={20} />
                            <Text fw={500}>Custom Daily Rate</Text>
                        </Group>
                    }
                    centered
                    size="md"
                >
                    <Stack gap="md">
                        {customRateEmployee && (
                            <>
                                <div>
                                    <Text size="sm" c="dimmed">
                                        Employee
                                    </Text>
                                    <Text fw={500}>
                                        {employees.find((emp) => emp.id === customRateEmployee.employeeId)?.name}
                                    </Text>
                                </div>

                                <div>
                                    <Text size="sm" c="dimmed">
                                        Date
                                    </Text>
                                    <Text fw={500}>
                                        {dayjs(customRateEmployee.date).format("MMMM DD, YYYY (dddd)")}
                                    </Text>
                                </div>

                                <div>
                                    <Text size="sm" c="dimmed">
                                        Daily Rate
                                    </Text>
                                    <Text fw={500}>
                                        ₱
                                        {
                                            employees.find((emp) => emp.id === customRateEmployee.employeeId)
                                                ?.defaultDailyRate
                                        }
                                    </Text>
                                </div>

                                <NumberInput
                                    label="Modified Rate"
                                    value={customRateValue}
                                    onChange={(value) =>
                                        setCustomRateValue(typeof value === "number" ? value : Number(value) || 0)
                                    }
                                    min={0}
                                    prefix="₱"
                                    required
                                    readOnly={isReadOnly()}
                                />
                            </>
                        )}

                        <Group justify="flex-end" gap="md" mt="md">
                            <Button
                                variant="outline"
                                onClick={() => {
                                    setCustomRateModalOpened(false);
                                    setCustomRateEmployee(null);
                                    setCustomRateValue(0);
                                }}
                            >
                                Cancel
                            </Button>
                            <Button
                                onClick={saveCustomRate}
                                disabled={customRateValue <= 0 || isReadOnly()}
                                className="bg-orange-600 hover:bg-orange-700"
                            >
                                Apply
                            </Button>
                        </Group>
                    </Stack>
                </Modal>

                {/* Employee Signature Modal */}
                <Modal
                    opened={signatureModalOpened}
                    onClose={() => {
                        setSignatureModalOpened(false);
                        setCurrentSigningEmployee(null);
                    }}
                    title={
                        <Group gap="sm">
                            <IconEdit size={20} />
                            <Text fw={500}>Employee Signature</Text>
                        </Group>
                    }
                    centered
                    size="md"
                >
                    <Stack gap="md">
                        {currentSigningEmployee && (
                            <div>
                                <Text size="sm" c="dimmed">
                                    Employee
                                </Text>
                                <Text fw={500}>{employees.find((emp) => emp.id === currentSigningEmployee)?.name}</Text>
                            </div>
                        )}

                        <div>
                            <Text size="sm" fw={500} mb="sm">
                                Please sign below to acknowledge payment:
                            </Text>
                            <SignatureCanvas
                                onSave={saveEmployeeSignature}
                                onCancel={() => {
                                    setSignatureModalOpened(false);
                                    setCurrentSigningEmployee(null);
                                }}
                                width={400}
                                height={150}
                            />
                        </div>
                    </Stack>
                </Modal>

                {/* Approval Modal */}
                <Modal
                    opened={approvalModalOpened}
                    onClose={() => {
                        setApprovalModalOpened(false);
                        setApprovalCheckbox(false);
                    }}
                    title={
                        <Group gap="sm">
                            <IconCheck size={20} />
                            <Text fw={500}>Approve Payroll Report</Text>
                        </Group>
                    }
                    centered
                    size="md"
                >
                    <Stack gap="md">
                        <Text size="sm">
                            Are you sure you want to approve this payroll report? This action cannot be undone.
                        </Text>

                        <Checkbox
                            checked={approvalCheckbox}
                            onChange={(event) => setApprovalCheckbox(event.currentTarget.checked)}
                            label="I confirm that I have reviewed this report and approve it for submission."
                            disabled={isReadOnly()}
                        />

                        <Group justify="flex-end" gap="sm">
                            <Button
                                variant="outline"
                                onClick={() => {
                                    setApprovalModalOpened(false);
                                    setApprovalCheckbox(false);
                                }}
                            >
                                Cancel
                            </Button>
                            <Button
                                color="green"
                                onClick={handleApproveReport}
                                disabled={!approvalCheckbox || isReadOnly()}
                                leftSection={<IconCheck size={16} />}
                            >
                                Approve Report
                            </Button>
                        </Group>
                    </Stack>
                </Modal>

                {/* Preview Modal */}
                <Modal
                    opened={previewModalOpened}
                    onClose={() => setPreviewModalOpened(false)}
                    title={
                        <Group gap="sm">
                            <IconReceipt2 size={20} />
                            <Text fw={500}>Payroll Report Preview</Text>
                        </Group>
                    }
                    centered
                    size="xl"
                >
                    <ScrollArea.Autosize mah={600}>
                        <Stack gap="md">
                            {/* Report Header */}
                            <Paper withBorder p="md">
                                <Group justify="space-between">
                                    <div>
                                        <Text fw={500} size="lg">
                                            Payroll Report for{" "}
                                            {selectedMonth
                                                ? dayjs(selectedMonth).format("MMMM YYYY")
                                                : "No month selected"}
                                        </Text>
                                        <Text size="sm" c="dimmed">
                                            School: {userCtx.userInfo?.schoolId || "Unknown School"}
                                        </Text>
                                    </div>
                                    <Badge color="blue" size="lg">
                                        {calculatePayrollSummary().totalEmployees} Employees
                                    </Badge>
                                </Group>
                            </Paper>

                            {/* Summary Stats */}
                            <SimpleGrid cols={3} spacing="md">
                                <Paper withBorder p="md" ta="center">
                                    <Text fw={500} size="xl">
                                        ₱{calculatePayrollSummary().totalPayroll.toLocaleString()}
                                    </Text>
                                    <Text size="sm" c="dimmed">
                                        Total Payroll
                                    </Text>
                                </Paper>
                                <Paper withBorder p="md" ta="center">
                                    <Text fw={500} size="xl">
                                        {calculatePayrollSummary().totalWorkingDays}
                                    </Text>
                                    <Text size="sm" c="dimmed">
                                        Working Days
                                    </Text>
                                </Paper>
                                <Paper withBorder p="md" ta="center">
                                    <Text fw={500} size="xl">
                                        {calculatePayrollSummary().totalAttendance}
                                    </Text>
                                    <Text size="sm" c="dimmed">
                                        Total Attendance
                                    </Text>
                                </Paper>
                            </SimpleGrid>

                            {/* Employee Details */}
                            <Paper withBorder p="md">
                                <Text fw={500} mb="md">
                                    Employee Summary
                                </Text>
                                <Table>
                                    <Table.Thead>
                                        <Table.Tr>
                                            <Table.Th>Employee</Table.Th>
                                            <Table.Th>Days Worked</Table.Th>
                                            <Table.Th>Average Daily Rate</Table.Th>
                                            <Table.Th>Total Salary</Table.Th>
                                            <Table.Th>Signature</Table.Th>
                                        </Table.Tr>
                                    </Table.Thead>
                                    <Table.Tbody>
                                        {employees.map((employee) => {
                                            const summary = calculateEmployeeSummary(employee.id);
                                            const signature = employeeSignatures.find(
                                                (s) => s.employeeId === employee.id
                                            );
                                            return (
                                                <Table.Tr key={employee.id}>
                                                    <Table.Td>{employee.name}</Table.Td>
                                                    <Table.Td>{summary.daysWorked}</Table.Td>
                                                    <Table.Td>₱{summary.averageRate.toLocaleString()}</Table.Td>
                                                    <Table.Td>₱{summary.totalSalary.toLocaleString()}</Table.Td>
                                                    <Table.Td>
                                                        {signature ? (
                                                            <Badge color="green" size="sm">
                                                                Signed
                                                            </Badge>
                                                        ) : (
                                                            <Badge color="red" size="sm">
                                                                Not Signed
                                                            </Badge>
                                                        )}
                                                    </Table.Td>
                                                </Table.Tr>
                                            );
                                        })}
                                    </Table.Tbody>
                                </Table>
                            </Paper>

                            {/* Action Buttons */}
                            <Group justify="flex-end" gap="sm">
                                <Button variant="outline" onClick={() => setPreviewModalOpened(false)}>
                                    Close
                                </Button>
                            </Group>
                        </Stack>
                    </ScrollArea.Autosize>
                </Modal>

                {/* Approval Modal */}
                <Modal
                    opened={reportApprovalModalOpened}
                    onClose={() => setReportApprovalModalOpened(false)}
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
                            You are about to approve this payroll report as{" "}
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
                            checked={reportApprovalCheckbox}
                            onChange={(event) => setReportApprovalCheckbox(event.currentTarget.checked)}
                        />

                        <Group justify="flex-end" gap="sm">
                            <Button variant="outline" onClick={() => setReportApprovalModalOpened(false)}>
                                Cancel
                            </Button>
                            <Button
                                onClick={handleReportApprovalConfirm}
                                disabled={!reportApprovalCheckbox}
                                color="green"
                            >
                                Approve & Sign
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
            </div>
        </Container>
    );

    async function handleApproveReport() {
        if (!approvalCheckbox || !selectedMonth || !userCtx.userInfo?.schoolId) return;

        try {
            const year = selectedMonth.getFullYear();
            const month = selectedMonth.getMonth() + 1;
            const schoolId = userCtx.userInfo.schoolId;

            // Change status to approved
            await changePayrollReportStatusV1ReportsPayrollSchoolIdYearMonthStatusPatch({
                path: {
                    school_id: schoolId,
                    year: year,
                    month: month,
                },
                body: {
                    new_status: "approved",
                    comments: "Payroll report approved by principal",
                },
            });

            notifications.show({
                title: "Report Approved",
                message: "The payroll report has been successfully approved.",
                color: "green",
                icon: <IconCheck size={18} />,
            });

            setApprovalModalOpened(false);
            setApprovalCheckbox(false);
        } catch (error) {
            customLogger.error("Error approving report:", error);
            notifications.show({
                title: "Error",
                message: "Failed to approve the report. Please try again.",
                color: "red",
                icon: <IconX size={18} />,
            });
        }
    }
}

export default function PayrollPage(): React.ReactElement {
    return (
        <Suspense fallback={<LoadingComponent message="Please wait..." />}>
            <PayrollPageContent />
        </Suspense>
    );
}
