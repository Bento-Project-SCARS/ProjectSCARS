import {
    IconAlertCircle,
    IconCircleCheck,
    IconInfoCircle,
    IconInfoTriangle,
    IconMail,
    IconShieldLock,
} from "@tabler/icons-react";

// Used for exporting the program information and connection details into NavBar Component
export const Program = {
    name: "BENTO",
    description: "Baliwag Enhanced Network for Tracking Operations",
    version: "0.7.0",
};

export const Connections = {
    CentralServer: {
        endpoint: process.env.NEXT_PUBLIC_CENTRAL_SERVER_ENDPOINT,
    },
};

export const LocalStorage = {
    accessToken: "at",
    userData: "ud",
    userPermissions: "up",
    userAvatar: "userAvatar",
    userPreferences: "userPrefs",
    setupCompleteDismissed: "setupCompleteDismissed",
    useBasicLoader: "useBasicLoader",
};

export const randomLoadingMessages: string[] = [
    "Balancing the school canteen budget...",
    "Sharpening pencils and double-checking decimals...",
    "Making sure every peso finds its desk...",
    "Reviewing receipts with a magnifying glass...",
    "Organizing ledgers for learning...",
    "Counting coins...",
    "Preparing your financial report card...",
    "Ensuring every cent is in its seat...",
    "Counting coins and balancing books...",
    "Crunching numbers for your school’s success...",
    "Reviewing receipts and sharpening pencils...",
    "Auditing the piggy bank...",
    "Making sure every cent is accounted for...",
];

export const notificationIcons: Record<string, [React.ComponentType, string]> = {
    info: [IconInfoCircle, "blue"],
    warning: [IconInfoTriangle, "yellow"],
    error: [IconAlertCircle, "red"],
    success: [IconCircleCheck, "green"],
    mail: [IconMail, "pink"],
    security: [IconShieldLock, "orange"],
};

export const roles: Record<number, string> = {
    1: "Website Administrator",
    2: "Superintendent",
    3: "Administrator",
    4: "Principal",
    5: "Canteen Manager",
};

export const userAvatarConfig = {
    MAX_FILE_SIZE_MB: 2,
    ALLOWED_FILE_TYPES: ["image/jpeg", "image/jpg", "image/png", "image/webp"],
};

export const userSignatureConfig = {
    MAX_FILE_SIZE_MB: 1,
    ALLOWED_FILE_TYPES: ["image/jpeg", "image/jpg", "image/png", "image/webp"],
};
