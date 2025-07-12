import { JwtToken } from "@/lib/api/csclient";
import { customLogger } from "@/lib/api/customLogger";
import { LocalStorage } from "@/lib/info";
import { performLogout } from "@/lib/utils/logout";

/**
 * Get the access token header for authenticated requests.
 * @returns {string} The access token header in the format "Bearer <token>".
 */
export function GetAccessTokenHeader(): string {
    customLogger.debug("Getting access token header");
    const storedToken = localStorage.getItem(LocalStorage.accessToken);
    if (storedToken === null) {
        customLogger.error("Access token is not set");
        throw new Error("Access token is not set");
    }

    const accessToken: JwtToken = JSON.parse(storedToken);
    return `Bearer ${accessToken.access_token}`;
}

/**
 * Check if user has "Remember Me" enabled by checking for refresh token in the stored JWT
 * @returns {boolean} Whether remember me is enabled
 */
export function IsRememberMeEnabled(): boolean {
    try {
        const storedToken = localStorage.getItem(LocalStorage.accessToken);
        if (!storedToken) return false;

        const token: JwtToken = JSON.parse(storedToken);
        return !!token.refresh_token;
    } catch (error) {
        customLogger.error("Error checking remember me status:", error);
        return false;
    }
}

/**
 * Get the stored refresh token from the JWT token object
 * @returns {string | null} The refresh token or null if not available
 */
export function GetRefreshToken(): string | null {
    try {
        const storedToken = localStorage.getItem(LocalStorage.accessToken);
        if (!storedToken) return null;

        const token: JwtToken = JSON.parse(storedToken);
        return token.refresh_token || null;
    } catch (error) {
        customLogger.error("Error getting refresh token:", error);
        return null;
    }
}

/**
 * Clear all authentication tokens using the centralized logout utility
 * @param redirect Whether to redirect to login page (default: false)
 */
export function ClearAuthTokens(redirect: boolean = false): void {
    performLogout(redirect);
}

/**
 * Check if access token exists in storage
 * Note: Since the server uses JWE (encrypted tokens), we cannot decode them client-side
 * to check expiration. Token validation is handled server-side and will return 401 when expired.
 * @returns {boolean} Whether the token is missing or invalid (true = missing/invalid, false = exists)
 */
export function IsAccessTokenMissing(): boolean {
    try {
        const storedToken = localStorage.getItem(LocalStorage.accessToken);
        if (!storedToken) return true;

        const token: JwtToken = JSON.parse(storedToken);
        if (!token.access_token) return true;

        // Since we're using JWE (encrypted tokens), we cannot decode them client-side
        // The server will validate the token and return 401 if expired
        // We can only check if the token exists in storage
        return false; // Token exists and appears valid, let server validate
    } catch (error) {
        customLogger.error("Error checking token existence:", error);
        return true; // Assume missing if we can't parse the stored token
    }
}

/**
 * Check if tokens exist and handle missing tokens
 * Since we use JWE tokens, actual expiration is validated server-side via 401 responses
 * This function only checks if tokens exist in storage and logs out if completely missing
 * @param logoutCallback - Function to call when auto-logout is needed
 */
export function CheckAndHandleMissingTokens(logoutCallback: () => void): void {
    const storedToken = localStorage.getItem(LocalStorage.accessToken);
    if (!storedToken) {
        customLogger.info("No access token found in storage. Logging out.");
        logoutCallback();
        return;
    }

    try {
        const token: JwtToken = JSON.parse(storedToken);
        if (!token.access_token) {
            customLogger.info("Invalid access token format. Logging out.");
            logoutCallback();
            return;
        }

        // Token exists and appears valid - actual expiration will be handled
        // by the customClient's 401 error handling and automatic refresh logic
        customLogger.debug("Access token exists in storage. Server will validate expiration.");
    } catch (error) {
        customLogger.error("Error parsing stored token:", error);
        logoutCallback();
    }
}
