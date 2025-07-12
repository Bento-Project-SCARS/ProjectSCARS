import { LocalStorage } from "@/lib/info";
import {
    UserPublic,
    getUserProfileEndpointV1UsersMeGet,
    getUserAvatarEndpointV1UsersAvatarGet,
} from "@/lib/api/csclient";
import { createContext, ReactNode, useContext, useEffect, useState, useCallback, useRef } from "react";
import { useAuth } from "@/lib/providers/auth";
import { customLogger } from "@/lib/api/customLogger";

interface UserContextType {
    userInfo: UserPublic | null;
    userPermissions: string[] | null;
    userAvatar: Blob | null;
    userAvatarUrl: string | null;
    updateUserInfo: (userInfo: UserPublic, permissions: string[] | null, userAvatar?: Blob | null) => void;
    clearUserInfo: () => void;
    refreshUserData: () => Promise<boolean>;
    checkForUpdates: () => Promise<boolean>;
    forceRefresh: () => Promise<boolean>;
}

interface UserProviderProps {
    children: ReactNode;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export function UserProvider({ children }: UserProviderProps): ReactNode {
    const [userInfo, setUserInfo] = useState<UserPublic | null>(null);
    const [userPermissions, setUserPermissions] = useState<string[] | null>(null);
    const [userAvatar, setUserAvatar] = useState<Blob | null>(null);
    const [userAvatarUrl, setUserAvatarUrl] = useState<string | null>(null);
    const lastCheckTimeRef = useRef<number>(0);
    const { isAuthenticated } = useAuth();

    useEffect(() => {
        const loadUserData = async () => {
            const storedUserInfo = localStorage.getItem(LocalStorage.userData);
            const storedUserPermissions = localStorage.getItem(LocalStorage.userPermissions);
            const storedUserAvatar = localStorage.getItem(LocalStorage.userAvatar);
            if (storedUserInfo) {
                setUserInfo(JSON.parse(storedUserInfo));
            }
            if (storedUserPermissions) {
                setUserPermissions(JSON.parse(storedUserPermissions));
            }
            if (storedUserAvatar) {
                try {
                    // Decode base64 data URL to blob
                    const response = await fetch(storedUserAvatar);
                    const avatarBlob = await response.blob();
                    setUserAvatar(avatarBlob);
                    setUserAvatarUrl((prevUrl) => {
                        if (prevUrl) {
                            URL.revokeObjectURL(prevUrl);
                        }
                        return URL.createObjectURL(avatarBlob);
                    });
                } catch (error) {
                    customLogger.error("Failed to decode user avatar:", error);
                }
            }
        };

        loadUserData();
    }, []);

    /**
     * Update the user information and optionally the user avatar.
     * @param {UserPublic} userInfo - The user information to set.
     * @param {string[]} permissions - The permissions of the user.
     * @param {Blob | null} userAvatar - The user avatar to set, if available.
     */
    const updateUserInfo = (userInfo: UserPublic, permissions?: string[] | null, userAvatar?: Blob | null) => {
        customLogger.debug("Setting user info", { userInfo, permissions, userAvatar });
        setUserInfo(userInfo);
        localStorage.setItem(LocalStorage.userData, JSON.stringify(userInfo));

        // Update permissions and avatar only if they are provided
        if (permissions) {
            setUserPermissions(permissions);
            localStorage.setItem(LocalStorage.userPermissions, JSON.stringify(permissions));
        } else {
            setUserPermissions(null);
            localStorage.removeItem(LocalStorage.userPermissions);
        }

        if (userAvatar) {
            setUserAvatar(userAvatar);
            setUserAvatarUrl((prevUrl) => {
                if (prevUrl) {
                    URL.revokeObjectURL(prevUrl);
                }
                return URL.createObjectURL(userAvatar);
            });
            const reader = new FileReader();
            reader.onload = () => {
                localStorage.setItem(LocalStorage.userAvatar, reader.result as string);
            };
            reader.readAsDataURL(userAvatar);
        } else {
            setUserAvatar(null);
            setUserAvatarUrl(null);
            localStorage.removeItem(LocalStorage.userAvatar);
        }
    };

    /**
     * Clear the user information and avatar.
     */
    const clearUserInfo = () => {
        setUserInfo(null);
        setUserPermissions(null);
        setUserAvatar(null);
        setUserAvatarUrl(null);
        localStorage.removeItem(LocalStorage.userData);
        localStorage.removeItem(LocalStorage.userPermissions);
        localStorage.removeItem(LocalStorage.userAvatar);
    };

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
    }, []);

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

    // Auto-check for updates periodically when user is authenticated
    useEffect(() => {
        if (!isAuthenticated) return;

        const userUpdateCheckInterval = setInterval(() => {
            checkForUpdates();
        }, 5 * 60 * 1000); // Check every 5 minutes

        return () => clearInterval(userUpdateCheckInterval);
    }, [isAuthenticated, checkForUpdates]);

    // Check for updates when user focuses the tab/window
    useEffect(() => {
        if (!isAuthenticated) return;

        const handleFocus = () => {
            checkForUpdates();
        };

        window.addEventListener("focus", handleFocus);
        return () => window.removeEventListener("focus", handleFocus);
    }, [isAuthenticated, checkForUpdates]);

    return (
        <UserContext.Provider
            value={{
                userInfo,
                userPermissions,
                userAvatar,
                userAvatarUrl,
                updateUserInfo,
                clearUserInfo,
                refreshUserData,
                checkForUpdates,
                forceRefresh,
            }}
        >
            {children}
        </UserContext.Provider>
    );
}

/**
 * Hook to access the user context.
 * This hook is used to access the user context in a component.
 * @returns {UserContextType} The user context containing the user information and avatar.
 */
export function useUser(): UserContextType {
    customLogger.debug("useUser called");
    const ctx = useContext(UserContext);
    if (!ctx) {
        const errorMessage = "useUser must be used within a UserProvider";
        customLogger.error(errorMessage);
        throw new Error(errorMessage);
    }
    return ctx;
}
