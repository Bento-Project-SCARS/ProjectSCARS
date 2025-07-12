// NOTE: react-scan must be the top-most import
import { ReactScan } from "@/components/dev/ReactScan";

import { Program } from "@/lib/info";
import { theme, defaultColorscheme, notificationLimit, notificationAutoClose } from "@/lib/theme";
import { ColorSchemeScript, MantineProvider, mantineHtmlProps } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import type { Metadata } from "next";

import "@mantine/core/styles.css";
import "@mantine/charts/styles.css";
import "@mantine/dropzone/styles.css";
import "@mantine/notifications/styles.css";
import "@mantine/spotlight/styles.css";

// Set page metadata
export const metadata: Metadata = {
    title: `${Program.name} | ${Program.description}`,
    description: Program.description,
};

interface RootLayoutProps {
    children: React.ReactNode;
}

/**
 * RootLayout component serves as the main layout for the application.
 * @param {RootLayoutProps} props - The properties for the RootLayout component.
 * @return {JSX.Element} The rendered RootLayout component.
 */
export default function RootLayout({ children }: RootLayoutProps) {
    return (
        // Use mantineHtmlProps to handle the data-mantine-color-scheme attribute
        // and suppress hydration warnings for the <html> element.
        <html lang="en" {...mantineHtmlProps}>
            <head>
                <script suppressHydrationWarning />
                <ColorSchemeScript />
            </head>
            <body>
                <ReactScan />
                <MantineProvider theme={theme} defaultColorScheme={defaultColorscheme}>
                    {children}
                    <Notifications limit={notificationLimit} autoClose={notificationAutoClose} />
                </MantineProvider>
            </body>
        </html>
    );
}
