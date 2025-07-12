"use client";

import { requestVerificationEmailV1AuthEmailRequestPost, updateUserEndpointV1UsersPatch } from "@/lib/api/csclient";
import { customLogger } from "@/lib/api/customLogger";
import { GetAccessTokenHeader } from "@/lib/utils/token";
import { Button, Center, Container, Modal, Stack, Text, TextInput } from "@mantine/core";
import { useForm } from "@mantine/form";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { IconMail, IconMailbox, IconMailFast, IconSendOff } from "@tabler/icons-react";
import { useState } from "react";

interface ChangeEmailComponentProps {
    modalOpen: boolean;
    setModalOpen: (open: boolean) => void;
    oldEmail?: string | null;
    userId?: string;
    onEmailChanged?: () => void;
}

interface ChangeEmailFormValues {
    newEmail: string;
}

export function ChangeEmailComponent({
    modalOpen,
    setModalOpen,
    oldEmail,
    userId,
    onEmailChanged,
}: ChangeEmailComponentProps) {
    const [buttonLoading, buttonStateHandler] = useDisclosure(false);
    const [showSuccessModal, setShowSuccessModal] = useState(false);

    const form = useForm<ChangeEmailFormValues>({
        mode: "uncontrolled",
        initialValues: {
            newEmail: "",
        },
        validate: {
            newEmail: (value) => {
                if (!value) return "Email is required";
                if (!value.includes("@")) return "Please enter a valid email address";
                if (value === oldEmail) return "New email must be different from current email";
                return null;
            },
        },
    });

    const handleSubmit = async (values: ChangeEmailFormValues) => {
        if (!userId) {
            notifications.show({
                id: "change-email-error",
                title: "Error",
                message: "User ID is required to change email.",
                color: "red",
                icon: <IconSendOff />,
            });
            return;
        }

        buttonStateHandler.open();
        try {
            const result = await updateUserEndpointV1UsersPatch({
                body: {
                    id: userId,
                    email: values.newEmail,
                },
                headers: { Authorization: GetAccessTokenHeader() },
            });

            if (result.error) {
                throw new Error(`Failed to update email: ${result.response.status} ${result.response.statusText}`);
            }

            // After successfully updating the email, request a verification email
            try {
                const verificationResult = await requestVerificationEmailV1AuthEmailRequestPost({
                    headers: { Authorization: GetAccessTokenHeader() },
                });

                if (verificationResult.error) {
                    customLogger.warn(
                        "Failed to send verification email:",
                        verificationResult.response.status,
                        verificationResult.response.statusText
                    );
                    notifications.show({
                        id: "verification-email-warning",
                        title: "Email Updated, but Verification Email Failed",
                        message:
                            "Your email was updated successfully, but we couldn't send a verification email. You can request one manually from your profile.",
                        color: "yellow",
                        icon: <IconMail />,
                    });
                } else {
                    notifications.show({
                        id: "change-email-success",
                        title: "Email Updated Successfully",
                        message:
                            "Your email has been updated and a verification email has been sent. Please check your new email inbox.",
                        color: "green",
                        icon: <IconMail />,
                    });
                }
            } catch (verificationError) {
                customLogger.warn("Failed to send verification email:", verificationError);
                notifications.show({
                    id: "verification-email-warning",
                    title: "Email Updated, but Verification Email Failed",
                    message:
                        "Your email was updated successfully, but we couldn't send a verification email. You can request one manually from your profile.",
                    color: "yellow",
                    icon: <IconMail />,
                });
            }

            form.reset();
            setModalOpen(false);
            setShowSuccessModal(true);

            // Call the callback to refresh user data
            if (onEmailChanged) {
                onEmailChanged();
            }
        } catch (error) {
            customLogger.error("Failed to change email:", error);
            const errorMessage = error instanceof Error ? error.message : "Failed to change email. Please try again.";
            notifications.show({
                id: "change-email-error",
                title: "Email Change Failed",
                message: errorMessage,
                color: "red",
                icon: <IconSendOff />,
            });
        } finally {
            buttonStateHandler.close();
        }
    };

    return (
        <Container>
            <Modal opened={modalOpen} onClose={() => setModalOpen(false)} title="Change Email Address" centered>
                <form onSubmit={form.onSubmit(handleSubmit)}>
                    <Stack>
                        <Center mb="lg" p="lg">
                            <IconMailbox size={48} />
                        </Center>
                        <Text size="sm" mb="md">
                            Please enter your new email address. A confirmation link will be sent to this email.
                        </Text>
                        {oldEmail && (
                            <Text size="xs" c="dimmed">
                                Current email: {oldEmail}
                            </Text>
                        )}
                        <TextInput
                            label="Enter Your New Email"
                            placeholder="your.new.email@example.com"
                            key={form.key("newEmail")}
                            {...form.getInputProps("newEmail")}
                        />
                        <Button type="submit" loading={buttonLoading} rightSection={<IconMail />}>
                            Change Email
                        </Button>
                    </Stack>
                </form>
            </Modal>
            <Modal
                opened={showSuccessModal}
                onClose={() => {
                    setShowSuccessModal(false);
                    setModalOpen(false);
                }}
                title="Email Change Successful"
                centered
            >
                <Stack>
                    <Center mb="lg" p="lg">
                        <IconMailFast size={48} />
                    </Center>
                    <Text size="sm" mb="md">
                        Your email has been successfully changed and a verification email has been sent to your new
                        email address. Please check your inbox and click on the link to verify your new email.
                    </Text>
                    <Button
                        onClick={() => {
                            setShowSuccessModal(false);
                            setModalOpen(false);
                        }}
                    >
                        Okay, Got It!
                    </Button>
                </Stack>
            </Modal>
        </Container>
    );
}
