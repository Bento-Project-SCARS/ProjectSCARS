import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
    return {
        name: "BENTO",
        short_name: "BENTO",
        description: "Baliwag's Enhanced Network for Tracking Operations",
        start_url: "/",
        display: "standalone",
        background_color: "#ffffff",
        theme_color: "#339af0", // Using Mantine's primary blue color
        orientation: "portrait",
        scope: "/",
        categories: ["finance", "productivity"],
        icons: [
            {
                src: "/icon-192x192.png",
                sizes: "192x192",
                type: "image/png",
                purpose: "maskable",
            },
            {
                src: "/icon-256x256.png",
                sizes: "256x256",
                type: "image/png",
            },
            {
                src: "/icon-384x384.png",
                sizes: "384x384",
                type: "image/png",
            },
            {
                src: "/icon-512x512.png",
                sizes: "512x512",
                type: "image/png",
            },
        ],
    };
}
