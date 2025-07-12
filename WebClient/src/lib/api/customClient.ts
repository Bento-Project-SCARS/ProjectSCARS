import ky, { HTTPError, KyRequest, KyResponse, NormalizedOptions } from "ky";
import { AuthenticationError } from "../error";
import { LocalStorage } from "../info";
import { performLogout } from "../utils/logout";
import { GetRefreshToken } from "../utils/token";
import { JwtToken } from "./csclient";
import { createClient, createConfig } from "./csclient/client";
import type { CreateClientConfig } from "./csclient/client.gen";
import { customLogger } from "@/lib/api/customLogger";

const methods = ["get", "post", "put", "head", "delete", "options", "trace", "patch"];
const statusCodes = [401, 403, 408, 413, 429, 500, 502, 503, 504];

const logRequest = (request: KyRequest) => {
    // Add any global headers or authentication here
    customLogger.log(`🚀 Making request to: ${request.url}`);

    // Always set the latest access token from localStorage
    const accessTokenData = localStorage.getItem(LocalStorage.accessToken);
    if (accessTokenData) {
        try {
            const tokenObj = JSON.parse(accessTokenData);
            if (tokenObj.access_token) {
                request.headers.set("Authorization", `Bearer ${tokenObj.access_token}`);
            }
        } catch (error) {
            customLogger.warn("Failed to parse access token from localStorage:", error);
        }
    }
};
const logRequestComplete = (request: KyRequest, options: NormalizedOptions, response: KyResponse) => {
    // Log successful responses
    customLogger.log(`✅ Request to ${request.url} completed with status: ${response.status}`);
};
const logError = (error: HTTPError) => {
    // Log errors with more context
    customLogger.error(`❌ Request failed:`, error);
    return error;
};
const retryRequest = async ({
    request,
    error,
    retryCount,
}: {
    request: KyRequest;
    error: Error;
    retryCount: number;
}) => {
    customLogger.log(`🔄 Retrying request (attempt ${retryCount + 1}):`, request.url);

    // Handle token refresh on 401 errors
    if (error instanceof HTTPError && error.response.status === 401) {
        // if (retryCount > 0) {
        //     customLogger.warn("🚫 Multiple 401 errors, stopping retry attempts");
        //     performLogout(true);
        //     throw new AuthenticationError("Multiple authentication failures - user logged out");
        // }

        // Check if user is logged in before attempting token refresh
        const userData = localStorage.getItem(LocalStorage.userData);
        if (!userData) {
            customLogger.warn("🚪 User not logged in, skipping token refresh...");
            // throw new AuthenticationError("User is not logged in");
            return; // Skip refresh if user is not logged in
        }
        try {
            customLogger.warn("🔑 Unauthorized request, attempting to refresh token...");

            // Attempt to refresh token using the proper utility function
            const refreshToken = GetRefreshToken();
            if (!refreshToken) {
                customLogger.warn("🚪 No refresh token available, logging out user...");
                performLogout(true); // Redirect to login page
                throw new AuthenticationError("No refresh token available - user logged out");
            }

            customLogger.debug("🔄 Found refresh token, calling refresh endpoint...");
            try {
                const tokenResponse = await tokenRefreshClient
                    .post("v1/auth/refresh", {
                        json: { refresh_token: refreshToken },
                    })
                    .json<JwtToken>();

                localStorage.setItem(LocalStorage.accessToken, JSON.stringify(tokenResponse));
                request.headers.set("Authorization", `Bearer ${tokenResponse.access_token}`);

                customLogger.log("✅ Token refreshed successfully, retrying original request");
            } catch (refreshError) {
                customLogger.error("❌ Failed to refresh token:", refreshError);
                customLogger.warn("🚪 Token refresh failed, logging out user...");
                performLogout(true); // Redirect to login page
                throw new AuthenticationError("Token refresh failed - user logged out");
            }
        } catch (refreshError) {
            customLogger.error("❌ Failed to refresh token:", refreshError);
            customLogger.warn("🚪 Token refresh failed, logging out user...");
            performLogout(true); // Redirect to login page
            throw new AuthenticationError("Token refresh failed - user logged out");
        }
    }
};

// Create a simple ky instance for token refresh (without retry logic to avoid circular dependencies)
const tokenRefreshClient = ky.create({
    prefixUrl: process.env.NEXT_PUBLIC_CENTRAL_SERVER_ENDPOINT,
    timeout: 10000, // 10 seconds timeout for token refresh
    retry: 0, // No retries for token refresh to avoid circular dependencies
    hooks: {
        beforeRequest: [logRequest],
        afterResponse: [logRequestComplete],
        beforeError: [logError],
    },
});

// Create a ky instance with base configuration
const defaultKyClient = ky.create({
    prefixUrl: process.env.NEXT_PUBLIC_CENTRAL_SERVER_ENDPOINT,
    timeout: 30000, // 30 seconds timeout
    retry: {
        limit: 3,
        methods: methods,
        statusCodes: statusCodes,
    },
    hooks: {
        beforeRequest: [logRequest],
        afterResponse: [logRequestComplete],
        beforeError: [logError],
        beforeRetry: [retryRequest],
    },
});

// Create a ky instance without retries for specific requests (like login)
const noRetryKyClient = ky.create({
    prefixUrl: process.env.NEXT_PUBLIC_CENTRAL_SERVER_ENDPOINT,
    timeout: 30000, // 30 seconds timeout
    retry: 0, // No retries
    hooks: {
        beforeRequest: [logRequest],
        afterResponse: [logRequestComplete],
        beforeError: [logError],
        // No beforeRetry hook since we don't want retries
    },
});

export const createClientConfig: CreateClientConfig = (config) => ({
    ...config,
    baseUrl: process.env.NEXT_PUBLIC_CENTRAL_SERVER_ENDPOINT,
    fetch: defaultKyClient, // Use ky as the fetch implementation
});

export const createNoRetryClientConfig: CreateClientConfig = (config) => ({
    ...config,
    baseUrl: process.env.NEXT_PUBLIC_CENTRAL_SERVER_ENDPOINT,
    fetch: noRetryKyClient, // Use no-retry ky client
});

// Create a no-retry client instance for specific API calls that shouldn't be retried
export const noRetryClient = createClient(createNoRetryClientConfig(createConfig({})));
