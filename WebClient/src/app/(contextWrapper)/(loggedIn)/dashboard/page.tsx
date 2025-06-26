"use client";

import { HomeSection } from "@/components/Dashboard/HomeSection";
import { ErrorBoundary } from "@/components/ErrorBoundary/ErrorBoundary";
import { LoadingComponent } from "@/components/LoadingComponent/LoadingComponent";
import { SpotlightComponent } from "@/components/SpotlightComponent";
import { GetUserInfo } from "@/lib/api/auth";
import { GetSelfNotifications } from "@/lib/api/notification";
import { GetUserAvatar } from "@/lib/api/user";
import { notificationIcons } from "@/lib/info";
import { useUser } from "@/lib/providers/user";
import { NotificationType } from "@/lib/types";
import {
    Avatar,
    Card,
    Container,
    Flex,
    Group,
    List,
    SemiCircleProgress,
    Stack,
    Text,
    ThemeIcon,
    Title,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconCircleCheck, IconCircleDashed, IconRefreshAlert } from "@tabler/icons-react";
import Link from "next/link";
import React, { Suspense, memo, useCallback, useEffect, useState } from "react";

const stepsToComplete: [string, boolean][] = [
    ["Add and verify your email address", false],
    ["Complete your profile information", false],
    ["Add a profile picture", false],
    ["Set up two-factor authentication", false],
];

