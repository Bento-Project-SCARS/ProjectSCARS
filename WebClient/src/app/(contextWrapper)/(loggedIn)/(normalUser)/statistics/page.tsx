"use client";

import { BarChart, LineChart } from "@mantine/charts";
import {
    Card,
    Divider,
    Grid,
    Group,
    Paper,
    SimpleGrid,
    Text,
    Title,
    Alert,
    Loader,
    Switch,
    Container,
    Stack,
} from "@mantine/core";
import {
    IconArrowDownRight,
    IconArrowUpRight,
    IconCoin,
    IconDiscount2,
    IconReceipt2,
    IconUserPlus,
    IconAlertCircle,
    IconFilter,
    IconZoomQuestion,
} from "@tabler/icons-react";

import classes from "./Stats.module.css";

import {
    getDailySalesAndPurchasesSummaryFilteredV1ReportsDailySchoolIdYearMonthSummaryFilteredGet,
    getDailySalesAndPurchasesSummaryV1ReportsDailySchoolIdYearMonthSummaryGet,
    School,
} from "@/lib/api/csclient";
import { useUser } from "@/lib/providers/user";
import { GetSchoolInfo } from "@/lib/api/school";
import { useCallback, useEffect, useState } from "react";
import dayjs from "dayjs";
import { notifications } from "@mantine/notifications";
import { customLogger } from "@/lib/api/customLogger";

const icons = {
    user: IconUserPlus,
    discount: IconDiscount2,
    receipt: IconReceipt2,
    coin: IconCoin,
};

interface FinancialStats {
    netSales: number;
    totalPurchases: number;
    netIncome: number;
    prevNetSales: number;
    prevTotalPurchases: number;
    prevNetIncome: number;
    monthlySalesData: Array<{ month: string; sales: number }>;
    monthlyPurchasesData: Array<{ month: string; purchases: number }>;
    monthlyNetIncomeData: Array<{ month: string; net: number }>;
}

