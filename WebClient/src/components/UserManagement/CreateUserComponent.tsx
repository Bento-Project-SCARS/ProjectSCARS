"use client";

import { Role, School, UserPublic, UserUpdate, createNewUserV1AuthCreatePost } from "@/lib/api/csclient";
import { customLogger } from "@/lib/api/customLogger";
import { GetAccessTokenHeader } from "@/lib/utils/token";
import { Button, Modal, PasswordInput, Select, Stack, TextInput } from "@mantine/core";
import { useForm } from "@mantine/form";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { IconUserCheck, IconUserExclamation } from "@tabler/icons-react";
import { useCallback, useMemo } from "react";

interface CreateUserComponentProps {
    modalOpen: boolean;
    setModalOpen: (open: boolean) => void;
    availableSchools: School[];
    availableRoles: Role[];
    UpdateUserInfo: (userInfo: UserUpdate) => Promise<UserPublic>;
    onUserCreate?: (newUser: UserPublic) => void;
}

export function CreateUserComponent({
    modalOpen,
    setModalOpen,
    availableSchools,
    availableRoles,
    UpdateUserInfo,
    onUserCreate,
}: CreateUserComponentProps) {
    const [buttonLoading, buttonStateHandler] = useDisclosure(false);

    // Replace multiple useState with useForm
    const form = useForm({
        initialValues: {
            firstName: "",
            middleName: "",
            lastName: "",
            position: "",
            email: "",
            password: "",
            username: "",
            assignedSchool: null as number | null,
            role: null as number | null,
        },
        validate: {
            username: (value) => (!value ? "Username is required" : null),
            password: (value) => (!value ? "Password is required" : null),
            role: (value) => (!value ? "Role is required" : null),
        },
    });

    // Memoize school and role data transformations
    const schoolOptions = useMemo(
        () =>
            availableSchools.map((school) => ({
                value: school.id?.toString() || "",
                label: `${school.name}${school.address ? ` (${school.address})` : ""}`,
            })),
        [availableSchools]
    );

    const roleOptions = useMemo(
        () =>
            availableRoles.map((role) => ({
                value: role.id?.toString() || "",
                label: role.description,
            })),
        [availableRoles]
    );

    // Memoize handler functions
    const handleCreateUser = useCallback(
        async (values: typeof form.values) => {
            buttonStateHandler.open();
            try {
                const result = await createNewUserV1AuthCreatePost({
                    headers: { Authorization: GetAccessTokenHeader() },
                    body: {
                        username: values.username,
                        roleId: Number(values.role),
                        password: values.password,
                    },
                });
                if (result.error) {
                    throw new Error(`Failed to create user: ${result.response.status} ${result.response.statusText}`);
                }
                const new_user = result.data;
                const updatedUser = await UpdateUserInfo({
                    id: new_user.id,
                    username: values.username,
                    email: values.email || null,
                    nameFirst: values.firstName,
                    nameMiddle: values.middleName,
                    nameLast: values.lastName,
                    position: values.position || null,
                    schoolId: values.assignedSchool ? Number(values.assignedSchool) : null,
                    roleId: Number(values.role),
                });
                notifications.show({
                    id: "create-user-success",
                    title: "Success",
                    message: "User created successfully",
                    color: "green",
                    icon: <IconUserCheck />,
                });
                setModalOpen(false);
                form.reset();
                if (onUserCreate) onUserCreate(updatedUser);
            } catch (err) {
                customLogger.error(err instanceof Error ? err.message : "Failed to create user");
                notifications.show({
                    id: "create-user-error",
                    title: "Error",
                    message: err instanceof Error ? `Failed to create user: ${err.message}` : "Failed to create user",
                    color: "red",
                    icon: <IconUserExclamation />,
                });
            } finally {
                buttonStateHandler.close();
            }
        },
        [buttonStateHandler, form, setModalOpen, UpdateUserInfo, onUserCreate]
    );

    return (
        <Modal opened={modalOpen} onClose={() => setModalOpen(false)} title="Add New User">
            <form onSubmit={form.onSubmit(handleCreateUser)}>
                <Stack>
                    <TextInput label="First Name" {...form.getInputProps("firstName")} />
                    <TextInput label="Middle Name" {...form.getInputProps("middleName")} />
                    <TextInput label="Last Name" {...form.getInputProps("lastName")} />
                    <TextInput withAsterisk label="Username" {...form.getInputProps("username")} />
                    <TextInput label="Email" {...form.getInputProps("email")} />
                    <PasswordInput withAsterisk label="Password" {...form.getInputProps("password")} />
                    <TextInput label="Position" {...form.getInputProps("position")} />
                    <Select
                        label="Assigned School"
                        placeholder="School"
                        data={schoolOptions}
                        {...form.getInputProps("assignedSchool")}
                    />
                    <Select
                        withAsterisk
                        label="Role"
                        placeholder="Role"
                        data={roleOptions}
                        {...form.getInputProps("role")}
                    />
                    <Button type="submit" loading={buttonLoading} rightSection={<IconUserCheck />}>
                        Create User
                    </Button>
                </Stack>
            </form>
        </Modal>
    );
}
