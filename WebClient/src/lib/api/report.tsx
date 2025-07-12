import * as csclient from "@/lib/api/csclient";
import {
    DailyFinancialReport,
    DailyFinancialReportEntry,
    LiquidationReportCreateRequest,
    LiquidationReportEntryData,
    LiquidationReportResponse,
    MonthlyReport,
} from "@/lib/api/csclient";
import { customLogger } from "@/lib/api/customLogger";

export async function GetLocalMonthlyReports(
    schoolId: number,
    offset: number,
    limit: number
): Promise<MonthlyReport[]> {
    customLogger.debug(`GetLocalMonthlyReports: schoolId=${schoolId}, offset=${offset}, limit=${limit}`);

    const response = await csclient.getAllSchoolMonthlyReportsV1ReportsMonthlySchoolIdGet({
        path: { school_id: schoolId },
        query: { offset, limit },
    });

    if (!response.data) {
        customLogger.warn(`No monthly reports found for schoolId=${schoolId}`);
        return [];
    }

    return response.data;
}

export async function GetDailySalesAndPurchasesReport(
    schoolId: number,
    year: number,
    month: number
): Promise<DailyFinancialReport | null> {
    customLogger.debug(`GetDailySalesAndPurchases: schoolId=${schoolId}, year=${year}, month=${month}`);

    try {
        const response = await csclient.getSchoolDailyReportV1ReportsDailySchoolIdYearMonthGet({
            path: { school_id: schoolId, year, month },
        });

        if (!response.data) {
            customLogger.warn(
                `No daily sales and purchases report found for schoolId=${schoolId}, year=${year}, month=${month}`
            );
            return null;
        }
        return response.data;
    } catch (error) {
        if (error instanceof Error && error.message.includes("404")) {
            return null;
        }
        throw error;
    }
}

export async function GetDailySalesAndPurchasesReportEntries(
    schoolId: number,
    year: number,
    month: number
): Promise<DailyFinancialReportEntry[]> {
    customLogger.debug(`GetDailySalesAndPurchasesReportEntries: schoolId=${schoolId}, year=${year}, month=${month}`);

    try {
        const response = await csclient.getSchoolDailyReportEntriesV1ReportsDailySchoolIdYearMonthEntriesGet({
            path: { school_id: schoolId, year, month },
        });

        return response.data || [];
    } catch (error) {
        if (error instanceof Error && error.message.includes("404")) {
            return [];
        }
        throw error;
    }
}

export async function SetDailySalesAndPurchasesReport(
    schoolId: number,
    year: number,
    month: number,
    report: DailyFinancialReport
): Promise<DailyFinancialReport> {
    customLogger.debug(`SetDailySalesAndPurchasesReport: schoolId=${schoolId}, year=${year}, month=${month}`);

    const response = await csclient.createSchoolDailyReportV1ReportsDailySchoolIdYearMonthPatch({
        path: { school_id: schoolId, year, month },
        query: { noted_by: report.notedBy },
    });

    if (!response.data) {
        throw new Error("Failed to set daily sales and purchases report");
    }

    return response.data;
}

export async function SetDailySalesAndPurchasesReportEntries(
    schoolId: number,
    year: number,
    month: number,
    entries: DailyFinancialReportEntry[]
): Promise<void> {
    customLogger.debug(`SetDailySalesAndPurchasesReportEntries: schoolId=${schoolId}, year=${year}, month=${month}`);

    // For each entry, send a PUT request to update the entry for the given day
    await Promise.all(
        entries.map(async (entry: DailyFinancialReportEntry) => {
            await csclient.updateDailySalesAndPurchasesEntryV1ReportsDailySchoolIdYearMonthEntriesDayPut({
                path: { school_id: schoolId, year, month, day: entry.day },
                query: { sales: entry.sales, purchases: entry.purchases },
            });
        })
    );
}

// Liquidation Report API Functions

export async function GetLiquidationReport(
    schoolId: number,
    year: number,
    month: number,
    category: string
): Promise<LiquidationReportResponse | null> {
    customLogger.debug(
        `GetLiquidationReport: schoolId=${schoolId}, year=${year}, month=${month}, category=${category}`
    );

    try {
        const response = await csclient.getLiquidationReportV1ReportsLiquidationSchoolIdYearMonthCategoryGet({
            path: { school_id: schoolId, year, month, category },
        });

        return response.data || null;
    } catch (error) {
        if (error instanceof Error && error.message.includes("404")) {
            // Report doesn't exist yet
            return null;
        }
        throw error;
    }
}

export async function GetLiquidationReportEntries(
    schoolId: number,
    year: number,
    month: number,
    category: string
): Promise<LiquidationReportEntryData[]> {
    customLogger.debug(
        `GetLiquidationReportEntries: schoolId=${schoolId}, year=${year}, month=${month}, category=${category}`
    );

    try {
        const response =
            await csclient.getLiquidationReportEntriesV1ReportsLiquidationSchoolIdYearMonthCategoryEntriesGet({
                path: { school_id: schoolId, year, month, category },
            });

        return response.data || [];
    } catch (error) {
        if (error instanceof Error && error.message.includes("404")) {
            // No entries exist yet
            return [];
        }
        throw error;
    }
}

export async function CreateOrUpdateLiquidationReport(
    schoolId: number,
    year: number,
    month: number,
    category: string,
    reportData: LiquidationReportCreateRequest
): Promise<LiquidationReportResponse> {
    customLogger.debug(
        `CreateOrUpdateLiquidationReport: schoolId=${schoolId}, year=${year}, month=${month}, category=${category}`
    );

    const response = await csclient.createOrUpdateLiquidationReportV1ReportsLiquidationSchoolIdYearMonthCategoryPatch({
        path: { school_id: schoolId, year, month, category },
        body: reportData,
    });

    if (!response.data) {
        throw new Error("Failed to create/update liquidation report");
    }

    return response.data;
}

export async function DeleteLiquidationReport(
    schoolId: number,
    year: number,
    month: number,
    category: string
): Promise<void> {
    customLogger.debug(
        `DeleteLiquidationReport: schoolId=${schoolId}, year=${year}, month=${month}, category=${category}`
    );

    await csclient.deleteLiquidationReportV1ReportsLiquidationSchoolIdYearMonthCategoryDelete({
        path: { school_id: schoolId, year, month, category },
    });
}

export async function GetLiquidationCategories(): Promise<Record<string, Record<string, string | boolean>>> {
    customLogger.debug("GetLiquidationCategories");

    const response = await csclient.getLiquidationCategoriesV1ReportsLiquidationCategoriesGet();

    return response.data || {};
}