export default function StatisticsPage() {
    const { userInfo } = useUser();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [statsData, setStatsData] = useState<FinancialStats | null>(null);
    const [schoolInfo, setSchoolInfo] = useState<School | null>(null);
    const [includeDrafts, setIncludeDrafts] = useState(true);
    const [includeReviews, setIncludeReviews] = useState(true); // Default to include reviews

    // Determine if user can control filtering based on role
    const canControlFiltering = userInfo?.roleId && [4, 5].includes(userInfo.roleId); // Principals and Canteen Managers can control filtering
    const isAdminUser = userInfo?.roleId && [2, 3].includes(userInfo.roleId); // Superintendent or Administrator

    const fetchFinancialData = useCallback(async () => {
        if (!userInfo?.schoolId) {
            setLoading(false);
            setError("You are not assigned to a school. Please contact your administrator.");
            return;
        }

        // Helper function to fetch summary with fallback
        const fetchSummaryWithFallback = async (schoolId: number, year: number, month: number) => {
            try {
                // Try filtered endpoint first
                return await getDailySalesAndPurchasesSummaryFilteredV1ReportsDailySchoolIdYearMonthSummaryFilteredGet({
                    path: { school_id: schoolId, year, month },
                    query: {
                        include_drafts: includeDrafts,
                        include_reviews: includeReviews,
                        include_approved: true,
                        include_rejected: true,
                        include_received: true,
                        include_archived: true,
                    },
                });
            } catch {
                // If filtered endpoint fails (404), fallback to original endpoint
                console.warn("Filtered endpoint not available, falling back to original endpoint");
                return await getDailySalesAndPurchasesSummaryV1ReportsDailySchoolIdYearMonthSummaryGet({
                    path: { school_id: schoolId, year, month },
                });
            }
        };

        try {
            setLoading(true);
            setError(null);

            // Get school info
            const school = await GetSchoolInfo(userInfo.schoolId);
            setSchoolInfo(school);

            // Get current year and month
            const currentDate = dayjs();
            const currentYear = currentDate.year();
            const currentMonth = currentDate.month() + 1; // dayjs months are 0-indexed
            const prevMonth = currentMonth === 1 ? 12 : currentMonth - 1;
            const prevYear = currentMonth === 1 ? currentYear - 1 : currentYear;

            // Fetch current month summary with filtering
            const currentSummaryResponse = await fetchSummaryWithFallback(userInfo.schoolId, currentYear, currentMonth);

            // Fetch previous month summary for comparison
            let prevSummaryResponse;
            try {
                prevSummaryResponse = await fetchSummaryWithFallback(userInfo.schoolId, prevYear, prevMonth);
            } catch {
                // Previous month data may not exist
                prevSummaryResponse = { data: { total_sales: 0, total_purchases: 0, net_income: 0 } };
            }

            // Get monthly data for charts (last 12 months)
            const monthlyData = [];
            for (let i = 11; i >= 0; i--) {
                const targetDate = currentDate.subtract(i, "month");
                const year = targetDate.year();
                const month = targetDate.month() + 1;

                try {
                    const monthSummary = await fetchSummaryWithFallback(userInfo.schoolId, year, month);

                    if (monthSummary.data) {
                        const sales =
                            typeof monthSummary.data.total_sales === "number" ? monthSummary.data.total_sales : 0;
                        const purchases =
                            typeof monthSummary.data.total_purchases === "number"
                                ? monthSummary.data.total_purchases
                                : 0;

                        monthlyData.push({
                            date: targetDate.format("MMM YYYY"),
                            sales,
                            purchases,
                            net: sales - purchases,
                        });
                    }
                } catch {
                    // Month data may not exist, add zero values
                    monthlyData.push({
                        date: targetDate.format("MMM YYYY"),
                        sales: 0,
                        purchases: 0,
                        net: 0,
                    });
                }
            }

            const currentSales =
                typeof currentSummaryResponse.data?.total_sales === "number"
                    ? currentSummaryResponse.data.total_sales
                    : 0;
            const currentPurchases =
                typeof currentSummaryResponse.data?.total_purchases === "number"
                    ? currentSummaryResponse.data.total_purchases
                    : 0;
            const currentNetIncome =
                typeof currentSummaryResponse.data?.net_income === "number"
                    ? currentSummaryResponse.data.net_income
                    : 0;

            const prevSales =
                typeof prevSummaryResponse.data?.total_sales === "number" ? prevSummaryResponse.data.total_sales : 0;
            const prevPurchases =
                typeof prevSummaryResponse.data?.total_purchases === "number"
                    ? prevSummaryResponse.data.total_purchases
                    : 0;
            const prevNetIncome =
                typeof prevSummaryResponse.data?.net_income === "number" ? prevSummaryResponse.data.net_income : 0;

            setStatsData({
                netSales: currentSales,
                totalPurchases: currentPurchases,
                netIncome: currentNetIncome,
                prevNetSales: prevSales,
                prevTotalPurchases: prevPurchases,
                prevNetIncome: prevNetIncome,
                monthlySalesData: monthlyData.map((d) => ({ month: d.date, sales: d.sales })),
                monthlyPurchasesData: monthlyData.map((d) => ({ month: d.date, purchases: d.purchases })),
                monthlyNetIncomeData: monthlyData.map((d) => ({ month: d.date, net: d.net })),
            });
        } catch (err) {
            customLogger.error("Error fetching financial data:", err);
            const errorMessage = err instanceof Error ? err.message : "Failed to load financial data";
            setError(errorMessage);
            notifications.show({
                title: "Error",
                message: "Failed to load financial statistics",
                color: "red",
                icon: <IconAlertCircle size={16} />,
            });
        } finally {
            setLoading(false);
        }
    }, [userInfo?.schoolId, includeDrafts, includeReviews]);

    useEffect(() => {
        fetchFinancialData();
    }, [fetchFinancialData, includeDrafts, includeReviews]);

    if (loading) {
        return (
            <div className={classes.root}>
                <Group justify="center" style={{ minHeight: 200 }}>
                    <Loader size="lg" />
                    <Text>Loading financial statistics...</Text>
                </Group>
            </div>
        );
    }

    if (error || !statsData) {
        return (
            <div className={classes.root}>
                <Container size="xl" mt={50} style={{ textAlign: "center" }}>
                    <IconZoomQuestion
                        size={64}
                        style={{ margin: "auto", display: "block" }}
                        color="var(--mantine-color-dimmed)"
                    />
                    <Text size="lg" mt="xl" c="dimmed">
                        {error || "No financial data available"}
                    </Text>
                </Container>
            </div>
        );
    }

    // Calculate percentage changes
    const calculateChange = (current: number, previous: number) => {
        if (previous === 0) return current > 0 ? 100 : 0;
        return Math.round(((current - previous) / previous) * 100);
    };

    const salesChange = calculateChange(statsData.netSales, statsData.prevNetSales);
    const purchasesChange = calculateChange(statsData.totalPurchases, statsData.prevTotalPurchases);
    const netIncomeChange = calculateChange(statsData.netIncome, statsData.prevNetIncome);
    const grossProfitChange = calculateChange(
        statsData.netSales - statsData.totalPurchases,
        statsData.prevNetSales - statsData.prevTotalPurchases
    );

    const TopStats = [
        {
            title: "Net Sales",
            icon: "receipt" as const,
            value: `₱${statsData.netSales.toLocaleString()}`,
            diff: salesChange,
        },
        {
            title: "Gross Profit",
            icon: "coin" as const,
            value: `₱${(statsData.netSales - statsData.totalPurchases).toLocaleString()}`,
            diff: grossProfitChange,
        },
        {
            title: "Total Purchases",
            icon: "discount" as const,
            value: `₱${statsData.totalPurchases.toLocaleString()}`,
            diff: purchasesChange,
        },
        {
            title: "Net Income",
            icon: "user" as const,
            value: `₱${statsData.netIncome.toLocaleString()}`,
            diff: netIncomeChange,
        },
    ];

    const stats = TopStats.map((stat) => {
        const Icon = icons[stat.icon];
        const DiffIcon = stat.diff > 0 ? IconArrowUpRight : IconArrowDownRight;

        return (
            <Paper withBorder p="md" radius="md" key={stat.title}>
                <Group justify="space-between">
                    <Text size="xs" c="dimmed" className={classes.title}>
                        {stat.title}
                    </Text>
                    <Icon className={classes.icon} size={22} stroke={1.5} />
                </Group>
                <Group align="flex-end" gap="xs" mt={25}>
                    <Text className={classes.value}>{stat.value}</Text>
                    <Text c={stat.diff > 0 ? "teal" : "red"} fz="sm" fw={500} className={classes.diff}>
                        <span>{stat.diff}%</span>
                        <DiffIcon size={16} stroke={1.5} />
                    </Text>
                </Group>
                <Text fz="xs" c="dimmed" mt={7}>
                    Compared to previous month
                </Text>
            </Paper>
        );
    });

    // Prepare chart data
    const combinedSalesData = statsData.monthlySalesData.map((item, index) => ({
        month: item.month,
        sales: item.sales,
        purchases: statsData.monthlyPurchasesData[index]?.purchases || 0,
        gross: item.sales - (statsData.monthlyPurchasesData[index]?.purchases || 0),
    }));

    const profitMarginData = statsData.monthlySalesData.map((item, index) => {
        const purchases = statsData.monthlyPurchasesData[index]?.purchases || 0;
        const margin = item.sales > 0 ? ((item.sales - purchases) / item.sales) * 100 : 0;
        return {
            month: item.month,
            margin: Math.round(margin * 100) / 100,
        };
    });

    const costToSalesData = statsData.monthlySalesData.map((item, index) => {
        const purchases = statsData.monthlyPurchasesData[index]?.purchases || 0;
        const ratio = item.sales > 0 ? (purchases / item.sales) * 100 : 0;
        return {
            month: item.month,
            ratio: Math.round(ratio * 100) / 100,
        };
    });

    return (
        <Container size="xl" py={{ base: "sm", md: "md" }}>
            <div className={classes.root}>
                {schoolInfo && (
                    <>
                        <Title order={2} mb="lg" hiddenFrom="sm">
                            Financial Statistics
                        </Title>
                        <Title order={2} mb="lg" visibleFrom="sm">
                            Financial Statistics - {schoolInfo.name}
                        </Title>
                        <Text size="sm" c="dimmed" mb="md" hiddenFrom="sm">
                            {schoolInfo.name}
                        </Text>
                    </>
                )}

                {/* Filtering Controls - Only show for Canteen Managers */}
                {canControlFiltering && (
                    <Card withBorder p={{ base: "sm", md: "md" }} mb="lg">
                        {/* Desktop Layout */}
                        <Group justify="space-between" align="center" visibleFrom="md">
                            <Group gap="xs">
                                <IconFilter size={20} />
                                <Text fw={500}>Report Filtering Options</Text>
                            </Group>
                            <Group gap="lg">
                                <Group gap="xs">
                                    <Switch
                                        checked={includeDrafts}
                                        onChange={(e) => setIncludeDrafts(e.currentTarget.checked)}
                                        size="sm"
                                    />
                                    <Text size="sm">Include Draft Reports</Text>
                                </Group>
                                <Group gap="xs">
                                    <Switch
                                        checked={includeReviews}
                                        onChange={(e) => setIncludeReviews(e.currentTarget.checked)}
                                        size="sm"
                                    />
                                    <Text size="sm">Include Reports Under Review</Text>
                                </Group>
                            </Group>
                        </Group>

                        {/* Mobile Layout */}
                        <Stack gap="md" hiddenFrom="md">
                            <Group gap="xs" justify="center">
                                <IconFilter size={20} />
                                <Text fw={500} ta="center">
                                    Report Filtering Options
                                </Text>
                            </Group>
                            <Stack gap="sm">
                                <Group gap="xs" justify="space-between">
                                    <Text size="sm">Include Draft Reports</Text>
                                    <Switch
                                        checked={includeDrafts}
                                        onChange={(e) => setIncludeDrafts(e.currentTarget.checked)}
                                        size="sm"
                                    />
                                </Group>
                                <Group gap="xs" justify="space-between">
                                    <Text size="sm">Include Reports Under Review</Text>
                                    <Switch
                                        checked={includeReviews}
                                        onChange={(e) => setIncludeReviews(e.currentTarget.checked)}
                                        size="sm"
                                    />
                                </Group>
                            </Stack>
                        </Stack>
                    </Card>
                )}

                {/* Status indicator for admin users */}
                {isAdminUser && (
                    <Alert color="blue" mb="lg">
                        <Group gap="xs">
                            <IconAlertCircle size={16} />
                            <Text size="sm">As an administrator, you are viewing data from approved reports only.</Text>
                        </Group>
                    </Alert>
                )}

                <SimpleGrid cols={{ base: 1, xs: 2, md: 4 }} spacing={{ base: "sm", md: "md" }}>
                    {stats}
                </SimpleGrid>

                <Divider my="lg" label="Core Financial Statistics" labelPosition="center" />

                <Grid gutter={{ base: "sm", md: "md" }}>
                    <Grid.Col span={{ base: 12, md: 6 }}>
                        <Card withBorder p={{ base: "sm", md: "lg" }}>
                            <Title order={4} mb="sm">
                                Monthly Net Sales
                            </Title>
                            <LineChart
                                h={{ base: 250, md: 300 }}
                                data={statsData.monthlySalesData}
                                dataKey="month"
                                series={[{ name: "sales", color: "indigo.6" }]}
                                curveType="linear"
                                withTooltip
                                valueFormatter={(value) => `₱${value.toLocaleString()}`}
                            />
                        </Card>
                    </Grid.Col>

                    <Grid.Col span={{ base: 12, md: 6 }}>
                        <Card withBorder p={{ base: "sm", md: "lg" }}>
                            <Title order={4} mb="sm">
                                Monthly Net Income
                            </Title>
                            <LineChart
                                h={{ base: 250, md: 300 }}
                                data={statsData.monthlyNetIncomeData}
                                dataKey="month"
                                series={[{ name: "net", color: "green.6" }]}
                                curveType="linear"
                                withTooltip
                                valueFormatter={(value) => `₱${value.toLocaleString()}`}
                            />
                        </Card>
                    </Grid.Col>

                    <Grid.Col span={{ base: 12, md: 6 }}>
                        <Card withBorder p={{ base: "sm", md: "lg" }}>
                            <Title order={4} mb="sm">
                                Sales vs Purchases
                            </Title>
                            <BarChart
                                h={{ base: 250, md: 300 }}
                                data={combinedSalesData}
                                dataKey="month"
                                series={[
                                    { name: "purchases", color: "red.6" },
                                    { name: "sales", color: "green.6" },
                                ]}
                                withTooltip
                                withLegend
                                valueFormatter={(value) => `₱${value.toLocaleString()}`}
                            />
                        </Card>
                    </Grid.Col>

                    <Grid.Col span={{ base: 12, md: 6 }}>
                        <Card withBorder p={{ base: "sm", md: "lg" }}>
                            <Title order={4} mb="sm">
                                Monthly Gross Profit
                            </Title>
                            <LineChart
                                h={{ base: 250, md: 300 }}
                                data={combinedSalesData}
                                dataKey="month"
                                series={[{ name: "gross", color: "blue.6" }]}
                                curveType="linear"
                                withTooltip
                                valueFormatter={(value) => `₱${value.toLocaleString()}`}
                            />
                        </Card>
                    </Grid.Col>
                </Grid>

                <Divider my="lg" label="Performance & Efficiency Metrics" labelPosition="center" />

                <Grid gutter={{ base: "sm", md: "md" }}>
                    <Grid.Col span={{ base: 12, md: 4 }}>
                        <Card withBorder p={{ base: "sm", md: "lg" }}>
                            <Title order={5} mb="sm">
                                Profit Margin Over Time (%)
                            </Title>
                            <LineChart
                                h={{ base: 200, md: 250 }}
                                data={profitMarginData}
                                dataKey="month"
                                series={[{ name: "margin", color: "teal.6" }]}
                                curveType="linear"
                                withTooltip
                                valueFormatter={(value) => `${value}%`}
                            />
                        </Card>
                    </Grid.Col>
                    <Grid.Col span={{ base: 12, md: 4 }}>
                        <Card withBorder p={{ base: "sm", md: "lg" }}>
                            <Title order={5} mb="sm">
                                Cost-to-Sales Ratio (%)
                            </Title>
                            <LineChart
                                h={{ base: 200, md: 250 }}
                                data={costToSalesData}
                                dataKey="month"
                                series={[{ name: "ratio", color: "orange.6" }]}
                                curveType="linear"
                                withTooltip
                                valueFormatter={(value) => `${value}%`}
                            />
                        </Card>
                    </Grid.Col>
                    <Grid.Col span={{ base: 12, md: 4 }}>
                        <Card withBorder p={{ base: "sm", md: "lg" }}>
                            <Title order={5} mb="sm">
                                Monthly Summary
                            </Title>
                            <div style={{ padding: "1rem 0" }}>
                                <Text size="sm" c="dimmed">
                                    Current Month Summary
                                </Text>
                                <Text fw={600}>Sales: ₱{statsData.netSales.toLocaleString()}</Text>
                                <Text fw={600}>Purchases: ₱{statsData.totalPurchases.toLocaleString()}</Text>
                                <Text fw={600} c={statsData.netIncome >= 0 ? "green" : "red"}>
                                    Net Income: ₱{statsData.netIncome.toLocaleString()}
                                </Text>
                            </div>
                        </Card>
                    </Grid.Col>
                </Grid>

                {statsData.monthlySalesData.length > 0 && (
                    <>
                        <Divider my="lg" label="Comparative Views" labelPosition="center" />
                        <Grid gutter={{ base: "sm", md: "md" }}>
                            <Grid.Col span={12}>
                                <Card withBorder p={{ base: "sm", md: "lg" }}>
                                    <Title order={4} mb="sm">
                                        12-Month Financial Overview
                                    </Title>
                                    <BarChart
                                        h={{ base: 300, md: 400 }}
                                        data={combinedSalesData}
                                        dataKey="month"
                                        series={[
                                            { name: "sales", color: "blue.6" },
                                            { name: "purchases", color: "red.6" },
                                            { name: "gross", color: "green.6" },
                                        ]}
                                        withTooltip
                                        withLegend
                                        valueFormatter={(value) => `₱${value.toLocaleString()}`}
                                    />
                                </Card>
                            </Grid.Col>
                        </Grid>
                    </>
                )}
            </div>
        </Container>
    );
}
