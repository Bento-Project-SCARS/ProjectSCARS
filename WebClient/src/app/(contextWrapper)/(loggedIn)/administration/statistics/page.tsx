"use client";

import { BarChart, LineChart } from "@mantine/charts";
import { Card, Divider, Grid, Group, Paper, SimpleGrid, Text, Title, Alert, Loader, Select } from "@mantine/core";
import {
    IconArrowDownRight,
    IconArrowUpRight,
    IconCoin,
    IconDiscount2,
    IconReceipt2,
    IconUserPlus,
    IconAlertCircle,
} from "@tabler/icons-react";

import classes from "./Stats.module.css";

import {
    getDailySalesAndPurchasesSummaryV1ReportsDailySchoolIdYearMonthSummaryGet,
    School,
    getAllSchoolsEndpointV1SchoolsAllGet,
} from "@/lib/api/csclient";
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
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [statsData, setStatsData] = useState<FinancialStats | null>(null);
    const [schoolInfo, setSchoolInfo] = useState<School | null>(null);
    const [selectedSchoolId, setSelectedSchoolId] = useState<number | null>(null);
    const [schools, setSchools] = useState<School[]>([]);
    const [loadingSchools, setLoadingSchools] = useState(true);
    const [viewingAllSchools, setViewingAllSchools] = useState(false);

    // Fetch all schools for the dropdown
    const fetchSchools = useCallback(async () => {
        try {
            setLoadingSchools(true);
            const response = await getAllSchoolsEndpointV1SchoolsAllGet();
            if (response.data) {
                setSchools(response.data);
                // Set "All Schools" as default if no selection is made
                if (!selectedSchoolId && !viewingAllSchools) {
                    setViewingAllSchools(true);
                }
            }
        } catch (err) {
            customLogger.error("Error fetching schools:", err);
            notifications.show({
                title: "Error",
                message: "Failed to load schools",
                color: "red",
                icon: <IconAlertCircle size={16} />,
            });
        } finally {
            setLoadingSchools(false);
        }
    }, [selectedSchoolId, viewingAllSchools]);

    const fetchFinancialData = useCallback(async () => {
        if (!selectedSchoolId && !viewingAllSchools) {
            setLoading(false);
            return;
        }

        try {
            setLoading(true);
            setError(null);

            // Get current year and month
            const currentDate = dayjs();
            const currentYear = currentDate.year();
            const currentMonth = currentDate.month() + 1; // dayjs months are 0-indexed
            const prevMonth = currentMonth === 1 ? 12 : currentMonth - 1;
            const prevYear = currentMonth === 1 ? currentYear - 1 : currentYear;

            if (viewingAllSchools) {
                // Combined statistics for all schools
                setSchoolInfo(null);

                let totalCurrentSales = 0;
                let totalCurrentPurchases = 0;
                let totalCurrentNetIncome = 0;
                let totalPrevSales = 0;
                let totalPrevPurchases = 0;
                let totalPrevNetIncome = 0;

                // Arrays to store monthly data for all schools
                const monthlyDataMap = new Map<string, { sales: number; purchases: number; net: number }>();

                // Initialize monthly data for last 12 months
                for (let i = 11; i >= 0; i--) {
                    const targetDate = currentDate.subtract(i, "month");
                    const monthKey = targetDate.format("MMM YYYY");
                    monthlyDataMap.set(monthKey, { sales: 0, purchases: 0, net: 0 });
                }

                for (const school of schools) {
                    if (!school.id) continue;

                    try {
                        // Current month data
                        const currentSummaryResponse =
                            await getDailySalesAndPurchasesSummaryV1ReportsDailySchoolIdYearMonthSummaryGet({
                                path: {
                                    school_id: school.id,
                                    year: currentYear,
                                    month: currentMonth,
                                },
                            });

                        if (currentSummaryResponse.data) {
                            totalCurrentSales +=
                                typeof currentSummaryResponse.data.total_sales === "number"
                                    ? currentSummaryResponse.data.total_sales
                                    : 0;
                            totalCurrentPurchases +=
                                typeof currentSummaryResponse.data.total_purchases === "number"
                                    ? currentSummaryResponse.data.total_purchases
                                    : 0;
                            totalCurrentNetIncome +=
                                typeof currentSummaryResponse.data.net_income === "number"
                                    ? currentSummaryResponse.data.net_income
                                    : 0;
                        }

                        // Previous month data
                        try {
                            const prevSummaryResponse =
                                await getDailySalesAndPurchasesSummaryV1ReportsDailySchoolIdYearMonthSummaryGet({
                                    path: {
                                        school_id: school.id,
                                        year: prevYear,
                                        month: prevMonth,
                                    },
                                });

                            if (prevSummaryResponse.data) {
                                totalPrevSales +=
                                    typeof prevSummaryResponse.data.total_sales === "number"
                                        ? prevSummaryResponse.data.total_sales
                                        : 0;
                                totalPrevPurchases +=
                                    typeof prevSummaryResponse.data.total_purchases === "number"
                                        ? prevSummaryResponse.data.total_purchases
                                        : 0;
                                totalPrevNetIncome +=
                                    typeof prevSummaryResponse.data.net_income === "number"
                                        ? prevSummaryResponse.data.net_income
                                        : 0;
                            }
                        } catch {
                            // Previous month data may not exist for this school
                        }

                        // Monthly data for charts (last 12 months)
                        for (let i = 11; i >= 0; i--) {
                            const targetDate = currentDate.subtract(i, "month");
                            const year = targetDate.year();
                            const month = targetDate.month() + 1;
                            const monthKey = targetDate.format("MMM YYYY");

                            try {
                                const monthSummary =
                                    await getDailySalesAndPurchasesSummaryV1ReportsDailySchoolIdYearMonthSummaryGet({
                                        path: {
                                            school_id: school.id,
                                            year,
                                            month,
                                        },
                                    });

                                if (monthSummary.data) {
                                    const existingData = monthlyDataMap.get(monthKey)!;
                                    const sales =
                                        typeof monthSummary.data.total_sales === "number"
                                            ? monthSummary.data.total_sales
                                            : 0;
                                    const purchases =
                                        typeof monthSummary.data.total_purchases === "number"
                                            ? monthSummary.data.total_purchases
                                            : 0;

                                    monthlyDataMap.set(monthKey, {
                                        sales: existingData.sales + sales,
                                        purchases: existingData.purchases + purchases,
                                        net: existingData.net + (sales - purchases),
                                    });
                                }
                            } catch {
                                // Month data may not exist for this school
                            }
                        }
                    } catch (err) {
                        customLogger.warn(`Failed to fetch data for school ${school.name}:`, err);
                    }
                }

                // Convert monthly data map to arrays
                const monthlyData = Array.from(monthlyDataMap.entries()).map(([monthKey, data]) => ({
                    date: monthKey,
                    ...data,
                }));

                setStatsData({
                    netSales: totalCurrentSales,
                    totalPurchases: totalCurrentPurchases,
                    netIncome: totalCurrentNetIncome,
                    prevNetSales: totalPrevSales,
                    prevTotalPurchases: totalPrevPurchases,
                    prevNetIncome: totalPrevNetIncome,
                    monthlySalesData: monthlyData.map((d) => ({ month: d.date, sales: d.sales })),
                    monthlyPurchasesData: monthlyData.map((d) => ({ month: d.date, purchases: d.purchases })),
                    monthlyNetIncomeData: monthlyData.map((d) => ({ month: d.date, net: d.net })),
                });
            } else {
                // Single school statistics
                const school = await GetSchoolInfo(selectedSchoolId!);
                setSchoolInfo(school);

                // Fetch current month summary
                const currentSummaryResponse =
                    await getDailySalesAndPurchasesSummaryV1ReportsDailySchoolIdYearMonthSummaryGet({
                        path: {
                            school_id: selectedSchoolId!,
                            year: currentYear,
                            month: currentMonth,
                        },
                    });

                // Fetch previous month summary for comparison
                let prevSummaryResponse;
                try {
                    prevSummaryResponse =
                        await getDailySalesAndPurchasesSummaryV1ReportsDailySchoolIdYearMonthSummaryGet({
                            path: {
                                school_id: selectedSchoolId!,
                                year: prevYear,
                                month: prevMonth,
                            },
                        });
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
                        const monthSummary =
                            await getDailySalesAndPurchasesSummaryV1ReportsDailySchoolIdYearMonthSummaryGet({
                                path: {
                                    school_id: selectedSchoolId!,
                                    year,
                                    month,
                                },
                            });

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
                    typeof prevSummaryResponse.data?.total_sales === "number"
                        ? prevSummaryResponse.data.total_sales
                        : 0;
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
            }
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
    }, [selectedSchoolId, viewingAllSchools, schools]);

    useEffect(() => {
        fetchSchools();
    }, [fetchSchools]);

    useEffect(() => {
        if (selectedSchoolId || viewingAllSchools) {
            fetchFinancialData();
        }
    }, [fetchFinancialData, selectedSchoolId, viewingAllSchools]);

    if (loadingSchools) {
        return (
            <div className={classes.root}>
                <Group justify="center" style={{ minHeight: 200 }}>
                    <Loader size="lg" />
                    <Text>Loading schools...</Text>
                </Group>
            </div>
        );
    }

    // Show school selector and loading message when no school is selected
    if (!statsData && !loading && !error) {
        return (
            <div className={classes.root}>
                <Title order={2} mb="lg">
                    Financial Statistics - Administration
                </Title>

                <Select
                    label="Select School"
                    placeholder="Choose a school to view statistics"
                    data={[
                        { value: "all", label: "All Schools" },
                        ...schools.map((school) => ({
                            value: school.id?.toString() || "",
                            label: school.name || "",
                        })),
                    ]}
                    value={viewingAllSchools ? "all" : selectedSchoolId?.toString() || null}
                    onChange={(value) => {
                        if (value === "all") {
                            setViewingAllSchools(true);
                            setSelectedSchoolId(null);
                        } else {
                            setViewingAllSchools(false);
                            setSelectedSchoolId(value ? parseInt(value) : null);
                        }
                    }}
                    mb="xl"
                />

                <Alert
                    icon={<IconAlertCircle size={16} />}
                    title="Select a School"
                    color="blue"
                    style={{ margin: "2rem 0" }}
                >
                    Please select a school or &quot;All Schools&quot; to view financial statistics.
                </Alert>
            </div>
        );
    }

    if (loading) {
        return (
            <div className={classes.root}>
                <Title order={2} mb="lg">
                    Financial Statistics - Administration
                </Title>

                <Select
                    label="Select School"
                    placeholder="Choose a school to view statistics"
                    data={[
                        { value: "all", label: "All Schools" },
                        ...schools.map((school) => ({
                            value: school.id?.toString() || "",
                            label: school.name || "",
                        })),
                    ]}
                    value={viewingAllSchools ? "all" : selectedSchoolId?.toString() || null}
                    onChange={(value) => {
                        if (value === "all") {
                            setViewingAllSchools(true);
                            setSelectedSchoolId(null);
                        } else {
                            setViewingAllSchools(false);
                            setSelectedSchoolId(value ? parseInt(value) : null);
                        }
                    }}
                    mb="xl"
                />

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
                <Alert
                    icon={<IconAlertCircle size={16} />}
                    title="Error Loading Data"
                    color="red"
                    style={{ margin: "2rem 0" }}
                >
                    {error || "No financial data available"}
                </Alert>
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
        <div className={classes.root}>
            <Group justify="space-between" mb="lg">
                <Title order={2}>Financial Statistics - Administration</Title>
                <Select
                    label="Select School"
                    placeholder="Choose a school to view statistics"
                    value={viewingAllSchools ? "all" : selectedSchoolId?.toString() || null}
                    onChange={(value) => {
                        if (value === "all") {
                            setViewingAllSchools(true);
                            setSelectedSchoolId(null);
                        } else {
                            setViewingAllSchools(false);
                            setSelectedSchoolId(value ? parseInt(value) : null);
                        }
                    }}
                    data={[
                        { value: "all", label: "🏫 All Schools Combined" },
                        ...schools
                            .filter((school) => school.id != null)
                            .map((school) => ({
                                value: school.id!.toString(),
                                label: school.name,
                            })),
                    ]}
                    style={{ minWidth: 300 }}
                />
            </Group>

            {viewingAllSchools ? (
                <Text size="lg" mb="md" c="dimmed">
                    Viewing combined data for: <strong>All Schools ({schools.length} schools)</strong>
                </Text>
            ) : schoolInfo ? (
                <Text size="lg" mb="md" c="dimmed">
                    Viewing data for: <strong>{schoolInfo.name}</strong>
                </Text>
            ) : null}

            <SimpleGrid cols={{ base: 1, xs: 2, md: 4 }}>{stats}</SimpleGrid>

            <Divider my="lg" label="Core Financial Statistics" labelPosition="center" />

            <Grid gutter="md">
                <Grid.Col span={{ base: 12, md: 6 }}>
                    <Card withBorder p="lg">
                        <Title order={4}>Monthly Net Sales</Title>
                        <LineChart
                            h={300}
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
                    <Card withBorder p="lg">
                        <Title order={4}>Monthly Net Income</Title>
                        <LineChart
                            h={300}
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
                    <Card withBorder p="lg">
                        <Title order={4}>Sales vs Purchases</Title>
                        <BarChart
                            h={300}
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
                    <Card withBorder p="lg">
                        <Title order={4}>Monthly Gross Profit</Title>
                        <LineChart
                            h={300}
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

            <Grid gutter="md">
                <Grid.Col span={{ base: 12, md: 4 }}>
                    <Card withBorder p="lg">
                        <Title order={5}>Profit Margin Over Time (%)</Title>
                        <LineChart
                            h={250}
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
                    <Card withBorder p="lg">
                        <Title order={5}>Cost-to-Sales Ratio (%)</Title>
                        <LineChart
                            h={250}
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
                    <Card withBorder p="lg">
                        <Title order={5}>Monthly Summary</Title>
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
                    <Grid gutter="md">
                        <Grid.Col span={12}>
                            <Card withBorder p="lg">
                                <Title order={4}>12-Month Financial Overview</Title>
                                <BarChart
                                    h={400}
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
    );
}
