// eslint-disable-next-line @typescript-eslint/no-explicit-any
const log = (message: string, data?: any) => {
    if (process.env.NODE_ENV === "development") {
        const stack = new Error().stack;
        const caller = stack?.split("\n")[2]?.trim() || "unknown";
        console.log(`[CustomLogger] ${message}`, {
            caller: caller,
            timestamp: new Date().toISOString(),
            data: data,
        });
    }
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const error = (message: string, data?: any) => {
    if (process.env.NODE_ENV === "development") {
        const stack = new Error().stack;
        const caller = stack?.split("\n")[2]?.trim() || "unknown";
        console.error(`[CustomLogger] ${message}`, {
            caller: caller,
            timestamp: new Date().toISOString(),
            data: data,
        });
    }
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const warn = (message: string, data?: any) => {
    if (process.env.NODE_ENV === "development") {
        const stack = new Error().stack;
        const caller = stack?.split("\n")[2]?.trim() || "unknown";
        console.warn(`[CustomLogger] ${message}`, {
            caller: caller,
            timestamp: new Date().toISOString(),
            data: data,
        });
    }
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const info = (message: string, data?: any) => {
    if (process.env.NODE_ENV === "development") {
        const stack = new Error().stack;
        const caller = stack?.split("\n")[2]?.trim() || "unknown";
        console.info(`[CustomLogger] ${message}`, {
            caller: caller,
            timestamp: new Date().toISOString(),
            data: data,
        });
    }
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const debug = (message: string, data?: any) => {
    if (process.env.NODE_ENV === "development") {
        const stack = new Error().stack;
        const caller = stack?.split("\n")[2]?.trim() || "unknown";
        console.debug(`[CustomLogger] ${message}`, {
            caller: caller,
            timestamp: new Date().toISOString(),
            data: data,
        });
    }
};

export const customLogger = {
    log,
    error,
    warn,
    info,
    debug,
};
