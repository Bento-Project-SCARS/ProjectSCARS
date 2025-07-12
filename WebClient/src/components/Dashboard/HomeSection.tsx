import {
    Card,
    Container,
    Grid,
    Group,
    LoadingOverlay,
    Paper,
    RingProgress,
    Stack,
    Text,
    Title,
    Alert,
    Badge,
    Skeleton,
    Box,
} from "@mantine/core";
import { Calendar } from "@mantine/dates";
import "@mantine/dates/styles.css";
import {
    IconCalendarStats,
    IconFileText,
    IconFileCheck,
    IconCoin,
    IconTrendingUp,
    IconAlertCircle,
    IconSchool,
} from "@tabler/icons-react";
import { motion } from "framer-motion";
import { memo, useState, useEffect, useCallback } from "react";
import dayjs from "dayjs";
import { useUser } from "@/lib/providers/user";
import * as csclient from "@/lib/api/csclient";
import { customLogger } from "@/lib/api/customLogger";
import { GetSchoolInfo } from "@/lib/api/school";

interface DashboardStats {
    totalReports: number;
    draftReports: number;
    currentMonthSales: number;
    currentMonthExpenses: number;
    salesEntryDates: string[];
    schoolName?: string;
}

const StatCard = memo(
    ({
        icon: Icon,
        title,
        value,
        subtitle,
        color = "blue",
        loading = false,
    }: {
        icon: typeof IconFileText;
        title: string;
        value: string | number;
        subtitle?: string;
        color?: string;
        loading?: boolean;
    }) => (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            <Card shadow="sm" padding="lg" radius="md" withBorder h="100%">
                <Stack gap="sm">
                    <Group justify="space-between">
                        <Icon size={24} color={`var(--mantine-color-${color}-6)`} />
                        {loading && <Skeleton height={8} radius="xl" />}
                    </Group>
                    <div>
                        <Text size="xs" tt="uppercase" fw={700} c="dimmed">
                            {title}
                        </Text>
                        <Text size="xl" fw={700}>
                            {loading ? <Skeleton height={28} width="60%" /> : value}
                        </Text>
                        {subtitle && (
                            <Text size="xs" c="dimmed">
                                {loading ? <Skeleton height={12} width="80%" /> : subtitle}
                            </Text>
                        )}
                    </div>
                </Stack>
            </Card>
        </motion.div>
    )
);

StatCard.displayName = "StatCard";

const CalendarCard = memo(({ salesEntryDates, loading = false }: { salesEntryDates: string[]; loading?: boolean }) => {
    const getDayProps = useCallback(
        (date: string) => {
            const hasEntry = salesEntryDates.includes(date);
            const isToday = dayjs(date).isSame(dayjs(), "day");

            return {
                style: {
                    backgroundColor: hasEntry
                        ? isToday
                            ? "var(--mantine-color-green-6)"
                            : "var(--mantine-color-green-5)"
                        : undefined,
                    color: hasEntry ? "white" : undefined,
                    fontWeight: hasEntry ? 700 : undefined,
                },
            };
        },
        [salesEntryDates]
    );

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
        >
            <Card shadow="sm" padding="lg" radius="md" withBorder h="100%">
                <Stack gap="md">
                    <Group gap="sm">
                        <IconCalendarStats size={24} color="var(--mantine-color-teal-6)" />
                        <Text size="xs" tt="uppercase" fw={700} c="dimmed">
                            Daily Sales Reports
                        </Text>
                    </Group>

                    <Box pos="relative">
                        <LoadingOverlay visible={loading} />
                        <Calendar getDayProps={getDayProps} size="sm" firstDayOfWeek={1} hideOutsideDates />
                    </Box>

                    <Paper p="xs" bg="gray.0" radius="sm">
                        <Group gap="xs">
                            <Box w={12} h={12} bg="green.5" style={{ borderRadius: 2 }} />
                            <Text size="xs" c="dimmed">
                                Days with sales entries
                            </Text>
                        </Group>
                    </Paper>
                </Stack>
            </Card>
        </motion.div>
    );
});

CalendarCard.displayName = "CalendarCard";

