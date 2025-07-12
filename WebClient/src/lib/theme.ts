import { createTheme, MantineColorsTuple, MantineThemeOverride } from "@mantine/core";

export const notificationLimit = 5;
export const notificationAutoClose = 5000;

export const defaultColorscheme = "auto";
const defaultColors: MantineColorsTuple = [
    "#dffbff",
    "#caf2ff",
    "#99e2ff",
    "#64d2ff",
    "#3cc4fe",
    "#23bcfe",
    "#00b5ff",
    "#00a1e4",
    "#008fcd",
    "#007cb6",
];

// Your theme configuration is merged with default theme
export const theme: MantineThemeOverride = createTheme({
    // FIXME: fonts are not working as expected
    // fontFamily: "Manrope, sans-serif",
    // fontFamilyMonospace: "JetBrains Mono, monospace",
    defaultRadius: "md",
    colors: { defaultColors },
});
