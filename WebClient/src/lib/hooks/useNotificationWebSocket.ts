import { useCallback, useEffect, useRef } from "react";
import { customLogger } from "@/lib/api/customLogger";
import { Notification } from "@/lib/api/csclient";

interface NotificationWebSocketEvent {
    type: "new_notification" | "notification_archived" | "notification_unarchived";
    notification_id: string;
    data: Record<string, unknown>;
    timestamp: number;
}

interface UseNotificationWebSocketProps {
    onNewNotification?: (notification: Notification) => void;
    onNotificationArchived?: (notificationId: string) => void;
    onNotificationUnarchived?: (notificationId: string) => void;
    enabled?: boolean;
}

/**
 * Hook for listening to notification-related WebSocket events
 * Listens for the custom 'websocket-notification' events dispatched by the main WebSocket hook
 */
export function useNotificationWebSocket({
    onNewNotification,
    onNotificationArchived,
    onNotificationUnarchived,
    enabled = true,
}: UseNotificationWebSocketProps) {
    const handlersRef = useRef({
        onNewNotification,
        onNotificationArchived,
        onNotificationUnarchived,
    });

    // Update handlers ref when props change
    useEffect(() => {
        handlersRef.current = {
            onNewNotification,
            onNotificationArchived,
            onNotificationUnarchived,
        };
    }, [onNewNotification, onNotificationArchived, onNotificationUnarchived]);

    const handleNotificationEvent = useCallback(
        (event: CustomEvent<NotificationWebSocketEvent>) => {
            if (!enabled) return;

            const { type, notification_id, data } = event.detail;
            const handlers = handlersRef.current;

            customLogger.debug("Processing notification WebSocket event", { type, notification_id });

            switch (type) {
                case "new_notification":
                    if (handlers.onNewNotification && data.notification) {
                        handlers.onNewNotification(data.notification as Notification);
                    }
                    break;

                case "notification_archived":
                    if (handlers.onNotificationArchived) {
                        handlers.onNotificationArchived(notification_id);
                    }
                    break;

                case "notification_unarchived":
                    if (handlers.onNotificationUnarchived) {
                        handlers.onNotificationUnarchived(notification_id);
                    }
                    break;

                default:
                    customLogger.debug("Unknown notification WebSocket event type", type);
            }
        },
        [enabled]
    );

    useEffect(() => {
        if (!enabled) return;

        // Listen for the custom notification events dispatched by the main WebSocket hook
        window.addEventListener("websocket-notification", handleNotificationEvent as EventListener);

        return () => {
            window.removeEventListener("websocket-notification", handleNotificationEvent as EventListener);
        };
    }, [enabled, handleNotificationEvent]);

    return {
        // Could add methods here to trigger notification actions if needed
    };
}
