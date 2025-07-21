import { customLogger } from "@/lib/api/customLogger";
import { useUserWebSocket } from "@/lib/hooks/useUserWebSocket";
import { useAuth } from "@/lib/providers/auth";
import React, { createContext, useContext, useEffect } from "react";

interface WebSocketContextValue {
    isConnected: boolean;
    isConnecting: boolean;
    connectionStatus: string;
    sendPing: () => void;
}

const WebSocketContext = createContext<WebSocketContextValue | undefined>(undefined);

export function useWebSocketContext() {
    const context = useContext(WebSocketContext);
    if (context === undefined) {
        throw new Error("useWebSocketContext must be used within a WebSocketProvider");
    }
    return context;
}

interface WebSocketProviderProps {
    children: React.ReactNode;
}

/**
 * Provider that manages the WebSocket connection for real-time user updates
 * Should be placed inside the AuthProvider to ensure authentication is available
 */
export function WebSocketProvider({ children }: WebSocketProviderProps) {
    const { isAuthenticated } = useAuth();
    const { isConnected, isConnecting, connectionStatus, sendPing, readyState } = useUserWebSocket();

    // Log connection status changes for debugging
    useEffect(() => {
        if (isAuthenticated) {
            customLogger.info(`WebSocket status: ${connectionStatus}`, {
                isConnected,
                isConnecting,
                readyState,
            });
        }
    }, [isAuthenticated, connectionStatus, isConnected, isConnecting, readyState]);

    const contextValue: WebSocketContextValue = {
        isConnected,
        isConnecting,
        connectionStatus,
        sendPing,
    };

    return <WebSocketContext.Provider value={contextValue}>{children}</WebSocketContext.Provider>;
}
