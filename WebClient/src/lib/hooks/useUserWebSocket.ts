import {
    getUserAvatarEndpointV1UsersAvatarGet,
    getUserProfileEndpointV1UsersMeGet,
    JwtToken,
} from "@/lib/api/csclient";
import { customLogger } from "@/lib/api/customLogger";
import { LocalStorage } from "@/lib/info";
import { useAuth } from "@/lib/providers/auth";
import { useUser } from "@/lib/providers/user";
import { performLogout } from "@/lib/utils/logout";
import { useCallback, useEffect, useRef } from "react";
import useWebSocket, { ReadyState } from "react-use-websocket";

/**
 * WebSocket message types that can be received from the server
 */
interface WebSocketMessage {
    type: string;
    [key: string]: unknown;
}

interface UserUpdateMessage extends WebSocketMessage {
    type: "user_update";
    update_type: "profile_updated" | "avatar_updated" | "signature_updated" | "password_changed" | "user_deactivated";
    user_id: string;
    data: Record<string, unknown>;
    timestamp: number;
}

interface NotificationMessage extends WebSocketMessage {
    type: "notification";
    notification_type: "new_notification" | "notification_archived" | "notification_unarchived";
    notification_id: string;
    data: Record<string, unknown>;
    timestamp: number;
}

interface UserManagementMessage extends WebSocketMessage {
    type: "user_management";
    management_type: "user_created" | "user_updated" | "user_deleted" | "user_deactivated" | "user_reactivated";
    user_id: string;
    data: Record<string, unknown>;
    timestamp: number;
}

interface SchoolManagementMessage extends WebSocketMessage {
    type: "school_management";
    management_type:
        | "school_created"
        | "school_updated"
        | "school_deleted"
        | "school_deactivated"
        | "school_reactivated";
    school_id: string;
    data: Record<string, unknown>;
    timestamp: number;
}

interface ConnectionEstablishedMessage extends WebSocketMessage {
    type: "connection_established";
    user_id: string;
    timestamp: number;
}

/**
 * Hook for managing WebSocket connection for real-time user updates
 */
