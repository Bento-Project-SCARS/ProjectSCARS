"use client";

import { HomeSection } from "@/components/Dashboard/HomeSection";
import { ErrorBoundary } from "@/components/ErrorBoundary/ErrorBoundary";
import { LoadingComponent } from "@/components/LoadingComponent/LoadingComponent";
import {
    Notification,
    getUserAvatarEndpointV1UsersAvatarGet,
    getUserNotificationsV1NotificationsMeGet,
    getUserProfileEndpointV1UsersMeGet,
    type UserPublic,
} from "@/lib/api/csclient";
import { customLogger } from "@/lib/api/customLogger";
import { LocalStorage, notificationIcons } from "@/lib/info";
import { useUser } from "@/lib/providers/user";
import { GetAccessTokenHeader } from "@/lib/utils/token";
import { Avatar, Card, Container, Group, List, SemiCircleProgress, Stack, Text, ThemeIcon, Title } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconCircleCheck, IconCircleDashed, IconRefreshAlert } from "@tabler/icons-react";
import dayjs from "dayjs";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Suspense, memo, useCallback, useEffect, useState } from "react";

const stepsToComplete: [string, boolean][] = [
    ["Add and verify your email address", false],
    ["Complete your profile information", false],
    ["Add a profile picture", false],
    ["Set up two-factor authentication", false],
];

