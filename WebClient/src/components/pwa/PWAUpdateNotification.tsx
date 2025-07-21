"use client";

import { Button, Group, Notification } from "@mantine/core";
import { IconDownload } from "@tabler/icons-react";
import { useEffect, useState } from "react";

export function PWAUpdateNotification() {
    const [showUpdate, setShowUpdate] = useState(false);
    const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);
    const [isMounted, setIsMounted] = useState(false);

    useEffect(() => {
        setIsMounted(true);

        if ("serviceWorker" in navigator) {
            navigator.serviceWorker.ready.then((reg) => {
                setRegistration(reg);

                // Listen for updates
                reg.addEventListener("updatefound", () => {
                    const newWorker = reg.installing;
                    if (newWorker) {
                        newWorker.addEventListener("statechange", () => {
                            if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
                                setShowUpdate(true);
                            }
                        });
                    }
                });
            });

            // Listen for controlling change (when new SW takes control)
            navigator.serviceWorker.addEventListener("controllerchange", () => {
                window.location.reload();
            });
        }
    }, []);

    const handleUpdate = () => {
        if (registration?.waiting) {
            registration.waiting.postMessage({ type: "SKIP_WAITING" });
        }
        setShowUpdate(false);
    };

    const handleDismiss = () => {
        setShowUpdate(false);
    };

    if (!isMounted || !showUpdate) return null;

    return (
        <Notification
            style={{
                position: "fixed",
                bottom: 16,
                right: 16,
                zIndex: 1000,
                maxWidth: 400,
            }}
            icon={<IconDownload size={16} />}
            color="blue"
            title="Update Available"
            onClose={handleDismiss}
        >
            <Group justify="apart" mt="xs">
                <span>A new version of the app is available.</span>
                <Group gap="xs">
                    <Button size="xs" variant="light" onClick={handleDismiss}>
                        Later
                    </Button>
                    <Button size="xs" onClick={handleUpdate}>
                        Update
                    </Button>
                </Group>
            </Group>
        </Notification>
    );
}
