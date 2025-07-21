// Type declarations for missing modules used by next-pwa
declare module "minimatch" {
    const minimatch: unknown;
    export = minimatch;
}

declare module "next-pwa" {
    const nextPWA: (config: unknown) => (nextConfig: unknown) => unknown;
    export = nextPWA;
}

// Additional PWA-related type declarations
declare module "workbox-*" {
    const content: unknown;
    export = content;
}