const DashboardContent = memo(function DashboardContent() {
    const userCtx = useUser();
    const router = useRouter();
    const [profileCompletionPercentage, setProfileCompletionPercentage] = useState(0);
    const [HVNotifications, setHVNotifications] = useState<Notification[]>([]);
    const [setupCompleteDismissed, setSetupCompleteDismissed] = useState(
        () => typeof window !== "undefined" && localStorage.getItem(LocalStorage.setupCompleteDismissed) === "true"
    );
    const [isLoading, setIsLoading] = useState(true);
    const [isNotificationLoading, setIsNotificationLoading] = useState(true);

    // Handle step clicks to navigate to the profile page
    const handleStepClick = (index: number) => {
        switch (index) {
            case 0:
            case 1:
            case 2:
            case 3:
                router.push("/account/profile");
                break;
            default:
                break;
        }
    };

    useEffect(() => {
        // Check if forceupdateinfo is true
        if (userCtx.userInfo?.forceUpdateInfo) {
            router.push("/account/welcome");
        }
    }, [router, userCtx.userInfo?.forceUpdateInfo]);

    // Load user info and avatar
    useEffect(() => {
        let mounted = true;

        const loadUserInfo = async () => {
            if (!userCtx.userInfo) return;
            try {
                const userInfoResult = await getUserProfileEndpointV1UsersMeGet({
                    headers: { Authorization: GetAccessTokenHeader() },
                });

                if (userInfoResult.error) {
                    throw new Error(
                        `Failed to get user info: ${userInfoResult.response.status} ${userInfoResult.response.statusText}`
                    );
                }

                const [userInfo, userPermissions] = userInfoResult.data as [UserPublic, string[]];
                if (!mounted) return;
                if (userInfo.avatarUrn) {
                    const avatarResult = await getUserAvatarEndpointV1UsersAvatarGet({
                        query: { fn: userInfo.avatarUrn },
                        headers: { Authorization: GetAccessTokenHeader() },
                    });

                    if (!avatarResult.error && mounted) {
                        const userAvatar = avatarResult.data as Blob;
                        userCtx.updateUserInfo(userInfo, userPermissions, userAvatar);
                    } else if (mounted) {
                        customLogger.warn("Failed to fetch avatar:", avatarResult.error);
                        userCtx.updateUserInfo(userInfo, userPermissions);
                    }
                } else if (mounted) {
                    userCtx.updateUserInfo(userInfo, userPermissions);
                }
            } catch (error) {
                customLogger.error("Failed to fetch user info:", error);
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
                const result = await getUserNotificationsV1NotificationsMeGet({
                    query: {
                        unarchived_only: true,
                        important_only: true,
                        offset: 0,
                        limit: 1,
                    },
                    headers: { Authorization: GetAccessTokenHeader() },
                });

                if (result.error) {
                    throw new Error(
                        `Failed to fetch notifications: ${result.response.status} ${result.response.statusText}`
                    );
                }

                const notifications = result.data as Notification[];
                if (mounted) {
                    setHVNotifications(notifications);
                }
            } catch (error) {
                customLogger.error("Failed to fetch notifications:", error);
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

    // Calculate profile completion percentage
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
                {/* User Welcome Section */}
                <Card shadow="sm" p="md" radius="md" withBorder>
                    <Group gap="md" align="flex-start" wrap="nowrap">
                        <Avatar
                            variant="light"
                            radius="lg"
                            size={60}
                            color="#258ce6"
                            src={userCtx.userAvatarUrl}
                            style={{
                                width: "60px",
                                height: "60px",
                                "@media (min-width: 768px)": {
                                    width: "100px",
                                    height: "100px",
                                },
                            }}
                        />
                        <Stack gap="xs" style={{ flex: 1, minWidth: 0 }}>
                            {userCtx.userInfo?.nameFirst ? (
                                <Title
                                    order={3}
                                    style={{
                                        fontSize: "1.5rem",
                                        "@media (min-width: 992px)": {
                                            fontSize: "2.5rem",
                                        },
                                    }}
                                >
                                    Welcome, {userCtx.userInfo.nameFirst}!
                                </Title>
                            ) : userCtx.userInfo?.username ? (
                                <Title
                                    order={3}
                                    style={{
                                        fontSize: "1.5rem",
                                        "@media (min-width: 992px)": {
                                            fontSize: "2.5rem",
                                        },
                                    }}
                                >
                                    Welcome, {userCtx.userInfo.username}!
                                </Title>
                            ) : (
                                <Title
                                    order={3}
                                    style={{
                                        fontSize: "1.5rem",
                                        "@media (min-width: 992px)": {
                                            fontSize: "2.5rem",
                                        },
                                    }}
                                >
                                    Welcome!
                                </Title>
                            )}
                            <Text c="dimmed" size="md">
                                Here&apos;s what&apos;s happening with your account
                            </Text>
                        </Stack>
                    </Group>
                </Card>

                {/* Account Setup Section */}
                {profileCompletionPercentage !== 100 && !setupCompleteDismissed && (
                    <Card p="md" radius="md" withBorder>
                        <Stack gap="md">
                            <Group
                                justify="space-between"
                                align="center"
                                style={{
                                    "@media (max-width: 991px)": {
                                        flexDirection: "column",
                                        gap: "1rem",
                                    },
                                }}
                            >
                                <SemiCircleProgress
                                    fillDirection="left-to-right"
                                    orientation="up"
                                    filledSegmentColor="blue"
                                    value={profileCompletionPercentage}
                                    transitionDuration={250}
                                    size={120}
                                    hiddenFrom="sm"
                                />
                                <Stack
                                    style={{
                                        flex: 1,
                                        marginLeft: "1rem",
                                        "@media (max-width: 991px)": {
                                            marginLeft: "0",
                                            alignItems: "center",
                                            textAlign: "center",
                                        },
                                    }}
                                >
                                    <Title order={4}>Set Up Your Account</Title>
                                    <Text size="sm" c="dimmed">
                                        Complete your profile, set up security features, and customize your preferences.
                                    </Text>
                                    <List spacing="xs" center>
                                        {stepsToComplete.map(([step, completed], index) => (
                                            <List.Item
                                                key={index}
                                                icon={
                                                    <ThemeIcon
                                                        color={completed ? "green" : "blue"}
                                                        size={20}
                                                        radius="xl"
                                                    >
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
                            </Group>
                        </Stack>
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

                {/* <Divider my="md" /> */}

                {/* Home Section */}
                <Suspense fallback={<LoadingComponent message="Loading content..." withBorder={false} />}>
                    <HomeSection />
                </Suspense>
            </Stack>
        </Container>
    );
});

// Memoize the notification card
const NotificationCard = memo(function NotificationCard({ notification }: { notification: Notification }) {
    const notificationType = notification.type || "info";
    const iconConfig = notificationIcons[notificationType];
    const [IconComponent, color] = iconConfig || [notificationIcons.info[0], notificationIcons.info[1]];

    return (
        <Link href="/account/notifications" style={{ textDecoration: "none" }}>
            <Card withBorder radius="md" p="md">
                <Group>
                    <Avatar color={color} radius="xl">
                        <IconComponent />
                    </Avatar>
                    <Stack>
                        {notification.title && <Text size="md">{notification.title}</Text>}
                        <Text size="sm">{notification.content}</Text>
                    </Stack>
                </Group>
                <Text size="xs" c="dimmed" ta="right" mt={5}>
                    {dayjs(notification.created).format("YYYY-MM-DD HH:mm:ss")}
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