const DashboardContent = memo(function DashboardContent() {
    const userCtx = useUser();
    const [profileCompletionPercentage, setProfileCompletionPercentage] = useState(0);
    const [HVNotifications, setHVNotifications] = useState<NotificationType[]>([]);
    const [setupCompleteDismissed, setSetupCompleteDismissed] = useState(
        () => typeof window !== "undefined" && localStorage.getItem("setupCompleteDismissed") === "true"
    );
    const [isLoading, setIsLoading] = useState(true);
    const [isNotificationLoading, setIsNotificationLoading] = useState(true);

    const handleStepClick = useCallback((index: number) => {
        const routes = [
            "/account/profile", // Email verification
            "/account/profile", // Profile completion
            "/account/profile", // Profile picture
            "/account/profile", // Two-factor auth
        ];

        if (index >= 0 && index < routes.length) {
            window.location.href = routes[index];
        }
    }, []);

    // Load user info and avatar
    useEffect(() => {
        let mounted = true;

        const loadUserInfo = async () => {
            if (!userCtx.userInfo) return;

            try {
                const [userInfo, userPermissions] = await GetUserInfo();
                if (!mounted) return;

                if (userInfo.avatarUrn) {
                    const userAvatar = await GetUserAvatar(userInfo.avatarUrn);
                    if (mounted) {
                        userCtx.updateUserInfo(userInfo, userPermissions, userAvatar);
                    }
                } else if (mounted) {
                    userCtx.updateUserInfo(userInfo, userPermissions);
                }
            } catch (error) {
                console.error("Failed to fetch user info:", error);
                if (mounted) {
                    notifications.show({
                        id: "user-info-error",
                        title: "Error",
                        message: "Failed to load user information",
                        color: "red",
                        icon: <IconRefreshAlert />,
                    });
                }
            } finally {
                if (mounted) {
                    setIsLoading(false);
                }
            }
        };

        if (userCtx.userInfo) {
            loadUserInfo();
        } else {
            setIsLoading(false);
        }

        return () => {
            mounted = false;
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Load notifications
    useEffect(() => {
        let mounted = true;

        const loadNotifications = async () => {
            try {
                const notifications = await GetSelfNotifications(true, true, 0, 1);
                if (mounted) {
                    setHVNotifications(notifications);
                }
            } catch (error) {
                console.error("Failed to fetch notifications:", error);
                if (mounted) {
                    notifications.show({
                        id: "notifications-error",
                        title: "Error",
                        message: "Failed to load notifications",
                        color: "red",
                        icon: <IconRefreshAlert />,
                    });
                }
            } finally {
                if (mounted) {
                    setIsNotificationLoading(false);
                }
            }
        };

        loadNotifications();

        return () => {
            mounted = false;
        };
    }, []); // Load notifications once on mount

    const calculateSteps = useCallback(() => {
        if (!userCtx.userInfo) return;

        const totalSteps = stepsToComplete.length;
        let completedSteps = 0;
        const updatedSteps = [...stepsToComplete];

        if (userCtx.userInfo.emailVerified) {
            completedSteps++;
            updatedSteps[0][1] = true;
        }

        if (userCtx.userInfo.nameFirst && userCtx.userInfo.nameLast && userCtx.userInfo.email) {
            completedSteps++;
            updatedSteps[1][1] = true;
        }

        if (userCtx.userInfo.avatarUrn) {
            completedSteps++;
            updatedSteps[2][1] = true;
        }

        if (userCtx.userInfo.otpVerified) {
            completedSteps++;
            updatedSteps[3][1] = true;
        }

        setProfileCompletionPercentage(Math.round((completedSteps / totalSteps) * 100));
        return updatedSteps;
    }, [userCtx.userInfo]);

    useEffect(() => {
        calculateSteps();
    }, [calculateSteps]);

    if (isLoading) {
        return <LoadingComponent message="Loading dashboard..." withBorder={false} />;
    }

    return (
        <Container size="xl" py="md">
            <Stack gap="md">
                <SpotlightComponent />

                {/* User Welcome Section */}
                <Card shadow="sm" p="md" radius="md" withBorder>
                    <Group gap={20}>
                        <Avatar variant="light" radius="lg" size={100} color="#258ce6" src={userCtx.userAvatarUrl} />
                        <Stack gap="xs">
                            {userCtx.userInfo?.nameFirst ? (
                                <Title>Welcome, {userCtx.userInfo.nameFirst}!</Title>
                            ) : userCtx.userInfo?.username ? (
                                <Title>Welcome, {userCtx.userInfo.username}!</Title>
                            ) : (
                                <Title>Welcome!</Title>
                            )}
                            <Text c="dimmed">Here&apos;s what&apos;s happening with your account</Text>
                        </Stack>
                    </Group>
                </Card>

                {/* Account Setup Section */}
                {profileCompletionPercentage !== 100 && !setupCompleteDismissed && (
                    <Card p="md" radius="md" withBorder>
                        <Flex justify="space-between" align="center" mb={20}>
                            <SemiCircleProgress
                                fillDirection="left-to-right"
                                orientation="up"
                                filledSegmentColor="blue"
                                value={profileCompletionPercentage}
                                transitionDuration={250}
                                label={`${profileCompletionPercentage}% Complete`}
                            />
                            <Stack style={{ flex: 1 }}>
                                <Title order={4}>Set Up Your Account</Title>
                                <Text size="sm" c="dimmed">
                                    Complete your profile, set up security features, and customize your preferences.
                                </Text>
                                <List spacing="xs" center>
                                    {stepsToComplete.map(([step, completed], index) => (
                                        <List.Item
                                            key={index}
                                            icon={
                                                <ThemeIcon color={completed ? "green" : "blue"} size={20} radius="xl">
                                                    {completed ? <IconCircleCheck /> : <IconCircleDashed />}
                                                </ThemeIcon>
                                            }
                                            c={completed ? "gray" : "dark"}
                                            style={{ cursor: completed ? "default" : "pointer" }}
                                            onClick={() => !completed && handleStepClick(index)}
                                        >
                                            <Text
                                                size="sm"
                                                style={{
                                                    textDecoration: completed ? "line-through" : "none",
                                                    cursor: completed ? "default" : "pointer",
                                                }}
                                            >
                                                {step}
                                            </Text>
                                        </List.Item>
                                    ))}
                                </List>
                            </Stack>
                        </Flex>
                        <Text
                            size="xs"
                            c="dimmed"
                            ta="right"
                            style={{ cursor: "pointer" }}
                            onClick={() => {
                                if (typeof window !== "undefined") {
                                    localStorage.setItem("setupCompleteDismissed", "true");
                                }
                                setSetupCompleteDismissed(true);
                            }}
                        >
                            Dismiss
                        </Text>
                    </Card>
                )}

                {/* Notifications Section */}
                <Card p="md" radius="md" withBorder mb="xl">
                    <Title order={4}>Important Notifications</Title>
                    {isNotificationLoading ? (
                        <LoadingComponent message="Loading notifications..." withBorder={false} />
                    ) : HVNotifications.length > 0 ? (
                        HVNotifications.map((notification) => (
                            <NotificationCard key={notification.id} notification={notification} />
                        ))
                    ) : (
                        <Text size="sm" c="dimmed" mt={10}>
                            No important notifications at the moment.
                        </Text>
                    )}
                </Card>

                {/* Home Section */}
                <Suspense fallback={<LoadingComponent message="Loading content..." withBorder={false} />}>
                    <HomeSection />
                </Suspense>
            </Stack>
        </Container>
    );
});

// Memoize the notification card
const NotificationCard = memo(function NotificationCard({ notification }: { notification: NotificationType }) {
    return (
        <Link href="/account/notifications" style={{ textDecoration: "none" }}>
            <Card withBorder radius="md" p="md">
                <Group>
                    <Avatar color={notificationIcons[notification.type]?.[1]} radius="xl">
                        {notificationIcons[notification.type]?.[0] &&
                            React.createElement(notificationIcons[notification.type][0])}
                    </Avatar>
                    <Text size="sm">{notification.content}</Text>
                </Group>
                <Text size="xs" c="dimmed" ta="right" mt={5}>
                    {new Date(notification.created).toLocaleString()}
                </Text>
            </Card>
        </Link>
    );
});

export default function DashboardPage() {
    return (
        <ErrorBoundary>
            <Suspense fallback={<LoadingComponent message="Loading dashboard..." withBorder={false} />}>
                <DashboardContent />
            </Suspense>
        </ErrorBoundary>
    );
}
