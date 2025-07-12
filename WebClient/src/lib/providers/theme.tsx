"use client";

import { createContext, useContext, ReactNode, useEffect } from "react";
import { useLocalStorage } from "@mantine/hooks";
import { generateColors } from "@mantine/colors-generator";
import { UserPreferences } from "@/lib/types";
import { LocalStorage } from "@/lib/info";

interface ThemeContextType {
    userPreferences: UserPreferences;
    updatePreference: (key: keyof UserPreferences, value: string | boolean | null) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const useThemeContext = () => {
    const context = useContext(ThemeContext);
    if (!context) {
        throw new Error("useThemeContext must be used within a ThemeProvider");
    }
    return context;
};

interface ThemeProviderProps {
    children: ReactNode;
}

export const DynamicThemeProvider = ({ children }: ThemeProviderProps) => {
    const [userPreferences, setUserPreferences] = useLocalStorage<UserPreferences>({
        key: LocalStorage.userPreferences,
        defaultValue: {
            accentColor: "#228be6",
            language: "en",
        },
    });

    const updatePreference = (key: keyof UserPreferences, value: string | boolean | null) => {
        setUserPreferences((prev) => ({ ...prev, [key]: value }));
    };

    // Update CSS variables when accent color changes
    useEffect(() => {
        if (typeof window !== "undefined" && userPreferences.accentColor) {
            const root = document.documentElement;
            const accentColor = userPreferences.accentColor;

            // Validate that we have a valid hex color
            if (!accentColor || typeof accentColor !== "string" || !accentColor.startsWith("#")) {
                console.warn("Invalid accent color:", accentColor);
                return;
            }

            try {
                // Generate proper color shades using Mantine's color generator
                const colorShades = generateColors(accentColor);

                // Set the custom accent color shades
                colorShades.forEach((shade, index) => {
                    root.style.setProperty(`--mantine-color-accent-${index}`, shade);
                });

                // Update Mantine's primary color to use our accent color
                colorShades.forEach((shade, index) => {
                    root.style.setProperty(`--mantine-color-blue-${index}`, shade);
                });

                // Also update specific CSS variables that Mantine uses for primary colors
                root.style.setProperty("--mantine-primary-color-filled", colorShades[6]);
                root.style.setProperty("--mantine-primary-color-filled-hover", colorShades[7]);
                root.style.setProperty("--mantine-primary-color-light", colorShades[0]);
                root.style.setProperty("--mantine-primary-color-light-hover", colorShades[1]);
                root.style.setProperty("--mantine-primary-color-light-color", colorShades[6]);
            } catch (error) {
                console.error("Error generating colors for accent color:", accentColor, error);
            }
        }
    }, [userPreferences.accentColor]);

    return <ThemeContext.Provider value={{ userPreferences, updatePreference }}>{children}</ThemeContext.Provider>;
};
