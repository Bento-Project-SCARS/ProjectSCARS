"use client";

import { LoadingComponent } from "@/components/LoadingComponent/LoadingComponent";
import {
    AnnouncementRecipients,
    announceNotificationV1NotificationsAnnouncePost,
    archiveNotificationV1NotificationsPost,
    getAllRolesV1AuthRolesGet,
    getAllUsersEndpointV1UsersAllGet,
    getUserNotificationsV1NotificationsMeGet,
    Notification,
    NotificationType,
    Role,
    School,
    UserPublic,
} from "@/lib/api/csclient";
import { customLogger } from "@/lib/api/customLogger";
import { GetAllSchools } from "@/lib/api/school";
import { notificationIcons } from "@/lib/info";
import { useUser } from "@/lib/providers/user";
import { getRelativeTime } from "@/lib/utils/date";
import { GetAccessTokenHeader } from "@/lib/utils/token";
import {
    ActionIcon,
    Avatar,
    Badge,
    Box,
    Button,
    Card,
    Checkbox,
    Container,
    Divider,
    Group,
    Modal,
    MultiSelect,
    ScrollArea,
    SegmentedControl,
    Select,
    Stack,
    Switch,
    Text,
    Textarea,
    TextInput,
    Title,
    Tooltip,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import {
    IconAlertCircle,
    IconCircleCheck,
    IconConfetti,
    IconInfoCircle,
    IconMail,
    IconMailOpened,
    IconSearch,
    IconSpeakerphone,
} from "@tabler/icons-react";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { motion } from "motion/react";
import React, { useEffect, useState } from "react";

dayjs.extend(relativeTime);

export default function NotificationsPage() {
    const userCtx = useUser();
    const [loading, setLoading] = useState(true);
    const [allNotifications, setAllNotifications] = useState<Notification[]>([]);
    const [filteredNotifications, setFilteredNotifications] = useState<Notification[]>([]);
    const [filter, setFilter] = useState("unread");
    const [search, setSearch] = useState("");
    const [selectAll, setSelectAll] = useState(false);
    const [selected, setSelected] = useState<Set<string>>(new Set());

    // Announcement modal state
    const [announcementModalOpen, announcementModalHandlers] = useDisclosure(false);
    const [announcementLoading, announcementLoadingHandlers] = useDisclosure(false);
    const [availableRoles, setAvailableRoles] = useState<Role[]>([]);
    const [availableSchools, setAvailableSchools] = useState<School[]>([]);
    const [availableUsers, setAvailableUsers] = useState<UserPublic[]>([]);

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

    // Announcement form
    const announcementForm = useForm({
        initialValues: {
            title: "",
            content: "",
            recipientType: "" as AnnouncementRecipients | "",
            roleId: null as number | null,
            schoolId: null as number | null,
            userIds: [] as string[],
            notificationType: "info" as NotificationType,
            important: false,
        },
        validate: {
            title: (value) => (!value?.trim() ? "Title is required" : null),
            content: (value) => (!value?.trim() ? "Content is required" : null),
            recipientType: (value) => (!value ? "Recipient type is required" : null),
            roleId: (value, values) => (values.recipientType === "role" && !value ? "Role is required" : null),
            schoolId: (value, values) => (values.recipientType === "school" && !value ? "School is required" : null),
            userIds: (value, values) =>
                values.recipientType === "users" && (!value || value.length === 0)
                    ? "At least one user must be selected"
                    : null,
        },
    });

    // Fetch data for announcement form
    const fetchAnnouncementData = async () => {
        try {
            const [rolesResponse, schoolsResponse, usersResponse] = await Promise.all([
                getAllRolesV1AuthRolesGet(),
                GetAllSchools(0, 1000),
                getAllUsersEndpointV1UsersAllGet({
                    query: { limit: 1000 },
                    headers: { Authorization: GetAccessTokenHeader() },
                }),
            ]);

            if (rolesResponse.data) {
                setAvailableRoles(rolesResponse.data);
            }
            if (schoolsResponse) {
                setAvailableSchools(schoolsResponse);
            }
            if (usersResponse.data) {
                setAvailableUsers(usersResponse.data);
            }
        } catch (error) {
            customLogger.error("Failed to fetch announcement data:", error);
            notifications.show({
                title: "Error",
                message: "Failed to load form data. Please try again.",
                color: "red",
                icon: <IconAlertCircle />,
            });
        }
    };

    // Handle announcement submission
    const handleAnnouncementSubmit = async (values: typeof announcementForm.values) => {
        announcementLoadingHandlers.open();

        try {
            const response = await announceNotificationV1NotificationsAnnouncePost({
                query: {
                    title: values.title,
                    content: values.content,
                    recipient_types: values.recipientType as AnnouncementRecipients,
                    important: values.important,
                    notification_type: values.notificationType,
                    ...(values.recipientType === "role" && { recipient_role_id: values.roleId }),
                    ...(values.recipientType === "school" && { recipient_school_id: values.schoolId }),
                },
                ...(values.recipientType === "users" && { body: values.userIds }),
                headers: { Authorization: GetAccessTokenHeader() },
            });

            if (response.data) {
                notifications.show({
                    title: "Success",
                    message: response.data.message || "Announcement sent successfully!",
                    color: "green",
                    icon: <IconCircleCheck />,
                });
                announcementForm.reset();
                announcementModalHandlers.close();
                // Refresh notifications to show any new ones
                handleFetch();
            }
        } catch (error) {
            customLogger.error("Failed to send announcement:", error);
            notifications.show({
                title: "Error",
                message: "Failed to send announcement. Please try again.",
                color: "red",
                icon: <IconAlertCircle />,
            });
        } finally {
            announcementLoadingHandlers.close();
        }
    };

    // Handle opening announcement modal
    const handleOpenAnnouncement = () => {
        fetchAnnouncementData();
        announcementModalHandlers.open();
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
                <Group gap="sm">
                    <TextInput
                        style={{ width: 500 }}
                        placeholder="Search notifications"
                        leftSection={<IconSearch size={14} />}
                        value={search}
                        onChange={(e) => setSearch(e.currentTarget.value)}
                    />
                    {userCtx.userPermissions?.includes("notifications:announce") && (
                        <Tooltip label="Create Announcement" withArrow>
                            <ActionIcon variant="filled" aria-label="Announce" onClick={handleOpenAnnouncement}>
                                <IconSpeakerphone />
                            </ActionIcon>
                        </Tooltip>
                    )}
                </Group>
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
                                            setSelectAll(false);
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
                    {!loading && filteredNotifications.length === 0 && (
                        <Container size="xl" mt={50} style={{ textAlign: "center" }}>
                            <IconConfetti
                                size={64}
                                style={{ margin: "auto", display: "block" }}
                                color="var(--mantine-color-dimmed)"
                            />
                            <Text size="lg" mt="xl" c="dimmed">
                                You&apos;re all good!
                            </Text>
                        </Container>
                    )}
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
                                                        <Badge>{getRelativeTime(n.created)}</Badge>
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

            {/* Announcement Modal */}
            <Modal
                opened={announcementModalOpen}
                onClose={announcementModalHandlers.close}
                title="Create Announcement"
                size="lg"
            >
                <form onSubmit={announcementForm.onSubmit(handleAnnouncementSubmit)}>
                    <Stack gap="md">
                        <TextInput
                            label="Title"
                            placeholder="Enter announcement title"
                            required
                            {...announcementForm.getInputProps("title")}
                        />

                        <Textarea
                            label="Content"
                            placeholder="Enter announcement content"
                            required
                            minRows={4}
                            {...announcementForm.getInputProps("content")}
                        />

                        <Select
                            label="Send to"
                            placeholder="Select recipient type"
                            data={[
                                { value: "all", label: "Everyone" },
                                { value: "role", label: "Everyone with a specific role" },
                                { value: "school", label: "Everyone within a specific school" },
                                { value: "users", label: "Specific users" },
                            ]}
                            required
                            {...announcementForm.getInputProps("recipientType")}
                        />

                        {announcementForm.values.recipientType === "role" && (
                            <Select
                                label="Role"
                                placeholder="Select a role"
                                data={availableRoles.map((role) => ({
                                    value: role.id?.toString() || "",
                                    label: role.description || "",
                                }))}
                                required
                                value={announcementForm.values.roleId?.toString() || null}
                                onChange={(value) =>
                                    announcementForm.setFieldValue("roleId", value ? parseInt(value) : null)
                                }
                                error={announcementForm.errors.roleId}
                            />
                        )}

                        {announcementForm.values.recipientType === "school" && (
                            <Select
                                label="School"
                                placeholder="Select a school"
                                data={availableSchools.map((school) => ({
                                    value: school.id?.toString() || "",
                                    label: school.name || "",
                                }))}
                                required
                                value={announcementForm.values.schoolId?.toString() || null}
                                onChange={(value) =>
                                    announcementForm.setFieldValue("schoolId", value ? parseInt(value) : null)
                                }
                                error={announcementForm.errors.schoolId}
                            />
                        )}

                        {announcementForm.values.recipientType === "users" && (
                            <MultiSelect
                                label="Users"
                                placeholder="Select users"
                                data={availableUsers.map((user) => ({
                                    value: user.id,
                                    label: `${user.nameFirst || ""} ${user.nameLast || ""} (${user.username})`.trim(),
                                }))}
                                required
                                searchable
                                clearable
                                {...announcementForm.getInputProps("userIds")}
                            />
                        )}

                        <Select
                            label="Notification Type"
                            placeholder="Select notification type"
                            data={[
                                { value: "info", label: "Information" },
                                { value: "success", label: "Success" },
                                { value: "warning", label: "Warning" },
                                { value: "error", label: "Error" },
                                { value: "mail", label: "Mail" },
                                { value: "security", label: "Security" },
                            ]}
                            {...announcementForm.getInputProps("notificationType")}
                        />

                        <Switch
                            label="Mark as important"
                            description="Important notifications will be highlighted for recipients"
                            {...announcementForm.getInputProps("important", { type: "checkbox" })}
                        />

                        <Group justify="flex-end" mt="md">
                            <Button
                                type="button"
                                variant="light"
                                onClick={announcementModalHandlers.close}
                                disabled={announcementLoading}
                            >
                                Cancel
                            </Button>
                            <Button
                                type="submit"
                                loading={announcementLoading}
                                leftSection={<IconSpeakerphone size={16} />}
                            >
                                Send Announcement
                            </Button>
                        </Group>
                    </Stack>
                </form>
            </Modal>
        </Box>
    );
}
