"use client";

import { useEffect } from "react";
import { AuthProvider } from "@/lib/providers/auth";
import { UserProvider } from "@/lib/providers/user";
import { DynamicThemeProvider } from "@/lib/providers/theme";
import { useMantineColorScheme } from "@mantine/core";
import { customLogger } from "@/lib/api/customLogger";

/**
 * ContextWrapperLayout component that wraps the application in context providers.
 * @param {Object} props - The component props.
 * @param {React.ReactNode} props.children - The child components to render within the layout.
 * * @returns {JSX.Element} The rendered ContextWrapperLayout component.
 */
export default function ContextWrapperLayout({ children }: { children: React.ReactNode }) {
    const { setColorScheme } = useMantineColorScheme();
    // Set mantine-color-scheme-value to 'light' if not set
    useEffect(() => {
        if (typeof window !== "undefined" && !localStorage.getItem("mantine-color-scheme-value")) {
            localStorage.setItem("mantine-color-scheme-value", "light");
            setColorScheme("light");
        }
    }, [setColorScheme]);

    customLogger.debug("Rendering ContextWrapperLayout");
    return (
        <DynamicThemeProvider>
            <AuthProvider>
                <UserProvider>{children}</UserProvider>
            </AuthProvider>
        </DynamicThemeProvider>
    );
}
