"use client";

import { ActionIcon, Avatar, Group, Indicator, NavLink, Text, Tooltip } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
    IconBuilding,
    IconDashboard,
    IconGraph,
    IconHelp,
    IconLogout,
    IconNotification,
    IconRefresh,
    IconReport,
    IconSettings,
    IconUser,
} from "@tabler/icons-react";
import { usePathname, useRouter } from "next/navigation";
import { motion } from "motion/react";

import { getNotificationQuantityV1NotificationsQuantityGet } from "@/lib/api/csclient";
import { roles } from "@/lib/info";
import { useAuth } from "@/lib/providers/auth";
import { useUser } from "@/lib/providers/user";
import { JSX, useEffect, useState } from "react";

import classes from "./Navbar.module.css";
import { customLogger } from "@/lib/api/customLogger";
import { useUserSyncControls } from "@/lib/hooks/useUserSyncControls";
import { useNotificationWebSocket } from "@/lib/hooks/useNotificationWebSocket";

export const Navbar: React.FC = () => {
    const [links, setLinks] = useState<JSX.Element[]>([]);
    const [notificationsQuantity, setNotificationsQuantity] = useState<number>(0);
    const [isHovered, setIsHovered] = useState<boolean>(false);
    const userCtx = useUser();
    const router = useRouter();
    const pathname = usePathname();
    const { logout } = useAuth();
    const { triggerRefresh, isRefreshing } = useUserSyncControls();

    // WebSocket integration for real-time notification count updates
    useNotificationWebSocket({
        onNewNotification: () => {
            customLogger.debug("New notification received, updating count");
            setNotificationsQuantity((prev) => prev + 1);
        },
        onNotificationArchived: () => {
            customLogger.debug("Notification archived, updating count");
            fetchNotificationsQuantity(); // Refresh to get accurate count
        },
        onNotificationUnarchived: () => {
            customLogger.debug("Notification unarchived, updating count");
            fetchNotificationsQuantity(); // Refresh to get accurate count
        },
        enabled: true,
    });

    const fetchNotificationsQuantity = async () => {
        try {
            const result = await getNotificationQuantityV1NotificationsQuantityGet({
                query: { show_archived: false },
            });

            if (result.error) {
                throw new Error(
                    `Failed to fetch notifications quantity: ${result.response.status} ${result.response.statusText}`
                );
            }

            const quantity = result.data as number;
            customLogger.debug("Fetched notifications quantity:", quantity);
            setNotificationsQuantity(quantity);
        } catch (error) {
            customLogger.error("Failed to fetch notifications quantity:", error);
            setNotificationsQuantity(0);
        }
    };

    useEffect(() => {
        const navbarContents = [
            {
                key: "dashboard",
                link: "/dashboard",
                label: "Dashboard",
                requiredPermission: "users:self:read",
                showForRoles: [1, 2, 3, 4, 5], // Web Admin, Superintendent, Administrator, Principal, Canteen Manager
                icon: <IconDashboard stroke={1.5} />,
            },
            {
                key: "statistics",
                link: "/statistics",
                label: "School Statistics",
                requiredPermission: "users:self:read",
                showForRoles: [4, 5],
                icon: <IconGraph stroke={1.5} />,
            },
            {
                key: "reports",
                link: "/reports",
                label: "School Reports",
                requiredPermission: "reports:local:read",
                showForRoles: [4, 5],
                icon: <IconReport stroke={1.5} />,
            },
            {
                key: "adminStatistics",
                link: "/administration/statistics",
                label: "All School Statistics",
                requiredPermission: "reports:global:read",
                showForRoles: [2, 3], // Superintendent, Administrator only
                icon: <IconGraph stroke={1.5} />,
            },
            {
                key: "adminReports",
                link: "/administration/reports",
                label: "All School Reports",
                requiredPermission: "reports:global:read",
                showForRoles: [2, 3], // Superintendent, Administrator only
                icon: <IconReport stroke={1.5} />,
            },
            {
                key: "adminUsers",
                link: "/administration/users",
                label: "User Management",
                requiredPermission: "users:global:read",
                showForRoles: [1, 2, 3], // Website Admin, Superintendent, Administrator
                icon: <IconUser stroke={1.5} />,
            },
            {
                key: "adminSchools",
                link: "/administration/schools",
                label: "School Management",
                requiredPermission: "schools:global:read",
                showForRoles: [2, 3], // Superintendent, Administrator only
                icon: <IconBuilding stroke={1.5} />,
            },
            {
                key: "adminSettings",
                link: "/administration/settings",
                label: "Site Management",
                requiredPermission: "site:manage",
                showForRoles: [1], // Website Admin only
                icon: <IconSettings stroke={1.5} />,
            },
            {
                key: "notifications",
                link: "/account/notifications",
                label: "Notifications",
                requiredPermission: "notifications:self:view",
                showForRoles: [1, 2, 3, 4, 5], // All except Website Admin
                icon: (
                    <Indicator disabled={notificationsQuantity === 0}>
                        <IconNotification stroke={1.5} />
                    </Indicator>
                ),
            },
            {
                key: "profile",
                link: "/account/profile",
                label: "Profile",
                requiredPermission: "users:self:read",
                showForRoles: [1, 2, 3, 4, 5], // All roles
                icon: <IconUser stroke={1.5} />,
            },
        ];

        fetchNotificationsQuantity();
        setLinks(() => {
            return navbarContents
                .map((item) => {
                    const permissionGranted =
                        userCtx.userPermissions?.includes(item.requiredPermission) &&
                        item.showForRoles.includes(Number(userCtx.userInfo?.roleId));

                    if (permissionGranted) {
                        return (
                            <NavLink
                                href={item.link}
                                key={item.key}
                                label={item.label}
                                leftSection={item.icon}
                                active={pathname.startsWith(item.link)}
                                onClick={(event) => {
                                    if (!permissionGranted) {
                                        event.preventDefault();
                                        customLogger.warn(`User does not have permission for ${item.label}`);
                                        return;
                                    }
                                }}
                            />
                        );
                    }
                })
                .filter((item): item is JSX.Element => item !== undefined);
        });
    }, [notificationsQuantity, pathname, userCtx.userPermissions, userCtx.userInfo?.roleId]);

    return (
        <nav className={classes.navbar}>
            <div className={classes.navbarMain}>
                <div>{links}</div>
            </div>
            <div className={classes.footer}>
                {/* The logged-in user's avatar and name */}
                <Group
                    gap="sm"
                    align="center"
                    onMouseEnter={() => setIsHovered(true)}
                    onMouseLeave={() => setIsHovered(false)}
                >
                    {userCtx.userInfo?.avatarUrn && userCtx.userAvatarUrl ? (
                        <Avatar radius="xl" src={userCtx.userAvatarUrl}>
                            <IconUser />
                        </Avatar>
                    ) : (
                        <Avatar
                            radius="xl"
                            name={userCtx.userInfo?.nameFirst + " " + userCtx.userInfo?.nameLast}
                            color="initials"
                        />
                    )}
                    <Tooltip label={roles[userCtx.userInfo?.roleId || 0] || "Unknown Role"} position="top" withArrow>
                        <div>
                            <Text size="sm" fw={500}>
                                {[
                                    userCtx.userInfo?.nameFirst,
                                    userCtx.userInfo?.nameMiddle
                                        ? userCtx.userInfo.nameMiddle
                                              .split(" ")
                                              .map((n) => n[0])
                                              .join(".") + ". "
                                        : "",
                                    userCtx.userInfo?.nameLast,
                                ].join(" ")}
                            </Text>
                            <Text size="xs" c="dimmed">
                                {userCtx.userInfo?.username}
                            </Text>
                        </div>
                    </Tooltip>
                    {isHovered && (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ duration: 0.2 }}
                        >
                            <ActionIcon
                                disabled={isRefreshing}
                                variant="light"
                                size="sm"
                                onClick={() => triggerRefresh()}
                            >
                                <IconRefresh />
                            </ActionIcon>
                        </motion.div>
                    )}
                </Group>
            </div>
            <div className={classes.footer}>
                {/* <NavLink
                    href="#"
                    label="Documentation"
                    leftSection={<IconHelp className={classes.linkIcon} stroke={1.5} />}
                    onClick={(event) => {
                        event.preventDefault();
                        customLogger.info("User accessed documentation");
                        router.push("/documentation");
                    }}
                /> */}
                <NavLink
                    href="#"
                    label="Logout"
                    leftSection={<IconLogout className={classes.linkIcon} stroke={1.5} />}
                    onClick={(event) => {
                        event.preventDefault();
                        logout();
                        customLogger.info("User logged out");
                        notifications.show({
                            id: "logged-out",
                            title: "Logged Out",
                            message: "You are now logged out.",
                            icon: <IconLogout stroke={1.5} />,
                        });
                        router.push("/");
                    }}
                />
            </div>
        </nav>
    );
};
