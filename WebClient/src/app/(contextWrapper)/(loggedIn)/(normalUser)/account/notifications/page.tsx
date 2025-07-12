"use client";

import { LoadingComponent } from "@/components/LoadingComponent/LoadingComponent";
import {
    Notification,
    archiveNotificationV1NotificationsPost,
    getUserNotificationsV1NotificationsMeGet,
} from "@/lib/api/csclient";
import { customLogger } from "@/lib/api/customLogger";
import { notificationIcons } from "@/lib/info";
import { GetAccessTokenHeader } from "@/lib/utils/token";
import {
    ActionIcon,
    Avatar,
    Badge,
    Box,
    Card,
    Checkbox,
    Divider,
    Group,
    ScrollArea,
    SegmentedControl,
    Select,
    Stack,
    Text,
    TextInput,
    Title,
    Tooltip,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
    IconAlertCircle,
    IconCircleCheck,
    IconInfoCircle,
    IconMail,
    IconMailOpened,
    IconSearch,
} from "@tabler/icons-react";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { motion } from "motion/react";
import React, { useEffect, useState } from "react";

dayjs.extend(relativeTime);

export default function NotificationsPage() {
    const [loading, setLoading] = useState(true);
    const [allNotifications, setAllNotifications] = useState<Notification[]>([]);
    const [filteredNotifications, setFilteredNotifications] = useState<Notification[]>([]);
    const [filter, setFilter] = useState("unread");
    const [search, setSearch] = useState("");
    const [groupBy, setGroupBy] = useState("Date");
    const [selectAll, setSelectAll] = useState(false);
    const [selected, setSelected] = useState<Set<string>>(new Set());

    const handleFetch = async () => {
        try {
            const result = await getUserNotificationsV1NotificationsMeGet({
                headers: { Authorization: GetAccessTokenHeader() },
            });

            if (result.error) {
                throw new Error(
                    `Failed to fetch notifications: ${result.response.status} ${result.response.statusText}`
                );
            }

            const data = result.data as Notification[];
            setAllNotifications(data);
        } catch (error) {
            customLogger.error("Failed to fetch notifications:", error);
        } finally {
            setLoading(false);
        }
    };

    const archiveNotificationById = async (id: string, unarchive: boolean) => {
        const result = await archiveNotificationV1NotificationsPost({
            query: { unarchive: unarchive },
            body: { notification_id: id },
            headers: { Authorization: GetAccessTokenHeader() },
        });

        if (result.error) {
            throw new Error(`Failed to archive notification: ${result.response.status} ${result.response.statusText}`);
        }

        return result.data;
    };

    const handleArchive = async (id: string, unarchive: boolean) => {
        const notif = allNotifications.find((n) => n.id === id);
        if (!notif) return;
        try {
            await archiveNotificationById(id, unarchive);

            const notifType = notif.type || "info";
            if (unarchive) {
                notifications.show({
                    id: `unarchive-${id}`,
                    title: "Notification Unarchived",
                    message: `The notification has been unarchived.`,
                    color: notificationIcons[notifType]?.[1] || "gray",
                    icon: React.createElement(notificationIcons[notifType]?.[0] || IconInfoCircle),
                });
            } else {
                notifications.show({
                    id: `archive-${id}`,
                    title: "Notification Archived",
                    message: `The notification has been archived.`,
                    color: notificationIcons[notifType]?.[1] || "gray",
                    icon: React.createElement(notificationIcons[notifType]?.[0] || IconInfoCircle),
                });
            }
            setAllNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, archived: !unarchive } : n)));
        } catch (error) {
            if (error instanceof Error) {
                notifications.show({
                    id: `error-archive-${id}`,
                    title: "Error",
                    message: `Failed to archive the notification: ${error.message}`,
                    color: "red",
                    icon: <IconAlertCircle />,
                });
            } else {
                notifications.show({
                    id: `error-archive-${id}`,
                    title: "Error",
                    message: "Failed to archive the notification.",
                    color: "red",
                    icon: <IconAlertCircle />,
                });
            }
        }
    };

    useEffect(() => {
        handleFetch();
    }, []);

    useEffect(() => {
        const updateFiltered = () => {
            let result = [...allNotifications];
            if (filter === "unread") result = result.filter((n) => !n.archived);
            if (search.trim()) {
                result = result.filter(
                    (n) =>
                        n.title.toLowerCase().includes(search.toLowerCase()) ||
                        n.content.toLowerCase().includes(search.toLowerCase())
                );
            }
            // Filter out notifications without IDs
            result = result.filter((n) => n.id !== undefined);
            setFilteredNotifications(result);
        };

        updateFiltered();
    }, [allNotifications, filter, search]);

    return (
        <Box p="md">
            <Title order={1} mb="md">
                Notifications
            </Title>
            <Divider my="md" />
            <Group justify="space-between" mb="sm">
                <SegmentedControl
                    value={filter}
                    onChange={setFilter}
                    data={[
                        { label: "All", value: "all" },
                        { label: "Unread", value: "unread" },
                    ]}
                />
                <TextInput
                    style={{ width: 500 }}
                    placeholder="Search notifications"
                    leftSection={<IconSearch size={14} />}
                    value={search}
                    onChange={(e) => setSearch(e.currentTarget.value)}
                />
                <Select
                    value={groupBy}
                    onChange={(value) => {
                        if (value) setGroupBy(value);
                    }}
                    data={["Date", "Type"]}
                />
            </Group>

            <Group mb="sm" justify="space-between">
                <Checkbox
                    label="Select all"
                    checked={selectAll}
                    onChange={(event) => {
                        const checked = event.currentTarget.checked;
                        setSelectAll(checked);
                        setSelected(
                            checked
                                ? new Set(
                                      filteredNotifications
                                          .map((n) => n.id)
                                          .filter((id): id is string => id !== undefined)
                                  )
                                : new Set()
                        );
                    }}
                    mb="sm"
                />
                {selected.size > 0 && (
                    <Group>
                        <Text>
                            {selected.size == 1
                                ? `Selected ${selected.size} notification`
                                : `Selected ${selected.size} notifications`}
                        </Text>
                        <Tooltip
                            label={(() => {
                                const ids = Array.from(selected);
                                const selectedNotifications = allNotifications.filter(
                                    (n) => n.id && ids.includes(n.id)
                                );
                                const allArchived = selectedNotifications.every((n) => n.archived);
                                const action = allArchived ? "Unarchive" : "Archive";
                                return selected.size == 1
                                    ? `${action} ${selected.size} notification`
                                    : `${action} ${selected.size} notifications`;
                            })()}
                            position="bottom"
                            withArrow
                        >
                            <ActionIcon
                                variant="light"
                                color="blue"
                                onClick={() => {
                                    if (selected.size === 0) {
                                        notifications.show({
                                            id: "no-notifications-selected",
                                            title: "No Notifications Selected",
                                            message: "Please select at least one notification to archive.",
                                            color: "yellow",
                                            icon: <IconAlertCircle />,
                                        });
                                        return;
                                    }
                                    const ids = Array.from(selected);
                                    const selectedNotifications = allNotifications.filter(
                                        (n) => n.id && ids.includes(n.id)
                                    );
                                    const allArchived = selectedNotifications.every((n) => n.archived);

                                    Promise.all(ids.map((id) => archiveNotificationById(id, allArchived)))
                                        .then(() => {
                                            notifications.show({
                                                id: `archive-${allArchived ? "un" : ""}all`,
                                                title: allArchived
                                                    ? "Notifications Unarchived"
                                                    : "Notifications Archived",
                                                message: `Successfully ${allArchived ? "unarchived" : "archived"} ${
                                                    ids.length
                                                } notifications.`,
                                                color: "green",
                                                icon: <IconCircleCheck />,
                                            });
                                            setAllNotifications((prev) =>
                                                prev.map((n) =>
                                                    n.id && ids.includes(n.id) ? { ...n, archived: !allArchived } : n
                                                )
                                            );
                                            setSelected(new Set());
                                        })
                                        .catch((error: unknown) => {
                                            if (error instanceof Error && error.message.includes("404 Not Found")) {
                                                // Ignore 404 errors
                                                return;
                                            }
                                            notifications.show({
                                                id: `error-archive-${allArchived ? "un" : ""}all`,
                                                title: `Error ${
                                                    allArchived ? "Unarchiving" : "Archiving"
                                                } Notifications`,
                                                message:
                                                    error instanceof Error
                                                        ? error.message
                                                        : "An unknown error occurred.",
                                                color: "red",
                                                icon: <IconAlertCircle />,
                                            });
                                        });
                                }}
                            >
                                {(() => {
                                    const ids = Array.from(selected);
                                    const selectedNotifications = allNotifications.filter(
                                        (n) => n.id && ids.includes(n.id)
                                    );
                                    const allArchived = selectedNotifications.every((n) => n.archived);
                                    return allArchived ? <IconMail /> : <IconMailOpened />;
                                })()}
                            </ActionIcon>
                        </Tooltip>
                    </Group>
                )}
            </Group>

            <ScrollArea h={600}>
                <Stack>
                    {loading && <LoadingComponent withBorder={false} />}
                    {!loading && filteredNotifications.length === 0 && <Text>No notifications found.</Text>}
                    {!loading &&
                        filteredNotifications
                            .slice()
                            .reverse()
                            .filter((n) => n.id !== undefined) // Filter out notifications without IDs
                            .map((n) => {
                                const notificationType = n.type || "info";
                                const IconComponent = notificationIcons[notificationType]?.[0] || IconInfoCircle;
                                const color = notificationIcons[notificationType]?.[1] || "gray";
                                const isChecked = n.id ? selected.has(n.id) : false;
                                return (
                                    <Card key={n.id} withBorder radius="md" p="md">
                                        <Group align="flex-start">
                                            <Checkbox
                                                checked={isChecked}
                                                onChange={(e) => {
                                                    if (!n.id) return;
                                                    const newSet = new Set(selected);
                                                    if (e.currentTarget.checked) newSet.add(n.id);
                                                    else newSet.delete(n.id);
                                                    setSelected(newSet);
                                                }}
                                            />
                                            <Avatar color={color} radius="xl">
                                                <IconComponent />
                                            </Avatar>
                                            <Stack gap={0} style={{ flex: 1 }}>
                                                <Group justify="space-between">
                                                    <Group>
                                                        <Text fw={500}>{n.title}</Text>
                                                        {n.important && (
                                                            <Tooltip position="bottom" label="Important" withArrow>
                                                                <Badge color="red" variant="filled" size="xs">
                                                                    Important
                                                                </Badge>
                                                            </Tooltip>
                                                        )}
                                                    </Group>
                                                    <Tooltip
                                                        position="bottom"
                                                        label={dayjs(n.created).format("YYYY-MM-DD HH:mm:ss")}
                                                        withArrow
                                                    >
                                                        <Badge>{dayjs(n.created).fromNow()}</Badge>
                                                    </Tooltip>
                                                </Group>
                                                <Text size="sm" c="dimmed">
                                                    {n.content}
                                                </Text>
                                            </Stack>
                                            {n.archived ? (
                                                <Tooltip position="bottom" label="Unarchive" withArrow>
                                                    <motion.div
                                                        whileHover={{ scale: 1.1 }}
                                                        whileTap={{ scale: 0.9 }}
                                                        style={{ cursor: "pointer" }}
                                                        onClick={() => n.id && handleArchive(n.id, n.archived || false)}
                                                    >
                                                        <ActionIcon variant="subtle">
                                                            <IconMail />
                                                        </ActionIcon>
                                                    </motion.div>
                                                </Tooltip>
                                            ) : (
                                                <Tooltip position="bottom" label="Archive" withArrow>
                                                    <motion.div
                                                        whileHover={{ scale: 1.1 }}
                                                        whileTap={{ scale: 0.9 }}
                                                        style={{ cursor: "pointer" }}
                                                        onClick={() => n.id && handleArchive(n.id, n.archived || false)}
                                                    >
                                                        <ActionIcon variant="subtle">
                                                            <IconMailOpened />
                                                        </ActionIcon>
                                                    </motion.div>
                                                </Tooltip>
                                            )}
                                        </Group>
                                    </Card>
                                );
                            })}
                </Stack>
            </ScrollArea>
        </Box>
    );
}