export function useUserWebSocket() {
    const { isAuthenticated } = useAuth();
    const { userInfo, updateUserInfo } = useUser();
    const lastPingTimeRef = useRef<number>(0);
    const reconnectAttemptsRef = useRef<number>(0);
    const maxReconnectAttempts = 5;

    // Get access token from localStorage
    const getAccessToken = useCallback((): string | null => {
        try {
            const storedToken = localStorage.getItem(LocalStorage.accessToken);
            if (!storedToken) return null;

            const tokenObj: JwtToken = JSON.parse(storedToken);
            return tokenObj.access_token || null;
        } catch (error) {
            customLogger.error("Failed to get access token for WebSocket:", error);
            return null;
        }
    }, []);

    // Construct WebSocket URL with authentication token
    const socketUrl = useCallback(() => {
        if (!isAuthenticated) {
            return null;
        }

        const token = getAccessToken();
        if (!token) {
            return null;
        }

        // Use the API base URL to construct the WebSocket URL
        const baseUrl = process.env.NEXT_PUBLIC_CENTRAL_SERVER_ENDPOINT || "http://localhost:8000";
        const wsUrl = baseUrl.replace(/^http/, "ws");
        return `${wsUrl}/v1/ws/user-updates?token=${encodeURIComponent(token)}`;
    }, [isAuthenticated, getAccessToken]);

    const { sendMessage, lastMessage, readyState } = useWebSocket(socketUrl(), {
        onOpen: () => {
            customLogger.info("WebSocket connection established");
            reconnectAttemptsRef.current = 0;
        },
        onClose: (event) => {
            customLogger.info("WebSocket connection closed", { code: event.code, reason: event.reason });
        },
        onError: (event) => {
            customLogger.error("WebSocket error", event);
        },
        onMessage: (event) => {
            customLogger.debug("WebSocket message received", event.data);
        },
        shouldReconnect: (closeEvent) => {
            // Don't reconnect if the user is not authenticated
            if (!isAuthenticated) {
                return false;
            }

            // Don't reconnect if we've exceeded max attempts
            if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
                customLogger.warn("Max WebSocket reconnection attempts reached");
                return false;
            }

            // Don't reconnect on authentication failures
            if (closeEvent.code === 4001) {
                customLogger.warn("WebSocket authentication failed, not reconnecting");
                return false;
            }

            reconnectAttemptsRef.current++;
            customLogger.info(
                `Attempting WebSocket reconnection (${reconnectAttemptsRef.current}/${maxReconnectAttempts})`
            );
            return true;
        },
        reconnectAttempts: maxReconnectAttempts,
        reconnectInterval: (attemptNumber) => Math.min(Math.pow(2, attemptNumber) * 1000, 10000),
    });

    /**
     * Send a ping message to keep the connection alive
     */
    const sendPing = useCallback(() => {
        if (readyState === ReadyState.OPEN) {
            const now = Date.now();
            lastPingTimeRef.current = now;
            sendMessage(
                JSON.stringify({
                    type: "ping",
                    timestamp: now,
                })
            );
        }
    }, [readyState, sendMessage]);

    /**
     * Refresh user data from the server
     */
    const refreshUserData = useCallback(async (): Promise<boolean> => {
        try {
            const userInfoResult = await getUserProfileEndpointV1UsersMeGet();

            if (userInfoResult.data) {
                const [fetchedUserInfo, fetchedUserPermissions] = userInfoResult.data;

                // Check if user has been deactivated and log them out if so
                if (fetchedUserInfo.deactivated) {
                    customLogger.warn("User account has been deactivated during WebSocket refresh. Logging out...");
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
    }, [updateUserInfo]);

    /**
     * Handle incoming WebSocket messages
     */
    const handleMessage = useCallback(
        async (message: WebSocketMessage) => {
            switch (message.type) {
                case "connection_established": {
                    const connectionMsg = message as ConnectionEstablishedMessage;
                    customLogger.info("WebSocket connection established for user", connectionMsg.user_id);
                    break;
                }

                case "user_update": {
                    const updateMsg = message as UserUpdateMessage;

                    // Only process updates for the current user
                    if (updateMsg.user_id === userInfo?.id) {
                        customLogger.info("Received user update", {
                            updateType: updateMsg.update_type,
                            userId: updateMsg.user_id,
                        });

                        switch (updateMsg.update_type) {
                            case "profile_updated":
                                // Refresh all user data for profile updates
                                await refreshUserData();
                                break;

                            case "avatar_updated":
                                // Refresh user data to get the new avatar
                                await refreshUserData();
                                break;

                            case "signature_updated":
                                // Refresh user data to get the new signature
                                await refreshUserData();
                                break;

                            case "password_changed":
                                // For password changes, we might just update the lastModified timestamp
                                // The user will need to re-authenticate on next session
                                customLogger.info(
                                    "Password changed, user will need to re-authenticate on next session"
                                );
                                break;

                            case "user_deactivated":
                                // User has been deactivated, log them out immediately
                                customLogger.warn("User account has been deactivated via WebSocket. Logging out...");
                                performLogout(true);
                                break;

                            default:
                                customLogger.warn("Unknown user update type", updateMsg.update_type);
                        }
                    }
                    break;
                }

                case "notification": {
                    const notificationMsg = message as NotificationMessage;
                    customLogger.info("Received notification WebSocket message", {
                        type: notificationMsg.notification_type,
                        notification_id: notificationMsg.notification_id,
                    });

                    // Dispatch custom event for notification updates
                    // This allows other components to listen for notification changes
                    const notificationEvent = new CustomEvent("websocket-notification", {
                        detail: {
                            type: notificationMsg.notification_type,
                            notification_id: notificationMsg.notification_id,
                            data: notificationMsg.data,
                            timestamp: notificationMsg.timestamp,
                        },
                    });
                    window.dispatchEvent(notificationEvent);
                    break;
                }

                case "user_management": {
                    const userMgmtMsg = message as UserManagementMessage;
                    customLogger.info("Received user management WebSocket message", {
                        type: userMgmtMsg.management_type,
                        user_id: userMgmtMsg.user_id,
                    });

                    // Dispatch custom event for user management updates
                    const userMgmtEvent = new CustomEvent("websocket-user-management", {
                        detail: {
                            type: userMgmtMsg.management_type,
                            user_id: userMgmtMsg.user_id,
                            data: userMgmtMsg.data,
                            timestamp: userMgmtMsg.timestamp,
                        },
                    });
                    window.dispatchEvent(userMgmtEvent);
                    break;
                }

                case "school_management": {
                    const schoolMgmtMsg = message as SchoolManagementMessage;
                    customLogger.info("Received school management WebSocket message", {
                        type: schoolMgmtMsg.management_type,
                        school_id: schoolMgmtMsg.school_id,
                    });

                    // Dispatch custom event for school management updates
                    const schoolMgmtEvent = new CustomEvent("websocket-school-management", {
                        detail: {
                            type: schoolMgmtMsg.management_type,
                            school_id: schoolMgmtMsg.school_id,
                            data: schoolMgmtMsg.data,
                            timestamp: schoolMgmtMsg.timestamp,
                        },
                    });
                    window.dispatchEvent(schoolMgmtEvent);
                    break;
                }

                case "pong": {
                    const pingTime = lastPingTimeRef.current;
                    if (pingTime > 0) {
                        const roundTripTime = Date.now() - pingTime;
                        customLogger.debug("WebSocket ping response", { roundTripTime });
                    }
                    break;
                }

                default:
                    customLogger.debug("Unknown WebSocket message type", message.type);
            }
        },
        [userInfo?.id, refreshUserData]
    );

    /**
     * Process the last received message
     */
    useEffect(() => {
        if (lastMessage?.data) {
            try {
                const message: WebSocketMessage = JSON.parse(lastMessage.data);
                handleMessage(message);
            } catch (error) {
                customLogger.error("Failed to parse WebSocket message", error);
            }
        }
    }, [lastMessage, handleMessage]);

    /**
     * Set up periodic ping to keep connection alive
     */
    useEffect(() => {
        if (readyState === ReadyState.OPEN) {
            // Send ping every 30 seconds
            const pingInterval = setInterval(sendPing, 30000);
            return () => clearInterval(pingInterval);
        }
    }, [readyState, sendPing]);

    /**
     * Reset reconnection attempts when connection is successful
     */
    useEffect(() => {
        if (readyState === ReadyState.OPEN) {
            reconnectAttemptsRef.current = 0;
        }
    }, [readyState]);

    return {
        readyState,
        isConnected: readyState === ReadyState.OPEN,
        isConnecting: readyState === ReadyState.CONNECTING,
        connectionStatus: {
            [ReadyState.UNINSTANTIATED]: "Uninstantiated",
            [ReadyState.CONNECTING]: "Connecting",
            [ReadyState.OPEN]: "Connected",
            [ReadyState.CLOSING]: "Closing",
            [ReadyState.CLOSED]: "Closed",
        }[readyState],
        sendPing,
        refreshUserData,
    };
}
