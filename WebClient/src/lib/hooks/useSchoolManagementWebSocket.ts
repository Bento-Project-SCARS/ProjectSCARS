import { customLogger } from "@/lib/api/customLogger";
import { type School } from "@/lib/api/csclient";
import { useEffect } from "react";

interface SchoolManagementEvent {
    type: "school_created" | "school_updated" | "school_deleted" | "school_deactivated" | "school_reactivated";
    school_id: string;
    data: Record<string, unknown>;
    timestamp: number;
}

interface UseSchoolManagementWebSocketOptions {
    onSchoolCreated?: (school: School) => void;
    onSchoolUpdated?: (schoolId: string, data: Record<string, unknown>) => void;
    onSchoolDeleted?: (schoolId: string) => void;
    onSchoolDeactivated?: (schoolId: string) => void;
    onSchoolReactivated?: (schoolId: string) => void;
    enabled?: boolean;
}

/**
 * Hook for listening to school management WebSocket events
 */
export function useSchoolManagementWebSocket(options: UseSchoolManagementWebSocketOptions) {
    const {
        onSchoolCreated,
        onSchoolUpdated,
        onSchoolDeleted,
        onSchoolDeactivated,
        onSchoolReactivated,
        enabled = true,
    } = options;

    useEffect(() => {
        if (!enabled) return;

        const handleSchoolManagementEvent = (event: CustomEvent<SchoolManagementEvent>) => {
            const { type, school_id, data } = event.detail;

            customLogger.debug("Received school management event", { type, school_id, data });

            switch (type) {
                case "school_created":
                    if (onSchoolCreated && data.school) {
                        onSchoolCreated(data.school as School);
                    }
                    break;

                case "school_updated":
                    if (onSchoolUpdated) {
                        onSchoolUpdated(school_id, data);
                    }
                    break;

                case "school_deleted":
                    if (onSchoolDeleted) {
                        onSchoolDeleted(school_id);
                    }
                    break;

                case "school_deactivated":
                    if (onSchoolDeactivated) {
                        onSchoolDeactivated(school_id);
                    }
                    break;

                case "school_reactivated":
                    if (onSchoolReactivated) {
                        onSchoolReactivated(school_id);
                    }
                    break;

                default:
                    customLogger.warn("Unknown school management event type", type);
            }
        };

        window.addEventListener("websocket-school-management", handleSchoolManagementEvent as EventListener);

        return () => {
            window.removeEventListener("websocket-school-management", handleSchoolManagementEvent as EventListener);
        };
    }, [enabled, onSchoolCreated, onSchoolUpdated, onSchoolDeleted, onSchoolDeactivated, onSchoolReactivated]);
}
