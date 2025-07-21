"use client";

import { Role, School, UserPublic, createNewUserV1AuthCreatePost } from "@/lib/api/csclient";
import { customLogger } from "@/lib/api/customLogger";
import { GetAccessTokenHeader } from "@/lib/utils/token";
import { Button, Modal, PasswordInput, Select, Stack, TextInput } from "@mantine/core";
import { useForm } from "@mantine/form";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { IconUserCheck, IconUserExclamation } from "@tabler/icons-react";
import { useCallback, useMemo, useEffect } from "react";

interface CreateUserComponentProps {
    modalOpen: boolean;
    setModalOpen: (open: boolean) => void;
    availableSchools: School[];
    availableRoles: Role[];
    onUserCreate?: (newUser: UserPublic) => void;
}

export function CreateUserComponent({
    modalOpen,
    setModalOpen,
    availableSchools,
    availableRoles,
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

    // Clear school assignment when role changes to an incompatible one
    useEffect(() => {
        if (form.values.role && form.values.assignedSchool) {
            const roleId = Number(form.values.role);
            if (roleId !== 4 && roleId !== 5) {
                form.setFieldValue("assignedSchool", null);
            }
        }
    }, [form.values.role, form.values.assignedSchool, form]);

    // Memoize handler functions
    const handleCreateUser = useCallback(
        async (values: typeof form.values) => {
            buttonStateHandler.open();

            // Check if user with this role can be assigned to a school
            if (values.assignedSchool && values.role && Number(values.role) !== 4 && Number(values.role) !== 5) {
                notifications.show({
                    id: "invalid-role-school-assignment",
                    title: "Invalid Role for School Assignment",
                    message:
                        "Only principals and canteen managers can be assigned to schools. Please change the role or remove the school assignment.",
                    color: "red",
                    icon: <IconUserExclamation />,
                });
                buttonStateHandler.close();
                return;
            }

            try {
                const result = await createNewUserV1AuthCreatePost({
                    headers: { Authorization: GetAccessTokenHeader() },
                    body: {
                        username: values.username,
                        roleId: Number(values.role),
                        password: values.password,
                        email: values.email || null,
                        nameFirst: values.firstName || null,
                        nameMiddle: values.middleName || null,
                        nameLast: values.lastName || null,
                        position: values.position || null,
                        schoolId: values.assignedSchool ? Number(values.assignedSchool) : null,
                    },
                });
                if (result.error) {
                    throw new Error(`Failed to create user: ${result.response.status} ${result.response.statusText}`);
                }
                const newUser = result.data;

                notifications.show({
                    id: "create-user-success",
                    title: "Success",
                    message: "User created successfully",
                    color: "green",
                    icon: <IconUserCheck />,
                });
                setModalOpen(false);
                form.reset();
                if (onUserCreate) onUserCreate(newUser);
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
        [buttonStateHandler, form, setModalOpen, onUserCreate]
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
                        disabled={
                            form.values.role ? Number(form.values.role) !== 4 && Number(form.values.role) !== 5 : false
                        }
                        description={
                            form.values.role && Number(form.values.role) !== 4 && Number(form.values.role) !== 5
                                ? "Only principals and canteen managers can be assigned to schools"
                                : undefined
                        }
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
