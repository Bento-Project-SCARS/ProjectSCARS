import { LocalStorage, Program, randomLoadingMessages } from "@/lib/info";
import { describe, expect, it } from "vitest";

describe("Info Configuration", () => {
    describe("Program constants", () => {
        it("has correct program name", () => {
            expect(Program.name).toBe("BENTO");
        });

        it("has correct program description", () => {
            expect(Program.description).toBe("Baliwag Enhanced Network for Tracking Operations");
        });

        it("has version information", () => {
            expect(Program.version).toBeDefined();
            expect(typeof Program.version).toBe("string");
            expect(Program.version).toMatch(/^\d+\.\d+\.\d+$/); // Semantic versioning pattern
        });
    });

    describe("LocalStorage keys", () => {
        it("has all required storage keys", () => {
            expect(LocalStorage.accessToken).toBe("at");
            expect(LocalStorage.userData).toBe("ud");
            expect(LocalStorage.userPermissions).toBe("up");
            expect(LocalStorage.userAvatar).toBe("userAvatar");
            expect(LocalStorage.userPreferences).toBe("userPrefs");
            expect(LocalStorage.setupCompleteDismissed).toBe("setupCompleteDismissed");
        });

        it("has unique storage keys", () => {
            const keys = Object.values(LocalStorage);
            const uniqueKeys = new Set(keys);
            expect(uniqueKeys.size).toBe(keys.length);
        });
    });

    describe("Random loading messages", () => {
        it("is an array with messages", () => {
            expect(Array.isArray(randomLoadingMessages)).toBe(true);
            expect(randomLoadingMessages.length).toBeGreaterThan(0);
        });

        it("contains only strings", () => {
            randomLoadingMessages.forEach((message) => {
                expect(typeof message).toBe("string");
                expect(message.length).toBeGreaterThan(0);
            });
        });

        it("has consistent message format", () => {
            randomLoadingMessages.forEach((message) => {
                // Messages should end with ... or period
                expect(message).toMatch(/[.]{3}$|[.]$/);
            });
        });

        it("has reasonable message length", () => {
            randomLoadingMessages.forEach((message) => {
                expect(message.length).toBeGreaterThan(10);
                expect(message.length).toBeLessThan(100);
            });
        });
    });
});