export const HomeSection = memo(() => {
    const { userInfo } = useUser();
    const [stats, setStats] = useState<DashboardStats>({
        totalReports: 0,
        draftReports: 0,
        currentMonthSales: 0,
        currentMonthExpenses: 0,
        salesEntryDates: [],
    });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchDashboardData = useCallback(async () => {
        if (!userInfo) return;

        try {
            setLoading(true);
            setError(null);

            const currentDate = dayjs();
            const currentYear = currentDate.year();
            const currentMonth = currentDate.month() + 1;

            // Determine scope based on user role
            const isAdminUser = userInfo.roleId && [2, 3].includes(userInfo.roleId); // Superintendent or Administrator
            const schoolId = userInfo.schoolId;

            const dashboardData: DashboardStats = {
                totalReports: 0,
                draftReports: 0,
                currentMonthSales: 0,
                currentMonthExpenses: 0,
                salesEntryDates: [],
            };

            if (isAdminUser) {
                // Admin users see system-wide data
                dashboardData.schoolName = "All Schools";
                // TODO: Implement system-wide report counting
                // For now, show placeholder data
                dashboardData.totalReports = 0;
                dashboardData.draftReports = 0;
            } else if (schoolId) {
                // School-specific data
                try {
                    const school = await GetSchoolInfo(schoolId);
                    dashboardData.schoolName = school.name;

                    // Get monthly reports for the school
                    const reportsResponse = await csclient.getAllSchoolMonthlyReportsV1ReportsMonthlySchoolIdGet({
                        path: { school_id: schoolId },
                        query: { offset: 0, limit: 100 }, // Get recent reports
                    });

                    if (reportsResponse.data) {
                        dashboardData.totalReports = reportsResponse.data.length;
                        dashboardData.draftReports = reportsResponse.data.filter(
                            (report) => report.reportStatus === "draft"
                        ).length;
                    }

                    // Get current month's daily financial data
                    try {
                        const dailyEntriesResponse =
                            await csclient.getSchoolDailyReportEntriesV1ReportsDailySchoolIdYearMonthEntriesGet({
                                path: {
                                    school_id: schoolId,
                                    year: currentYear,
                                    month: currentMonth,
                                },
                            });

                        if (dailyEntriesResponse.data) {
                            const entries = dailyEntriesResponse.data;

                            // Calculate current month totals
                            dashboardData.currentMonthSales = entries.reduce(
                                (sum, entry) => sum + (entry.sales || 0),
                                0
                            );
                            dashboardData.currentMonthExpenses = entries.reduce(
                                (sum, entry) => sum + (entry.purchases || 0),
                                0
                            );

                            // Get dates with entries for calendar
                            dashboardData.salesEntryDates = entries
                                .filter((entry) => entry.sales && entry.sales > 0)
                                .map(
                                    (entry) =>
                                        `${currentYear}-${currentMonth.toString().padStart(2, "0")}-${entry.day
                                            .toString()
                                            .padStart(2, "0")}`
                                );
                        }
                    } catch (dailyError) {
                        // Daily entries might not exist yet, that's okay
                        customLogger.warn("No daily entries found for current month", dailyError);
                    }
                } catch (schoolError) {
                    customLogger.error("Failed to fetch school data", schoolError);
                    setError("Failed to load school information");
                }
            } else {
                setError("You are not assigned to a school. Please contact your administrator.");
            }

            setStats(dashboardData);
        } catch (err) {
            customLogger.error("Failed to fetch dashboard data", err);
            setError("Failed to load dashboard data");
        } finally {
            setLoading(false);
        }
    }, [userInfo]);

    useEffect(() => {
        if (userInfo) {
            fetchDashboardData();
        }
    }, [fetchDashboardData, userInfo]);

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat("en-PH", {
            style: "currency",
            currency: "PHP",
        }).format(amount);
    };

    const netIncome = stats.currentMonthSales - stats.currentMonthExpenses;

    return (
        <Container size="xl" mt={50}>
            {/* Header */}
            <Stack gap="xl" mb="xl">
                <div>
                    <Group gap="sm" mb="xs">
                        <IconSchool size={28} color="var(--mantine-color-blue-6)" />
                        <Title order={2}>Canteen Finance Dashboard</Title>
                    </Group>
                    {stats.schoolName && (
                        <Text size="lg" c="dimmed">
                            {stats.schoolName} • {dayjs().format("MMMM YYYY")}
                        </Text>
                    )}
                </div>

                {error && (
                    <Alert icon={<IconAlertCircle size={16} />} color="red" variant="light">
                        {error}
                    </Alert>
                )}
            </Stack>

            {/* Bento Grid */}
            <Grid gutter="lg">
                {/* Row 1: Stats Cards */}
                <Grid.Col span={{ base: 12, md: 3 }}>
                    <StatCard
                        icon={IconFileText}
                        title="Total Reports"
                        value={stats.totalReports}
                        subtitle="Monthly reports submitted"
                        color="blue"
                        loading={loading}
                    />
                </Grid.Col>

                <Grid.Col span={{ base: 12, md: 3 }}>
                    <StatCard
                        icon={IconFileCheck}
                        title="Draft Reports"
                        value={stats.draftReports}
                        subtitle="Pending submission"
                        color="orange"
                        loading={loading}
                    />
                </Grid.Col>

                <Grid.Col span={{ base: 12, md: 3 }}>
                    <StatCard
                        icon={IconCoin}
                        title="This Month Sales"
                        value={formatCurrency(stats.currentMonthSales)}
                        subtitle="Total revenue"
                        color="green"
                        loading={loading}
                    />
                </Grid.Col>

                <Grid.Col span={{ base: 12, md: 3 }}>
                    <StatCard
                        icon={IconTrendingUp}
                        title="Net Income"
                        value={formatCurrency(netIncome)}
                        subtitle="Sales minus expenses"
                        color={netIncome >= 0 ? "green" : "red"}
                        loading={loading}
                    />
                </Grid.Col>

                {/* Row 2: Calendar */}
                <Grid.Col span={{ base: 12, lg: 6 }}>
                    <CalendarCard salesEntryDates={stats.salesEntryDates} loading={loading} />
                </Grid.Col>

                {/* Row 2: Quick Actions */}
                <Grid.Col span={{ base: 12, lg: 6 }}>
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, delay: 0.3 }}
                    >
                        <Card shadow="sm" padding="lg" radius="md" withBorder h="100%">
                            <Stack gap="md">
                                <Group gap="sm">
                                    <IconTrendingUp size={24} color="var(--mantine-color-violet-6)" />
                                    <Text size="xs" tt="uppercase" fw={700} c="dimmed">
                                        Monthly Overview
                                    </Text>
                                </Group>

                                <Stack gap="md">
                                    <Group justify="space-between">
                                        <Text size="sm">Total Sales</Text>
                                        <Badge color="green" variant="light">
                                            {loading ? (
                                                <Skeleton height={16} width={60} />
                                            ) : (
                                                formatCurrency(stats.currentMonthSales)
                                            )}
                                        </Badge>
                                    </Group>

                                    <Group justify="space-between">
                                        <Text size="sm">Total Expenses</Text>
                                        <Badge color="red" variant="light">
                                            {loading ? (
                                                <Skeleton height={16} width={60} />
                                            ) : (
                                                formatCurrency(stats.currentMonthExpenses)
                                            )}
                                        </Badge>
                                    </Group>

                                    <Group justify="space-between">
                                        <Text size="sm" fw={600}>
                                            Net Income
                                        </Text>
                                        <Badge color={netIncome >= 0 ? "green" : "red"} variant="filled">
                                            {loading ? <Skeleton height={16} width={60} /> : formatCurrency(netIncome)}
                                        </Badge>
                                    </Group>

                                    {!loading && netIncome !== 0 && (
                                        <RingProgress
                                            size={120}
                                            thickness={12}
                                            sections={[
                                                {
                                                    value:
                                                        stats.currentMonthSales > 0
                                                            ? (Math.abs(netIncome) / stats.currentMonthSales) * 100
                                                            : 0,
                                                    color: netIncome >= 0 ? "green" : "red",
                                                },
                                            ]}
                                            label={
                                                <Text ta="center" fw={700} size="sm">
                                                    {stats.currentMonthSales > 0
                                                        ? `${(
                                                              (Math.abs(netIncome) / stats.currentMonthSales) *
                                                              100
                                                          ).toFixed(1)}%`
                                                        : "0%"}
                                                </Text>
                                            }
                                        />
                                    )}
                                </Stack>
                            </Stack>
                        </Card>
                    </motion.div>
                </Grid.Col>
            </Grid>
        </Container>
    );
});

HomeSection.displayName = "HomeSection";
