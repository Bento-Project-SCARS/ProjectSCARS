"use client";

import { LoadingComponent } from "@/components/LoadingComponent/LoadingComponent";
import classes from "@/components/MainLoginComponent/MainLoginComponent.module.css";
import { getStrength, PasswordRequirement, requirements } from "@/components/Password";
import { ProgramTitleCenter } from "@/components/ProgramTitleCenter";
import {
    getOauthConfigV1AuthConfigOauthGet,
    getUserProfileEndpointV1UsersMeGet,
    oauthUnlinkGoogleV1AuthOauthGoogleUnlinkGet,
    updateUserEndpointV1UsersPatch,
    UserPublic,
    UserUpdate,
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
    const [pwValue, setPwValue] = useState("");
    const [pwConfValue, setPwConfValue] = useState("");
    const [pwVisible, { toggle: pwVisibilityToggle }] = useDisclosure(false);
    const checks = requirements.map((requirement, index) => (
        <PasswordRequirement key={index} label={requirement.label} meets={requirement.re.test(pwValue)} />
    ));
    const pwStrength = getStrength(pwValue);
    const meterColor = pwStrength === 100 ? "teal" : pwStrength > 50 ? "yellow" : "red";
    const [nextLabel, setNextLabel] = useState("Get Started");
    const [buttonLoading, buttonLoadingHandler] = useDisclosure(false);
    const logoControls = useAnimation();
    const userChange = useForm({
        initialValues: {
            nameFirst: userInfo?.nameFirst || "",
            nameMiddle: userInfo?.nameMiddle || "",
            nameLast: userInfo?.nameLast || "",
            username: userInfo?.username || "",
            position: userInfo?.position || "",
            email: userInfo?.email || "",
        },
    });
    const [oauthSupport, setOAuthSupport] = useState<{ google: boolean; microsoft: boolean; facebook: boolean }>({
        google: false,
        // TODO: OAuth adapters below are not implemented yet.
        microsoft: false,
        facebook: false,
    });

    const welcomeSteps: [string, boolean | undefined][] = [
        ["Set your name", userPermissions?.includes("users:self:modify:name")],
        ["Set your username", userPermissions?.includes("users:self:modify:username")],
        ["Set your position", userPermissions?.includes("users:self:modify:position")],
        ["Link your email", userPermissions?.includes("users:self:modify:email")],
        ["Set your password", userPermissions?.includes("users:self:modify:password")],
        ["Link your Google/Microsoft/Facebook account", true],
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
                return !!(values.nameFirst?.trim() && values.nameLast?.trim());
            }
            currentStepIndex++;
        }

        // Username step
        if (userPermissions?.includes("users:self:modify:username")) {
            if (step === currentStepIndex) {
                return !!values.username?.trim();
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
                return !!(pwValue.trim() && pwConfValue.trim() && pwValue === pwConfValue && pwStrength >= 70);
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
        }
        if (active === maxSteps) {
            handleSubmit();
        }

        handleButtonState(active + 1);
    };

    const handleSubmit = async () => {
        buttonLoadingHandler.open();
        customLogger.debug("Submitting form values:", userChange.getValues());

        // Validate password match if password is being updated
        if (userPermissions?.includes("users:self:modify:password") && pwValue !== pwConfValue) {
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
            if (pwValue.trim()) {
                updateData.password = pwValue;
            }
        }

        updateData.forceUpdateInfo = false;
        customLogger.debug("Sending only modified fields:", updateData);

        try {
            // Call the API to update user information
            const result = await updateUserEndpointV1UsersPatch({
                body: updateData,
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

            // Redirect to the home page after successful update
            router.push("/");
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
        if (userInfo) {
            const new_values = {
                id: userInfo.id,
                username: userInfo.username || "",
                nameFirst: userInfo.nameFirst || "",
                nameMiddle: userInfo.nameMiddle || "",
                nameLast: userInfo.nameLast || "",
                position: userInfo.position || "",
                email: userInfo.email || "",
                deactivated: userInfo.deactivated,
                forceUpdateInfo: userInfo.forceUpdateInfo,
            };
            customLogger.debug("Setting form values:", new_values);
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
                        microsoft: response.microsoft,
                        facebook: response.facebook,
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
        <Modal opened={true} onClose={() => {}} size="auto" centered fullScreen withCloseButton={false}>
            <form
                onKeyDown={(e) => {
                    if (e.key === "Enter" && active < maxSteps) {
                        e.preventDefault();
                        nextStep();
                    }
                }}
            >
                <Stepper active={active} onStepClick={setActive} allowNextStepsSelect={false}>
                    {/* Welcome step */}
                    <Stepper.Step label="Welcome" description={`Welcome to ${Program.name}!`}>
                        <Group justify="center" mb="xl">
                            <Stack align="center" justify="center" pt="xl">
                                <ProgramTitleCenter classes={classes} logoControls={logoControls} />
                                <Container size="xs" mt="xl">
                                    <Text mt="md" ta="center">
                                        Hello! Welcome to{" "}
                                        <strong>
                                            {Program.name}: {Program.description}
                                        </strong>
                                    </Text>
                                    <Text mt="md" ta="center" mb="md">
                                        This is your first time here, so we will guide you through the steps to set up
                                        your account. In this onboarding process, you will be able to...
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
                            </Stack>
                        </Group>
                    </Stepper.Step>
                    {/* Name step */}
                    {userPermissions?.includes("users:self:modify:name") && (
                        <Stepper.Step label="Set Name" description={`Set your name`}>
                            <Group justify="center" mb="xl">
                                <Stack align="center" justify="center" pt="xl">
                                    <ProgramTitleCenter classes={classes} logoControls={logoControls} />
                                    <Container size="xs" mt="xl">
                                        <Text mt="md" ta="center">
                                            Please provide your <strong>full name</strong> to personalize your account
                                            experience. This will be used in reports, notifications, and other
                                            communications.
                                        </Text>
                                        <Flex justify="center" align="top" gap="md">
                                            <TextInput
                                                required
                                                mt="md"
                                                label="First"
                                                key={userChange.key("nameFirst")}
                                                {...userChange.getInputProps("nameFirst")}
                                                error={
                                                    getCurrentStepType(active) === "name" &&
                                                    !userChange.getValues().nameFirst?.trim()
                                                        ? "First name is required"
                                                        : null
                                                }
                                            />
                                            <TextInput
                                                mt="md"
                                                label="Middle"
                                                key={userChange.key("nameMiddle")}
                                                {...userChange.getInputProps("nameMiddle")}
                                            />
                                            <TextInput
                                                required
                                                mt="md"
                                                label="Last"
                                                key={userChange.key("nameLast")}
                                                {...userChange.getInputProps("nameLast")}
                                                error={
                                                    getCurrentStepType(active) === "name" &&
                                                    !userChange.getValues().nameLast?.trim()
                                                        ? "Last name is required"
                                                        : null
                                                }
                                            />
                                        </Flex>
                                    </Container>
                                </Stack>
                            </Group>
                        </Stepper.Step>
                    )}
                    {/* Username step */}
                    {userPermissions?.includes("users:self:modify:username") && (
                        <Stepper.Step label="Set Username" description={`Set your username`}>
                            <Group justify="center" mb="xl">
                                <Stack align="center" justify="center" pt="xl">
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
                                                !userChange.getValues().username?.trim()
                                                    ? "Username is required"
                                                    : null
                                            }
                                        />
                                    </Container>
                                </Stack>
                            </Group>
                        </Stepper.Step>
                    )}
                    {/* Position step */}
                    {userPermissions?.includes("users:self:modify:position") && (
                        <Stepper.Step label="Set Position" description={`Set your position`}>
                            <Group justify="center" mb="xl">
                                <Stack align="center" justify="center" pt="xl">
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
                                            defaultValue={userInfo?.position || ""}
                                            key={userChange.key("position")}
                                            {...userChange.getInputProps("position")}
                                        />
                                    </Container>
                                </Stack>
                            </Group>
                        </Stepper.Step>
                    )}
                    {/* Email step */}
                    {userPermissions?.includes("users:self:modify:email") && (
                        <Stepper.Step label="Set Email" description={`Set your email`}>
                            <Group justify="center" mb="xl">
                                <Stack align="center" justify="center" pt="xl">
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
                                            defaultValue={userInfo?.email || ""}
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
                                </Stack>
                            </Group>
                        </Stepper.Step>
                    )}
                    {/* Password step */}
                    {userPermissions?.includes("users:self:modify:password") && (
                        <Stepper.Step label="Set Password" description={`Set your password`}>
                            <Group justify="center" mb="xl">
                                <Stack align="center" justify="center" pt="xl">
                                    <ProgramTitleCenter classes={classes} logoControls={logoControls} />
                                    <Container size="xs" mt="xl">
                                        <Text mt="md" ta="center">
                                            Please set your <strong>password</strong>. This will be used to log in to
                                            the system.
                                        </Text>
                                        <PasswordInput
                                            withAsterisk
                                            label="New Password"
                                            value={pwValue}
                                            placeholder="Your new password"
                                            key={userChange.key("password")}
                                            {...userChange.getInputProps("password")}
                                            mt="md"
                                            onChange={(event) => {
                                                setPwValue(event.currentTarget.value);
                                                userChange.setFieldValue("password", event.currentTarget.value);
                                            }}
                                            onVisibilityChange={pwVisibilityToggle}
                                            error={
                                                getCurrentStepType(active) === "password" &&
                                                (!pwValue.trim() || pwStrength < 70)
                                                    ? "Strong password is required"
                                                    : null
                                            }
                                        />
                                        <TextInput
                                            withAsterisk
                                            type={pwVisible ? "text" : "password"}
                                            label="Confirm Password"
                                            value={pwConfValue}
                                            placeholder="Confirm your new password"
                                            mt="md"
                                            onChange={(event) => {
                                                setPwConfValue(event.currentTarget.value);
                                            }}
                                            error={
                                                getCurrentStepType(active) === "password" &&
                                                pwValue !== pwConfValue &&
                                                pwConfValue.length > 0
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
                                </Stack>
                            </Group>
                        </Stepper.Step>
                    )}
                    {/* OAuth step */}
                    <Stepper.Step label="OAuth Accounts" description={`Link your accounts`}>
                        <Group justify="center" mb="xl">
                            <Stack align="center" justify="center" pt="xl">
                                <ProgramTitleCenter classes={classes} logoControls={logoControls} />
                                <Container size="xs" mt="xl">
                                    <Text mt="md" ta="center">
                                        You can link your Google, Microsoft, or Facebook account to your profile for
                                        easier login and account management.
                                    </Text>
                                    <Stack mt="md">
                                        <Group justify="space-between" align="center">
                                            <Group>
                                                <Box w={30} h={30}>
                                                    <Image
                                                        src="/assets/logos/google.svg"
                                                        alt="Google Logo"
                                                        width={30}
                                                        height={30}
                                                        style={{ objectFit: "contain" }}
                                                    />
                                                </Box>
                                                <div>
                                                    <Group>
                                                        <Text size="sm" fw={500}>
                                                            Google
                                                        </Text>
                                                        <Badge
                                                            variant="filled"
                                                            color={userInfo?.oauthLinkedGoogleId ? "green" : "gray"}
                                                            size="xs"
                                                        >
                                                            {userInfo?.oauthLinkedGoogleId ? "Linked" : "Not Linked"}
                                                        </Badge>
                                                    </Group>
                                                    <Text size="xs" c="dimmed">
                                                        Link your Google account for quick sign-in
                                                    </Text>
                                                </div>
                                            </Group>
                                            {userInfo?.oauthLinkedGoogleId ? (
                                                <Button
                                                    variant="light"
                                                    color="red"
                                                    size="xs"
                                                    disabled={!oauthSupport.google}
                                                    onClick={async () => {
                                                        try {
                                                            const result =
                                                                await oauthUnlinkGoogleV1AuthOauthGoogleUnlinkGet({
                                                                    headers: { Authorization: GetAccessTokenHeader() },
                                                                });

                                                            if (result.error) {
                                                                throw new Error(
                                                                    `Failed to unlink Google account: ${result.response.status} ${result.response.statusText}`
                                                                );
                                                            }

                                                            notifications.show({
                                                                title: "Unlink Successful",
                                                                message:
                                                                    "Your Google account has been unlinked successfully.",
                                                                color: "green",
                                                            });
                                                        } catch (error) {
                                                            customLogger.error(
                                                                "Failed to unlink Google account:",
                                                                error
                                                            );
                                                            notifications.show({
                                                                title: "Unlink Failed",
                                                                message:
                                                                    "Failed to unlink your Google account. Please try again later.",
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
                                                        const response = await fetch(
                                                            `${process.env.NEXT_PUBLIC_CENTRAL_SERVER_ENDPOINT}/v1/auth/oauth/google/login`
                                                        );
                                                        const data = await response.json();
                                                        if (data.url) {
                                                            window.location.href = data.url;
                                                        }
                                                    }}
                                                >
                                                    Link Account
                                                </Button>
                                            )}
                                        </Group>
                                        <Group justify="space-between" align="center">
                                            <Group>
                                                <Box w={30} h={30}>
                                                    <Image
                                                        src="/assets/logos/microsoft.svg"
                                                        alt="Microsoft Logo"
                                                        width={30}
                                                        height={30}
                                                        style={{ objectFit: "contain" }}
                                                    />
                                                </Box>
                                                <div>
                                                    <Group>
                                                        <Text size="sm" fw={500}>
                                                            Microsoft
                                                        </Text>
                                                        <Badge
                                                            variant="filled"
                                                            color={userInfo?.oauthLinkedMicrosoftId ? "green" : "gray"}
                                                            size="xs"
                                                        >
                                                            {userInfo?.oauthLinkedMicrosoftId ? "Linked" : "Not Linked"}
                                                        </Badge>
                                                    </Group>
                                                    <Text size="xs" c="dimmed">
                                                        Link your Microsoft account for quick sign-in
                                                    </Text>
                                                </div>
                                            </Group>
                                            {userInfo?.oauthLinkedMicrosoftId ? (
                                                <Button
                                                    variant="light"
                                                    color="blue"
                                                    size="xs"
                                                    disabled={!oauthSupport.microsoft}
                                                    onClick={() => {
                                                        notifications.show({
                                                            title: "Coming Soon",
                                                            message: "Microsoft account linking will be available soon",
                                                            color: "blue",
                                                        });
                                                    }}
                                                >
                                                    Unlink Account
                                                </Button>
                                            ) : (
                                                <Button
                                                    variant="light"
                                                    color="blue"
                                                    size="xs"
                                                    disabled={!oauthSupport.microsoft}
                                                    onClick={async () => {
                                                        notifications.show({
                                                            title: "Coming Soon",
                                                            message: "Microsoft account linking will be available soon",
                                                            color: "blue",
                                                        });
                                                    }}
                                                >
                                                    Link Account
                                                </Button>
                                            )}
                                        </Group>
                                        <Group justify="space-between" align="center">
                                            <Group>
                                                <Box w={30} h={30}>
                                                    <Image
                                                        src="/assets/logos/facebook.svg"
                                                        alt="Facebook Logo"
                                                        width={30}
                                                        height={30}
                                                        style={{ objectFit: "contain" }}
                                                    />
                                                </Box>
                                                <div>
                                                    <Group>
                                                        <Text size="sm" fw={500}>
                                                            Facebook
                                                        </Text>
                                                        <Badge
                                                            variant="filled"
                                                            color={userInfo?.oauthLinkedFacebookId ? "green" : "gray"}
                                                            size="xs"
                                                        >
                                                            {userInfo?.oauthLinkedFacebookId ? "Linked" : "Not Linked"}
                                                        </Badge>
                                                    </Group>
                                                    <Text size="xs" c="dimmed">
                                                        Link your Facebook account for quick sign-in
                                                    </Text>
                                                </div>
                                            </Group>
                                            {userInfo?.oauthLinkedFacebookId ? (
                                                <Button
                                                    variant="light"
                                                    color="indigo"
                                                    size="xs"
                                                    disabled={!oauthSupport.facebook}
                                                    onClick={() => {
                                                        notifications.show({
                                                            title: "Coming Soon",
                                                            message:
                                                                "Facebook account unlinking will be available soon",
                                                            color: "blue",
                                                        });
                                                    }}
                                                >
                                                    Unlink Account
                                                </Button>
                                            ) : (
                                                <Button
                                                    variant="light"
                                                    color="indigo"
                                                    size="xs"
                                                    disabled={!oauthSupport.facebook}
                                                    onClick={async () => {
                                                        notifications.show({
                                                            title: "Coming Soon",
                                                            message: "Facebook account linking will be available soon",
                                                            color: "blue",
                                                        });
                                                    }}
                                                >
                                                    Link Account
                                                </Button>
                                            )}
                                        </Group>
                                    </Stack>
                                    <Text size="sm" c="dimmed" ta="center" mt="md">
                                        This step is optional and can be done later in the profile settings.
                                    </Text>
                                </Container>
                            </Stack>
                        </Group>
                    </Stepper.Step>
                    {/* Completed step */}
                    <Stepper.Completed>
                        <Group justify="center" mb="xl">
                            <Stack align="center" justify="center" pt="xl">
                                <ProgramTitleCenter classes={classes} logoControls={logoControls} />
                                <Container size="xs" mt="xl">
                                    <Text mt="md" ta="center">
                                        You have successfully completed the onboarding process! Your account is now set
                                        up and ready to use. If you need to make any changes later, you can do so in the
                                        profile settings.
                                    </Text>
                                    <Table mt="md">
                                        <Table.Tr>
                                            <Table.Td c="dimmed" align="right">
                                                Your name
                                            </Table.Td>
                                            <Table.Td>
                                                {" "}
                                                {userChange.getValues().nameFirst} {userChange.getValues().nameMiddle}{" "}
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
                                                {!userInfo?.oauthLinkedGoogleId &&
                                                    !userInfo?.oauthLinkedFacebookId &&
                                                    !userInfo?.oauthLinkedMicrosoftId && (
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
                                                {userInfo?.oauthLinkedMicrosoftId && (
                                                    <Badge variant="light" c="indigo" mr={4}>
                                                        <Image
                                                            src="/assets/logos/microsoft.svg"
                                                            alt="Microsoft Logo"
                                                            width={16}
                                                            height={16}
                                                            style={{ objectFit: "contain", marginRight: 4 }}
                                                        />
                                                    </Badge>
                                                )}
                                                {userInfo?.oauthLinkedFacebookId && (
                                                    <Badge variant="light" c="blue" mr={4}>
                                                        <Image
                                                            src="/assets/logos/facebook.svg"
                                                            alt="Facebook Logo"
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
                            </Stack>
                        </Group>
                    </Stepper.Completed>
                </Stepper>
                <Group justify="center" mt="xl">
                    <Button variant="default" onClick={prevStep} disabled={active === 0}>
                        Back
                    </Button>
                    <Button onClick={nextStep} loading={buttonLoading} disabled={!validateCurrentStep(active)}>
                        {nextLabel}
                    </Button>
                </Group>
                {!validateCurrentStep(active) && active < maxSteps && (
                    <Text size="sm" c="red" ta="center" mt="xs">
                        Please fill out all required fields to continue
                    </Text>
                )}
            </form>
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
