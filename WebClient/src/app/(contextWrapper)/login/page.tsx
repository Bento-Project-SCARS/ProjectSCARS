"use client";

import { LoadingComponent } from "@/components/LoadingComponent/LoadingComponent";
import { MainLoginComponent } from "@/components/MainLoginComponent/MainLoginComponent";
import { customLogger } from "@/lib/api/customLogger";
import { useAuth } from "@/lib/providers/auth";
import { useDisclosure } from "@mantine/hooks";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function LoginContent() {
    const [isLoading, handlers] = useDisclosure(true);
    const { isAuthenticated } = useAuth();
    const router = useRouter();

    customLogger.debug("Rendering LoginPage", { isAuthenticated });
    useEffect(() => {
        customLogger.debug("LoginContent useEffect started", { isAuthenticated });
        if (isAuthenticated) {
            // If the user is authenticated, redirect to the dashboard
            router.push("/dashboard");
        }
        handlers.close();
    }, [isAuthenticated, router, handlers]);

    customLogger.debug("Rendering LoginContent", { isAuthenticated });
    return (
        <>
            {isLoading && <LoadingComponent withBorder={false} />} {!isLoading && <MainLoginComponent />}
        </>
    );
}
