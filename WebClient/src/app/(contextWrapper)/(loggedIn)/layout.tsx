"use client";

import { Navbar } from "@/components/LoggedInNavBar/Navbar";
import { customLogger } from "@/lib/api/customLogger";
import { useAuth } from "@/lib/providers/auth";
import { useUser } from "@/lib/providers/user";
import { AppShell, ScrollArea, Burger, Group, Image, Title, Code } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Program } from "@/lib/info";

/**
 * Layout component for logged-in users.
 * @param {Object} props - The component props.
 * @param {React.ReactNode} props.children - The child components to render within the layout.
 */
export default function LoggedInLayout({ children }: { children: React.ReactNode }) {
    customLogger.debug("Rendering LoggedInLayout");
    return <LoggedInContent>{children}</LoggedInContent>;
}

/**
 * LoggedInContent component that wraps the main content for logged-in users.
 * @param {Object} props - The component props.
 * @param {React.ReactNode} props.children - The child components to render within the content area.
 */
function LoggedInContent({ children }: { children: React.ReactNode }) {
    const { clearUserInfo } = useUser();
    const { isAuthenticated } = useAuth();
    const [opened, { toggle }] = useDisclosure();
    const router = useRouter();

    customLogger.debug("Rendering LoggedInContent", { isAuthenticated });
    useEffect(() => {
        // If the user is not authenticated, redirect to the login page.
        if (!isAuthenticated) {
            customLogger.debug("User is not authenticated, redirecting to login page");
            clearUserInfo();
            router.push("/login");
        }
    }, [clearUserInfo, isAuthenticated, router]);

    return (
        <AppShell
            header={{ height: 60 }}
            navbar={{
                width: 325,
                breakpoint: "sm",
                collapsed: { mobile: !opened },
            }}
            padding="md"
        >
            <AppShell.Header>
                <Group h="100%" px="md" justify="space-between">
                    <Group>
                        <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" />
                        <Image
                            src="/assets/logos/BENTO.svg"
                            alt="BENTO Logo"
                            radius="md"
                            h={40}
                            w="auto"
                            fit="contain"
                        />
                        <Title order={3} visibleFrom="sm">
                            {Program.name}
                        </Title>
                        <Code fw={700} visibleFrom="md">
                            {Program.version}
                        </Code>
                    </Group>
                </Group>
            </AppShell.Header>
            <AppShell.Navbar>
                <ScrollArea scrollbars="y">
                    <Navbar />
                </ScrollArea>
            </AppShell.Navbar>
            <AppShell.Main>{children}</AppShell.Main>
        </AppShell>
    );
}
