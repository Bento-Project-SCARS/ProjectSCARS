import { Button } from "@mantine/core";
import { useUserSyncControls } from "@/lib/hooks/useUserSyncControls";
import { IconRefresh } from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import { customLogger } from "@/lib/api/customLogger";
import { parseAPIError } from "@/lib/utils/errorParser";

interface UserSyncButtonProps {
    variant?: "default" | "filled" | "outline" | "light" | "subtle" | "transparent";
    size?: "compact-xs" | "compact-sm" | "compact-md" | "compact-lg" | "compact-xl" | "xs" | "sm" | "md" | "lg" | "xl";
    showText?: boolean;
    className?: string;
}

/**
 * Button component to manually refresh user data
 */
export function UserSyncButton({
    variant = "outline",
    size = "sm",
    showText = true,
    className = "",
}: UserSyncButtonProps) {
    const { triggerRefresh, isRefreshing } = useUserSyncControls();

    const handleRefresh = async () => {
        try {
            const success = await triggerRefresh();
            if (success) {
                notifications.show({
                    title: "Profile Updated",
                    message: "Your profile data has been refreshed successfully",
                    color: "green",
                });
            } else {
                const parsedError = parseAPIError(
                    new Error("Profile refresh failed"),
                    "profile_refresh",
                    "Profile Refresh Failed"
                );
                notifications.show({
                    title: parsedError.title,
                    message: parsedError.message,
                    color: "red",
                    autoClose: parsedError.isUserFriendly ? 5000 : 10000,
                });
            }
        } catch (error) {
            customLogger.error("Error refreshing user data:", error);
            const parsedError = parseAPIError(error, "profile_refresh", "Profile Refresh Error");
            notifications.show({
                title: parsedError.title,
                message: parsedError.message,
                color: "red",
                autoClose: parsedError.isUserFriendly ? 5000 : 10000,
            });
        }
    };

    return (
        <Button
            variant={variant}
            size={size}
            onClick={handleRefresh}
            disabled={isRefreshing}
            className={className}
            leftSection={<IconRefresh className={isRefreshing ? "animate-spin" : ""} size={16} />}
        >
            {showText && (isRefreshing ? "Refreshing..." : "Refresh Profile")}
        </Button>
    );
}
