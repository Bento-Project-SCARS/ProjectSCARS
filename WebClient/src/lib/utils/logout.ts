import { customLogger } from "@/lib/api/customLogger";
import { LocalStorage } from "@/lib/info";

/**
 * Centralized logout utility that clears all authentication data and redirects to login.
 * This function can be called from anywhere in the application to perform a complete logout.
 *
 * @param redirect - Whether to redirect to login page (default: true)
 */
export function performLogout(redirect: boolean = true): void {
    customLogger.debug("🚪 Performing complete logout...");

    // Clear all authentication and user data from localStorage
    localStorage.removeItem(LocalStorage.accessToken);
    localStorage.removeItem(LocalStorage.userData);
    localStorage.removeItem(LocalStorage.userPermissions);
    localStorage.removeItem(LocalStorage.userAvatar);
    localStorage.removeItem(LocalStorage.userPreferences);
    localStorage.removeItem(LocalStorage.setupCompleteDismissed);

    // Redirect to login page if requested and we're in a browser environment
    if (redirect && typeof window !== "undefined") {
        customLogger.debug("🔄 Redirecting to login page...");
        window.location.href = "/login";
    }
}
