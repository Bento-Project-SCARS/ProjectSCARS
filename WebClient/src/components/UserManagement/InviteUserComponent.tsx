"use client";

import { Role, School, UserPublic, inviteUserV1AuthInvitePost } from "@/lib/api/csclient";
import { customLogger } from "@/lib/api/customLogger";
import { GetAccessTokenHeader } from "@/lib/utils/token";
import { Button, Modal, Select, Stack, TextInput } from "@mantine/core";
import { useForm } from "@mantine/form";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { IconUserCheck, IconUserExclamation } from "@tabler/icons-react";
import { useCallback, useMemo, useRef, useEffect } from "react";

interface InviteUserComponentProps {
    modalOpen: boolean;
    setModalOpen: (open: boolean) => void;
    availableSchools: School[];
    availableRoles: Role[];
    onUserInvite?: (newUser: UserPublic) => void;
}

export function InviteUserComponent({
    modalOpen,
    setModalOpen,
    availableSchools,
    availableRoles,
    onUserInvite: onUserInvite,
}: InviteUserComponentProps) {
    const [buttonLoading, buttonStateHandler] = useDisclosure(false);

    // Track whether the username has been manually edited by the user
    const usernameManuallyEdited = useRef(false);

    // Replace multiple useState with useForm
    const form = useForm({
        initialValues: {
            email: "",
            username: "",
            role: null as number | null,
            firstName: "",
            middleName: "",
            lastName: "",
            position: "",
            assignedSchool: null as number | null,
        },
        validate: {
            email: (value) =>
                !value ? "Email is required" : /^\S+@\S+\.\S+$/.test(value) ? null : "Invalid email format",
            username: (value) => (!value ? "Username is required" : null),
            role: (value) => (!value ? "Role is required" : null),
        },
    });

    // Watch for changes in name fields and automatically generate username if it hasn't been manually edited
    form.watch("firstName", ({ value }) => {
        if (!usernameManuallyEdited.current && value) {
            generateUsername();
        }
    });

    form.watch("middleName", () => {
        if (!usernameManuallyEdited.current) {
            generateUsername();
        }
    });

    form.watch("lastName", ({ value }) => {
        if (!usernameManuallyEdited.current && value) {
            generateUsername();
        }
    });

    // Watch for manual edits to the username field
    form.watch("username", ({ value, previousValue }) => {
        // If the username was changed and it's not from our automatic generation
        // (we can detect this by checking if the change came from user input)
        if (value !== previousValue && value !== generateUsernameValue()) {
            usernameManuallyEdited.current = true;
        }
    });

    // Helper function to get what the auto-generated username would be
    const generateUsernameValue = useCallback(() => {
        const values = form.getValues();
        const { firstName, middleName, lastName } = values;
        if (firstName || lastName) {
            return `${firstName || ""}${middleName || ""}${lastName || ""}`.toLowerCase().replace(/\s+/g, "");
        }
        return "";
    }, [form]);

    // Helper function to generate username from name fields
    const generateUsername = useCallback(() => {
        const username = generateUsernameValue();
        if (username) {
            form.setFieldValue("username", username);
        }
    }, [form, generateUsernameValue]);

    // Reset the manual edit flag when modal opens
    useEffect(() => {
        if (modalOpen) {
            usernameManuallyEdited.current = false;
        }
    }, [modalOpen]);

    // Clear school assignment when role changes to an incompatible one
    useEffect(() => {
        if (form.values.role && form.values.assignedSchool) {
            const roleId = Number(form.values.role);
            if (roleId !== 4 && roleId !== 5) {
                form.setFieldValue("assignedSchool", null);
            }
        }
    }, [form.values.role, form.values.assignedSchool, form]);

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
    const handleInviteUser = useCallback(
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
                const result = await inviteUserV1AuthInvitePost({
                    headers: { Authorization: GetAccessTokenHeader() },
                    body: {
                        email: values.email,
                        username: values.username,
                        roleId: Number(values.role),
                        nameFirst: values.firstName,
                        nameMiddle: values.middleName,
                        nameLast: values.lastName,
                        position: values.position || null,
                        schoolId: values.assignedSchool ? Number(values.assignedSchool) : null,
                    },
                });
                if (result.error) {
                    throw new Error(`Failed to invite user: ${result.response.status} ${result.response.statusText}`);
                }
                notifications.show({
                    id: "invite-user-success",
                    title: "Success",
                    message: "User invited successfully",
                    color: "green",
                    icon: <IconUserCheck />,
                });
                setModalOpen(false);
                form.reset();
                usernameManuallyEdited.current = false; // Reset manual edit flag
                if (onUserInvite) onUserInvite(result.data);
            } catch (err) {
                customLogger.error(
                    err instanceof Error ? `Failed to invite user: ${err.message}` : "Failed to invite user"
                );
                notifications.show({
                    id: "invite-user-error",
                    title: "Error",
                    message: err instanceof Error ? `Failed to invite user: ${err.message}` : "Failed to invite user",
                    color: "red",
                    icon: <IconUserExclamation />,
                });
            } finally {
                buttonStateHandler.close();
            }
        },
        [buttonStateHandler, form, setModalOpen, onUserInvite]
    );

    return (
        <Modal opened={modalOpen} onClose={() => setModalOpen(false)} title="Invite New User">
            <form onSubmit={form.onSubmit(handleInviteUser)}>
                <Stack>
                    <TextInput withAsterisk label="Email" {...form.getInputProps("email")} />
                    <TextInput label="First Name" {...form.getInputProps("firstName")} />
                    <TextInput label="Middle Name" {...form.getInputProps("middleName")} />
                    <TextInput label="Last Name" {...form.getInputProps("lastName")} />
                    <TextInput withAsterisk label="Username" {...form.getInputProps("username")} />
                    <Select
                        withAsterisk
                        label="Role"
                        placeholder="Role"
                        data={roleOptions}
                        {...form.getInputProps("role")}
                    />
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
                    <Button type="submit" loading={buttonLoading} rightSection={<IconUserCheck />}>
                        Invite User
                    </Button>
                </Stack>
            </form>
        </Modal>
    );
}
