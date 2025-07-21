"use client";

import { Alert, Transition } from "@mantine/core";
import { IconWifiOff, IconWifi } from "@tabler/icons-react";
import { useEffect, useState } from "react";

export function PWAConnectionStatus() {
    const [isOnline, setIsOnline] = useState(true);
    const [showOfflineAlert, setShowOfflineAlert] = useState(false);
    const [isMounted, setIsMounted] = useState(false);

    useEffect(() => {
        setIsMounted(true);

        const updateOnlineStatus = () => {
            setIsOnline(navigator.onLine);
            if (!navigator.onLine) {
                setShowOfflineAlert(true);
            } else {
                // Hide the alert after a short delay when coming back online
                setTimeout(() => setShowOfflineAlert(false), 3000);
            }
        };

        // Set initial status
        setIsOnline(navigator.onLine);

        // Listen for online/offline events
        window.addEventListener("online", updateOnlineStatus);
        window.addEventListener("offline", updateOnlineStatus);

        return () => {
            window.removeEventListener("online", updateOnlineStatus);
            window.removeEventListener("offline", updateOnlineStatus);
        };
    }, []);

    if (!isMounted) {
        return null;
    }

    return (
        <Transition mounted={showOfflineAlert} transition="slide-down" duration={300} timingFunction="ease">
            {(styles) => (
                <Alert
                    style={{
                        ...styles,
                        position: "fixed",
                        top: 0,
                        left: 0,
                        right: 0,
                        zIndex: 1000,
                        borderRadius: 0,
                    }}
                    icon={isOnline ? <IconWifi size={16} /> : <IconWifiOff size={16} />}
                    color={isOnline ? "green" : "orange"}
                    variant="filled"
                >
                    {isOnline
                        ? "Connection restored! You're back online."
                        : "You're offline. Some features may not be available."}
                </Alert>
            )}
        </Transition>
    );
}
