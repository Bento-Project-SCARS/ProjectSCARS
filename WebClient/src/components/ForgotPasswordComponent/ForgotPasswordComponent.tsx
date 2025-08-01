"use client";

import { ProgramTitleCenter } from "@/components/ProgramTitleCenter";
import { requestPasswordRecoveryV1AuthEmailRecoveryRequestPost } from "@/lib/api/csclient";
import { parseAPIError } from "@/lib/utils/errorParser";
import { Anchor, Button, Container, Paper, Text, TextInput } from "@mantine/core";
import { useForm } from "@mantine/form";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { IconArrowBackUp, IconMail, IconMailCancel, IconSend, IconSendOff, IconX } from "@tabler/icons-react";
import { motion, useAnimation } from "motion/react";
import { useRouter } from "next/navigation";

import classes from "@/components/ForgotPasswordComponent/ForgotPasswordComponent.module.css";
import { customLogger } from "@/lib/api/customLogger";

interface ForgotPasswordValues {
    username: string;
    email: string;
}

/**
 * ForgotPasswordComponent is the component for handling password recovery requests.
 * @returns {React.ReactElement} The rendered component.
 */
export function ForgotPasswordComponent(): React.ReactElement {
    const router = useRouter();
    const logoControls = useAnimation();
    const [requestSent, requestSentHandler] = useDisclosure(false);
    const [buttonLoading, buttonStateHandler] = useDisclosure(false);
    const form = useForm<ForgotPasswordValues>({
        mode: "uncontrolled",
        initialValues: { username: "", email: "" },
    });

    /**
     * Handles the sending of the recovery link to the user's email.
     * @param {ForgotPasswordValues} values - The values from the forgot password form.
     * @return {Promise<void>} A promise that resolves when the recovery link is sent.
     */
    const sendRecoveryLink = async (values: ForgotPasswordValues): Promise<void> => {
        customLogger.debug("Sending recovery email for user", {
            username: values.username,
            email: values.email,
        });
        buttonStateHandler.open();

        // make sure the user has entered both username and email.
        if (!values.username || !values.email) {
            const parsedError = parseAPIError(
                new Error("Username and email required"),
                "password_recovery",
                "Missing Information"
            );
            notifications.show({
                id: "forgot-password-error",
                title: parsedError.title,
                message: parsedError.message,
                color: "red",
                icon: <IconX />,
                autoClose: parsedError.isUserFriendly ? 5000 : 10000,
            });
            buttonStateHandler.close();
            return;
        }

        if (!values.email.includes("@")) {
            const parsedError = parseAPIError(new Error("Invalid email format"), "password_recovery", "Invalid Email");
            notifications.show({
                id: "forgot-password-invalid-email",
                title: parsedError.title,
                message: parsedError.message,
                color: "red",
                icon: <IconX />,
                autoClose: parsedError.isUserFriendly ? 5000 : 10000,
            });
            buttonStateHandler.close();
            return;
        }

        try {
            const result = await requestPasswordRecoveryV1AuthEmailRecoveryRequestPost({
                query: {
                    username: values.username,
                    email: values.email,
                },
            });

            const response = result.data;

            if (response?.message === "ok") {
                requestSentHandler.open();
                notifications.show({
                    id: "forgot-password-success",
                    title: "Account recovery email request sent",
                    message:
                        "If you entered the details correctly, an email will be sent. Please check your mail to proceed.",
                    color: "green",
                    icon: <IconMail />,
                });
                buttonStateHandler.close();
            } else if (response?.message === "User not found.") {
                notifications.show({
                    id: "forgot-password-user-not-found",
                    title: "Account recovery failed",
                    message: "The provided username does not exist.",
                    color: "red",
                    icon: <IconX />,
                });
                buttonStateHandler.close();
            } else if (response?.message === "The user does not have an email address set for password recovery.") {
                notifications.show({
                    id: "forgot-password-no-email",
                    title: "Account recovery failed",
                    message: "No recovery email found for the provided username.",
                    color: "red",
                    icon: <IconMailCancel />,
                });
                buttonStateHandler.close();
            } else if (response?.message === "Email does not match the user's email address.") {
                notifications.show({
                    id: "forgot-password-email-mismatch",
                    title: "Account recovery failed",
                    message: "The provided email does not match the user's email address.",
                    color: "red",
                    icon: <IconSendOff />,
                });
                buttonStateHandler.close();
            } else {
                const parsedError = parseAPIError(
                    new Error(response?.message || "Unknown recovery error"),
                    "password_recovery",
                    "Password Recovery Failed"
                );
                notifications.show({
                    id: "forgot-password-error",
                    title: parsedError.title,
                    message: parsedError.message,
                    color: "red",
                    icon: <IconX />,
                    autoClose: parsedError.isUserFriendly ? 5000 : 10000,
                });
                buttonStateHandler.close();
            }
        } catch (error) {
            customLogger.error("Unexpected error sending recovery email:", error);
            const parsedError = parseAPIError(error, "password_recovery", "Password Recovery Failed");
            notifications.show({
                id: "forgot-password-error",
                title: parsedError.title,
                message: parsedError.message,
                color: "red",
                icon: <IconX />,
                autoClose: parsedError.isUserFriendly ? 5000 : 10000,
            });
            buttonStateHandler.close();
        }
    };

    customLogger.debug("Returning ForgotPasswordComponent");
    return (
        <div>
            {/* Before the request is sent, show the form */}
            {!requestSent && (
                <Container size={420} my={40} style={{ paddingTop: "150px" }}>
                    <ProgramTitleCenter classes={classes} logoControls={logoControls} />
                    <Paper withBorder shadow="md" p={30} mt={30} radius="md">
                        <form onSubmit={form.onSubmit(sendRecoveryLink)}>
                            <TextInput
                                label="Username"
                                placeholder="Your username"
                                key={form.key("username")}
                                {...form.getInputProps("username")}
                            />
                            <TextInput
                                label="Email"
                                placeholder="Your email"
                                key={form.key("email")}
                                {...form.getInputProps("email")}
                            />
                            <Container style={{ display: "flex", gap: "1rem" }}>
                                <Button
                                    id="login-button"
                                    type="submit"
                                    fullWidth
                                    mt="xl"
                                    loading={buttonLoading}
                                    rightSection={<IconSend />}
                                    component={motion.button}
                                    transition={{ type: "spring", stiffness: 500, damping: 30, mass: 1 }}
                                    whileHover={{ scale: 1.05 }}
                                    whileTap={{ scale: 0.95 }}
                                >
                                    Send Recovery Link
                                </Button>
                            </Container>
                            <Text size="xs" mt="xs" c="dimmed" style={{ textAlign: "center" }}>
                                If you have forgotten your password, enter your username and email address to receive a
                                recovery link.
                            </Text>
                            <Anchor size="xs" mt="md" c="dimmed" onClick={() => router.back()}>
                                Go back to previous page
                            </Anchor>
                        </form>
                    </Paper>
                </Container>
            )}
            {/* After the request is sent, show the confirmation message */}
            {requestSent && (
                <Container size={420} my={40} style={{ paddingTop: "150px" }}>
                    <ProgramTitleCenter classes={classes} logoControls={logoControls} />
                    <Paper withBorder shadow="md" p={30} mt={30} radius="md">
                        <Text size="lg" ta="center">
                            Recovery link sent!
                        </Text>
                        <Text size="sm" ta="center" mt={10}>
                            If you entered your account details correctly, an email will be sent to you. Please check
                            your email for the recovery link and follow the instructions to reset your password.
                        </Text>
                        <Button
                            variant="light"
                            color="blue"
                            fullWidth
                            mt="xl"
                            leftSection={<IconArrowBackUp />}
                            onClick={() => {
                                router.push("/login");
                            }}
                            component={motion.button}
                            transition={{ type: "spring", stiffness: 500, damping: 30, mass: 1 }}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                        >
                            Back to Login
                        </Button>
                    </Paper>
                </Container>
            )}
        </div>
    );
}
