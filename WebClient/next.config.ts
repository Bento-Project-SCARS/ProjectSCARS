import type { NextConfig } from "next";
import { codecovNextJSWebpackPlugin } from "@codecov/nextjs-webpack-plugin";

const nextConfig: NextConfig = {
    devIndicators: process.env.NODE_ENV !== "production" ? {} : false,
    output: "standalone", // output a standalone build for container deployments
    serverExternalPackages: ["pino", "pino-pretty"],
    experimental: {
        optimizePackageImports: ["@mantine/core", "@mantine/hooks"],
    },
    webpack: (config, options) => {
        config.externals.push({
            "thread-stream": "commonjs thread-stream",
        });
        config.plugins.push(
            codecovNextJSWebpackPlugin({
                enableBundleAnalysis: process.env.CODECOV_TOKEN !== undefined,
                bundleName: "webclient-bundle",
                uploadToken: process.env.CODECOV_TOKEN,
                webpack: options.webpack,
            })
        );

        return config;
    },
};

export default nextConfig;
