import { customLogger } from "@/lib/api/customLogger";
import { type UserPublic } from "@/lib/api/csclient";
import { useEffect } from "react";

interface UserManagementEvent {
    type: "user_created" | "user_updated" | "user_deleted" | "user_deactivated" | "user_reactivated";
    user_id: string;
    data: Record<string, unknown>;
    timestamp: number;
}

interface UseUserManagementWebSocketOptions {
    onUserCreated?: (user: UserPublic) => void;
    onUserUpdated?: (userId: string, data: Record<string, unknown>) => void;
    onUserDeleted?: (userId: string) => void;
    onUserDeactivated?: (userId: string) => void;
    onUserReactivated?: (userId: string) => void;
    enabled?: boolean;
}

/**
 * Hook for listening to user management WebSocket events
 */
export function useUserManagementWebSocket(options: UseUserManagementWebSocketOptions) {
    const {
        onUserCreated,
        onUserUpdated,
        onUserDeleted,
        onUserDeactivated,
        onUserReactivated,
        enabled = true,
    } = options;

    useEffect(() => {
        if (!enabled) return;

        const handleUserManagementEvent = (event: CustomEvent<UserManagementEvent>) => {
            const { type, user_id, data } = event.detail;

            customLogger.debug("Received user management event", { type, user_id, data });

            switch (type) {
                case "user_created":
                    if (onUserCreated && data.user) {
                        onUserCreated(data.user as UserPublic);
                    }
                    break;

                case "user_updated":
                    if (onUserUpdated) {
                        onUserUpdated(user_id, data);
                    }
                    break;

                case "user_deleted":
                    if (onUserDeleted) {
                        onUserDeleted(user_id);
                    }
                    break;

                case "user_deactivated":
                    if (onUserDeactivated) {
                        onUserDeactivated(user_id);
                    }
                    break;

                case "user_reactivated":
                    if (onUserReactivated) {
                        onUserReactivated(user_id);
                    }
                    break;

                default:
                    customLogger.warn("Unknown user management event type", type);
            }
        };

        window.addEventListener("websocket-user-management", handleUserManagementEvent as EventListener);

        return () => {
            window.removeEventListener("websocket-user-management", handleUserManagementEvent as EventListener);
        };
    }, [enabled, onUserCreated, onUserUpdated, onUserDeleted, onUserDeactivated, onUserReactivated]);
}
