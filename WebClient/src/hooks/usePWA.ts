"use client";

import { useEffect, useState } from "react";
import { isPWA, isOffline, getPWADisplayMode } from "@/lib/pwa";

interface BeforeInstallPromptEvent extends Event {
    readonly platforms: string[];
    readonly userChoice: Promise<{
        outcome: "accepted" | "dismissed";
        platform: string;
    }>;
    prompt(): Promise<void>;
}

export function usePWA() {
    const [isInstalled, setIsInstalled] = useState(false);
    const [isOnline, setIsOnline] = useState(true);
    const [displayMode, setDisplayMode] = useState<string>("browser");
    const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
    const [canInstall, setCanInstall] = useState(false);

    useEffect(() => {
        // Set initial states
        setIsInstalled(isPWA());
        setIsOnline(!isOffline());
        setDisplayMode(getPWADisplayMode());

        // Listen for install prompt
        const handleBeforeInstallPrompt = (e: BeforeInstallPromptEvent) => {
            e.preventDefault();
            setInstallPrompt(e);
            setCanInstall(true);
        };

        // Listen for online/offline changes
        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);

        // Listen for display mode changes
        const handleDisplayModeChange = () => {
            setDisplayMode(getPWADisplayMode());
            setIsInstalled(isPWA());
        };

        // Add event listeners
        window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt as EventListener);
        window.addEventListener("online", handleOnline);
        window.addEventListener("offline", handleOffline);

        // Listen for display mode changes
        const standaloneQuery = window.matchMedia("(display-mode: standalone)");
        standaloneQuery.addEventListener("change", handleDisplayModeChange);

        return () => {
            window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt as EventListener);
            window.removeEventListener("online", handleOnline);
            window.removeEventListener("offline", handleOffline);
            standaloneQuery.removeEventListener("change", handleDisplayModeChange);
        };
    }, []);

    const install = async (): Promise<boolean> => {
        if (!installPrompt) return false;

        try {
            await installPrompt.prompt();
            const { outcome } = await installPrompt.userChoice;

            if (outcome === "accepted") {
                setCanInstall(false);
                setInstallPrompt(null);
                return true;
            }
            return false;
        } catch (error) {
            console.error("Error during installation:", error);
            return false;
        }
    };

    return {
        isInstalled,
        isOnline,
        displayMode,
        canInstall,
        install,
    };
}
