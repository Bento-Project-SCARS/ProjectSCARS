"use client";

import { useAuth } from "@/lib/providers/auth";
import { useUser } from "@/lib/providers/user";
import { Center, LoadingOverlay, Paper, Stack, Text } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { IconCheck } from "@tabler/icons-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, Suspense } from "react";

import {
    getUserAvatarEndpointV1UsersAvatarGet,
    getUserProfileEndpointV1UsersMeGet,
    JwtToken,
    microsoftOauthCallbackV1AuthOauthMicrosoftCallbackGet,
    type UserPublic,
} from "@/lib/api/csclient";
import { oauthLinkMicrosoftV1AuthOauthMicrosoftLinkGet } from "@/lib/api/oauth-temp";
import { GetAccessTokenHeader } from "@/lib/utils/token";

/**
 * OAuth Microsoft callback page
 * @returns {React.ReactElement} The rendered component.
 */
export default function OAuthMicrosoftPage(): React.ReactElement {
    return (
        <Paper>
            <Suspense fallback={<Center style={{ minHeight: "100vh" }}><Text>Loading...</Text></Center>}>
                <OAuthMicrosoftContent />
            </Suspense>
        </Paper>
    );
}

function OAuthMicrosoftContent() {
    const authCtx = useAuth();
    const userCtx = useUser();
    const router = useRouter();
    const params = useSearchParams();
    const [success, setSuccess] = useState(false);
    const [isLoading, handlers] = useDisclosure(true);

    console.debug("Rendering OAuthMicrosoftPage");
    useEffect(() => {
        const handleOAuth = async () => {
            console.debug("OAuthMicrosoftPage useEffect started");
            const code = params.get("code");
            if (!code) {
                console.error("No authorization code found in query parameters.");
                handlers.close();
                return;
            }
            console.debug("Authorization code found:", code);
            try {
                if (authCtx.isAuthenticated) {
                    console.debug("User is already authenticated, linking Microsoft account.");
                    try {
                        const result = await oauthLinkMicrosoftV1AuthOauthMicrosoftLinkGet({
                            query: { code: code },
                            headers: { Authorization: GetAccessTokenHeader() },
                        });

                        if (result.error) {
                            throw new Error(
                                `Failed to link Microsoft account: ${result.response?.status || 'Unknown'} ${result.response?.statusText || 'Error'}`
                            );
                        }

                        notifications.show({
                            id: "link-success",
                            title: "Link successful",
                            message: "Your Microsoft account has been linked successfully.",
                            color: "green",
                            icon: <IconCheck />,
                        });
                        setSuccess(true);
                        handlers.close();
                        router.push("/profile");
                        handlers.close();
                        return;
                    } catch (error) {
                        console.error("Failed to link Microsoft account:", error);
                        notifications.show({
                            title: "Link Failed",
                            message: "Failed to link your Microsoft account. Please try again later.",
                            color: "red",
                        });
                        router.push("/profile");
                        handlers.close();
                        return;
                    }
                }

                console.debug("User is not authenticated, proceeding with OAuth authentication.");
                const result = await microsoftOauthCallbackV1AuthOauthMicrosoftCallbackGet({
                    // @ts-expect-error - The SDK might not have the correct types yet
                    query: { code: code },
                });

                if (result.error) {
                    throw new Error(
                        `Failed to authenticate with Microsoft: ${result.response.status} ${result.response.statusText}`
                    );
                }

                const tokens = result.data as JwtToken;
                authCtx.login(tokens);

                const userInfoResult = await getUserProfileEndpointV1UsersMeGet({
                    headers: { Authorization: GetAccessTokenHeader() },
                });

                if (userInfoResult.error) {
                    throw new Error(
                        `Failed to get user info: ${userInfoResult.response.status} ${userInfoResult.response.statusText}`
                    );
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
                notifications.show({
                    id: "login-success",
                    title: "Login successful",
                    message: "You are now logged in.",
                    color: "green",
                    icon: <IconCheck />,
                });
                setSuccess(true);
                handlers.close();
                router.push("/dashboard");
            } catch (error) {
                console.error("Microsoft OAuth failed:", error);
                notifications.show({
                    title: "Login failed",
                    message: `Microsoft OAuth authentication failed: ${error}`,
                    color: "red",
                });
                handlers.close();
                router.push("/login");
            }
        };

        handleOAuth();
    }, [authCtx, handlers, params, router, userCtx]);

    return (
        <Center style={{ minHeight: "100vh" }}>
            <Stack align="center" gap="md">
                <LoadingOverlay visible={isLoading} />
                <Text size="lg" fw={500}>
                    {success ? "Microsoft OAuth successful!" : "Processing Microsoft OAuth..."}
                </Text>
                <Text size="sm" c="dimmed">
                    {success ? "Redirecting you now." : "Please wait while we authenticate you with Microsoft."}
                </Text>
            </Stack>
        </Center>
    );
}