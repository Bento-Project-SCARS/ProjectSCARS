// NOTE: react-scan must be the top-most import
import { ReactScan } from "@/components/dev/ReactScan";
import { PWAConnectionStatus, PWAUpdateNotification } from "@/components/pwa";

import { Program } from "@/lib/info";
import { theme, defaultColorscheme, notificationLimit, notificationAutoClose } from "@/lib/theme";
import { ColorSchemeScript, MantineProvider, mantineHtmlProps } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import type { Metadata, Viewport } from "next";

import "@mantine/core/styles.css";
import "@mantine/charts/styles.css";
import "@mantine/dropzone/styles.css";
import "@mantine/notifications/styles.css";
import "@mantine/spotlight/styles.css";

// Set page metadata with PWA support
export const metadata: Metadata = {
    title: `${Program.name} | ${Program.description}`,
    description: Program.description,
    manifest: "/manifest.json",
    appleWebApp: {
        capable: true,
        statusBarStyle: "default",
        title: Program.name,
        startupImage: ["/icon-512x512.png"],
    },
    formatDetection: {
        telephone: false,
    },
    openGraph: {
        type: "website",
        siteName: Program.name,
        title: `${Program.name} | ${Program.description}`,
        description: Program.description,
    },
    twitter: {
        card: "summary",
        title: `${Program.name} | ${Program.description}`,
        description: Program.description,
    },
    icons: {
        icon: [
            { url: "/icon-192x192.png", sizes: "192x192", type: "image/png" },
            { url: "/icon-256x256.png", sizes: "256x256", type: "image/png" },
            { url: "/icon-384x384.png", sizes: "384x384", type: "image/png" },
            { url: "/icon-512x512.png", sizes: "512x512", type: "image/png" },
        ],
        apple: [{ url: "/icon-192x192.png", sizes: "192x192", type: "image/png" }],
    },
};

export const viewport: Viewport = {
    width: "device-width",
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
    themeColor: "#339af0",
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
                    <PWAConnectionStatus />
                    {children}
                    <Notifications limit={notificationLimit} autoClose={notificationAutoClose} />
                    <PWAUpdateNotification />
                </MantineProvider>
            </body>
        </html>
    );
}
