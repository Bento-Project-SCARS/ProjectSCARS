"use client";

import { LoadingComponent } from "@/components/LoadingComponent/LoadingComponent";
import { PasswordRequirement, requirements } from "@/components/Password";
import { SignatureCanvas } from "@/components/SignatureCanvas/SignatureCanvas";
import { ChangeEmailComponent } from "@/components/UserManagement/ChangeEmailComponent";
import { UserSyncButton } from "@/components/UserSyncButton";
import {
    deleteUserAvatarEndpointV1UsersAvatarDelete,
    deleteUserInfoEndpointV1UsersDelete,
    deleteUserSignatureEndpointV1UsersSignatureDelete,
    disableMfaOtpV1AuthMfaOtpDisablePost,
    generateMfaOtpV1AuthMfaOtpGeneratePost,
    getAllRolesV1AuthRolesGet,
    getOauthConfigV1AuthConfigOauthGet,
    getUserAvatarEndpointV1UsersAvatarGet,
    getUserProfileEndpointV1UsersMeGet,
    getUserSignatureEndpointV1UsersSignatureGet,
    OtpToken,
    requestVerificationEmailV1AuthEmailRequestPost,
    Role,
    updateUserAvatarEndpointV1UsersAvatarPatch,
    updateUserEndpointV1UsersPatch,
    updateUserSignatureEndpointV1UsersSignaturePatch,
    UserDelete,
    UserPublic,
    UserUpdate,
    verifyEmailV1AuthEmailVerifyPost,
    verifyMfaOtpV1AuthMfaOtpVerifyPost,
} from "@/lib/api/csclient";
import { customLogger } from "@/lib/api/customLogger";
import { GetAllSchools } from "@/lib/api/school";
import { userAvatarConfig, userSignatureConfig } from "@/lib/info";
import { useThemeContext } from "@/lib/providers/theme";
import { useUser } from "@/lib/providers/user";
import { UserPreferences } from "@/lib/types";
import { GetAccessTokenHeader } from "@/lib/utils/token";
import {
    ActionIcon,
    Anchor,
    Avatar,
    Badge,
    Box,
    Button,
    Center,
    ColorInput,
    Divider,
    FileButton,
    Flex,
    Group,
    Modal,
    Paper,
    PinInput,
    Select,
    Space,
    Stack,
    Switch,
    Text,
    TextInput,
    Title,
    Tooltip,
    useMantineColorScheme,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import {
    IconCircleDashedCheck,
    IconCircleDashedX,
    IconClipboardCopy,
    IconDeviceFloppy,
    IconKey,
    IconMail,
    IconMailOff,
    IconMailOpened,
    IconPencilCheck,
    IconScribble,
    IconSendOff,
    IconTrash,
    IconUserExclamation,
    IconX,
} from "@tabler/icons-react";
import { useQRCode } from "next-qrcode";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

interface EditProfileValues {
    id: string;
    username: string | undefined;
    nameFirst: string | undefined;
    nameMiddle: string | undefined;
    nameLast: string | undefined;
    position: string | undefined;
    email: string | undefined;
    school: string | undefined;
    role: string | undefined;
    deactivated: boolean;
    forceUpdateInfo: boolean;
}

interface ProfileContentProps {
    userInfo: UserPublic | null;
    userPermissions: string[] | null;
    userAvatarUrl: string | null;
}

function ProfileContent({ userInfo, userPermissions, userAvatarUrl }: ProfileContentProps) {
    const searchParams = useSearchParams();
    const router = useRouter();
    const userCtx = useUser();
    const { SVG } = useQRCode();
    const { setColorScheme, colorScheme } = useMantineColorScheme();
    const { userPreferences, updatePreference } = useThemeContext();

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

    // Local state for preferences that will be saved when Save button is clicked
    const [localPreferences, setLocalPreferences] = useState({
        accentColor: userPreferences.accentColor,
        language: userPreferences.language,
    });

    // Sync localPreferences with userPreferences when userPreferences change
    useEffect(() => {
        setLocalPreferences({
            accentColor: userPreferences.accentColor,
            language: userPreferences.language,
        });
    }, [userPreferences]);
    const form = useForm<EditProfileValues>({
        mode: "uncontrolled",
        onValuesChange: () => {
            // Trigger unsaved changes check when form values change
            setTimeout(() => {
                if (!userInfo) return;

                const initialValues = {
                    id: userInfo.id,
                    username: userInfo.username || "",
                    nameFirst: userInfo.nameFirst || "",
                    nameMiddle: userInfo.nameMiddle || "",
                    nameLast: userInfo.nameLast || "",
                    position: userInfo.position || "",
                    email: userInfo.email || "",
                    school: availableSchools.find((school) => school.startsWith(`[${userInfo.schoolId}]`)),
                    role: availableRoles.find((role) => role.startsWith(`[${userInfo.roleId}]`)),
                    deactivated: userInfo.deactivated,
                    forceUpdateInfo: userInfo.forceUpdateInfo,
                };

                const currentValues = form.getValues();

                const hasFormChanges = Object.keys(initialValues).some((key) => {
                    const initial = initialValues[key as keyof typeof initialValues];
                    const current = currentValues[key as keyof typeof currentValues];
                    return initial !== current;
                });

                const hasFileChanges =
                    editUserAvatar !== null || avatarRemoved || editUserSignature !== null || signatureRemoved;

                setHasUnsavedChanges(hasFormChanges || hasFileChanges);
            }, 0);
        },
    });

    const [opened, modalHandler] = useDisclosure(false);
    const [buttonLoading, buttonStateHandler] = useDisclosure(false);
    const [passwordLoading, passwordStateHandler] = useDisclosure(false);
    const [otpEnabled, setOtpEnabled] = useState(false);
    const [otpGenData, setOtpGenData] = useState<OtpToken | null>(null);
    const [showOTPModal, setShowOTPModal] = useState(false);
    const [showOTPSecret, showOTPSecretHandler] = useDisclosure(false);
    const [showRecoveryCodeModal, setShowRecoveryCodeModal] = useState(false);
    const [verifyOtpCode, setVerifyOtpCode] = useState("");
    const [otpVerifyHasError, setOtpVerifyHasError] = useState(false);
    const [currentAvatarUrn, setCurrentAvatarUrn] = useState<string | null>(null);
    const [editUserAvatar, setEditUserAvatar] = useState<File | null>(null);
    const [editUserAvatarUrl, setEditUserAvatarUrl] = useState<string | null>(userAvatarUrl);
    const [avatarRemoved, setAvatarRemoved] = useState(false);
    const [currentSignatureUrn, setCurrentSignatureUrn] = useState<string | null>(null);
    const [editUserSignature, setEditUserSignature] = useState<File | null>(null);
    const [editUserSignatureUrl, setEditUserSignatureUrl] = useState<string | null>(null);
    const [signatureRemoved, setSignatureRemoved] = useState(false);
    const [availableRoles, setAvailableRoles] = useState<string[]>([]);
    const [availableSchools, setAvailableSchools] = useState<string[]>([]);
    const [showChangeEmailModal, setShowChangeEmailModal] = useState(false);
    const [showSignatureDrawModal, setShowSignatureDrawModal] = useState(false);
    const [newPassword, setNewPassword] = useState("");
    const changePasswordForm = useForm({
        mode: "uncontrolled",
        initialValues: {
            currentPassword: "",
            newPassword: "",
            confirmPassword: "",
        },
        validate: {
            currentPassword: (value) => (value.length === 0 ? "Current password is required" : null),
            newPassword: (value) => {
                if (value.length === 0) return "New password is required";
                if (value.length < 8) return "Password must be at least 8 characters long";
                if (!/(?=.*[a-z])/.test(value)) return "Password must contain at least one lowercase letter";
                if (!/(?=.*[A-Z])/.test(value)) return "Password must contain at least one uppercase letter";
                if (!/(?=.*\d)/.test(value)) return "Password must contain at least one digit";
                return null;
            },
            confirmPassword: (value, values) => (value !== values.newPassword ? "Passwords do not match" : null),
        },
    });
    const [oauthSupport, setOAuthSupport] = useState<{ google: boolean }>({
        google: false,
    });

    // Add state for tracking unsaved changes
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

    const SetSelectValue = async (value: string, s: string) => {
        // set x in string "[x] y"
        return `[${value}] ${s}`;
    };

    const GetSelectValue = async (s: string | undefined) => {
        // get x in string "[x] y"
        return s ? s.split("]")[0].replace(/\[/g, "") : null;
    };

    const fetchUserAvatar = async (avatarUrn: string): Promise<string | undefined> => {
        try {
            const result = await getUserAvatarEndpointV1UsersAvatarGet({
                query: { fn: avatarUrn },
                headers: { Authorization: GetAccessTokenHeader() },
            });

            if (result.error) {
                throw new Error(`Failed to fetch avatar: ${result.response.status} ${result.response.statusText}`);
            }

            const blob = result.data as Blob;
            const url = URL.createObjectURL(blob);
            if (avatarUrn && !currentAvatarUrn) URL.revokeObjectURL(avatarUrn);
            setCurrentAvatarUrn(avatarUrn);
            return url;
        } catch (error) {
            customLogger.error("Failed to fetch user avatar:", error);
            notifications.show({
                id: "fetch-user-avatar-error",
                title: "Error",
                message: "Failed to fetch user avatar.",
                color: "red",
                icon: <IconUserExclamation />,
            });
            return undefined;
        }
    };

    const fetchUserSignature = async (signatureUrn: string): Promise<string | undefined> => {
        try {
            const result = await getUserSignatureEndpointV1UsersSignatureGet({
                query: { fn: signatureUrn },
                headers: { Authorization: GetAccessTokenHeader() },
            });

            if (result.error) {
                throw new Error(`Failed to fetch signature: ${result.response.status} ${result.response.statusText}`);
            }

            const blob = result.data as Blob;
            const url = URL.createObjectURL(blob);
            if (signatureUrn && !currentSignatureUrn) URL.revokeObjectURL(signatureUrn);
            setCurrentSignatureUrn(signatureUrn);
            return url;
        } catch (error) {
            customLogger.error("Failed to fetch user signature:", error);
            notifications.show({
                id: "fetch-user-signature-error",
                title: "Error",
                message: "Failed to fetch user signature.",
                color: "red",
                icon: <IconScribble />,
            });
            return undefined;
        }
    };

    const handlePreferenceChange = (key: keyof UserPreferences, value: string | boolean | null) => {
        setLocalPreferences((prev) => ({ ...prev, [key]: value }));
        // Remove the immediate notification since preferences are saved with main form
    };
    const handleChangeAvatar = async (file: File | null) => {
        if (file === null) {
            customLogger.debug("No file selected, skipping upload...");
            return;
        }
        const fileSizeMB = file.size / (1024 * 1024);
        if (fileSizeMB > userAvatarConfig.MAX_FILE_SIZE_MB) {
            notifications.show({
                id: "file-too-large",
                title: "File Too Large",
                message: `File size ${fileSizeMB.toFixed(2)} MB exceeds the 2 MB limit.`,
                color: "red",
                icon: <IconSendOff />,
            });
            return;
        }
        if (!userAvatarConfig.ALLOWED_FILE_TYPES.includes(file.type)) {
            notifications.show({
                id: "invalid-file-type",
                title: "Invalid File Type",
                message: `Unsupported file type: ${file.type}. Allowed: JPG, PNG, WEBP.`,
                color: "red",
                icon: <IconSendOff />,
            });
            return;
        }

        setAvatarRemoved(false);
        setEditUserAvatar(file);
        setEditUserAvatarUrl((prevUrl) => {
            if (prevUrl && !currentAvatarUrn) {
                URL.revokeObjectURL(prevUrl); // Clean up previous URL
            }
            return URL.createObjectURL(file); // Create a new URL for the selected file
        });
    };

    const handleRemoveAvatar = () => {
        setAvatarRemoved(true);
        setEditUserAvatar(null);
        if (editUserAvatarUrl && !currentAvatarUrn) {
            URL.revokeObjectURL(editUserAvatarUrl);
        }
        setEditUserAvatarUrl(null);
    };

    const handleChangeSignature = async (file: File | null) => {
        if (file === null) {
            customLogger.debug("No file selected, skipping upload...");
            return;
        }
        const fileSizeMB = file.size / (1024 * 1024);
        if (fileSizeMB > userSignatureConfig.MAX_FILE_SIZE_MB) {
            notifications.show({
                id: "signature-file-too-large",
                title: "File Too Large",
                message: `File size ${fileSizeMB.toFixed(2)} MB exceeds the 1 MB limit.`,
                color: "red",
                icon: <IconSendOff />,
            });
            return;
        }
        if (!userSignatureConfig.ALLOWED_FILE_TYPES.includes(file.type)) {
            notifications.show({
                id: "signature-invalid-file-type",
                title: "Invalid File Type",
                message: `Unsupported file type: ${file.type}. Allowed: JPG, PNG, WEBP.`,
                color: "red",
                icon: <IconSendOff />,
            });
            return;
        }

        setSignatureRemoved(false);
        setEditUserSignature(file);
        setEditUserSignatureUrl((prevUrl) => {
            if (prevUrl && !currentSignatureUrn) {
                URL.revokeObjectURL(prevUrl); // Clean up previous URL
            }
            return URL.createObjectURL(file); // Create a new URL for the selected file
        });
    };

    const handleDrawSignature = () => {
        setShowSignatureDrawModal(true);
    };

    const handleSaveDrawnSignature = (signatureData: string) => {
        // Convert data URL to blob
        const [header, base64Data] = signatureData.split(",");
        const mimeType = header.match(/:(.*?);/)?.[1] || "image/png";
        const binaryString = atob(base64Data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }

        const blob = new Blob([bytes], { type: mimeType });
        const file = new File([blob], "signature.png", { type: "image/png" });

        // Use existing signature change handler
        handleChangeSignature(file);
        setShowSignatureDrawModal(false);
    };

    const handleCancelDrawSignature = () => {
        setShowSignatureDrawModal(false);
    };
    const handleSave = async (values: EditProfileValues) => {
        buttonStateHandler.open();
        // NOTE: Only update fields that have changed
        // customLogger.debug("values:", values);
        // customLogger.debug("userInfo:", userInfo);
        // Resolve async operations first
        const schoolId = await GetSelectValue(values.school);
        const roleId = await GetSelectValue(values.role);

        // Debug logging
        customLogger.debug("Form values debug:", {
            valuesSchool: values.school,
            valuesRole: values.role,
            availableSchools: availableSchools.length,
            availableRoles: availableRoles.length,
            userInfoSchoolId: userInfo?.schoolId,
            userInfoRoleId: userInfo?.roleId,
        });

        customLogger.debug("School comparison:", {
            schoolId,
            userInfoSchoolId: userInfo?.schoolId,
            schoolIdNumber: schoolId ? Number(schoolId) : null,
            isSchoolChanging: (schoolId ? Number(schoolId) : null) !== userInfo?.schoolId,
        });

        const newUserInfo: UserUpdate = {
            id: values.id,
            username: values.username !== userInfo?.username ? values.username : undefined,
            nameFirst: values.nameFirst !== userInfo?.nameFirst ? values.nameFirst || null : undefined,
            nameMiddle: values.nameMiddle !== userInfo?.nameMiddle ? values.nameMiddle || null : undefined,
            nameLast: values.nameLast !== userInfo?.nameLast ? values.nameLast || null : undefined,
            position: values.position !== userInfo?.position ? values.position || null : undefined,
            email: values.email !== userInfo?.email ? values.email || null : undefined,
            deactivated: values.deactivated !== userInfo?.deactivated ? values.deactivated : undefined,
            forceUpdateInfo: values.forceUpdateInfo !== userInfo?.forceUpdateInfo ? values.forceUpdateInfo : undefined,
            finishedTutorials: null,
            password: null,
        };

        // Only add schoolId if it's actually changing
        const newSchoolId = schoolId ? Number(schoolId) : null;
        const isSchoolActuallyChanging = newSchoolId !== userInfo?.schoolId;

        // Additional check: if school field is null but user has a school,
        // and the form couldn't find the school in available schools, don't treat it as a change
        const schoolFormValue = values.school;
        const userHasSchool = userInfo?.schoolId !== null;
        const schoolFieldIsEmpty = schoolFormValue === undefined || schoolFormValue === null;

        // If user has a school but form field is empty, it might be because the school
        // wasn't loaded yet in availableSchools, so don't treat it as a change
        const shouldIgnoreSchoolChange = userHasSchool && schoolFieldIsEmpty && availableSchools.length === 0;

        customLogger.debug("School change analysis:", {
            newSchoolId,
            isSchoolActuallyChanging,
            schoolFormValue,
            userHasSchool,
            schoolFieldIsEmpty,
            shouldIgnoreSchoolChange,
        });

        if (isSchoolActuallyChanging && !shouldIgnoreSchoolChange) {
            newUserInfo.schoolId = newSchoolId;
        }

        // Only add roleId if it's actually changing
        const newRoleId = roleId ? Number(roleId) : null;
        if (newRoleId !== userInfo?.roleId) {
            newUserInfo.roleId = newRoleId;
        }

        // Check for fields that were cleared (set to null) and need to be deleted
        const fieldsToDelete: UserDelete = {
            id: values.id,
            email: (values.email === "" || values.email === null) && userInfo?.email !== null,
            nameFirst: (values.nameFirst === "" || values.nameFirst === null) && userInfo?.nameFirst !== null,
            nameMiddle: (values.nameMiddle === "" || values.nameMiddle === null) && userInfo?.nameMiddle !== null,
            nameLast: (values.nameLast === "" || values.nameLast === null) && userInfo?.nameLast !== null,
            position: (values.position === "" || values.position === null) && userInfo?.position !== null,
            schoolId: values.school === null && userInfo?.schoolId !== null,
        };

        const hasFieldsToDelete = Object.values(fieldsToDelete).some(
            (field, index) => index > 0 && field === true // Skip the id field at index 0
        );
        // Track successful operations for consolidated notification
        const successfulOperations: string[] = [];

        try {
            customLogger.debug("Has values to remove:", hasFieldsToDelete);
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
                        id: "user-delete-fields-error",
                        title: "Error",
                        message: "Failed to remove user values. Please try again.",
                        color: "red",
                        icon: <IconSendOff />,
                    });
                    buttonStateHandler.close();
                    return;
                }
            }

            // Filter out fields that were deleted from the update object to avoid conflicts
            const filteredUserInfo: UserUpdate = { ...newUserInfo };
            if (fieldsToDelete.email) filteredUserInfo.email = undefined;
            if (fieldsToDelete.nameFirst) filteredUserInfo.nameFirst = undefined;
            if (fieldsToDelete.nameMiddle) filteredUserInfo.nameMiddle = undefined;
            if (fieldsToDelete.nameLast) filteredUserInfo.nameLast = undefined;
            if (fieldsToDelete.position) filteredUserInfo.position = undefined;
            if (fieldsToDelete.schoolId) filteredUserInfo.schoolId = undefined;

            // Then handle regular updates
            const result = await updateUserEndpointV1UsersPatch({
                body: filteredUserInfo,
                headers: { Authorization: GetAccessTokenHeader() },
            });

            if (result.error) {
                throw new Error(`Failed to update user: ${result.response.status} ${result.response.statusText}`);
            }

            let updatedUser = result.data as UserPublic;
            successfulOperations.push("Profile information");

            if (avatarRemoved && currentAvatarUrn) {
                try {
                    customLogger.debug("Removing avatar...");
                    const deleteResult = await deleteUserAvatarEndpointV1UsersAvatarDelete({
                        query: { user_id: values.id },
                        headers: { Authorization: GetAccessTokenHeader() },
                    });

                    if (deleteResult.error) {
                        throw new Error(
                            `Failed to remove avatar: ${deleteResult.response.status} ${deleteResult.response.statusText}`
                        );
                    }

                    customLogger.debug("Avatar removed successfully.");
                    successfulOperations.push("Avatar removed");
                } catch (error) {
                    if (error instanceof Error) {
                        const detail = error.message || "Failed to remove avatar.";
                        customLogger.error("Avatar removal failed:", detail);
                        notifications.show({
                            id: "avatar-remove-error",
                            title: "Avatar Removal Failed",
                            message: detail,
                            color: "red",
                            icon: <IconSendOff />,
                        });
                    }
                }
            }
            if (editUserAvatar) {
                try {
                    customLogger.debug("Uploading avatar...");
                    const uploadResult = await updateUserAvatarEndpointV1UsersAvatarPatch({
                        query: { user_id: values.id },
                        body: { img: editUserAvatar },
                        headers: { Authorization: GetAccessTokenHeader() },
                    });

                    if (uploadResult.error) {
                        throw new Error(
                            `Failed to upload avatar: ${uploadResult.response.status} ${uploadResult.response.statusText}`
                        );
                    }

                    updatedUser = uploadResult.data as UserPublic;
                    if (updatedUser.avatarUrn) {
                        fetchUserAvatar(updatedUser.avatarUrn);
                        customLogger.debug("Avatar uploaded successfully.");
                        successfulOperations.push("Avatar updated");
                    }
                } catch (error) {
                    if (error instanceof Error) {
                        const detail = error.message || "Failed to upload avatar.";
                        customLogger.error("Avatar upload failed:", detail);
                        notifications.show({
                            id: "avatar-upload-error",
                            title: "Avatar Upload Failed",
                            message: detail,
                            color: "red",
                            icon: <IconSendOff />,
                        });
                        buttonStateHandler.close();
                        throw new Error(detail);
                    }
                    buttonStateHandler.close();
                }
            }
            if (updatedUser.avatarUrn && updatedUser.avatarUrn.trim() !== "" && !avatarRemoved) {
                const newAvatarUrl = await fetchUserAvatar(updatedUser.avatarUrn);
                if (newAvatarUrl) {
                    setEditUserAvatarUrl(newAvatarUrl);
                }
            } else if (avatarRemoved) {
                setEditUserAvatarUrl(null);
            }

            // Handle signature removal
            if (signatureRemoved && currentSignatureUrn) {
                try {
                    customLogger.debug("Removing signature...");
                    const deleteResult = await deleteUserSignatureEndpointV1UsersSignatureDelete({
                        query: { user_id: values.id },
                        headers: { Authorization: GetAccessTokenHeader() },
                    });

                    if (deleteResult.error) {
                        throw new Error(
                            `Failed to remove signature: ${deleteResult.response.status} ${deleteResult.response.statusText}`
                        );
                    }

                    customLogger.debug("Signature removed successfully.");
                    successfulOperations.push("E-signature removed");
                } catch (error) {
                    if (error instanceof Error) {
                        const detail = error.message || "Failed to remove signature.";
                        customLogger.error("Signature removal failed:", detail);
                        notifications.show({
                            id: "signature-remove-error",
                            title: "E-signature Removal Failed",
                            message: detail,
                            color: "red",
                            icon: <IconSendOff />,
                        });
                    }
                }
            }

            // Handle signature upload
            if (editUserSignature) {
                try {
                    customLogger.debug("Uploading signature...");
                    const uploadResult = await updateUserSignatureEndpointV1UsersSignaturePatch({
                        query: { user_id: values.id },
                        body: { img: editUserSignature },
                        headers: { Authorization: GetAccessTokenHeader() },
                    });

                    if (uploadResult.error) {
                        throw new Error(
                            `Failed to upload signature: ${uploadResult.response.status} ${uploadResult.response.statusText}`
                        );
                    }

                    updatedUser = uploadResult.data as UserPublic;
                    if (updatedUser.signatureUrn) {
                        const newSignatureUrl = await fetchUserSignature(updatedUser.signatureUrn);
                        if (newSignatureUrl) {
                            setEditUserSignatureUrl(newSignatureUrl);
                        }
                        customLogger.debug("Signature uploaded successfully.");
                        successfulOperations.push("E-signature updated");
                    }
                } catch (error) {
                    if (error instanceof Error) {
                        const detail = error.message || "Failed to upload signature.";
                        customLogger.error("Signature upload failed:", detail);
                        notifications.show({
                            id: "signature-upload-error",
                            title: "E-signature Upload Failed",
                            message: detail,
                            color: "red",
                            icon: <IconSendOff />,
                        });
                    }
                }
            }

            // Update signature URL if needed
            if (updatedUser.signatureUrn && updatedUser.signatureUrn.trim() !== "" && !signatureRemoved) {
                const newSignatureUrl = await fetchUserSignature(updatedUser.signatureUrn);
                if (newSignatureUrl) {
                    setEditUserSignatureUrl(newSignatureUrl);
                }
            } else if (signatureRemoved) {
                setEditUserSignatureUrl(null);
            }

            // Reset temporary states after successful save
            setEditUserAvatar(null);
            setAvatarRemoved(false);
            setEditUserSignature(null);
            setSignatureRemoved(false);

            // Show consolidated success notification if any operations were successful
            if (successfulOperations.length > 0) {
                const message =
                    successfulOperations.length === 1
                        ? `${successfulOperations[0]} updated successfully.`
                        : `Successfully updated: ${successfulOperations.join(", ")}.`;

                notifications.show({
                    id: "profile-update-success",
                    title: "Profile Updated",
                    message,
                    color: "green",
                    icon: <IconPencilCheck />,
                });
            }
        } catch (error) {
            if (error instanceof Error && error.message.includes("status code 403")) {
                const detail = error.message || "Failed to update user information.";
                notifications.show({
                    id: "user-update-error",
                    title: "Error",
                    message: detail,
                    color: "red",
                    icon: <IconSendOff />,
                });
            }
            customLogger.error("Update process failed:", error);
            notifications.show({
                id: "user-update-error",
                title: "Error",
                message: (error as Error).message || "Failed to update user information. Please try again later.",
                color: "red",
                icon: <IconSendOff />,
            });
        } finally {
            const userInfoResult = await getUserProfileEndpointV1UsersMeGet({
                headers: { Authorization: GetAccessTokenHeader() },
            });

            if (userInfoResult.error) {
                throw new Error(
                    `Failed to get user info: ${userInfoResult.response.status} ${userInfoResult.response.statusText}`
                );
            }

            const [updatedUserInfo, updatedPermissions] = userInfoResult.data as [UserPublic, string[]];
            userCtx.updateUserInfo(updatedUserInfo, updatedPermissions, editUserAvatar);

            // Save preferences to localStorage via theme context
            Object.keys(localPreferences).forEach((key) => {
                const prefKey = key as keyof UserPreferences;
                if (localPreferences[prefKey] !== userPreferences[prefKey]) {
                    updatePreference(prefKey, localPreferences[prefKey]);
                }
            });

            setHasUnsavedChanges(false); // Reset unsaved changes flag after successful save
            buttonStateHandler.close();
        }

        router.push("/dashboard");
    };

    const handlePasswordChange = async (values: {
        currentPassword: string;
        newPassword: string;
        confirmPassword: string;
    }) => {
        try {
            passwordStateHandler.open();

            // Call the new password change endpoint
            const response = await fetch(`${process.env.NEXT_PUBLIC_CENTRAL_SERVER_ENDPOINT}/v1/users/me/password`, {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: GetAccessTokenHeader(),
                },
                body: JSON.stringify({
                    current_password: values.currentPassword,
                    new_password: values.newPassword,
                }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(
                    errorData.detail || `Failed to update password: ${response.status} ${response.statusText}`
                );
            }

            const result = await response.json();

            notifications.show({
                id: "password-update-success",
                title: "Password Updated",
                message: result.message || "Your password has been updated successfully.",
                color: "green",
                icon: <IconKey />,
            });

            // Reset the form and close the modal
            changePasswordForm.reset();
            setNewPassword("");
            modalHandler.close();
        } catch (error) {
            customLogger.error("Password update error:", error);
            notifications.show({
                id: "password-update-error",
                title: "Error",
                message: (error as Error).message || "Failed to update password. Please try again.",
                color: "red",
                icon: <IconSendOff />,
            });
        } finally {
            passwordStateHandler.close();
        }
    };

    useEffect(() => {
        if (userInfo) {
            setOtpEnabled(userInfo.otpVerified);

            // Initialize signature URL if user has a signature
            if (userInfo.signatureUrn && userInfo.signatureUrn.trim() !== "") {
                fetchUserSignature(userInfo.signatureUrn).then((url) => {
                    if (url) {
                        setEditUserSignatureUrl(url);
                    }
                });
            }

            // Only reset form values if there are no unsaved changes
            // This prevents losing user input when OAuth operations refresh userInfo
            if (!hasUnsavedChanges) {
                const new_values = {
                    id: userInfo.id,
                    username: userInfo.username || "",
                    nameFirst: userInfo.nameFirst || "",
                    nameMiddle: userInfo.nameMiddle || "",
                    nameLast: userInfo.nameLast || "",
                    position: userInfo.position || "",
                    email: userInfo.email || "",
                    school: availableSchools.find((school) => school.startsWith(`[${userInfo.schoolId}]`)),
                    role: availableRoles.find((role) => role.startsWith(`[${userInfo.roleId}]`)),
                    deactivated: userInfo.deactivated,
                    forceUpdateInfo: userInfo.forceUpdateInfo,
                };
                customLogger.debug("Setting form values:", new_values);
                form.setValues(new_values);
                setHasUnsavedChanges(false); // Reset unsaved changes when form is initialized
            }
        }
    }, [userInfo, availableRoles, availableSchools, hasUnsavedChanges]); // eslint-disable-line react-hooks/exhaustive-deps

    // Track form changes to show unsaved changes indicator
    useEffect(() => {
        if (!userInfo) return;

        const initialValues = {
            id: userInfo.id,
            username: userInfo.username || "",
            nameFirst: userInfo.nameFirst || "",
            nameMiddle: userInfo.nameMiddle || "",
            nameLast: userInfo.nameLast || "",
            position: userInfo.position || "",
            email: userInfo.email || "",
            school: availableSchools.find((school) => school.startsWith(`[${userInfo.schoolId}]`)),
            role: availableRoles.find((role) => role.startsWith(`[${userInfo.roleId}]`)),
            deactivated: userInfo.deactivated,
            forceUpdateInfo: userInfo.forceUpdateInfo,
        };

        const currentValues = form.getValues();

        // Check if any form values have changed or if files/flags have been modified
        const hasFormChanges = Object.keys(initialValues).some((key) => {
            const initial = initialValues[key as keyof typeof initialValues];
            const current = currentValues[key as keyof typeof currentValues];
            return initial !== current;
        });

        const hasFileChanges =
            editUserAvatar !== null || avatarRemoved || editUserSignature !== null || signatureRemoved;

        // Check if preferences have changed
        const hasPreferenceChanges =
            localPreferences.accentColor !== userPreferences.accentColor ||
            localPreferences.language !== userPreferences.language;

        setHasUnsavedChanges(hasFormChanges || hasFileChanges || hasPreferenceChanges);
    }, [
        form,
        userInfo,
        availableRoles,
        availableSchools,
        editUserAvatar,
        avatarRemoved,
        editUserSignature,
        signatureRemoved,
        localPreferences.accentColor,
        localPreferences.language,
        userPreferences.accentColor,
        userPreferences.language,
    ]);

    useEffect(() => {
        // Fetch available roles and schools
        const fetchRolesAndSchools = async () => {
            try {
                const rolesResult = await getAllRolesV1AuthRolesGet({
                    headers: { Authorization: GetAccessTokenHeader() },
                });

                if (rolesResult.error) {
                    throw new Error(
                        `Failed to get roles: ${rolesResult.response.status} ${rolesResult.response.statusText}`
                    );
                }

                const rolesData = rolesResult.data as Role[];
                const formattedRoles = await Promise.all(
                    rolesData.map((role) => SetSelectValue(role.id?.toString() || "", role.description))
                );
                setAvailableRoles(formattedRoles);
            } catch (error) {
                customLogger.error("Failed to fetch roles:", error);
            }

            try {
                const schoolsData = await GetAllSchools(0, 999);
                const formattedSchools = await Promise.all(
                    schoolsData
                        .filter((school) => school.id != null) // Filter out schools without valid IDs
                        .map((school) => SetSelectValue(school.id!.toString(), school.name))
                );
                setAvailableSchools(formattedSchools);
            } catch (error) {
                customLogger.error("Failed to fetch schools:", error);
            }
        };

        fetchRolesAndSchools();
    }, []);

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

    // Check if email verification token is present in the URL and verify it
    useEffect(() => {
        const emailVerificationToken = searchParams.get("emailVerificationToken");
        if (emailVerificationToken) {
            customLogger.debug("Email verification token found:", emailVerificationToken);

            const verifyEmail = async () => {
                try {
                    const result = await verifyEmailV1AuthEmailVerifyPost({
                        query: { token: emailVerificationToken },
                        headers: { Authorization: GetAccessTokenHeader() },
                    });

                    if (result.error) {
                        throw new Error(
                            `Failed to verify email: ${result.response.status} ${result.response.statusText}`
                        );
                    }

                    notifications.show({
                        id: "email-verification-success",
                        title: "Your email has been verified",
                        message: "Thank you for verifying your email address.",
                        color: "green",
                        icon: <IconMailOpened />,
                    });
                } catch (error) {
                    if (error instanceof Error) {
                        notifications.show({
                            id: "email-verification-failure",
                            title: "Email Verification Failed",
                            message: `Failed to verify your email: ${error.message}`,
                            color: "red",
                            icon: <IconMailOff />,
                        });
                    } else {
                        notifications.show({
                            id: "email-verification-failure-unknown",
                            title: "Email Verification Failed",
                            message: "An unknown error occurred while verifying your email. Please try again later.",
                            color: "red",
                            icon: <IconMailOff />,
                        });
                    }
                }
            };

            verifyEmail();
        }
    }, [searchParams]);

    return (
        <Box mx="auto" p="lg">
            <Flex justify="space-between" align="center" mb="sm">
                <Group align="center">
                    <Title order={3}>Profile</Title>
                    {hasUnsavedChanges && (
                        <Badge color="yellow" variant="filled" size="sm">
                            You have unsaved changes
                        </Badge>
                    )}
                </Group>
                <UserSyncButton size="compact-sm" />
            </Flex>
            <Divider mb="lg" />
            <Flex justify="space-between" align="flex-start" wrap="wrap" w="100%">
                <Group gap={20}>
                    <Avatar
                        variant="light"
                        radius="lg"
                        size={100}
                        color="#258ce6"
                        src={avatarRemoved ? undefined : editUserAvatarUrl || userAvatarUrl || undefined}
                    />
                    <Stack gap={0}>
                        <Text size="sm" c="dimmed">
                            {userInfo && userInfo.position ? userInfo.position : "No Assigned Position"}
                        </Text>
                        <Text fw={600} size="lg">
                            {userInfo?.nameFirst || userInfo?.nameMiddle || userInfo?.nameLast
                                ? `${userInfo?.nameFirst ?? ""} ${
                                      userInfo?.nameMiddle
                                          ? userInfo.nameMiddle
                                                .split(" ")
                                                .map((n) => n[0])
                                                .join(".") + ". "
                                          : ""
                                  }${userInfo?.nameLast ?? ""}`.trim()
                                : "Unnamed User"}
                        </Text>
                        <Text size="sm" c="dimmed">
                            @{userInfo?.username}
                        </Text>
                    </Stack>
                </Group>
                <Group gap="sm">
                    <FileButton onChange={handleChangeAvatar} accept="image/png,image/jpeg">
                        {(props) => (
                            <Button variant="outline" size="sm" {...props}>
                                Change Profile Picture
                            </Button>
                        )}
                    </FileButton>
                    {(editUserAvatarUrl || userAvatarUrl) && !avatarRemoved && (
                        <Button variant="outline" size="sm" color="red" onClick={handleRemoveAvatar}>
                            Remove Avatar
                        </Button>
                    )}
                </Group>
            </Flex>

            <Divider my="lg" />

            <form
                onSubmit={form.onSubmit(handleSave)}
                onKeyDown={(e) => {
                    if (e.key === "Enter") {
                        e.preventDefault();
                        form.onSubmit(handleSave)();
                    }
                }}
            >
                <Title order={4} mb="sm" mt="lg">
                    Account
                </Title>
                <Tooltip
                    disabled={userPermissions?.includes("users:self:modify:username")}
                    label="Username cannot be changed. Contact an administrator for assistance."
                    withArrow
                >
                    <TextInput
                        disabled={!userPermissions?.includes("users:self:modify:username")}
                        label="Username"
                        placeholder="Username"
                        key={form.key("username")}
                        {...form.getInputProps("username")}
                    />
                </Tooltip>{" "}
                <Tooltip
                    disabled={userPermissions?.includes("users:self:modify:role")}
                    label="Role cannot be changed. Contact an administrator for assistance."
                    withArrow
                >
                    <Select
                        disabled={!userPermissions?.includes("users:self:modify:role")}
                        label="Role"
                        placeholder="Role"
                        data={availableRoles}
                        key={form.key("role")}
                        searchable
                        {...form.getInputProps("role")}
                    />
                </Tooltip>
                <Tooltip
                    disabled={userPermissions?.includes("users:self:modify:position")}
                    label="Position cannot be changed. Contact an administrator for assistance."
                    withArrow
                >
                    <TextInput
                        disabled={!userPermissions?.includes("users:self:modify:position")}
                        label="Position"
                        placeholder="Position"
                        key={form.key("position")}
                        {...form.getInputProps("position")}
                    />
                </Tooltip>
                <Tooltip
                    disabled={userPermissions?.includes("users:self:modify:school")}
                    label="School cannot be changed. Contact an administrator for assistance.. Contact an administrator for assistance."
                    withArrow
                >
                    <Select
                        disabled={!userPermissions?.includes("users:self:modify:school")}
                        label="Assigned School"
                        placeholder="School"
                        data={availableSchools}
                        key={form.key("school")}
                        clearable
                        searchable
                        {...form.getInputProps("school")}
                    />
                </Tooltip>
                <Group mt="md">
                    <Tooltip
                        disabled={userPermissions?.includes("users:self:deactivate")}
                        label="Deactivation status cannot be changed. Contact an administrator for assistance."
                        withArrow
                    >
                        <Switch
                            disabled={!userPermissions?.includes("users:self:deactivate")}
                            label="Deactivated"
                            placeholder="Deactivated"
                            key={form.key("deactivated")}
                            {...form.getInputProps("deactivated", { type: "checkbox" })}
                        />
                    </Tooltip>
                    <Tooltip
                        disabled={userPermissions?.includes("users:self:forceupdate")}
                        label="Force Update Required cannot be changed. Contact an administrator for assistance."
                        withArrow
                    >
                        <Switch
                            disabled={!userPermissions?.includes("users:self:forceupdate")}
                            label="Force Update Required"
                            placeholder="Force Update Required"
                            key={form.key("forceUpdateInfo")}
                            {...form.getInputProps("forceUpdateInfo", { type: "checkbox" })}
                        />
                    </Tooltip>
                </Group>
                <Title order={4} mb="sm" mt="lg">
                    Personal Information
                </Title>
                <Group>
                    <Tooltip
                        disabled={userPermissions?.includes("users:self:modify:name")}
                        label="Name cannot be changed. Contact an administrator for assistance."
                        withArrow
                    >
                        <TextInput
                            disabled={!userPermissions?.includes("users:self:modify:name")}
                            label="First Name"
                            placeholder="First Name"
                            rightSection={
                                <IconTrash
                                    size={16}
                                    color="red"
                                    onClick={() => form.setFieldValue("nameFirst", "")}
                                    style={{
                                        opacity: 0,
                                        cursor: "pointer",
                                        transition: "opacity 0.2s ease",
                                    }}
                                    onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
                                    onMouseLeave={(e) => (e.currentTarget.style.opacity = "0")}
                                />
                            }
                            key={form.key("nameFirst")}
                            {...form.getInputProps("nameFirst")}
                        />
                    </Tooltip>
                    <Tooltip
                        disabled={userPermissions?.includes("users:self:modify:name")}
                        label="Name cannot be changed. Contact an administrator for assistance."
                        withArrow
                    >
                        <TextInput
                            disabled={!userPermissions?.includes("users:self:modify:name")}
                            label="Middle Name"
                            placeholder="Middle Name"
                            rightSection={
                                <IconTrash
                                    size={16}
                                    color="red"
                                    onClick={() => form.setFieldValue("nameMiddle", "")}
                                    style={{
                                        opacity: 0,
                                        cursor: "pointer",
                                        transition: "opacity 0.2s ease",
                                    }}
                                    onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
                                    onMouseLeave={(e) => (e.currentTarget.style.opacity = "0")}
                                />
                            }
                            key={form.key("nameMiddle")}
                            {...form.getInputProps("nameMiddle")}
                        />
                    </Tooltip>
                    <Tooltip
                        disabled={userPermissions?.includes("users:self:modify:name")}
                        label="Name cannot be changed. Contact an administrator for assistance."
                        withArrow
                    >
                        <TextInput
                            disabled={!userPermissions?.includes("users:self:modify:name")}
                            label="Last Name"
                            placeholder="Last Name"
                            rightSection={
                                <IconTrash
                                    size={16}
                                    color="red"
                                    onClick={() => form.setFieldValue("nameLast", "")}
                                    style={{
                                        opacity: 0,
                                        cursor: "pointer",
                                        transition: "opacity 0.2s ease",
                                    }}
                                    onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
                                    onMouseLeave={(e) => (e.currentTarget.style.opacity = "0")}
                                />
                            }
                            key={form.key("nameLast")}
                            {...form.getInputProps("nameLast")}
                        />
                    </Tooltip>
                </Group>
                <Flex justify="space-between" align="flex-start" wrap="wrap" w="100%" mt="lg">
                    <Stack gap={10}>
                        <Text fw={500} size="sm">
                            Electronic Signature
                        </Text>
                        <Group align="center" gap={15}>
                            {editUserSignatureUrl ? (
                                <Box
                                    style={{
                                        border: "1px solid #e0e0e0",
                                        borderRadius: "8px",
                                        padding: "8px",
                                        backgroundColor: "white",
                                        maxWidth: "200px",
                                        maxHeight: "80px",
                                        overflow: "hidden",
                                    }}
                                >
                                    <Image
                                        src={editUserSignatureUrl}
                                        alt="User signature"
                                        width={200}
                                        height={80}
                                        style={{
                                            objectFit: "contain",
                                            width: "100%",
                                            height: "auto",
                                            maxHeight: "80px",
                                        }}
                                    />
                                </Box>
                            ) : (
                                <Box
                                    style={{
                                        border: "2px dashed #e0e0e0",
                                        borderRadius: "8px",
                                        padding: "20px",
                                        backgroundColor: "#f9f9f9",
                                        width: "200px",
                                        height: "80px",
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                    }}
                                >
                                    <Text size="xs" c="dimmed" ta="center">
                                        No signature uploaded
                                    </Text>
                                </Box>
                            )}
                            <Stack gap={5}>
                                <FileButton onChange={handleChangeSignature} accept="image/png,image/jpeg">
                                    {(props) => (
                                        <Button variant="outline" size="sm" {...props}>
                                            {editUserSignatureUrl ? "Change Signature" : "Upload Signature"}
                                        </Button>
                                    )}
                                </FileButton>
                                <Button variant="outline" size="sm" onClick={handleDrawSignature}>
                                    Draw Signature
                                </Button>
                                {editUserSignatureUrl && (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        color="red"
                                        onClick={() => {
                                            setSignatureRemoved(true);
                                            setEditUserSignature(null);
                                            if (editUserSignatureUrl && !currentSignatureUrn) {
                                                URL.revokeObjectURL(editUserSignatureUrl);
                                            }
                                            setEditUserSignatureUrl(null);
                                        }}
                                    >
                                        Remove Signature
                                    </Button>
                                )}
                            </Stack>
                        </Group>
                        <Text size="xs" c="dimmed">
                            Upload your electronic signature or draw it directly. Max file size: 1MB. Formats: JPG, PNG,
                            WEBP.
                        </Text>
                    </Stack>
                </Flex>
                <Paper shadow="sm" p="md" radius="md" mt="xl">
                    <Title order={4} mb="xs">
                        Personal Preferences
                    </Title>
                    <Stack>
                        <Switch
                            label="Dark Mode"
                            checked={colorScheme === "dark"}
                            onChange={(e) => setColorScheme(e.currentTarget.checked ? "dark" : "light")}
                        />
                        <Group align="end">
                            <ColorInput
                                label="Accent Color"
                                value={localPreferences.accentColor}
                                onChange={(color) => handlePreferenceChange("accentColor", color)}
                                style={{ flex: 1 }}
                            />
                            <Button
                                variant="light"
                                size="sm"
                                onClick={() => handlePreferenceChange("accentColor", "#258ce6")}
                                title="Reset to default accent color"
                            >
                                Reset
                            </Button>
                        </Group>
                        <Select
                            label="Default Language"
                            data={[
                                { value: "en", label: "English" },
                                { value: "fil", label: "Filipino" },
                            ]}
                            value={localPreferences.language}
                            onChange={(value) => handlePreferenceChange("language", value)}
                            description="This setting will be implemented in a future update"
                        />
                    </Stack>
                </Paper>
                <Title order={4} mb="sm" mt="lg">
                    Account Security
                </Title>
                <Flex justify="space-between" align="end" w="100%" gap="lg">
                    <Stack w="100%" style={{ flexGrow: 1, minWidth: 0 }}>
                        <Tooltip
                            disabled={userPermissions?.includes("users:self:modify:email")}
                            label="Email cannot be changed. Contact an administrator for assistance."
                            withArrow
                        >
                            <TextInput
                                disabled
                                label="Email"
                                placeholder="No Email Set"
                                rightSection={
                                    form.values.email &&
                                    (userInfo?.emailVerified && form.values.email === userInfo?.email ? (
                                        <Tooltip
                                            label="This email has been verified. You're good to go!"
                                            withArrow
                                            multiline
                                            w={250}
                                        >
                                            <IconCircleDashedCheck size={16} color="green" />
                                        </Tooltip>
                                    ) : (
                                        <Tooltip
                                            label="This email has not yet been verified. Click to send a verification email."
                                            withArrow
                                            multiline
                                            w={250}
                                            onClick={async () => {
                                                try {
                                                    const result = await requestVerificationEmailV1AuthEmailRequestPost(
                                                        {
                                                            headers: { Authorization: GetAccessTokenHeader() },
                                                        }
                                                    );

                                                    if (result.error) {
                                                        throw new Error(
                                                            `Failed to send verification email: ${result.response.status} ${result.response.statusText}`
                                                        );
                                                    }

                                                    notifications.show({
                                                        id: "verification-email-sent",
                                                        title: "Verification Email Sent",
                                                        message:
                                                            "Please check your email and click the link to verify your email.",
                                                        color: "blue",
                                                        icon: <IconMail />,
                                                    });
                                                } catch (error) {
                                                    if (error instanceof Error) {
                                                        notifications.show({
                                                            id: "verification-email-error",
                                                            title: "Error",
                                                            message: `Failed to send verification email: ${error.message}`,
                                                            color: "red",
                                                            icon: <IconSendOff />,
                                                        });
                                                    } else {
                                                        notifications.show({
                                                            id: "verification-email-error-unknown",
                                                            title: "Error",
                                                            message:
                                                                "Failed to send verification email. Please try again later.",
                                                            color: "red",
                                                            icon: <IconSendOff />,
                                                        });
                                                    }
                                                }
                                            }}
                                        >
                                            <IconCircleDashedX size={16} color="gray" />
                                        </Tooltip>
                                    ))
                                }
                                key={form.key("email")}
                                {...form.getInputProps("email")}
                            />
                        </Tooltip>
                    </Stack>

                    <Button
                        variant="outline"
                        size="sm"
                        style={{
                            height: 35,
                            whiteSpace: "nowrap",
                            width: 165,
                            flexShrink: 0,
                        }}
                        onClick={() => {
                            setShowChangeEmailModal(true);
                        }}
                    >
                        Change email
                    </Button>
                </Flex>
                <Space h="md" />
                <Flex justify="space-between" align="end" w="100%" gap="lg">
                    <Stack w="100%" style={{ flexGrow: 1, minWidth: 0 }}>
                        <TextInput
                            label="Password"
                            value="(unchanged)"
                            size="sm"
                            disabled
                            w="100%"
                            style={{ flexGrow: 1, minWidth: 0 }}
                            labelProps={{ style: { marginBottom: 6 } }}
                        />
                    </Stack>
                    {/* Password change modal moved outside the main form */}

                    <Button
                        variant="outline"
                        size="sm"
                        style={{
                            height: 35,
                            whiteSpace: "nowrap",
                            width: 165,
                            flexShrink: 0,
                        }}
                        onClick={modalHandler.open}
                    >
                        Change password
                    </Button>
                </Flex>
                <Space h="md" />
                <Group justify="space-between" mt="md">
                    <Box>
                        <Text fw={500} size="sm">
                            2-Step Verification
                        </Text>
                        <Text size="xs" c="dimmed">
                            Add an additional layer of security to your account during login.
                        </Text>
                    </Box>
                    <Switch
                        checked={otpEnabled}
                        onChange={async (e) => {
                            try {
                                if (e.currentTarget.checked) {
                                    if (userInfo?.otpVerified) {
                                        notifications.show({
                                            title: "Two-Step Verification Already Enabled",
                                            message: "You have already enabled two-step verification.",
                                            color: "yellow",
                                            icon: <IconKey />,
                                        });
                                        return;
                                    }
                                    const otpResult = await generateMfaOtpV1AuthMfaOtpGeneratePost({
                                        headers: { Authorization: GetAccessTokenHeader() },
                                    });

                                    if (otpResult.error) {
                                        throw new Error(
                                            `Failed to generate OTP: ${otpResult.response.status} ${otpResult.response.statusText}`
                                        );
                                    }

                                    const otpData = otpResult.data as OtpToken;
                                    setOtpGenData(otpData);
                                    setShowOTPModal(true);
                                } else {
                                    const disableResult = await disableMfaOtpV1AuthMfaOtpDisablePost({
                                        headers: { Authorization: GetAccessTokenHeader() },
                                    });

                                    if (disableResult.error) {
                                        throw new Error(
                                            `Failed to disable OTP: ${disableResult.response.status} ${disableResult.response.statusText}`
                                        );
                                    }

                                    notifications.show({
                                        title: "Two-Step Verification Disabled",
                                        message: "You will no longer be prompted for a verification code during login.",
                                        color: "yellow",
                                        icon: <IconKey />,
                                    });
                                    setOtpEnabled(false);
                                }
                            } catch (error) {
                                customLogger.error(error instanceof Error ? error.message : String(error));
                                notifications.show({
                                    title: "Error",
                                    message: "An unknown error occurred.",
                                    color: "red",
                                    icon: <IconX />,
                                });
                                setOtpVerifyHasError(true);
                            } finally {
                                const userInfoResult = await getUserProfileEndpointV1UsersMeGet({
                                    headers: { Authorization: GetAccessTokenHeader() },
                                });

                                if (userInfoResult.error) {
                                    throw new Error(
                                        `Failed to get user info: ${userInfoResult.response.status} ${userInfoResult.response.statusText}`
                                    );
                                }

                                const [updatedUserInfo, updatedPermissions] = userInfoResult.data as [
                                    UserPublic,
                                    string[]
                                ];
                                userCtx.updateUserInfo(updatedUserInfo, updatedPermissions);
                            }
                        }}
                    />
                </Group>
                <Divider my="lg" label="Linked Accounts" labelPosition="center" />
                <Stack>
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
                                        const { unlinkGoogleAccountPopup } = await import("@/lib/utils/oauth-popup");
                                        await unlinkGoogleAccountPopup();

                                        notifications.show({
                                            title: "Unlink Successful",
                                            message: "Your Google account has been unlinked successfully.",
                                            color: "green",
                                        });

                                        // Refresh the page to update user data
                                        await refetchUserProfile();
                                    } catch (error) {
                                        customLogger.error("Failed to unlink Google account:", error);
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
                                        const { linkGoogleAccountPopup } = await import("@/lib/utils/oauth-popup");
                                        await linkGoogleAccountPopup();

                                        notifications.show({
                                            title: "Link Successful",
                                            message: "Your Google account has been linked successfully.",
                                            color: "green",
                                        });

                                        // Refresh the page to update user data
                                        await refetchUserProfile();
                                    } catch (error) {
                                        customLogger.error("Failed to link Google account:", error);
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
                    </Group>
                </Stack>
                <Button loading={buttonLoading} rightSection={<IconDeviceFloppy />} type="submit" fullWidth mt="xl">
                    Save
                </Button>
            </form>
            <Modal
                opened={showOTPModal}
                onClose={() => {
                    showOTPSecretHandler.close();
                    setShowOTPModal(false);
                }}
                title="Enable Two-Step Verification"
                centered
            >
                <Stack>
                    <Text size="sm" c="dimmed" ta="center">
                        Scan the QR code below with your authenticator app to set up two-step verification.
                    </Text>
                    <Box style={{ textAlign: "center" }}>
                        <SVG text={otpGenData?.provisioning_uri || ""} />
                    </Box>
                    {!showOTPSecret && (
                        <Anchor
                            size="xs"
                            c="dimmed"
                            onClick={showOTPSecretHandler.open}
                            style={{ cursor: "pointer", textAlign: "center" }}
                        >
                            Can&apos;t scan the QR code?
                        </Anchor>
                    )}
                    {showOTPSecret && (
                        <Anchor
                            size="xs"
                            c="dimmed"
                            onClick={() => {
                                if (otpGenData?.secret) {
                                    navigator.clipboard.writeText(otpGenData.secret);
                                    // showOTPSecretHandler.close();
                                    notifications.show({
                                        title: "Secret Copied",
                                        message: "The secret key has been copied to your clipboard",
                                        color: "green",
                                    });
                                }
                            }}
                            style={{ cursor: "pointer", textAlign: "center" }}
                        >
                            <strong>{otpGenData?.secret.match(/.{1,4}/g)?.join(" ") || "Error"}</strong>
                        </Anchor>
                    )}
                    <Text size="sm" ta="center">
                        Enter the verification code generated by your authenticator app below to complete the setup.
                    </Text>
                    <Center>
                        <PinInput
                            oneTimeCode
                            length={6}
                            type="number"
                            onChange={(value) => {
                                setVerifyOtpCode(value);
                                setOtpVerifyHasError(false);
                            }}
                            error={otpVerifyHasError}
                        />
                    </Center>
                    <Button
                        variant="filled"
                        color="blue"
                        onClick={async () => {
                            try {
                                const result = await verifyMfaOtpV1AuthMfaOtpVerifyPost({
                                    query: { otp: verifyOtpCode },
                                    headers: { Authorization: GetAccessTokenHeader() },
                                });

                                if (result.error) {
                                    throw new Error(
                                        `Failed to verify OTP: ${result.response.status} ${result.response.statusText}`
                                    );
                                }

                                notifications.show({
                                    title: "Two-Step Verification Enabled",
                                    message: "You will now be prompted for a verification code during login.",
                                    color: "green",
                                    icon: <IconKey />,
                                });
                                setOtpEnabled(true);
                                setShowOTPModal(false);
                                setShowRecoveryCodeModal(true);
                            } catch (error) {
                                customLogger.error(error instanceof Error ? error.message : String(error));
                                notifications.show({
                                    title: "Error Enabling Two-Step Verification",
                                    message: "An unknown error occurred.",
                                    color: "red",
                                    icon: <IconX />,
                                });
                                setOtpVerifyHasError(true);
                            } finally {
                                showOTPSecretHandler.close();
                            }
                        }}
                    >
                        Enable Two-Step Verification
                    </Button>
                </Stack>
            </Modal>
            <Modal
                opened={showRecoveryCodeModal}
                onClose={() => setShowRecoveryCodeModal(false)}
                title="Recovery Code"
                centered
            >
                <Stack>
                    <Text size="sm" c="dimmed" ta="center">
                        Store this recovery code in a safe place. They can be used to access your account if you lose
                        access to your authenticator app.
                    </Text>
                    <Group justify="center" gap="sm">
                        <Flex justify="center" align="center" gap="xs">
                            {otpGenData?.recovery_code ? (
                                <Text size="md" fw={500}>
                                    {otpGenData.recovery_code}
                                </Text>
                            ) : (
                                <Text size="md" c="red">
                                    No recovery code available
                                </Text>
                            )}
                            <ActionIcon
                                variant="light"
                                color="blue"
                                onClick={() => {
                                    navigator.clipboard.writeText(otpGenData?.recovery_code || "");
                                    notifications.show({
                                        title: "Recovery Codes Copied",
                                        message: "The recovery codes have been copied to your clipboard",
                                        color: "green",
                                    });
                                }}
                            >
                                <IconClipboardCopy size={16} />
                            </ActionIcon>
                        </Flex>
                    </Group>
                </Stack>
            </Modal>

            {/* Signature Drawing Modal */}
            <Modal
                opened={showSignatureDrawModal}
                onClose={handleCancelDrawSignature}
                title={
                    <Group gap="sm">
                        <IconScribble size={20} />
                        <Text fw={500}>Draw Your Signature</Text>
                    </Group>
                }
                centered
                size="md"
            >
                <Stack gap="md">
                    <Text size="sm" c="dimmed">
                        Draw your signature in the canvas below. Use your mouse or touch to create your signature.
                    </Text>
                    <SignatureCanvas onSave={handleSaveDrawnSignature} onCancel={handleCancelDrawSignature} />
                </Stack>
            </Modal>

            <ChangeEmailComponent
                modalOpen={showChangeEmailModal}
                setModalOpen={setShowChangeEmailModal}
                oldEmail={userInfo?.email}
                userId={userInfo?.id}
                onEmailChanged={async () => {
                    // Refresh user information after email change
                    try {
                        const userInfoResult = await getUserProfileEndpointV1UsersMeGet({
                            headers: { Authorization: GetAccessTokenHeader() },
                        });

                        if (userInfoResult.error) {
                            throw new Error(
                                `Failed to get user info: ${userInfoResult.response.status} ${userInfoResult.response.statusText}`
                            );
                        }

                        const [updatedUserInfo, updatedPermissions] = userInfoResult.data as [UserPublic, string[]];
                        userCtx.updateUserInfo(updatedUserInfo, updatedPermissions);
                    } catch (error) {
                        customLogger.error("Failed to refresh user info after email change:", error);
                    }
                }}
            />

            {/* Password change modal - moved outside the main form */}
            <Modal
                opened={opened}
                onClose={() => {
                    changePasswordForm.reset();
                    setNewPassword("");
                    modalHandler.close();
                }}
                title="Update Password"
                centered
            >
                <form onSubmit={changePasswordForm.onSubmit(handlePasswordChange)}>
                    <Stack>
                        <TextInput
                            label="Current Password"
                            placeholder="Enter your current password"
                            type="password"
                            required
                            key={changePasswordForm.key("currentPassword")}
                            {...changePasswordForm.getInputProps("currentPassword")}
                        />
                        <TextInput
                            label="New Password"
                            placeholder="At least 8 characters"
                            type="password"
                            required
                            value={newPassword}
                            onChange={(event) => {
                                const value = event.currentTarget.value;
                                setNewPassword(value);
                                changePasswordForm.setFieldValue("newPassword", value);
                            }}
                            error={changePasswordForm.errors.newPassword}
                        />
                        <Box>
                            {requirements.map((requirement) => (
                                <PasswordRequirement
                                    key={requirement.label}
                                    label={requirement.label}
                                    meets={requirement.re.test(newPassword)}
                                />
                            ))}
                        </Box>
                        <TextInput
                            label="Confirm Password"
                            placeholder="Re-enter your new password"
                            type="password"
                            required
                            key={changePasswordForm.key("confirmPassword")}
                            {...changePasswordForm.getInputProps("confirmPassword")}
                        />

                        <Button
                            variant="filled"
                            color="blue"
                            type="submit"
                            loading={passwordLoading}
                            leftSection={<IconKey size={16} />}
                        >
                            Update Password
                        </Button>

                        <Anchor
                            size="xs"
                            style={{
                                color: "gray",
                                textAlign: "center",
                                cursor: "pointer",
                            }}
                            href="/forgotPassword"
                        >
                            Forgot your password?
                        </Anchor>
                    </Stack>
                </form>
            </Modal>
        </Box>
    );
}

export default function ProfilePage() {
    const userCtx = useUser();
    return (
        <Suspense fallback={<LoadingComponent message="Loading your profile..." withBorder={false} />}>
            <ProfileContent
                userInfo={userCtx.userInfo}
                userPermissions={userCtx.userPermissions}
                userAvatarUrl={userCtx.userAvatarUrl}
            />
        </Suspense>
    );
}
