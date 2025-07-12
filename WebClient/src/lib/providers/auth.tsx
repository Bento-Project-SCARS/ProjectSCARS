"use client";

import { JwtToken } from "@/lib/api/csclient";
import { customLogger } from "@/lib/api/customLogger";
import { LocalStorage } from "@/lib/info";
import { performLogout } from "@/lib/utils/logout";
import { CheckAndHandleMissingTokens } from "@/lib/utils/token";
import { createContext, ReactNode, useContext, useEffect, useState } from "react";

interface AuthContextType {
    isAuthenticated: boolean; // Whether the user is authenticated
    login: (tokens: JwtToken) => void; // Function to log the user in
    logout: () => void; // Function to log the user out
}

interface AuthProviderProps {
    children: ReactNode;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * AuthProvider component that provides authentication context to its children.
 * This component manages the authentication state and provides login and logout functions.
 * @param {AuthProviderProps} props - The properties for the AuthProvider component.
 * @return {React.FC<AuthProviderProps>} The AuthProvider component.
 */
export function AuthProvider({ children }: AuthProviderProps): ReactNode {
    const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
        if (typeof window === "undefined") {
            customLogger.debug("Window is undefined");
            return false; // Server-side rendering
        }

        const stored_auth_state = localStorage.getItem(LocalStorage.accessToken);
        return stored_auth_state !== null;
    });

    /**
     * Log the user in by storing the complete token object in local storage and updating the authentication state.
     * @param {JwtToken} tokens - The tokens returned from the server.
     */
    const login = (tokens: JwtToken) => {
        customLogger.debug("Setting local login state to true", { hasRefreshToken: !!tokens.refresh_token });
        localStorage.setItem(LocalStorage.accessToken, JSON.stringify(tokens));
        setIsAuthenticated(true);
    };

    /**
     * Log the user out by removing all user data from local storage and updating the authentication state.
     */
    const logout = () => {
        customLogger.debug("Setting local login state to false");
        setIsAuthenticated(false);
        performLogout(false); // Don't redirect here since we might want to handle it differently in React components
    };

    // Set up automatic token existence checking
    useEffect(() => {
        if (!isAuthenticated) return;

        const tokenCheckInterval = setInterval(() => {
            CheckAndHandleMissingTokens(logout);
        }, 5 * 60 * 1000); // Check every 5 minutes

        // Initial check
        CheckAndHandleMissingTokens(logout);

        return () => clearInterval(tokenCheckInterval);
    }, [isAuthenticated]);

    return <AuthContext.Provider value={{ isAuthenticated, login, logout }}>{children}</AuthContext.Provider>;
}

/**
 * Hook to access the authentication context.
 * This hook is used to access the authentication context in a component.
 * @returns {AuthContextType} The authentication context containing the authentication state and functions.
 */
export function useAuth(): AuthContextType {
    customLogger.debug("useAuth called");
    const ctx = useContext(AuthContext);
    if (!ctx) {
        const errorMessage = "useAuth must be used within an AuthProvider";
        customLogger.error(errorMessage);
        throw new Error(errorMessage);
    }
    return ctx;
}
