"use client";

import { ErrorComponent } from "@/components/ErrorComponent";
import { LoadingComponent } from "@/components/LoadingComponent/LoadingComponent";
import { MainLoginComponent } from "@/components/MainLoginComponent/MainLoginComponent";
import {
    getUserAvatarEndpointV1UsersAvatarGet,
    getUserProfileEndpointV1UsersMeGet,
    googleOauthCallbackV1AuthOauthGoogleCallbackGet,
    oauthLinkGoogleV1AuthOauthGoogleLinkGet,
    type JwtToken,
    type UserPublic,
} from "@/lib/api/csclient";
import { customLogger } from "@/lib/api/customLogger";
import { useAuth } from "@/lib/providers/auth";
import { useUser } from "@/lib/providers/user";
import { GetAccessTokenHeader } from "@/lib/utils/token";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { IconCheck, IconX } from "@tabler/icons-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

function OAuthGoogleContent() {
    const authCtx = useAuth();
    const userCtx = useUser();
    const router = useRouter();
    const params = useSearchParams();
    const [success, setSuccess] = useState(false);
    const [isLoading, handlers] = useDisclosure(true);

    customLogger.debug("Rendering OAuthGooglePage");
    useEffect(() => {
        const handleOAuth = async () => {
            customLogger.debug("OAuthGooglePage useEffect started");
            const code = params.get("code");
            if (!code) {
                customLogger.error("No authorization code found in query parameters.");
                handlers.close();
                return;
            }
            customLogger.debug("Authorization code found:", code);
            try {
                if (authCtx.isAuthenticated) {
                    customLogger.debug("User is already authenticated, linking Google account.");
                    try {
                        const result = await oauthLinkGoogleV1AuthOauthGoogleLinkGet({
                            query: { code: code },
                            headers: { Authorization: GetAccessTokenHeader() },
                        });

                        if (result.error) {
                            throw new Error(
                                `Failed to link Google account: ${result.response.status} ${result.response.statusText}`
                            );
                        }
                        notifications.show({
                            id: "google-link-success",
                            title: "Google account linked",
                            message: "Your Google account has been successfully linked.",
                            color: "green",
                            icon: <IconCheck />,
                        });
                        setSuccess(true);
                        router.push("/dashboard");
                        handlers.close();
                        return;
                    } catch (error) {
                        if (error instanceof Error) {
                            notifications.show({
                                id: "google-link-failed",
                                title: "Google account linking failed",
                                message: error.message,
                                color: "red",
                                icon: <IconX />,
                            });
                        } else {
                            customLogger.error("Error linking Google account:", error);
                            notifications.show({
                                id: "link-error",
                                title: "Linking failed",
                                message: `${error}`,
                                color: "red",
                                icon: <IconX />,
                            });
                        }
                        setSuccess(true);
                        router.push("/profile");
                        handlers.close();
                        return;
                    }
                }

                customLogger.debug("User is not authenticated, proceeding with OAuth authentication.");
                const result = await googleOauthCallbackV1AuthOauthGoogleCallbackGet({
                    query: { code: code },
                });

                if (result.error) {
                    throw new Error(
                        `Failed to authenticate with Google: ${result.response.status} ${result.response.statusText}`
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
                customLogger.debug("User info fetched successfully", { id: userInfo.id, username: userInfo.username });
                let userAvatar: Blob | null = null;
                if (userInfo.avatarUrn) {
                    const avatarResult = await getUserAvatarEndpointV1UsersAvatarGet({
                        query: { fn: userInfo.avatarUrn },
                        headers: { Authorization: GetAccessTokenHeader() },
                    });

                    if (!avatarResult.error) {
                        userAvatar = avatarResult.data as Blob;
                        customLogger.debug("User avatar fetched successfully", { size: userAvatar.size });
                    } else {
                        customLogger.warn("Failed to fetch avatar:", avatarResult.error);
                        userAvatar = null;
                    }
                } else {
                    customLogger.warn("No avatar found for user, using default avatar.");
                }
                userCtx.updateUserInfo(userInfo, userPermissions, userAvatar);
                notifications.show({
                    id: "login-success",
                    title: "Login successful",
                    message: "You are now logged in.",
                    color: "green",
                    icon: <IconCheck />,
                });
                router.push("/dashboard");
            } catch (error) {
                if (error instanceof Error) {
                    notifications.show({
                        id: "google-login-failed",
                        title: "Google login failed",
                        message: error.message,
                        color: "red",
                        icon: <IconX />,
                    });
                } else {
                    customLogger.error("Error logging in:", error);
                    notifications.show({
                        id: "login-error",
                        title: "Login failed",
                        message: `${error}`,
                        color: "red",
                        icon: <IconX />,
                    });
                }
                handlers.close();
            }
            setSuccess(true);
        };

        handleOAuth();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    return (
        <>
            {isLoading && <LoadingComponent withBorder={false} />} {!isLoading && success && <MainLoginComponent />}{" "}
            {!isLoading && !success && (
                <ErrorComponent
                    error={new Error("Failed to authenticate with Google. Please try again later.")}
                    reset={() => router.push("/login")}
                />
            )}
        </>
    );
}

export default function OAuthGooglePage() {
    return (
        <Suspense fallback={<LoadingComponent withBorder={false} />}>
            <OAuthGoogleContent />
        </Suspense>
    );
}
