import { getUserAvatarEndpointV1UsersAvatarGet, getUserProfileEndpointV1UsersMeGet } from "@/lib/api/csclient";
import { customLogger } from "@/lib/api/customLogger";
import { useAuth } from "@/lib/providers/auth";
import { useUser } from "@/lib/providers/user";
import { useCallback, useRef } from "react";

/**
 * Hook to synchronize user data between client and server
 * Automatically checks for server-side updates and refreshes local data when needed
 */
export function useUserSync() {
    const { userInfo, updateUserInfo } = useUser();
    const { isAuthenticated } = useAuth();
    const lastCheckTimeRef = useRef<number>(0);

    /**
     * Fetch fresh user data from server and update local context
     */
    const refreshUserData = useCallback(async (): Promise<boolean> => {
        try {
            const userInfoResult = await getUserProfileEndpointV1UsersMeGet();

            if (userInfoResult.data) {
                const [fetchedUserInfo, fetchedUserPermissions] = userInfoResult.data;

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
    }, [updateUserInfo]);

    /**
     * Check if local user data is outdated compared to server
     */
    const checkForUpdates = useCallback(async (): Promise<boolean> => {
        if (!isAuthenticated || !userInfo) {
            return false;
        }

        // Throttle checks to avoid excessive API calls
        const now = Date.now();
        if (now - lastCheckTimeRef.current < 30000) {
            // 30 seconds minimum between checks
            return false;
        }
        lastCheckTimeRef.current = now;

        try {
            const userInfoResult = await getUserProfileEndpointV1UsersMeGet();

            if (userInfoResult.data) {
                const [fetchedUserInfo] = userInfoResult.data;

                // Compare lastModified timestamps
                const localLastModified = new Date(userInfo.lastModified);
                const serverLastModified = new Date(fetchedUserInfo.lastModified);

                if (serverLastModified > localLastModified) {
                    customLogger.info("Server-side user data is newer. Refreshing local data...");
                    return await refreshUserData();
                }
            }
            return false;
        } catch (error) {
            customLogger.error("Failed to check for user updates:", error);
            return false;
        }
    }, [isAuthenticated, userInfo, refreshUserData]);

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
    };
}
