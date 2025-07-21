"use client";

import { getStrength, PasswordRequirement, requirements } from "@/components/Password";
import { Role, School, UserDelete, UserPublic, UserUpdate } from "@/lib/api/csclient";
import { userAvatarConfig } from "@/lib/info";
import { useUser } from "@/lib/providers/user";
import { formatUTCDate } from "@/lib/utils/date";
import {
    Badge,
    Box,
    Button,
    Card,
    Center,
    FileButton,
    Flex,
    Group,
    Image,
    Modal,
    PasswordInput,
    Progress,
    Select,
    Stack,
    Switch,
    Table,
    Text,
    TextInput,
    Tooltip,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import {
    IconCircleDashedCheck,
    IconCircleDashedX,
    IconDeviceFloppy,
    IconPencilCheck,
    IconSendOff,
    IconTrash,
    IconUser,
} from "@tabler/icons-react";
import { motion } from "motion/react";

import { customLogger } from "@/lib/api/customLogger";
import { useEffect, useState } from "react";

interface EditUserProps {
    index: number;
    user: UserPublic;
    availableSchools: School[];
    availableRoles: Role[];
    setIndex: React.Dispatch<React.SetStateAction<number | null>>;
    UpdateUserInfo: (userInfo: UserUpdate) => Promise<UserPublic>;
    UploadUserAvatar: (userId: string, file: File) => Promise<UserPublic>;
    RemoveUserAvatar: (userId: string) => Promise<void>;
    DeleteUserInfo: (userDelete: UserDelete) => Promise<void>;
    fetchUserAvatar: (avatarUrn: string) => string | undefined;
    onUserUpdate?: (updatedUser: UserPublic) => void;
}

interface EditUserValues {
    id: string;
    username: string | null;
    nameFirst: string | null;
    nameMiddle: string | null;
    nameLast: string | null;
    position: string | null;
    email: string | null;
    password: string;
    school: string | null;
    role: string | null;
    deactivated: boolean;
    forceUpdateInfo: boolean;
}

export function EditUserComponent({
    index,
    user,
    availableSchools,
    availableRoles,
    setIndex,
    UpdateUserInfo,
    UploadUserAvatar,
    RemoveUserAvatar,
    DeleteUserInfo,
    fetchUserAvatar,
    onUserUpdate,
}: EditUserProps) {
    const [editUserAvatar, setEditUserAvatar] = useState<File | null>(null);
    const [editUserAvatarUrl, setEditUserAvatarUrl] = useState<string | null>(null);
    const [currentAvatarUrn, setCurrentAvatarUrn] = useState<string | null>(null);
    const [avatarRemoved, setAvatarRemoved] = useState(false);
    const [buttonLoading, buttonStateHandler] = useDisclosure(false);
    const [passwordValue, setPasswordValue] = useState("");
    const userCtx = useUser();
    const availableSchoolNames = availableSchools.map(
        (school) => `[${school.id}] ${school.name}${school.address ? ` (${school.address})` : ""}`
    );
    const availableRoleDescriptions = availableRoles.map((role) => role.description);
    const form = useForm<EditUserValues>({
        mode: "uncontrolled",
        initialValues: {
            id: user.id,
            username: user.username || null,
            nameFirst: user.nameFirst || null,
            nameMiddle: user.nameMiddle || null,
            nameLast: user.nameLast || null,
            position: user.position || null,
            email: user.email || null,
            password: "",
            school: availableSchools.find((school) => school.id === user.schoolId)
                ? `[${availableSchools.find((school) => school.id === user.schoolId)!.id}] ${
                      availableSchools.find((school) => school.id === user.schoolId)!.name
                  }${
                      availableSchools.find((school) => school.id === user.schoolId)!.address
                          ? ` (${availableSchools.find((school) => school.id === user.schoolId)!.address})`
                          : ""
                  }`
                : null,
            role: availableRoles.find((role) => role.id === user.roleId)?.description || null,
            deactivated: user.deactivated,
            forceUpdateInfo: user.forceUpdateInfo,
        },
    });

    customLogger.debug("form initial values:", form.values);
    useEffect(() => {
        customLogger.debug("EditUserComponent mounted with index:", index);
        setAvatarRemoved(false);
        setEditUserAvatar(null);
        setPasswordValue(""); // Reset password field when component mounts
        if (user.avatarUrn) {
            setCurrentAvatarUrn(user.avatarUrn);
            const avatarUrl = fetchUserAvatar(user.avatarUrn);
            setEditUserAvatarUrl(avatarUrl ? avatarUrl : null);
        } else {
            setCurrentAvatarUrn(null);
            setEditUserAvatarUrl(null);
        }
    }, [index, user, fetchUserAvatar]);

    const setAvatar = async (file: File | null) => {
        if (file === null) {
            customLogger.debug("No file selected, skipping upload...");
            return;
        }
        const fileSizeMB = file.size / (1024 * 1024);
        if (fileSizeMB > userAvatarConfig.MAX_FILE_SIZE_MB) {
            notifications.show({
                id: "file-too-large",
                title: "File Too Large",
                message: `File size ${fileSizeMB.toFixed(2)} MB exceeds the 2 MB limit.`,
                color: "red",
                icon: <IconSendOff />,
            });
            return;
        }
        if (!userAvatarConfig.ALLOWED_FILE_TYPES.includes(file.type)) {
            notifications.show({
                id: "invalid-file-type",
                title: "Invalid File Type",
                message: `Unsupported file type: ${file.type}. Allowed: JPG, PNG, WEBP.`,
                color: "red",
                icon: <IconSendOff />,
            });
            return;
        }

        setAvatarRemoved(false);
        setEditUserAvatar(file);
        setEditUserAvatarUrl((prevUrl) => {
            if (prevUrl && !currentAvatarUrn) {
                URL.revokeObjectURL(prevUrl); // Clean up previous URL
            }
            return URL.createObjectURL(file); // Create a new URL for the selected file
        });
    };

    const removeProfilePicture = () => {
        setAvatarRemoved(true);
        setEditUserAvatar(null);
        if (editUserAvatarUrl && !currentAvatarUrn) {
            URL.revokeObjectURL(editUserAvatarUrl);
        }
        setEditUserAvatarUrl(null);
    };

    const handleSave = async (values: EditUserValues): Promise<void> => {
        buttonStateHandler.open();
        const selectedSchool = availableSchools.find(
            (school) =>
                school.name === values.school ||
                `[${school.id}] ${school.name}${school.address ? ` (${school.address})` : ""}` === values.school
        );
        if (values.school && !selectedSchool) {
            notifications.show({
                id: "school-not-found",
                title: "Error",
                message: "Selected school not found.",
                color: "red",
                icon: <IconSendOff />,
            });
            buttonStateHandler.close();
            return;
        }

        const selectedRole = availableRoles.find((role) => role.description === values.role);
        if (!selectedRole) {
            notifications.show({
                id: "role-not-found",
                title: "Error",
                message: "Selected role not found.",
                color: "red",
                icon: <IconSendOff />,
            });
            buttonStateHandler.close();
            return;
        }

        // Check if user with this role can be assigned to a school
        if (selectedSchool && selectedRole.id !== 4 && selectedRole.id !== 5) {
            notifications.show({
                id: "invalid-role-school-assignment",
                title: "Invalid Role for School Assignment",
                message:
                    "Only principals and canteen managers can be assigned to schools. Please change the role first or remove the school assignment.",
                color: "red",
                icon: <IconSendOff />,
            });
            buttonStateHandler.close();
            return;
        }

        // NOTE: Only update fields that have changed
        // For nullable fields, we need to send null explicitly when they are cleared
        const newUserInfo: UserUpdate = {
            id: values.id,
            username: values.username !== user.username ? values.username : undefined,
            nameFirst: values.nameFirst !== user.nameFirst ? values.nameFirst || null : undefined,
            nameMiddle: values.nameMiddle !== user.nameMiddle ? values.nameMiddle || null : undefined,
            nameLast: values.nameLast !== user.nameLast ? values.nameLast || null : undefined,
            position: values.position !== user.position ? values.position || null : undefined,
            email: values.email !== user.email ? values.email || null : undefined,
            password: values.password && values.password.trim() !== "" ? values.password : null,
            schoolId: selectedSchool?.id !== user.schoolId ? selectedSchool?.id : undefined,
            roleId: selectedRole.id !== user.roleId ? selectedRole.id : undefined,
            deactivated: values.deactivated !== user.deactivated ? values.deactivated : undefined,
            forceUpdateInfo: values.forceUpdateInfo !== user.forceUpdateInfo ? values.forceUpdateInfo : undefined,
            finishedTutorials: null,
        };

        // Check for fields that were cleared (set to null) and need to be deleted
        const fieldsToDelete: UserDelete = {
            id: values.id,
            email: values.email === null && user.email !== null,
            nameFirst: values.nameFirst === null && user.nameFirst !== null,
            nameMiddle: values.nameMiddle === null && user.nameMiddle !== null,
            nameLast: values.nameLast === null && user.nameLast !== null,
            position: values.position === null && user.position !== null,
            schoolId: values.school === null && user.schoolId !== null,
        };

        const hasFieldsToDelete = Object.values(fieldsToDelete).some(
            (field, index) => index > 0 && field === true // Skip the id field at index 0
        );
        try {
            // First handle field deletions if any
            if (hasFieldsToDelete) {
                await DeleteUserInfo(fieldsToDelete);
                notifications.show({
                    id: "user-delete-fields-success",
                    title: "Success",
                    message: "Selected fields cleared successfully.",
                    color: "green",
                    icon: <IconPencilCheck />,
                });
            }

            // Filter out fields that were deleted from the update object to avoid conflicts
            const filteredUserInfo: UserUpdate = { ...newUserInfo };
            if (fieldsToDelete.email) filteredUserInfo.email = undefined;
            if (fieldsToDelete.nameFirst) filteredUserInfo.nameFirst = undefined;
            if (fieldsToDelete.nameMiddle) filteredUserInfo.nameMiddle = undefined;
            if (fieldsToDelete.nameLast) filteredUserInfo.nameLast = undefined;
            if (fieldsToDelete.position) filteredUserInfo.position = undefined;
            if (fieldsToDelete.schoolId) filteredUserInfo.schoolId = undefined;

            // Then handle regular updates
            let updatedUser = await UpdateUserInfo(filteredUserInfo);
            notifications.show({
                id: "user-update-success",
                title: "Success",
                message: "User information updated successfully.",
                color: "green",
                icon: <IconPencilCheck />,
            });

            if (avatarRemoved && currentAvatarUrn) {
                try {
                    customLogger.debug("Removing avatar...");
                    await RemoveUserAvatar(values.id);
                    customLogger.debug("Avatar removed successfully.");
                    notifications.show({
                        id: "avatar-remove-success",
                        title: "Success",
                        message: "Avatar removed successfully.",
                        color: "green",
                        icon: <IconPencilCheck />,
                    });
                } catch (error) {
                    if (error instanceof Error) {
                        const detail = error.message || "Failed to remove avatar.";
                        customLogger.error("Avatar removal failed:", detail);
                        notifications.show({
                            id: "avatar-remove-error",
                            title: "Avatar Removal Failed",
                            message: detail,
                            color: "red",
                            icon: <IconSendOff />,
                        });
                    }
                }
            }
            if (editUserAvatar) {
                try {
                    customLogger.debug("Uploading avatar...");
                    updatedUser = await UploadUserAvatar(values.id, editUserAvatar);
                    if (updatedUser.avatarUrn) {
                        fetchUserAvatar(updatedUser.avatarUrn);
                        customLogger.debug("Avatar uploaded successfully.");
                        notifications.show({
                            id: "avatar-upload-success",
                            title: "Success",
                            message: "Avatar uploaded successfully.",
                            color: "green",
                            icon: <IconPencilCheck />,
                        });
                    }
                } catch (error) {
                    if (error instanceof Error) {
                        const detail = error.message || "Failed to upload avatar.";
                        customLogger.error("Avatar upload failed:", detail);
                        notifications.show({
                            id: "avatar-upload-error",
                            title: "Avatar Upload Failed",
                            message: detail,
                            color: "red",
                            icon: <IconSendOff />,
                        });
                        throw new Error(detail);
                    }
                    buttonStateHandler.close();
                }
            }
            if (updatedUser.avatarUrn && updatedUser.avatarUrn.trim() !== "" && !avatarRemoved) {
                fetchUserAvatar(updatedUser.avatarUrn);
            }
            if (onUserUpdate) onUserUpdate(updatedUser);
            setIndex(null);
        } catch (error) {
            try {
                if (error instanceof Error && error.message.includes("status code 403")) {
                    const detail = error.message || "Failed to update user information.";
                    notifications.show({
                        id: "user-update-error",
                        title: "Error",
                        message: detail,
                        color: "red",
                        icon: <IconSendOff />,
                    });
                }
                customLogger.error("Update process failed:", error);
                notifications.show({
                    id: "user-update-error",
                    title: "Error",
                    message: (error as Error).message || "Failed to update user information. Please try again later.",
                    color: "red",
                    icon: <IconSendOff />,
                });
            } finally {
                buttonStateHandler.close();
            }
        }
    };

    const showRemoveButton = editUserAvatar || (currentAvatarUrn && !avatarRemoved);

    return (
        <Modal opened={index !== null} onClose={() => setIndex(null)} title="Edit User" centered size="auto">
            <Group gap="md" justify="apart" wrap="wrap" style={{ marginBottom: "1rem" }}>
                <Flex direction="column" gap="md" p="lg" style={{ flex: 1, minWidth: "300px" }}>
                    <Center>
                        <Card shadow="sm" radius="xl" withBorder style={{ position: "relative", cursor: "pointer" }}>
                            <FileButton onChange={setAvatar} accept="image/png,image/jpeg">
                                {(props) => (
                                    <motion.div
                                        whileHover={{ scale: 1.05 }}
                                        style={{ position: "relative" }}
                                        {...props}
                                    >
                                        {editUserAvatarUrl && !avatarRemoved ? (
                                            <Image
                                                id="edit-user-avatar"
                                                src={editUserAvatarUrl}
                                                alt="User Avatar"
                                                h={150}
                                                w={150}
                                                radius="xl"
                                            />
                                        ) : (
                                            <IconUser size={150} color="gray" />
                                        )}
                                        <motion.div
                                            initial={{ opacity: 0 }}
                                            whileHover={{ opacity: 1 }}
                                            style={{
                                                position: "absolute",
                                                top: 0,
                                                left: 0,
                                                right: 0,
                                                bottom: 0,
                                                backgroundColor: "rgba(0, 0, 0, 0.5)",
                                                borderRadius: "var(--mantine-radius-xl)",
                                                display: "flex",
                                                alignItems: "center",
                                                justifyContent: "center",
                                                color: "white",
                                                fontWeight: 500,
                                            }}
                                        >
                                            Upload Picture
                                        </motion.div>
                                    </motion.div>
                                )}
                            </FileButton>
                        </Card>
                    </Center>
                    {showRemoveButton && (
                        <Button variant="outline" color="red" mt="md" onClick={removeProfilePicture}>
                            Remove Profile Picture
                        </Button>
                    )}
                    <Table mt="md" verticalSpacing="xs" withRowBorders p="md">
                        <Table.Tr>
                            <Table.Td align="right">Date Created</Table.Td>
                            <Table.Td align="left" c="dimmed">
                                {formatUTCDate(user.dateCreated)}
                            </Table.Td>
                        </Table.Tr>
                        <Table.Tr>
                            <Table.Td align="right">Last Logged In Time</Table.Td>
                            {user.lastLoggedInTime ? (
                                <Table.Td align="left" c="dimmed">
                                    {formatUTCDate(user.lastLoggedInTime)}
                                </Table.Td>
                            ) : (
                                <Table.Td align="left" c="dimmed">
                                    Never
                                </Table.Td>
                            )}
                        </Table.Tr>
                        <Table.Tr>
                            <Table.Td align="right">Last Logged In IP</Table.Td>
                            {user.lastLoggedInIp ? (
                                <Table.Td align="left" c="dimmed">
                                    {user.lastLoggedInIp}
                                </Table.Td>
                            ) : (
                                <Table.Td align="left" c="dimmed">
                                    Not available
                                </Table.Td>
                            )}
                        </Table.Tr>
                        <Table.Tr>
                            <Table.Td align="right">Two-Factor Authentication</Table.Td>
                            <Table.Td align="left" c="dimmed">
                                {user.otpVerified ? (
                                    <Tooltip
                                        label="Two-Factor Authentication is enabled for this user."
                                        withArrow
                                        multiline
                                    >
                                        <Badge color="green" variant="light">
                                            Enabled
                                        </Badge>
                                    </Tooltip>
                                ) : (
                                    <Tooltip
                                        label="Two-Factor Authentication is not enabled for this user."
                                        withArrow
                                        multiline
                                    >
                                        <Badge color="red" variant="light">
                                            Disabled
                                        </Badge>
                                    </Tooltip>
                                )}
                            </Table.Td>
                        </Table.Tr>
                        <Table.Tr>
                            <Table.Td align="right">OAuth Connections</Table.Td>
                            <Table.Td align="left" c="dimmed">
                                <Flex gap="xs" wrap="wrap">
                                    {user.oauthLinkedGoogleId ? (
                                        <Tooltip label="The user has a Google account linked." withArrow multiline>
                                            <Badge color="red" variant="light">
                                                <Image
                                                    src="/assets/logos/google.svg"
                                                    alt="Google Logo"
                                                    h={16}
                                                    w={16}
                                                    style={{ pointerEvents: "none" }}
                                                />
                                            </Badge>
                                        </Tooltip>
                                    ) : (
                                        <Tooltip label="No Google account is linked to this user." withArrow multiline>
                                            <Badge color="gray" variant="light">
                                                <Image
                                                    src="/assets/logos/google.svg"
                                                    alt="Google Logo"
                                                    h={16}
                                                    w={16}
                                                    style={{
                                                        filter: "grayscale(100%)",
                                                        pointerEvents: "none",
                                                    }}
                                                />
                                            </Badge>
                                        </Tooltip>
                                    )}
                                </Flex>
                            </Table.Td>
                        </Table.Tr>
                    </Table>
                </Flex>
                <Flex direction="column" gap="md" style={{ flex: 1, minWidth: "300px" }}>
                    <form
                        onSubmit={form.onSubmit(handleSave)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") {
                                e.preventDefault();
                                form.onSubmit(handleSave)();
                            }
                        }}
                    >
                        <Tooltip
                            disabled={
                                userCtx.userInfo?.id === user?.id
                                    ? userCtx.userPermissions?.includes("users:self:modify:username")
                                    : userCtx.userPermissions?.includes("users:global:modify:username")
                            }
                            label="Username cannot be changed"
                            withArrow
                        >
                            <TextInput
                                disabled={
                                    userCtx.userInfo?.id === user?.id
                                        ? !userCtx.userPermissions?.includes("users:self:modify:username")
                                        : !userCtx.userPermissions?.includes("users:global:modify:username")
                                }
                                label="Username"
                                placeholder="Username"
                                key={form.key("username")}
                                {...form.getInputProps("username")}
                            />
                        </Tooltip>
                        <Tooltip
                            disabled={
                                userCtx.userInfo?.id === user?.id
                                    ? userCtx.userPermissions?.includes("users:self:modify:name")
                                    : userCtx.userPermissions?.includes("users:global:modify:name")
                            }
                            label="Name cannot be changed"
                            withArrow
                        >
                            <TextInput
                                disabled={
                                    userCtx.userInfo?.id === user?.id
                                        ? !userCtx.userPermissions?.includes("users:self:modify:name")
                                        : !userCtx.userPermissions?.includes("users:global:modify:name")
                                }
                                label="First Name"
                                placeholder="First Name"
                                rightSection={
                                    <IconTrash
                                        size={16}
                                        color="red"
                                        onClick={() => form.setFieldValue("nameFirst", null)}
                                        style={{
                                            opacity: 0,
                                            cursor: "pointer",
                                            transition: "opacity 0.2s ease",
                                        }}
                                        onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
                                        onMouseLeave={(e) => (e.currentTarget.style.opacity = "0")}
                                    />
                                }
                                key={form.key("nameFirst")}
                                {...form.getInputProps("nameFirst")}
                            />
                        </Tooltip>
                        <Tooltip
                            disabled={
                                userCtx.userInfo?.id === user?.id
                                    ? userCtx.userPermissions?.includes("users:self:modify:name")
                                    : userCtx.userPermissions?.includes("users:global:modify:name")
                            }
                            label="Name cannot be changed"
                            withArrow
                        >
                            <TextInput
                                disabled={
                                    userCtx.userInfo?.id === user?.id
                                        ? !userCtx.userPermissions?.includes("users:self:modify:name")
                                        : !userCtx.userPermissions?.includes("users:global:modify:name")
                                }
                                label="Middle Name"
                                placeholder="Middle Name"
                                rightSection={
                                    <IconTrash
                                        size={16}
                                        color="red"
                                        onClick={() => form.setFieldValue("nameMiddle", null)}
                                        style={{
                                            opacity: 0,
                                            cursor: "pointer",
                                            transition: "opacity 0.2s ease",
                                        }}
                                        onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
                                        onMouseLeave={(e) => (e.currentTarget.style.opacity = "0")}
                                    />
                                }
                                key={form.key("nameMiddle")}
                                {...form.getInputProps("nameMiddle")}
                            />
                        </Tooltip>
                        <Tooltip
                            disabled={
                                userCtx.userInfo?.id === user?.id
                                    ? userCtx.userPermissions?.includes("users:self:modify:name")
                                    : userCtx.userPermissions?.includes("users:global:modify:name")
                            }
                            label="Name cannot be changed"
                            withArrow
                        >
                            <TextInput
                                disabled={
                                    userCtx.userInfo?.id === user?.id
                                        ? !userCtx.userPermissions?.includes("users:self:modify:name")
                                        : !userCtx.userPermissions?.includes("users:global:modify:name")
                                }
                                label="Last Name"
                                placeholder="Last Name"
                                rightSection={
                                    <IconTrash
                                        size={16}
                                        color="red"
                                        onClick={() => form.setFieldValue("nameLast", null)}
                                        style={{
                                            opacity: 0,
                                            cursor: "pointer",
                                            transition: "opacity 0.2s ease",
                                        }}
                                        onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
                                        onMouseLeave={(e) => (e.currentTarget.style.opacity = "0")}
                                    />
                                }
                                key={form.key("nameLast")}
                                {...form.getInputProps("nameLast")}
                            />
                        </Tooltip>
                        <Tooltip
                            disabled={
                                userCtx.userInfo?.id === user?.id
                                    ? userCtx.userPermissions?.includes("users:self:modify:email")
                                    : userCtx.userPermissions?.includes("users:global:modify:email")
                            }
                            label="Email cannot be changed"
                            withArrow
                        >
                            <TextInput
                                disabled={
                                    userCtx.userInfo?.id === user?.id
                                        ? !userCtx.userPermissions?.includes("users:self:modify:email")
                                        : !userCtx.userPermissions?.includes("users:global:modify:email")
                                }
                                label="Email"
                                placeholder="Email"
                                leftSection={
                                    form.values.email &&
                                    (user.emailVerified && form.values.email === user.email ? (
                                        <Tooltip
                                            label="This email has been verified. You're good to go!"
                                            withArrow
                                            multiline
                                            w={250}
                                        >
                                            <IconCircleDashedCheck size={16} color="green" />
                                        </Tooltip>
                                    ) : (
                                        <Tooltip
                                            label="This email has not yet been verified."
                                            withArrow
                                            multiline
                                            w={250}
                                        >
                                            <IconCircleDashedX size={16} color="gray" />
                                        </Tooltip>
                                    ))
                                }
                                rightSection={
                                    <IconTrash
                                        size={16}
                                        color="red"
                                        onClick={() => form.setFieldValue("email", null)}
                                        style={{
                                            opacity: 0,
                                            cursor: "pointer",
                                            transition: "opacity 0.2s ease",
                                        }}
                                        onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
                                        onMouseLeave={(e) => (e.currentTarget.style.opacity = "0")}
                                    />
                                }
                                key={form.key("email")}
                                {...form.getInputProps("email")}
                            />
                        </Tooltip>
                        <Tooltip
                            disabled={
                                userCtx.userInfo?.id === user?.id
                                    ? userCtx.userPermissions?.includes("users:self:modify:position")
                                    : userCtx.userPermissions?.includes("users:global:modify:position")
                            }
                            label="Position cannot be changed"
                            withArrow
                        >
                            <TextInput
                                disabled={
                                    userCtx.userInfo?.id === user?.id
                                        ? !userCtx.userPermissions?.includes("users:self:modify:position")
                                        : !userCtx.userPermissions?.includes("users:global:modify:position")
                                }
                                label="Position"
                                placeholder="Position"
                                rightSection={
                                    <IconTrash
                                        size={16}
                                        color="red"
                                        onClick={() => form.setFieldValue("position", null)}
                                        style={{
                                            opacity: 0,
                                            cursor: "pointer",
                                            transition: "opacity 0.2s ease",
                                        }}
                                        onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
                                        onMouseLeave={(e) => (e.currentTarget.style.opacity = "0")}
                                    />
                                }
                                key={form.key("position")}
                                {...form.getInputProps("position")}
                            />
                        </Tooltip>
                        {/* Password Field */}
                        <Tooltip
                            disabled={
                                userCtx.userInfo?.id === user?.id
                                    ? userCtx.userPermissions?.includes("users:self:modify:password")
                                    : userCtx.userPermissions?.includes("users:global:modify:password")
                            }
                            label="Password cannot be changed"
                            withArrow
                        >
                            <Box>
                                <PasswordInput
                                    disabled={
                                        userCtx.userInfo?.id === user?.id
                                            ? !userCtx.userPermissions?.includes("users:self:modify:password")
                                            : !userCtx.userPermissions?.includes("users:global:modify:password")
                                    }
                                    label="New Password"
                                    placeholder="Leave empty to keep current password"
                                    value={passwordValue}
                                    onChange={(event) => {
                                        const newValue = event.currentTarget.value;
                                        setPasswordValue(newValue);
                                        form.setFieldValue("password", newValue);
                                    }}
                                />
                                {passwordValue && (
                                    <Stack gap="xs" mt="md">
                                        <Text size="sm" fw={500}>
                                            Password strength
                                        </Text>
                                        <Progress
                                            value={getStrength(passwordValue)}
                                            color={
                                                getStrength(passwordValue) < 50
                                                    ? "red"
                                                    : getStrength(passwordValue) < 80
                                                    ? "yellow"
                                                    : "teal"
                                            }
                                            size="sm"
                                        />
                                        <Box>
                                            {requirements.map((requirement, index) => (
                                                <PasswordRequirement
                                                    key={index}
                                                    label={requirement.label}
                                                    meets={requirement.re.test(passwordValue)}
                                                />
                                            ))}
                                        </Box>
                                    </Stack>
                                )}
                            </Box>
                        </Tooltip>
                        {(() => {
                            const currentRoleValue = form.getValues().role;
                            const currentRole = availableRoles.find((role) => role.description === currentRoleValue);
                            const canAssignToSchool = currentRole && (currentRole.id === 4 || currentRole.id === 5);
                            const roleBasedTooltipLabel = canAssignToSchool
                                ? "School cannot be changed"
                                : "Only principals and canteen managers can be assigned to schools";

                            return (
                                <Tooltip
                                    disabled={
                                        canAssignToSchool &&
                                        (userCtx.userInfo?.id === user?.id
                                            ? userCtx.userPermissions?.includes("users:self:modify:school")
                                            : userCtx.userPermissions?.includes("users:global:modify:school"))
                                    }
                                    label={roleBasedTooltipLabel}
                                    withArrow
                                >
                                    <Select
                                        disabled={
                                            !canAssignToSchool ||
                                            (userCtx.userInfo?.id === user?.id
                                                ? !userCtx.userPermissions?.includes("users:self:modify:school")
                                                : !userCtx.userPermissions?.includes("users:global:modify:school"))
                                        }
                                        label="Assigned School"
                                        placeholder={
                                            canAssignToSchool ? "School" : "Role must be Principal or Canteen Manager"
                                        }
                                        data={availableSchoolNames}
                                        key={form.key("school")}
                                        clearable
                                        searchable
                                        {...form.getInputProps("school")}
                                    />
                                </Tooltip>
                            );
                        })()}
                        <Tooltip
                            disabled={
                                userCtx.userInfo?.id === user?.id
                                    ? userCtx.userPermissions?.includes("users:self:modify:role")
                                    : userCtx.userPermissions?.includes("users:global:modify:role")
                            }
                            label="Role cannot be changed"
                            withArrow
                        >
                            <Select
                                disabled={
                                    userCtx.userInfo?.id === user?.id
                                        ? !userCtx.userPermissions?.includes("users:self:modify:role")
                                        : !userCtx.userPermissions?.includes("users:global:modify:role")
                                }
                                label="Role"
                                placeholder="Role"
                                data={availableRoleDescriptions}
                                key={form.key("role")}
                                searchable
                                {...form.getInputProps("role")}
                            />
                        </Tooltip>
                        <Group mt="md">
                            <Tooltip
                                disabled={
                                    userCtx.userInfo?.id === user?.id
                                        ? userCtx.userPermissions?.includes("users:self:deactivate")
                                        : userCtx.userPermissions?.includes("users:global:deactivate")
                                }
                                label="Deactivation status cannot be changed"
                                withArrow
                            >
                                <Switch
                                    disabled={
                                        userCtx.userInfo?.id === user?.id
                                            ? !userCtx.userPermissions?.includes("users:self:deactivate")
                                            : !userCtx.userPermissions?.includes("users:global:deactivate")
                                    }
                                    label="Deactivated"
                                    placeholder="Deactivated"
                                    key={form.key("deactivated")}
                                    {...form.getInputProps("deactivated", { type: "checkbox" })}
                                />
                            </Tooltip>
                            <Tooltip
                                disabled={
                                    userCtx.userInfo?.id === user?.id
                                        ? userCtx.userPermissions?.includes("users:self:forceupdate")
                                        : userCtx.userPermissions?.includes("users:global:forceupdate")
                                }
                                label="Force Update Required cannot be changed"
                                withArrow
                            >
                                <Switch
                                    disabled={
                                        userCtx.userInfo?.id === user?.id
                                            ? !userCtx.userPermissions?.includes("users:self:forceupdate")
                                            : !userCtx.userPermissions?.includes("users:global:forceupdate")
                                    }
                                    label="Force Update Required"
                                    placeholder="Force Update Required"
                                    key={form.key("forceUpdateInfo")}
                                    {...form.getInputProps("forceUpdateInfo", { type: "checkbox" })}
                                />
                            </Tooltip>
                        </Group>
                        <Button
                            loading={buttonLoading}
                            rightSection={<IconDeviceFloppy />}
                            type="submit"
                            fullWidth
                            mt="xl"
                        >
                            Save
                        </Button>
                    </form>
                </Flex>
            </Group>
        </Modal>
    );
}
