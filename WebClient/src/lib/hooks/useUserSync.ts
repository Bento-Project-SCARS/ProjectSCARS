import { getUserAvatarEndpointV1UsersAvatarGet, getUserProfileEndpointV1UsersMeGet } from "@/lib/api/csclient";
import { customLogger } from "@/lib/api/customLogger";
import { useAuth } from "@/lib/providers/auth";
import { useUser } from "@/lib/providers/user";
import { performLogout } from "@/lib/utils/logout";
import { useCallback, useRef } from "react";
import { useUserWebSocket } from "./useUserWebSocket";

/**
 * Hook to synchronize user data between client and server
 * Automatically checks for server-side updates and refreshes local data when needed.
 * Integrates with WebSocket for real-time updates and falls back to polling when WebSocket is unavailable.
 */
export function useUserSync() {
    const { userInfo, updateUserInfo } = useUser();
    const { isAuthenticated } = useAuth();
    const { isConnected: wsConnected, refreshUserData: wsRefreshUserData } = useUserWebSocket();
    const lastCheckTimeRef = useRef<number>(0);

    /**
     * Fetch fresh user data from server and update local context
     * Uses WebSocket refresh method when available for consistency
     */
    const refreshUserData = useCallback(async (): Promise<boolean> => {
        try {
            // Use WebSocket refresh method if available, otherwise use direct API call
            if (wsConnected && wsRefreshUserData) {
                return await wsRefreshUserData();
            }

            // Fallback to direct API call
            const userInfoResult = await getUserProfileEndpointV1UsersMeGet();

            if (userInfoResult.data) {
                const [fetchedUserInfo, fetchedUserPermissions] = userInfoResult.data;

                // Check if user has been deactivated and log them out if so
                if (fetchedUserInfo.deactivated) {
                    customLogger.warn("User account has been deactivated. Logging out...");
                    performLogout(true);
                    return false; // Don't continue with the update
                }

                // Get user avatar if available
                let userAvatar: Blob | null = null;
                if (fetchedUserInfo.avatarUrn) {
                    try {
                        const avatarResult = await getUserAvatarEndpointV1UsersAvatarGet({
                            query: {
                                fn: fetchedUserInfo.avatarUrn,
                            },
                        });
                        if (avatarResult.data) {
                            userAvatar = avatarResult.data as Blob;
                        }
                    } catch (error) {
                        customLogger.warn("Failed to fetch user avatar:", error);
                    }
                }

                updateUserInfo(fetchedUserInfo, fetchedUserPermissions, userAvatar);
                return true;
            }
            return false;
        } catch (error) {
            customLogger.error("Failed to refresh user data:", error);
            return false;
        }
    }, [updateUserInfo, wsConnected, wsRefreshUserData]);

    /**
     * Check if local user data is outdated compared to server
     * When WebSocket is connected, this is used as a fallback/validation mechanism
     * When WebSocket is not connected, this is the primary sync mechanism
     */
    const checkForUpdates = useCallback(async (): Promise<boolean> => {
        if (!isAuthenticated || !userInfo) {
            return false;
        }

        // Determine throttle interval based on WebSocket connection status
        const throttleInterval = wsConnected ? 60000 : 10000; // 1 minute if WS connected, 10 seconds otherwise

        // Throttle checks to avoid excessive API calls
        const now = Date.now();
        if (now - lastCheckTimeRef.current < throttleInterval) {
            return false;
        }
        lastCheckTimeRef.current = now;

        // If WebSocket is connected, we mainly rely on real-time updates
        // so we can be less aggressive with polling
        if (wsConnected) {
            customLogger.debug("WebSocket connected, performing periodic validation check");
        } else {
            customLogger.debug("WebSocket not connected, performing regular sync check");
        }

        try {
            const userInfoResult = await getUserProfileEndpointV1UsersMeGet();

            if (userInfoResult.data) {
                const [fetchedUserInfo] = userInfoResult.data;

                // Check if user has been deactivated and log them out if so
                if (fetchedUserInfo.deactivated) {
                    customLogger.warn("User account has been deactivated during update check. Logging out...");
                    performLogout(true);
                    return false; // Don't continue with the comparison
                }

                // Compare lastModified timestamps
                const localLastModified = new Date(userInfo.lastModified);
                const serverLastModified = new Date(fetchedUserInfo.lastModified);

                if (serverLastModified > localLastModified) {
                    const timeDiff = serverLastModified.getTime() - localLastModified.getTime();
                    customLogger.info(
                        `Server-side user data is newer by ${Math.round(timeDiff / 1000)}s. Refreshing local data...`,
                        { wsConnected }
                    );
                    return await refreshUserData();
                }
            }
            return false;
        } catch (error) {
            customLogger.error("Failed to check for user updates:", error);
            return false;
        }
    }, [isAuthenticated, userInfo, refreshUserData, wsConnected]);

    /**
     * Force refresh user data (useful for manual refresh)
     */
    const forceRefresh = useCallback(async (): Promise<boolean> => {
        lastCheckTimeRef.current = 0; // Reset throttle
        return await refreshUserData();
    }, [refreshUserData]);

    return {
        refreshUserData,
        checkForUpdates,
        forceRefresh,
        // WebSocket-related status
        isWebSocketConnected: wsConnected,
        syncMethod: wsConnected ? "websocket" : "polling",
    };
}
