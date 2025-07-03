"use client";

import { ProgramTitleCenter } from "@/components/ProgramTitleCenter";
import { useAuth } from "@/lib/providers/auth";
import { useUser } from "@/lib/providers/user";
import {
    Anchor,
    Button,
    Center,
    Checkbox,
    Container,
    Divider,
    Group,
    Image,
    Modal,
    Paper,
    PasswordInput,
    PinInput,
    Text,
    TextInput,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { IconCheck, IconKey, IconLogin, IconX } from "@tabler/icons-react";
import { motion, useAnimation } from "motion/react";
import { useRouter } from "next/navigation";

import classes from "@/components/MainLoginComponent/MainLoginComponent.module.css";
import {
    getOauthConfigV1AuthConfigOauthGet,
    getUserAvatarEndpointV1UsersAvatarGet,
    getUserProfileEndpointV1UsersMeGet,
    JwtToken,
    mfaOtpRecoveryV1AuthMfaOtpRecoveryPost,
    requestAccessTokenV1AuthLoginPost,
    validateMfaOtpV1AuthMfaOtpValidatePost,
    type BodyRequestAccessTokenV1AuthLoginPost,
    type UserPublic,
} from "@/lib/api/csclient";
import { noRetryClient } from "@/lib/api/customClient";
import { GetAccessTokenHeader } from "@/lib/utils/token";
import { useEffect, useState } from "react";

interface LoginFormValues {
    username: string;
    password: string;
    otpCode?: string;
    otpRecoveryCode?: string;
    rememberMe: boolean;
}

/**
 * MainLoginComponent is the main login component for the application.
 * @returns {React.ReactElement} The rendered component.
 */
export function MainLoginComponent(): React.ReactElement {
    const router = useRouter();
    const authCtx = useAuth();
    const userCtx = useUser();

    const logoControls = useAnimation();
    const [buttonLoading, buttonStateHandler] = useDisclosure(false);
    const [showMFAInput, setShowMFAInput] = useState(false);
    const [showOTPRecoveryInput, setShowOTPRecoveryInput] = useState(false);
    const [mfaNonce, setMFANonce] = useState<string | null>(null);
    const [oauthSupport, setOAuthSupport] = useState<{ google: boolean; microsoft: boolean; facebook: boolean }>({
        google: false,
        microsoft: false,
        facebook: false,
    });
    const form = useForm<LoginFormValues>({
        mode: "uncontrolled",
        initialValues: { username: "", password: "", rememberMe: true },
    });
    const otpForm = useForm<LoginFormValues>({
        mode: "uncontrolled",
        initialValues: form.getInitialValues(),
    });
    const OTPRecoveryForm = useForm<LoginFormValues>({
        mode: "uncontrolled",
        initialValues: form.getInitialValues(),
    });
    const [otpFormHasError, setOtpFormHasError] = useState(false);
    const [otpRecoveryFormHasError, setOtpRecoveryFormHasError] = useState(false);

    /**
     * Handles the login process for the user.
     * @param {LoginFormValues} values - The values from the login form.
     * @return {Promise<void>} A promise that resolves when the login is complete.
     */
    const loginUser = async (values: LoginFormValues): Promise<void> => {
        console.debug("Logging in user", {
            username: values.username,
            rememberMe: values.rememberMe,
        });
        buttonStateHandler.open();
        // make sure the user has entered both username and password.
        if (!values.username || !values.password) {
            notifications.show({
                id: "login-error",
                title: "Login failed",
                message: "Please enter both username and password.",
                color: "red",
                icon: <IconX />,
            });
            buttonStateHandler.close();
            form.setFieldValue("password", "");
            return;
        }

        try {
            if (values.otpCode && !mfaNonce) {
                notifications.show({
                    id: "mfa-nonce-error",
                    title: "MFA Error",
                    message: "MFA nonce is not available.",
                    color: "red",
                    icon: <IconX />,
                });
                setOtpFormHasError(true);
                buttonStateHandler.close();
                return;
            }

            let loginResponse: JwtToken | { [key: string]: string };
            if (!values.otpCode) {
                // Initial login attempt
                const loginFormData: BodyRequestAccessTokenV1AuthLoginPost = {
                    grant_type: "password",
                    username: values.username,
                    password: values.password,
                };

                const result = await requestAccessTokenV1AuthLoginPost({
                    body: loginFormData,
                    query: {
                        remember_me: values.rememberMe,
                    },
                    client: noRetryClient, // Use no-retry client for login to avoid retrying failed credentials
                });

                if (result.error) {
                    const errorMessage = `Failed to log in: ${result.response.status} ${result.response.statusText}`;
                    form.setFieldValue("password", "");
                    console.error(result.error);
                    throw new Error(errorMessage);
                }

                loginResponse = result.data as JwtToken | { [key: string]: string };
            } else {
                // MFA validation
                const result = await validateMfaOtpV1AuthMfaOtpValidatePost({
                    body: {
                        otp: values.otpCode || "",
                        nonce: mfaNonce || "",
                    },
                });

                if (result.error) {
                    const errorMessage = `Failed to validate TOTP: ${result.response.status} ${result.response.statusText}`;
                    console.error(result.error);
                    throw new Error(errorMessage);
                }

                loginResponse = result.data as JwtToken;
            }

            if ("otp_nonce" in loginResponse) {
                notifications.show({
                    id: "otp-required",
                    title: "OTP Required",
                    message: "Please enter the OTP from your authenticator app.",
                    color: "yellow",
                    icon: <IconKey />,
                });
                setMFANonce(loginResponse.otp_nonce as string);
                setShowMFAInput(true);
                buttonStateHandler.close();
                return;
            }

            const tokens = loginResponse as JwtToken;

            authCtx.login(tokens);

            // Fetch user info using the new API
            const userInfoResult = await getUserProfileEndpointV1UsersMeGet({
                headers: { Authorization: `Bearer ${tokens.access_token}` },
            });

            if (userInfoResult.error) {
                const errorMessage = `Failed to get user info: ${userInfoResult.response.status} ${userInfoResult.response.statusText}`;
                form.setFieldValue("password", "");
                console.error(errorMessage);
                throw new Error(errorMessage);
            }

            const [userInfo, userPermissions] = userInfoResult.data as [UserPublic, string[]];
            console.debug("User info fetched successfully", { id: userInfo.id, username: userInfo.username });

            let userAvatar: Blob | null = null;
            if (userInfo.avatarUrn) {
                const avatarResult = await getUserAvatarEndpointV1UsersAvatarGet({
                    query: { fn: userInfo.avatarUrn },
                    headers: { Authorization: GetAccessTokenHeader() },
                });

                if (!avatarResult.error) {
                    userAvatar = avatarResult.data as Blob;
                    console.debug("User avatar fetched successfully", { size: userAvatar.size });
                } else {
                    console.warn("Failed to fetch avatar:", avatarResult.error);
                    userAvatar = null;
                }
            } else {
                console.warn("No avatar found for user, using default avatar.");
            }
            userCtx.updateUserInfo(userInfo, userPermissions, userAvatar);
            console.info(`Login successful for user ${values.username}`);
            notifications.show({
                id: "login-success",
                title: "Login successful",
                message: "You are now logged in.",
                color: "green",
                icon: <IconCheck />,
            });
            router.push("/dashboard");
        } catch (error) {
            if (error instanceof Error && error.message.includes("status code 401")) {
                if (showMFAInput || values.otpCode) {
                    notifications.show({
                        id: "otp-validation-failed",
                        title: "OTP Validation failed",
                        message: "Please check your OTP code and try again.",
                        color: "red",
                        icon: <IconX />,
                    });
                    setOtpFormHasError(true);
                } else {
                    notifications.show({
                        id: "login-failed",
                        title: "Login failed",
                        message: "Please check your username and password.",
                        color: "red",
                        icon: <IconX />,
                    });
                }
            } else if (error instanceof Error && error.message.includes("status code 429")) {
                notifications.show({
                    id: "login-too-many-attempts",
                    title: "Login failed",
                    message: "Too many attempts, please try again later.",
                    color: "red",
                    icon: <IconX />,
                });
            } else {
                console.error("Error logging in:", error);
                notifications.show({
                    id: "login-error",
                    title: "Login failed",
                    message: `${error}`,
                    color: "red",
                    icon: <IconX />,
                });
            }
            buttonStateHandler.close();
        }
    };

    useEffect(() => {
        console.debug("MainLoginComponent mounted, checking OAuth support");
        // Check if OAuth is supported by the server
        getOauthConfigV1AuthConfigOauthGet()
            .then((result) => {
                console.debug("OAuth support response:", result);
                if (result.error) {
                    console.error("OAuth support error:", result.error);
                    notifications.show({
                        id: "oauth-support-error",
                        title: "OAuth Support Error",
                        message: "Could not retrieve OAuth support information from the server.",
                        color: "yellow",
                        icon: <IconX />,
                    });
                    return;
                }

                if (result.data) {
                    const response = result.data as { google: boolean; microsoft: boolean; facebook: boolean };
                    setOAuthSupport({
                        google: response.google,
                        microsoft: response.microsoft,
                        facebook: response.facebook,
                    });
                    console.info("OAuth support updated", response);
                } else {
                    console.warn("No OAuth support information received from server.");
                    notifications.show({
                        id: "oauth-support-error",
                        title: "OAuth Support Error",
                        message: "Could not retrieve OAuth support information from the server.",
                        color: "yellow",
                        icon: <IconX />,
                    });
                }
            })
            .catch((error) => {
                console.error("Error fetching OAuth support:", error);
                notifications.show({
                    id: "oauth-support-fetch-error",
                    title: "OAuth Support Fetch Error",
                    message: "Failed to fetch OAuth support information.",
                    color: "red",
                    icon: <IconX />,
                });
            });
    }, []);

    console.debug("Returning MainLoginComponent");
    return (
        <Container size={420} my={40} style={{ paddingTop: "150px" }}>
            <ProgramTitleCenter classes={classes} logoControls={logoControls} />
            <Paper withBorder shadow="md" p={30} mt={30} radius="md">
                <form
                    onSubmit={form.onSubmit(loginUser)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") {
                            e.preventDefault();
                            // except when forgot password is focused
                            if (document.activeElement?.id === "forgot-password") {
                                document.getElementById("forgot-password")?.click();
                                return;
                            }
                            form.onSubmit(loginUser)();
                        }
                    }}
                >
                    <TextInput
                        label="Username"
                        placeholder="Your username"
                        key={form.key("username")}
                        {...form.getInputProps("username")}
                    />
                    <PasswordInput
                        label="Password"
                        placeholder="Your password"
                        key={form.key("password")}
                        {...form.getInputProps("password")}
                        mt="md"
                    />
                    <Group justify="space-between" mt="lg">
                        <Checkbox label="Remember me" {...form.getInputProps("rememberMe", { type: "checkbox" })} />
                        <Anchor
                            id="forgot-password"
                            onClick={(e) => {
                                e.preventDefault();
                                router.push("/forgotPassword");
                            }}
                            component="button"
                            size="sm"
                        >
                            Forgot password?
                        </Anchor>
                    </Group>
                    <Button
                        id="login-button"
                        type="submit"
                        fullWidth
                        mt="xl"
                        loading={buttonLoading}
                        rightSection={<IconLogin />}
                        component={motion.button}
                        transition={{ type: "spring", stiffness: 500, damping: 30, mass: 1 }}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        drag
                        dragElastic={0.1}
                        dragConstraints={{ top: 0, left: 0, right: 0, bottom: 0 }}
                    >
                        Sign in
                    </Button>
                    <Divider my="lg" label="Or continue with" labelPosition="center" />
                    <Group justify="center" mt="md">
                        <Button
                            variant="light"
                            disabled={!oauthSupport.google}
                            component={motion.button}
                            transition={{ type: "spring", stiffness: 500, damping: 30, mass: 1 }}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            drag
                            dragElastic={0.1}
                            dragConstraints={{ top: 0, left: 0, right: 0, bottom: 0 }}
                            onClick={async (e: React.MouseEvent) => {
                                e.preventDefault();
                                try {
                                    const response = await fetch("http://localhost:8081/v1/auth/oauth/google/login");
                                    const data = await response.json();
                                    if (data.url) {
                                        window.location.href = data.url;
                                    }
                                } catch (error) {
                                    console.error("Error starting OAuth:", error);
                                    notifications.show({
                                        title: "Login failed",
                                        message: "Failed to start Google login process.",
                                        color: "red",
                                        icon: <IconX />,
                                    });
                                }
                            }}
                        >
                            <Image
                                src="/assets/logos/google.svg"
                                alt="Log In with Google"
                                height={20}
                                width="auto"
                                radius="sm"
                                fit="contain"
                                style={
                                    !oauthSupport.google
                                        ? { filter: "grayscale(100%)", pointerEvents: "none" }
                                        : { pointerEvents: "none" }
                                }
                            />
                        </Button>
                        {/* Microsoft OAuth Button */}
                        <Button
                            variant="light"
                            disabled={!oauthSupport.microsoft}
                            component={motion.button}
                            transition={{ type: "spring", stiffness: 500, damping: 30, mass: 1 }}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            drag
                            dragElastic={0.1}
                            dragConstraints={{ top: 0, left: 0, right: 0, bottom: 0 }}
                            onClick={async (e: React.MouseEvent) => {
                                e.preventDefault();
                                try {
                                    const response = await fetch("http://localhost:8081/v1/auth/oauth/microsoft/login");
                                    const data = await response.json();
                                    if (data.url) {
                                        window.location.href = data.url;
                                    }
                                } catch (error) {
                                    console.error("Error starting Microsoft OAuth:", error);
                                    notifications.show({
                                        title: "Login failed",
                                        message: "Failed to start Microsoft login process.",
                                        color: "red",
                                        icon: <IconX />,
                                    });
                                }
                            }}
                        >
                            <Image
                                src="/assets/logos/microsoft.svg"
                                alt="Log In with Microsoft"
                                height={20}
                                width="auto"
                                radius="sm"
                                fit="contain"
                                style={
                                    !oauthSupport.microsoft
                                        ? { filter: "grayscale(100%)", pointerEvents: "none" }
                                        : { pointerEvents: "none" }
                                }
                            />
                        </Button>
                        {/* Facebook OAuth Button */}
                        <Button
                            variant="light"
                            disabled={!oauthSupport.facebook}
                            component={motion.button}
                            transition={{ type: "spring", stiffness: 500, damping: 30, mass: 1 }}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            drag
                            dragElastic={0.1}
                            dragConstraints={{ top: 0, left: 0, right: 0, bottom: 0 }}
                            onClick={async (e: React.MouseEvent) => {
                                e.preventDefault();
                                try {
                                    const response = await fetch("http://localhost:8081/v1/auth/oauth/facebook/login");
                                    const data = await response.json();
                                    if (data.url) {
                                        window.location.href = data.url;
                                    }
                                } catch (error) {
                                    console.error("Error starting Facebook OAuth:", error);
                                    notifications.show({
                                        title: "Login failed",
                                        message: "Failed to start Facebook login process.",
                                        color: "red",
                                        icon: <IconX />,
                                    });
                                }
                            }}
                        >
                            <Image
                                src="/assets/logos/facebook.svg"
                                alt="Log In with Facebook"
                                height={20}
                                width="auto"
                                radius="sm"
                                fit="contain"
                                style={
                                    !oauthSupport.facebook
                                        ? { filter: "grayscale(100%)", pointerEvents: "none" }
                                        : { pointerEvents: "none" }
                                }
                            />
                        </Button>
                    </Group>
                </form>
            </Paper>
            <Modal
                opened={showMFAInput}
                onClose={() => {
                    setShowMFAInput(false);
                    setOtpFormHasError(false);
                    setShowOTPRecoveryInput(false);
                    otpForm.reset();
                }}
                title="Multi-Factor Authentication"
                centered
                size="md"
            >
                <form
                    onSubmit={otpForm.onSubmit((values) => {
                        if (!mfaNonce) {
                            notifications.show({
                                id: "mfa-nonce-error",
                                title: "MFA Error",
                                message: "MFA nonce is not available.",
                                color: "red",
                                icon: <IconX />,
                            });
                            setOtpFormHasError(true);
                            return;
                        }
                        loginUser({ ...form.values, otpCode: values.otpCode || "" });
                    })}
                >
                    <Center mb="lg">
                        <IconKey size={48} stroke={1.5} style={{ margin: "0.5rem" }} />
                    </Center>
                    <Text size="sm" mb="md">
                        You have previously enabled Multi-Factor Authentication (MFA) for your account. Please enter the
                        OTP code generated by your authenticator app to complete the login process.
                    </Text>
                    <Center m="xl">
                        <PinInput
                            oneTimeCode
                            key={otpForm.key("otpCode")}
                            {...otpForm.getInputProps("otpCode")}
                            length={6}
                            type="number"
                            error={otpFormHasError}
                        />
                    </Center>
                    <Center>
                        <Anchor
                            size="xs"
                            c="dimmed"
                            onClick={(e) => {
                                e.preventDefault();
                                setOtpFormHasError(false);
                                setShowMFAInput(false);
                                setShowOTPRecoveryInput(true);
                            }}
                        >
                            Can&apos;t access your authenticator app?
                        </Anchor>
                    </Center>
                    <Button type="submit" fullWidth mt="md" loading={buttonLoading}>
                        Submit
                    </Button>
                </form>
            </Modal>
            <Modal
                opened={showOTPRecoveryInput}
                onClose={() => {
                    setShowOTPRecoveryInput(false);
                    setOtpRecoveryFormHasError(false);
                    setShowMFAInput(false);
                    OTPRecoveryForm.reset();
                }}
                title="Use OTP Recovery Code"
                centered
                size="md"
            >
                <form
                    onSubmit={OTPRecoveryForm.onSubmit(async (values) => {
                        if (!mfaNonce) {
                            notifications.show({
                                id: "mfa-nonce-error",
                                title: "MFA Error",
                                message: "MFA nonce is not available.",
                                color: "red",
                                icon: <IconX />,
                            });
                            return;
                        }
                        try {
                            const result = await mfaOtpRecoveryV1AuthMfaOtpRecoveryPost({
                                body: {
                                    recovery_code: values.otpRecoveryCode || "",
                                    nonce: mfaNonce,
                                },
                            });

                            if (result.error) {
                                const errorMessage = `Failed to use OTP recovery code: ${result.response.status} ${result.response.statusText}`;
                                console.error(result.error);
                                throw new Error(errorMessage);
                            }

                            const tokens = result.data as JwtToken;
                            authCtx.login(tokens);

                            // Fetch user info using the new API
                            const userInfoResult = await getUserProfileEndpointV1UsersMeGet({
                                headers: { Authorization: `Bearer ${tokens.access_token}` },
                            });

                            if (userInfoResult.error) {
                                const errorMessage = `Failed to get user info: ${userInfoResult.response.status} ${userInfoResult.response.statusText}`;
                                console.error(errorMessage);
                                throw new Error(errorMessage);
                            }

                            const [userInfo, userPermissions] = userInfoResult.data as [UserPublic, string[]];
                            let userAvatar: Blob | null = null;
                            if (userInfo.avatarUrn) {
                                const avatarResult = await getUserAvatarEndpointV1UsersAvatarGet({
                                    query: { fn: userInfo.avatarUrn },
                                    headers: { Authorization: GetAccessTokenHeader() },
                                });

                                if (!avatarResult.error) {
                                    userAvatar = avatarResult.data as Blob;
                                } else {
                                    console.warn("Failed to fetch avatar:", avatarResult.error);
                                    userAvatar = null;
                                }
                            }
                            userCtx.updateUserInfo(userInfo, userPermissions, userAvatar);

                            notifications.show({
                                id: "otp-recovery-success",
                                title: "OTP Recovery Code Used",
                                message: "You have successfully used your OTP recovery code. OTP has been disabled.",
                                color: "green",
                                icon: <IconCheck />,
                            });
                            setOtpFormHasError(false);
                            setShowMFAInput(false);
                            router.push("/dashboard");
                        } catch (error) {
                            console.error("Error using OTP recovery code:", error);
                            notifications.show({
                                id: "otp-recovery-error",
                                title: "OTP Recovery Code Error",
                                message: `Failed to use OTP recovery code: ${error}`,
                                color: "red",
                                icon: <IconX />,
                            });
                            setOtpRecoveryFormHasError(true);
                        }
                    })}
                >
                    <Center mb="lg">
                        <IconKey size={48} stroke={1.5} style={{ margin: "0.5rem" }} />
                    </Center>
                    <Text size="sm" mb="md">
                        If you have lost access to your authenticator app, you can use your OTP recovery code to log in.
                        Please enter your recovery code below.
                    </Text>
                    <TextInput
                        label="OTP Recovery Code"
                        placeholder="Enter your OTP recovery code"
                        key={OTPRecoveryForm.key("otpRecoveryCode")}
                        {...OTPRecoveryForm.getInputProps("otpRecoveryCode")}
                        mt="md"
                        error={otpRecoveryFormHasError ? "Invalid OTP recovery code" : undefined}
                    />
                    <Button type="submit" fullWidth mt="md" loading={buttonLoading}>
                        Use Recovery Code
                    </Button>
                </form>
            </Modal>
        </Container>
    );
}
