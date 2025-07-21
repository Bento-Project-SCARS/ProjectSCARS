"use client";

import { Button, Group, Modal, Text, Stack } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { IconDownload, IconX } from "@tabler/icons-react";
import { useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
    readonly platforms: string[];
    readonly userChoice: Promise<{
        outcome: "accepted" | "dismissed";
        platform: string;
    }>;
    prompt(): Promise<void>;
}

export function PWAInstallPrompt() {
    const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
    const [isInstallable, setIsInstallable] = useState(false);
    const [isInstalled, setIsInstalled] = useState(false);
    const [opened, { open, close }] = useDisclosure(false);
    const [isIOS, setIsIOS] = useState(false);

    useEffect(() => {
        // Check if running as PWA
        setIsInstalled(window.matchMedia("(display-mode: standalone)").matches);

        // Check if iOS
        setIsIOS(/iPad|iPhone|iPod/.test(navigator.userAgent));

        // Listen for the beforeinstallprompt event
        const handleBeforeInstallPrompt = (e: BeforeInstallPromptEvent) => {
            e.preventDefault();
            setInstallPrompt(e);
            setIsInstallable(true);
        };

        window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt as EventListener);

        return () => {
            window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt as EventListener);
        };
    }, []);

    const handleInstall = async () => {
        if (!installPrompt) return;

        installPrompt.prompt();
        const { outcome } = await installPrompt.userChoice;

        if (outcome === "accepted") {
            setIsInstallable(false);
            setInstallPrompt(null);
        }
        close();
    };

    const handleIOSInstall = () => {
        open();
    };

    // Don't show if already installed
    if (isInstalled) return null;

    return (
        <>
            {/* Install button for supported browsers */}
            {isInstallable && (
                <Button leftSection={<IconDownload size={16} />} variant="light" size="sm" onClick={handleInstall}>
                    Install App
                </Button>
            )}

            {/* Install button for iOS */}
            {isIOS && !isInstallable && (
                <Button leftSection={<IconDownload size={16} />} variant="light" size="sm" onClick={handleIOSInstall}>
                    Install App
                </Button>
            )}

            {/* iOS Install Instructions Modal */}
            <Modal opened={opened} onClose={close} title="Install ProjectSCARS" centered>
                <Stack gap="md">
                    <Text>
                        To install this app on your iOS device, tap the share button{" "}
                        <span role="img" aria-label="share icon">
                            📤
                        </span>{" "}
                        and then &ldquo;Add to Home Screen&rdquo;{" "}
                        <span role="img" aria-label="plus icon">
                            ➕
                        </span>
                        .
                    </Text>
                    <Group justify="flex-end">
                        <Button variant="light" onClick={close} leftSection={<IconX size={16} />}>
                            Close
                        </Button>
                    </Group>
                </Stack>
            </Modal>
        </>
    );
}
