/**
 * PWA utility functions
 */

/**
 * Check if the app is running as a PWA (installed)
 */
export function isPWA(): boolean {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(display-mode: standalone)").matches;
}

/**
 * Check if the device is iOS
 */
export function isIOS(): boolean {
    if (typeof window === "undefined") return false;
    return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

/**
 * Check if the device is Android
 */
export function isAndroid(): boolean {
    if (typeof window === "undefined") return false;
    return /Android/.test(navigator.userAgent);
}

/**
 * Check if PWA installation is supported
 */
export function isPWAInstallSupported(): boolean {
    if (typeof window === "undefined") return false;
    return "serviceWorker" in navigator && "PushManager" in window;
}

/**
 * Check if the app is running offline
 */
export function isOffline(): boolean {
    if (typeof window === "undefined") return false;
    return !navigator.onLine;
}

/**
 * Register service worker manually if needed
 */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
        return null;
    }

    try {
        const registration = await navigator.serviceWorker.register("/sw.js", {
            scope: "/",
        });

        console.log("Service Worker registered successfully:", registration);
        return registration;
    } catch (error) {
        console.error("Service Worker registration failed:", error);
        return null;
    }
}

/**
 * Get PWA display mode
 */
export function getPWADisplayMode(): string {
    if (typeof window === "undefined") return "browser";

    if (window.matchMedia("(display-mode: standalone)").matches) {
        return "standalone";
    }
    if (window.matchMedia("(display-mode: minimal-ui)").matches) {
        return "minimal-ui";
    }
    if (window.matchMedia("(display-mode: fullscreen)").matches) {
        return "fullscreen";
    }
    return "browser";
}

/**
 * Add to home screen prompt for iOS users
 */
export function showIOSInstallPrompt(): string {
    return `To install this app on your iOS device:
1. Tap the Share button (square with arrow pointing up)
2. Scroll down and tap "Add to Home Screen"
3. Tap "Add" in the top right corner`;
}

/**
 * Share content using Web Share API if available
 */
export async function shareContent(shareData: ShareData): Promise<boolean> {
    if (typeof navigator === "undefined" || !navigator.share) {
        return false;
    }

    try {
        await navigator.share(shareData);
        return true;
    } catch (error) {
        console.error("Error sharing:", error);
        return false;
    }
}
