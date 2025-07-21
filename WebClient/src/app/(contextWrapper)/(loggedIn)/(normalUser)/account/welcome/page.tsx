"use client";

import { LoadingComponent } from "@/components/LoadingComponent/LoadingComponent";
import classes from "@/components/MainLoginComponent/MainLoginComponent.module.css";
import { getStrength, PasswordRequirement, requirements } from "@/components/Password";
import { ProgramTitleCenter } from "@/components/ProgramTitleCenter";
import {
    getOauthConfigV1AuthConfigOauthGet,
    getUserProfileEndpointV1UsersMeGet,
    updateUserEndpointV1UsersPatch,
    deleteUserInfoEndpointV1UsersDelete,
    UserPublic,
    UserUpdate,
    UserDelete,
} from "@/lib/api/csclient";
import { customLogger } from "@/lib/api/customLogger";
import { Program } from "@/lib/info";
import { useUser } from "@/lib/providers/user";
import { GetAccessTokenHeader } from "@/lib/utils/token";
import {
    Badge,
    Box,
    Button,
    Container,
    Flex,
    Group,
    Image,
    List,
    Modal,
    PasswordInput,
    Progress,
    Stack,
    Stepper,
    Table,
    Text,
    TextInput,
    ThemeIcon,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { IconCircleCheck, IconCircleX, IconX } from "@tabler/icons-react";
import { useAnimation } from "motion/react";
import { useRouter } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

interface ProfileContentProps {
    userInfo: UserPublic | null;
    userPermissions: string[] | null;
}

function WelcomeContent({ userInfo, userPermissions }: ProfileContentProps) {
    const router = useRouter();
    const userCtx = useUser();
    const [active, setActive] = useState(0);
    const [pwVisible, { toggle: pwVisibilityToggle }] = useDisclosure(false);
    const [, forceUpdate] = useState({});
    const [nextLabel, setNextLabel] = useState("Get Started");
    const [buttonLoading, buttonLoadingHandler] = useDisclosure(false);
    const logoControls = useAnimation();
    const userChange = useForm({
        mode: "uncontrolled",
        initialValues: {
            nameFirst: userInfo?.nameFirst || "",
            nameMiddle: userInfo?.nameMiddle || "",
            nameLast: userInfo?.nameLast || "",
            username: userInfo?.username || "",
            position: userInfo?.position || "",
            email: userInfo?.email || "",
            password: "",
            confirmPassword: "",
        },
        onValuesChange: (values) => {
            // Force re-evaluation of password strength when password changes
            if (values.password !== undefined) {
                // Trigger re-render to update password strength indicators
                forceUpdate({});
            }
        },
    });
    const getCurrentPassword = () => userChange.getValues().password || "";
    const checks = requirements.map((requirement, index) => (
        <PasswordRequirement key={index} label={requirement.label} meets={requirement.re.test(getCurrentPassword())} />
    ));
    const pwStrength = getStrength(getCurrentPassword());
    const meterColor = pwStrength === 100 ? "teal" : pwStrength > 50 ? "yellow" : "red";
    const [oauthSupport, setOAuthSupport] = useState<{ google: boolean }>({
        google: false,
    });

    // Helper function to refetch user profile
    const refetchUserProfile = async () => {
        try {
            const newResult = await getUserProfileEndpointV1UsersMeGet({
                headers: { Authorization: GetAccessTokenHeader() },
            });

            if (newResult.error || !newResult.data) {
                throw new Error(
                    `Failed to fetch updated user profile: ${newResult.response.status} ${newResult.response.statusText}`
                );
            }

            userCtx.updateUserInfo(newResult.data[0], newResult.data[1]);
        } catch (error) {
            customLogger.error("Error refetching user profile:", error);
            throw error;
        }
    };

    const welcomeSteps: [string, boolean | undefined][] = [
        ["Set your name", userPermissions?.includes("users:self:modify:name")],
        ["Set your username", userPermissions?.includes("users:self:modify:username")],
        ["Set your position", userPermissions?.includes("users:self:modify:position")],
        ["Link your email", userPermissions?.includes("users:self:modify:email")],
        ["Set your password", userPermissions?.includes("users:self:modify:password")],
        ["Link your Google account for easier sign in", true],
    ];
    let maxSteps = 2; // Total number of steps in the welcome process
    maxSteps += userPermissions?.includes("users:self:modify:name") ? 1 : 0;
    maxSteps += userPermissions?.includes("users:self:modify:username") ? 1 : 0;
    maxSteps += userPermissions?.includes("users:self:modify:position") ? 1 : 0;
    maxSteps += userPermissions?.includes("users:self:modify:email") ? 1 : 0;
    maxSteps += userPermissions?.includes("users:self:modify:password") ? 1 : 0;

    const getCurrentStepType = (step: number): string => {
        let currentStepIndex = 0;

        // Welcome step
        if (step === currentStepIndex) return "welcome";
        currentStepIndex++;

        // Name step
        if (userPermissions?.includes("users:self:modify:name")) {
            if (step === currentStepIndex) return "name";
            currentStepIndex++;
        }

        // Username step
        if (userPermissions?.includes("users:self:modify:username")) {
            if (step === currentStepIndex) return "username";
            currentStepIndex++;
        }

        // Position step
        if (userPermissions?.includes("users:self:modify:position")) {
            if (step === currentStepIndex) return "position";
            currentStepIndex++;
        }

        // Email step
        if (userPermissions?.includes("users:self:modify:email")) {
            if (step === currentStepIndex) return "email";
            currentStepIndex++;
        }

        // Password step
        if (userPermissions?.includes("users:self:modify:password")) {
            if (step === currentStepIndex) return "password";
            currentStepIndex++;
        }

        // OAuth step
        if (step === currentStepIndex) return "oauth";

        return "completed";
    };

    const validateCurrentStep = (step: number): boolean => {
        const values = userChange.getValues();

        // Map the current step to the actual step based on enabled permissions
        let currentStepIndex = 0;

        // Welcome step (always present)
        if (step === currentStepIndex) return true;
        currentStepIndex++;

        // Name step
        if (userPermissions?.includes("users:self:modify:name")) {
            if (step === currentStepIndex) {
                const firstName = values.nameFirst?.trim() || "";
                const lastName = values.nameLast?.trim() || "";
                const middleName = values.nameMiddle?.trim() || "";
                return !!(
                    firstName &&
                    lastName &&
                    firstName.length <= 60 &&
                    lastName.length <= 60 &&
                    middleName.length <= 60
                );
            }
            currentStepIndex++;
        }

        // Username step
        if (userPermissions?.includes("users:self:modify:username")) {
            if (step === currentStepIndex) {
                const username = values.username?.trim() || "";
                return username.length >= 3 && username.length <= 22;
            }
            currentStepIndex++;
        }

        // Position step (optional field)
        if (userPermissions?.includes("users:self:modify:position")) {
            if (step === currentStepIndex) return true;
            currentStepIndex++;
        }

        // Email step
        if (userPermissions?.includes("users:self:modify:email")) {
            if (step === currentStepIndex) {
                const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                return !!(values.email?.trim() && emailRegex.test(values.email));
            }
            currentStepIndex++;
        }

        // Password step
        if (userPermissions?.includes("users:self:modify:password")) {
            if (step === currentStepIndex) {
                const password = values.password?.trim() || "";
                const confirmPassword = values.confirmPassword?.trim() || "";
                const passwordStrength = getStrength(password);
                return !!(password && confirmPassword && password === confirmPassword && passwordStrength >= 70);
            }
            currentStepIndex++;
        }

        // OAuth step (always present, optional)
        if (step === currentStepIndex) return true;
        currentStepIndex++;

        // Completed step
        return true;
    };

    const handleButtonState = (step: number) => {
        if (step === maxSteps) {
            setNextLabel("Finish");
        } else if (step === maxSteps + 1) {
            setNextLabel("Go to Dashboard");
        } else {
            setNextLabel("Next");
        }
    };

    const prevStep = () => {
        if (active > 0) {
            setActive((current) => current - 1);
        }
        handleButtonState(active - 1);
    };
    const nextStep = () => {
        // Validate current step before proceeding
        if (!validateCurrentStep(active)) {
            notifications.show({
                id: "validation-error",
                title: "Required Fields Missing",
                message: "Please fill out all required fields before proceeding.",
                color: "red",
                icon: <IconX />,
            });
            return;
        }

        if (active < maxSteps) {
            setActive((current) => current + 1);
        } else if (active === maxSteps) {
            handleSubmit();
            router.push("/");
        }

        handleButtonState(active + 1);
    };

    const handleSubmit = async () => {
        buttonLoadingHandler.open();
        customLogger.debug("Submitting form values:", userChange.getValues());

        // Validate password match if password is being updated
        const formValues = userChange.getValues();
        if (
            userPermissions?.includes("users:self:modify:password") &&
            formValues.password !== formValues.confirmPassword
        ) {
            notifications.show({
                id: "password-mismatch",
                title: "Password Mismatch",
                message: "The passwords do not match. Please try again.",
                color: "red",
                icon: <IconX />,
            });
            buttonLoadingHandler.close();
            return;
        }

        // Build update object with only modified fields
        const updateData: UserUpdate = {
            id: userInfo?.id || "",
            forceUpdateInfo: true,
        };

        const currentValues = userChange.getValues();

        // Only include fields that have changed and user has permission to modify
        if (userPermissions?.includes("users:self:modify:name")) {
            if (currentValues.nameFirst !== (userInfo?.nameFirst || "")) {
                updateData.nameFirst = currentValues.nameFirst;
            }
            if (currentValues.nameMiddle !== (userInfo?.nameMiddle || "")) {
                updateData.nameMiddle = currentValues.nameMiddle;
            }
            if (currentValues.nameLast !== (userInfo?.nameLast || "")) {
                updateData.nameLast = currentValues.nameLast;
            }
        }

        if (userPermissions?.includes("users:self:modify:username")) {
            if (currentValues.username !== (userInfo?.username || "")) {
                updateData.username = currentValues.username;
            }
        }

        if (userPermissions?.includes("users:self:modify:position")) {
            if (currentValues.position !== (userInfo?.position || "")) {
                updateData.position = currentValues.position;
            }
        }

        if (userPermissions?.includes("users:self:modify:email")) {
            if (currentValues.email !== (userInfo?.email || "")) {
                updateData.email = currentValues.email;
            }
        }

        if (userPermissions?.includes("users:self:modify:password")) {
            if (formValues.password?.trim()) {
                updateData.password = formValues.password;
            }
        }

        // Check for fields that were cleared (set to null/empty) and need to be deleted
        const fieldsToDelete: UserDelete = {
            id: userInfo?.id || "",
            email: false,
            nameFirst: false,
            nameMiddle: false,
            nameLast: false,
            position: false,
            schoolId: false,
        };

        // Check each field for deletion only if user has permission to modify it
        if (userPermissions?.includes("users:self:modify:email")) {
            fieldsToDelete.email =
                (currentValues.email === "" || currentValues.email === null) && userInfo?.email !== null;
        }

        if (userPermissions?.includes("users:self:modify:name")) {
            fieldsToDelete.nameFirst =
                (currentValues.nameFirst === "" || currentValues.nameFirst === null) && userInfo?.nameFirst !== null;
            fieldsToDelete.nameMiddle =
                (currentValues.nameMiddle === "" || currentValues.nameMiddle === null) && userInfo?.nameMiddle !== null;
            fieldsToDelete.nameLast =
                (currentValues.nameLast === "" || currentValues.nameLast === null) && userInfo?.nameLast !== null;
        }

        if (userPermissions?.includes("users:self:modify:position")) {
            fieldsToDelete.position =
                (currentValues.position === "" || currentValues.position === null) && userInfo?.position !== null;
        }

        const hasFieldsToDelete = Object.values(fieldsToDelete).some(
            (field, index) => index > 0 && field === true // Skip the id field at index 0
        );

        updateData.forceUpdateInfo = false;
        customLogger.debug("Sending only modified fields:", updateData);
        customLogger.debug("Fields to delete:", fieldsToDelete);
        customLogger.debug("Has fields to delete:", hasFieldsToDelete);

        try {
            // First handle field deletions if any
            if (hasFieldsToDelete) {
                const deleteResult = await deleteUserInfoEndpointV1UsersDelete({
                    body: fieldsToDelete,
                    headers: { Authorization: GetAccessTokenHeader() },
                });

                if (deleteResult.error) {
                    customLogger.error(
                        `Failed to delete user fields: ${deleteResult.response.status} ${deleteResult.response.statusText}`
                    );
                    notifications.show({
                        id: "user-delete-error",
                        title: "Delete Failed",
                        message: "Failed to clear some profile fields. Please try again.",
                        color: "red",
                        icon: <IconX />,
                    });
                    buttonLoadingHandler.close();
                    return;
                }
                customLogger.debug("Successfully deleted user fields");
            }

            // Filter out fields that were deleted from the update object to avoid conflicts
            const filteredUpdateData: UserUpdate = { ...updateData };
            if (fieldsToDelete.email) filteredUpdateData.email = undefined;
            if (fieldsToDelete.nameFirst) filteredUpdateData.nameFirst = undefined;
            if (fieldsToDelete.nameMiddle) filteredUpdateData.nameMiddle = undefined;
            if (fieldsToDelete.nameLast) filteredUpdateData.nameLast = undefined;
            if (fieldsToDelete.position) filteredUpdateData.position = undefined;

            // Then handle regular updates
            const result = await updateUserEndpointV1UsersPatch({
                body: filteredUpdateData,
                headers: { Authorization: GetAccessTokenHeader() },
            });

            if (result.error) {
                throw new Error(
                    `Failed to update user information: ${result.response.status} ${result.response.statusText}`
                );
            }

            notifications.show({
                id: "user-update-success",
                title: "Profile Updated",
                message: "Your profile has been updated successfully.",
                color: "green",
                icon: <IconCircleCheck />,
            });

            const newResult = await getUserProfileEndpointV1UsersMeGet({
                headers: { Authorization: GetAccessTokenHeader() },
            });

            if (newResult.error || !newResult.data) {
                customLogger.error(
                    `Failed to fetch updated user profile: ${newResult.response.status} ${newResult.response.statusText}`
                );
                notifications.show({
                    id: "user-fetch-error",
                    title: "Fetch Error",
                    message: "Failed to fetch your updated profile. Please try again later.",
                    color: "red",
                    icon: <IconX />,
                });
                return;
            }

            userCtx.updateUserInfo(newResult.data[0], newResult.data[1]);

            // Show completed step
            setActive(maxSteps + 1);
        } catch (error) {
            customLogger.error("Error updating user information:", error);
            notifications.show({
                id: "user-update-error",
                title: "Update Failed",
                message: "Failed to update your profile. Please try again later.",
                color: "red",
                icon: <IconX />,
            });
        } finally {
            buttonLoadingHandler.close();
        }
    };

    useEffect(() => {
        // Only initialize form values once when userInfo is first available
        // Don't reset if form has already been initialized to preserve user input
        if (userInfo && !userChange.isDirty()) {
            const new_values = {
                nameFirst: userInfo.nameFirst || "",
                nameMiddle: userInfo.nameMiddle || "",
                nameLast: userInfo.nameLast || "",
                username: userInfo.username || "",
                position: userInfo.position || "",
                email: userInfo.email || "",
                password: "",
                confirmPassword: "",
            };
            customLogger.debug("Setting initial form values:", new_values);
            userChange.setValues(new_values);
        }
    }, [userInfo]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        customLogger.debug("MainLoginComponent mounted, checking OAuth support");
        // Check if OAuth is supported by the server
        const fetchOAuthSupport = async () => {
            try {
                const result = await getOauthConfigV1AuthConfigOauthGet({
                    headers: { Authorization: GetAccessTokenHeader() },
                });

                if (result.error) {
                    throw new Error(
                        `Failed to get OAuth config: ${result.response.status} ${result.response.statusText}`
                    );
                }

                const response = result.data;
                customLogger.debug("OAuth support response:", response);
                if (response) {
                    setOAuthSupport({
                        google: response.google,
                    });
                    customLogger.info("OAuth support updated", response);
                } else {
                    customLogger.warn("No OAuth support information received from server.");
                    notifications.show({
                        id: "oauth-support-error",
                        title: "OAuth Support Error",
                        message: "Could not retrieve OAuth support information from the server.",
                        color: "yellow",
                        icon: <IconX />,
                    });
                }
            } catch (error) {
                customLogger.error("Error fetching OAuth support:", error);
                notifications.show({
                    id: "oauth-support-fetch-error",
                    title: "OAuth Support Fetch Error",
                    message: "Failed to fetch OAuth support information.",
                    color: "red",
                    icon: <IconX />,
                });
            }
        };

        fetchOAuthSupport();
    }, []);

    return (
        <Modal
            opened={true}
            onClose={() => {}}
            size="auto"
            centered
            fullScreen
            withCloseButton={false}
            styles={{
                content: {
                    overflow: "auto",
                    height: "100vh",
                },
                body: {
                    padding: 0,
                    height: "100vh",
                    display: "flex",
                    flexDirection: "column",
                },
            }}
        >
            <Container
                size="lg"
                py={{ base: "xs", sm: "md", lg: "xl" }}
                style={{ flex: 1, display: "flex", flexDirection: "column" }}
            >
                <form
                    onKeyDown={(e) => {
                        if (e.key === "Enter" && active < maxSteps) {
                            e.preventDefault();
                            nextStep();
                        }
                    }}
                    style={{ height: "100%", display: "flex", flexDirection: "column" }}
                >
                    {/* Mobile stepper - hidden but required for state management */}
                    <Stepper
                        active={active}
                        onStepClick={setActive}
                        allowNextStepsSelect={false}
                        hiddenFrom="sm"
                        styles={{
                            root: {
                                display: "none",
                            },
                        }}
                    >
                        {/* Empty placeholder steps for mobile */}
                        <Stepper.Step />
                        <Stepper.Step />
                        <Stepper.Step />
                        <Stepper.Step />
                        <Stepper.Step />
                        <Stepper.Step />
                        <Stepper.Step />
                    </Stepper>

                    {/* Desktop Stepper - visible from sm and up */}
                    <Stepper
                        active={active}
                        onStepClick={setActive}
                        allowNextStepsSelect={false}
                        visibleFrom="sm"
                        mb="xl"
                        size="sm"
                        styles={{
                            step: {
                                minWidth: "auto",
                            },
                            stepLabel: {
                                fontSize: "var(--mantine-font-size-xs)",
                                fontWeight: 500,
                            },
                            stepDescription: {
                                display: "none", // Hide descriptions to save space
                            },
                        }}
                    >
                        {/* Compact stepper content only for desktop */}
                        <Stepper.Step label="Welcome" />
                        {userPermissions?.includes("users:self:modify:name") && <Stepper.Step label="Name" />}
                        {userPermissions?.includes("users:self:modify:username") && <Stepper.Step label="Username" />}
                        {userPermissions?.includes("users:self:modify:position") && <Stepper.Step label="Position" />}
                        {userPermissions?.includes("users:self:modify:email") && <Stepper.Step label="Email" />}
                        {userPermissions?.includes("users:self:modify:password") && <Stepper.Step label="Password" />}
                        <Stepper.Step label="OAuth" />
                    </Stepper>

                    {/* Content area - responsive for both mobile and desktop */}
                    <Stack style={{ flex: 1 }} justify="center">
                        {/* Mobile progress indicator */}
                        <Group hiddenFrom="sm" justify="space-between" mb="md" px="sm">
                            <Text size="sm" c="dimmed">
                                {active === maxSteps ? "Complete!" : `Step ${active + 1} of ${maxSteps + 1}`}
                            </Text>
                            <Progress value={active === maxSteps ? 100 : (active / maxSteps) * 100} w={100} size="sm" />
                        </Group>

                        {/* Step Content - This will be the main content area */}
                        <Stack align="center" justify="center" style={{ flex: 1 }}>
                            {/* Welcome step */}
                            {active === 0 && (
                                <>
                                    <ProgramTitleCenter classes={classes} logoControls={logoControls} />
                                    <Container size="xs" mt="xl">
                                        <Text mt="md" ta="center">
                                            Hello! Welcome to{" "}
                                            <strong>
                                                {Program.name}: {Program.description}
                                            </strong>
                                        </Text>
                                        <Text mt="md" ta="center" mb="md">
                                            This is your first time here, so we will guide you through the steps to set
                                            up your account. In this onboarding process, you will be able to...
                                        </Text>
                                        <List spacing="xs" center>
                                            {welcomeSteps.map(([step, hasPermission], index) => (
                                                <List.Item
                                                    key={index}
                                                    icon={
                                                        <ThemeIcon
                                                            color={hasPermission ? "green" : "gray"}
                                                            size={20}
                                                            radius="xl"
                                                        >
                                                            {hasPermission ? <IconCircleCheck /> : <IconCircleX />}
                                                        </ThemeIcon>
                                                    }
                                                    c={hasPermission ? "dark" : "gray"}
                                                >
                                                    <Text
                                                        size="sm"
                                                        style={{
                                                            textDecoration: hasPermission ? "none" : "line-through",
                                                        }}
                                                    >
                                                        {step}
                                                    </Text>
                                                </List.Item>
                                            ))}
                                        </List>
                                    </Container>
                                </>
                            )}

                            {/* Name step */}
                            {getCurrentStepType(active) === "name" && (
                                <>
                                    <ProgramTitleCenter classes={classes} logoControls={logoControls} />
                                    <Container size="xs" mt="xl">
                                        <Text mt="md" ta="center">
                                            Please provide your <strong>full name</strong> to personalize your account
                                            experience. This will be used in reports, notifications, and other
                                            communications.
                                        </Text>
                                        <Flex
                                            justify="center"
                                            align="top"
                                            gap="md"
                                            direction={{ base: "column", sm: "row" }}
                                        >
                                            <TextInput
                                                required
                                                mt="md"
                                                label="First"
                                                key={userChange.key("nameFirst")}
                                                {...userChange.getInputProps("nameFirst")}
                                                error={
                                                    getCurrentStepType(active) === "name" &&
                                                    (!userChange.getValues().nameFirst?.trim()
                                                        ? "First name is required"
                                                        : (userChange.getValues().nameFirst?.trim().length || 0) > 60
                                                        ? "First name must be 60 characters or less"
                                                        : null)
                                                }
                                            />
                                            <TextInput
                                                mt="md"
                                                label="Middle"
                                                key={userChange.key("nameMiddle")}
                                                {...userChange.getInputProps("nameMiddle")}
                                                error={
                                                    getCurrentStepType(active) === "name" &&
                                                    (userChange.getValues().nameMiddle?.trim().length || 0) > 60
                                                        ? "Middle name must be 60 characters or less"
                                                        : null
                                                }
                                            />
                                            <TextInput
                                                required
                                                mt="md"
                                                label="Last"
                                                key={userChange.key("nameLast")}
                                                {...userChange.getInputProps("nameLast")}
                                                error={
                                                    getCurrentStepType(active) === "name" &&
                                                    (!userChange.getValues().nameLast?.trim()
                                                        ? "Last name is required"
                                                        : (userChange.getValues().nameLast?.trim().length || 0) > 60
                                                        ? "Last name must be 60 characters or less"
                                                        : null)
                                                }
                                            />
                                        </Flex>
                                    </Container>
                                </>
                            )}
                            {/* Username step */}
                            {getCurrentStepType(active) === "username" && (
                                <>
                                    <ProgramTitleCenter classes={classes} logoControls={logoControls} />
                                    <Container size="xs" mt="xl">
                                        <Text mt="md" ta="center">
                                            {userChange.getValues().nameFirst
                                                ? `Hello, ${userChange.getValues().nameFirst}! `
                                                : "It's okay, you can set your name later in the profile settings. "}
                                            Please set your <strong>username</strong>. This will be used to identify you
                                            in the system.
                                        </Text>
                                        <TextInput
                                            mt="md"
                                            label="Username"
                                            placeholder="Enter your username"
                                            required
                                            key={userChange.key("username")}
                                            {...userChange.getInputProps("username")}
                                            error={
                                                getCurrentStepType(active) === "username" &&
                                                (() => {
                                                    const username = userChange.getValues().username?.trim() || "";
                                                    if (!username) return "Username is required";
                                                    if (username.length < 3)
                                                        return "Username must be at least 3 characters";
                                                    if (username.length > 22)
                                                        return "Username must be 22 characters or less";
                                                    return null;
                                                })()
                                            }
                                        />
                                    </Container>
                                </>
                            )}
                            {/* Position step */}
                            {getCurrentStepType(active) === "position" && (
                                <>
                                    <ProgramTitleCenter classes={classes} logoControls={logoControls} />
                                    <Container size="xs" mt="xl">
                                        <Text mt="md" ta="center">
                                            Now, please enter your <strong>position</strong>. This will be used to
                                            identify your role in the system.
                                        </Text>
                                        <TextInput
                                            mt="md"
                                            label="Position"
                                            placeholder="Enter your position"
                                            key={userChange.key("position")}
                                            {...userChange.getInputProps("position")}
                                        />
                                    </Container>
                                </>
                            )}

                            {/* Email step */}
                            {getCurrentStepType(active) === "email" && (
                                <>
                                    <ProgramTitleCenter classes={classes} logoControls={logoControls} />
                                    <Container size="xs" mt="xl">
                                        <Text mt="md" ta="center">
                                            Enter your <strong>email</strong>. This will be used to contact you and for
                                            notifications. In case you forget your password, we will also use this email
                                            to reset it.
                                        </Text>
                                        <TextInput
                                            mt="md"
                                            label="Email"
                                            placeholder="Enter your email"
                                            required
                                            key={userChange.key("email")}
                                            {...userChange.getInputProps("email")}
                                            error={
                                                getCurrentStepType(active) === "email" &&
                                                (!userChange.getValues().email?.trim() ||
                                                    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
                                                        userChange.getValues().email || ""
                                                    ))
                                                    ? "Valid email is required"
                                                    : null
                                            }
                                        />
                                    </Container>
                                </>
                            )}

                            {/* Password step */}
                            {getCurrentStepType(active) === "password" && (
                                <>
                                    <ProgramTitleCenter classes={classes} logoControls={logoControls} />
                                    <Container size="xs" mt="xl">
                                        <Text mt="md" ta="center">
                                            Please set your <strong>password</strong>. This will be used to log in to
                                            the system.
                                        </Text>
                                        <PasswordInput
                                            withAsterisk
                                            label="New Password"
                                            placeholder="Your new password"
                                            key={userChange.key("password")}
                                            {...userChange.getInputProps("password")}
                                            mt="md"
                                            onVisibilityChange={pwVisibilityToggle}
                                            error={
                                                getCurrentStepType(active) === "password" &&
                                                (!userChange.getValues().password?.trim() ||
                                                    getStrength(userChange.getValues().password || "") < 70)
                                                    ? "Strong password is required"
                                                    : null
                                            }
                                        />
                                        <TextInput
                                            withAsterisk
                                            type={pwVisible ? "text" : "password"}
                                            label="Confirm Password"
                                            placeholder="Confirm your new password"
                                            key={userChange.key("confirmPassword")}
                                            {...userChange.getInputProps("confirmPassword")}
                                            mt="md"
                                            error={
                                                getCurrentStepType(active) === "password" &&
                                                userChange.getValues().password !==
                                                    userChange.getValues().confirmPassword &&
                                                (userChange.getValues().confirmPassword?.length || 0) > 0
                                                    ? "Passwords do not match"
                                                    : null
                                            }
                                        />
                                        <Text size="sm" mb={5} c="dimmed" pt={25}>
                                            Please choose a strong but memorable password.
                                        </Text>
                                        <Progress color={meterColor} value={pwStrength} size={5} mb="xs" />
                                        {checks}
                                    </Container>
                                </>
                            )}

                            {/* OAuth step */}
                            {getCurrentStepType(active) === "oauth" && (
                                <>
                                    <ProgramTitleCenter classes={classes} logoControls={logoControls} />
                                    <Container size="xs" mt="xl">
                                        <Text mt="md" ta="center">
                                            You can link your Google account to your profile for easier login and
                                            account management.
                                        </Text>
                                        <Stack mt="md">
                                            <Group justify="space-between" align="center" wrap="wrap" gap="md">
                                                <Group wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
                                                    <Box w={30} h={30} style={{ flexShrink: 0 }}>
                                                        <Image
                                                            src="/assets/logos/google.svg"
                                                            alt="Google Logo"
                                                            width={30}
                                                            height={30}
                                                            style={{ objectFit: "contain" }}
                                                        />
                                                    </Box>
                                                    <Stack gap="xs" style={{ flex: 1, minWidth: 0 }}>
                                                        <Group gap="xs" wrap="wrap">
                                                            <Text size="sm" fw={500}>
                                                                Google
                                                            </Text>
                                                            <Badge
                                                                variant="filled"
                                                                color={userInfo?.oauthLinkedGoogleId ? "green" : "gray"}
                                                                size="xs"
                                                            >
                                                                {userInfo?.oauthLinkedGoogleId
                                                                    ? "Linked"
                                                                    : "Not Linked"}
                                                            </Badge>
                                                        </Group>
                                                        <Text size="xs" c="dimmed">
                                                            Link your Google account for quick sign-in
                                                        </Text>
                                                    </Stack>
                                                </Group>
                                                <Box style={{ flexShrink: 0 }}>
                                                    {userInfo?.oauthLinkedGoogleId ? (
                                                        <Button
                                                            variant="light"
                                                            color="red"
                                                            size="xs"
                                                            disabled={!oauthSupport.google}
                                                            onClick={async () => {
                                                                try {
                                                                    const { unlinkGoogleAccountPopup } = await import(
                                                                        "@/lib/utils/oauth-popup"
                                                                    );
                                                                    await unlinkGoogleAccountPopup();

                                                                    notifications.show({
                                                                        title: "Unlink Successful",
                                                                        message:
                                                                            "Your Google account has been unlinked successfully.",
                                                                        color: "green",
                                                                    });

                                                                    // Refresh user data to update the UI
                                                                    await refetchUserProfile();
                                                                } catch (error) {
                                                                    customLogger.error(
                                                                        "Failed to unlink Google account:",
                                                                        error
                                                                    );
                                                                    notifications.show({
                                                                        title: "Unlink Failed",
                                                                        message:
                                                                            error instanceof Error
                                                                                ? error.message
                                                                                : "Failed to unlink your Google account. Please try again later.",
                                                                        color: "red",
                                                                    });
                                                                }
                                                            }}
                                                        >
                                                            Unlink Account
                                                        </Button>
                                                    ) : (
                                                        <Button
                                                            variant="light"
                                                            color="red"
                                                            size="xs"
                                                            disabled={!oauthSupport.google}
                                                            onClick={async () => {
                                                                try {
                                                                    const { linkGoogleAccountPopup } = await import(
                                                                        "@/lib/utils/oauth-popup"
                                                                    );
                                                                    await linkGoogleAccountPopup();

                                                                    notifications.show({
                                                                        title: "Link Successful",
                                                                        message:
                                                                            "Your Google account has been linked successfully.",
                                                                        color: "green",
                                                                    });

                                                                    // Refresh user data to update the UI
                                                                    await refetchUserProfile();
                                                                } catch (error) {
                                                                    customLogger.error(
                                                                        "Failed to link Google account:",
                                                                        error
                                                                    );
                                                                    notifications.show({
                                                                        title: "Link Failed",
                                                                        message:
                                                                            error instanceof Error
                                                                                ? error.message
                                                                                : "Failed to link your Google account. Please try again later.",
                                                                        color: "red",
                                                                    });
                                                                }
                                                            }}
                                                        >
                                                            Link Account
                                                        </Button>
                                                    )}
                                                </Box>
                                            </Group>
                                        </Stack>
                                        <Text size="xs" c="dimmed" ta="center" mt="md">
                                            This step is optional and can be done later in the profile settings.
                                        </Text>
                                    </Container>
                                </>
                            )}

                            {/* Completed step */}
                            {active === maxSteps && (
                                <>
                                    <ProgramTitleCenter classes={classes} logoControls={logoControls} />
                                    <Container size="xs" mt="xl">
                                        <Text mt="md" ta="center">
                                            You have successfully completed the onboarding process! Your account is now
                                            set up and ready to use. If you need to make any changes later, you can do
                                            so in the profile settings.
                                        </Text>
                                        <Table mt="md">
                                            <Table.Tr>
                                                <Table.Td c="dimmed" align="right">
                                                    Your name
                                                </Table.Td>
                                                <Table.Td>
                                                    {userChange.getValues().nameFirst}{" "}
                                                    {userChange.getValues().nameMiddle}{" "}
                                                    {userChange.getValues().nameLast}
                                                </Table.Td>
                                            </Table.Tr>
                                            <Table.Tr>
                                                <Table.Td c="dimmed" align="right">
                                                    Your username
                                                </Table.Td>
                                                <Table.Td>{userChange.getValues().username}</Table.Td>
                                            </Table.Tr>
                                            <Table.Tr>
                                                <Table.Td c="dimmed" align="right">
                                                    Your email
                                                </Table.Td>
                                                <Table.Td>{userChange.getValues().email}</Table.Td>
                                            </Table.Tr>
                                            <Table.Tr>
                                                <Table.Td c="dimmed" align="right">
                                                    Your position
                                                </Table.Td>
                                                <Table.Td>{userChange.getValues().position}</Table.Td>
                                            </Table.Tr>
                                            <Table.Tr>
                                                <Table.Td c="dimmed" align="right">
                                                    OAuth Accounts
                                                </Table.Td>
                                                <Table.Td>
                                                    {!userInfo?.oauthLinkedGoogleId && (
                                                        <Text size="sm" c="dimmed">
                                                            No accounts linked
                                                        </Text>
                                                    )}
                                                    {userInfo?.oauthLinkedGoogleId && (
                                                        <Badge variant="light" c="red" mr={4}>
                                                            <Image
                                                                src="/assets/logos/google.svg"
                                                                alt="Google Logo"
                                                                width={16}
                                                                height={16}
                                                                style={{ objectFit: "contain", marginRight: 4 }}
                                                            />
                                                        </Badge>
                                                    )}
                                                </Table.Td>
                                            </Table.Tr>
                                        </Table>
                                    </Container>
                                </>
                            )}
                        </Stack>
                    </Stack>

                    {/* Navigation buttons - responsive positioning */}
                    <Group
                        justify="center"
                        mt="xl"
                        gap="md"
                        style={{
                            position: "sticky",
                            bottom: 0,
                            backgroundColor: "var(--mantine-color-body)",
                            padding: "var(--mantine-spacing-md) 0",
                            borderTop: "1px solid var(--mantine-color-gray-3)",
                        }}
                    >
                        <Button variant="default" onClick={prevStep} disabled={active === 0} size="md">
                            Back
                        </Button>
                        <Button
                            onClick={nextStep}
                            loading={buttonLoading}
                            disabled={!validateCurrentStep(active)}
                            size="md"
                        >
                            {nextLabel}
                        </Button>
                    </Group>

                    {!validateCurrentStep(active) && active < maxSteps && (
                        <Text size="sm" c="red" ta="center" mt="xs" px="md">
                            Please fill out all required fields to continue
                        </Text>
                    )}
                </form>
            </Container>
        </Modal>
    );
}

export default function ProfilePage() {
    const userCtx = useUser();
    return (
        <Suspense fallback={<LoadingComponent message="Loading your profile..." withBorder={false} />}>
            <WelcomeContent userInfo={userCtx.userInfo} userPermissions={userCtx.userPermissions} />
        </Suspense>
    );
}
