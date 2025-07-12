"use client";

import { deleteSchoolInfoEndpointV1SchoolsDelete, School, SchoolDelete, SchoolUpdate } from "@/lib/api/csclient";
import { customLogger } from "@/lib/api/customLogger";
import { RemoveSchoolLogo, UpdateSchoolInfo, UploadSchoolLogo } from "@/lib/api/school";
import { Button, Card, Center, FileButton, Flex, Image, Modal, Switch, TextInput } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import {
    IconDeviceFloppy,
    IconPencilCheck,
    IconSendOff,
    IconTrash,
    IconUser,
    IconUserExclamation,
} from "@tabler/icons-react";
import { motion } from "motion/react";
import { useCallback, useEffect, useState } from "react";

interface EditSchoolComponentProps {
    index: number | null;
    school: School | null;
    setIndex: React.Dispatch<React.SetStateAction<number | null>>;
    onSchoolUpdate?: (updatedSchool: School) => void;
    fetchSchoolLogo: (logoUrn: string) => string | undefined;
    onRefresh?: () => void;
}

export function EditSchoolComponent({
    index,
    school,
    setIndex,
    onSchoolUpdate,
    fetchSchoolLogo,
    onRefresh,
}: EditSchoolComponentProps) {
    const [editSchool, setEditSchool] = useState<School | null>(null);
    const [editSchoolLogo, setEditSchoolLogo] = useState<File | null>(null);
    const [editSchoolLogoUrl, setEditSchoolLogoUrl] = useState<string | null>(null);
    const [logoToRemove, setLogoToRemove] = useState(false);
    const [buttonLoading, buttonStateHandler] = useDisclosure(false);

    useEffect(() => {
        if (school) {
            setEditSchool(school);
            setLogoToRemove(false);
            if (school.logoUrn && school.id != null) {
                const logoUrl = fetchSchoolLogo(school.logoUrn);
                setEditSchoolLogoUrl(logoUrl ? logoUrl : null);
            } else {
                setEditSchoolLogo(null);
                setEditSchoolLogoUrl(null);
            }
        }
    }, [school, fetchSchoolLogo]);

    const handleSave = useCallback(async () => {
        buttonStateHandler.open();
        if (index !== null && editSchool && editSchool.id != null) {
            const newSchoolInfo: SchoolUpdate = {
                id: editSchool.id,
                name: editSchool.name,
                address: editSchool.address,
                phone: editSchool.phone,
                email: editSchool.email,
                website: editSchool.website,
                deactivated: editSchool.deactivated,
            };
            try {
                // Handle value removal first
                const valuesToRemove: SchoolDelete = {
                    id: editSchool.id,
                    address: editSchool.address === null,
                    phone: editSchool.phone === null,
                    email: editSchool.email === null,
                    website: editSchool.website === null,
                };
                const hasValuesToRemove = Object.values(valuesToRemove).some(
                    (field, index) => index > 0 && field === true
                );
                customLogger.debug("Has values to remove:", hasValuesToRemove);
                if (hasValuesToRemove) {
                    const deleteResult = await deleteSchoolInfoEndpointV1SchoolsDelete({ body: valuesToRemove });
                    if (deleteResult.error) {
                        customLogger.error("Failed to remove school values:", deleteResult.error);
                        notifications.show({
                            id: "remove-school-values-error",
                            title: "Error",
                            message: "Failed to remove school values. Please try again.",
                            color: "red",
                            icon: <IconSendOff />,
                        });
                        buttonStateHandler.close();
                        return;
                    }
                }

                // update school info first
                await UpdateSchoolInfo(newSchoolInfo);
                let updatedSchool = { ...editSchool };
                // logo removal
                if (logoToRemove && editSchool.logoUrn) {
                    customLogger.debug("Removing logo...");
                    try {
                        const schoolAfterLogoRemoval = await RemoveSchoolLogo(editSchool.id);
                        if (schoolAfterLogoRemoval) {
                            updatedSchool = schoolAfterLogoRemoval;
                        }
                        customLogger.debug("Logo removed successfully.");
                    } catch (error) {
                        customLogger.error("Failed to remove school logo:", error);
                        notifications.show({
                            id: "remove-logo-error",
                            title: "Error",
                            message: "Failed to remove school logo. Please try again.",
                            color: "red",
                            icon: <IconUserExclamation />,
                        });
                        buttonStateHandler.close();
                        return;
                    }
                }
                // logo upload
                else if (editSchoolLogo) {
                    customLogger.debug("Uploading logo...");
                    try {
                        const schoolAfterLogoUpload = await UploadSchoolLogo(editSchool.id, editSchoolLogo);
                        updatedSchool = schoolAfterLogoUpload;
                        if (schoolAfterLogoUpload.logoUrn) {
                            fetchSchoolLogo(schoolAfterLogoUpload.logoUrn);
                        }
                        customLogger.debug("Logo uploaded successfully.");
                    } catch (error) {
                        customLogger.error("Failed to upload school logo:", error);
                        notifications.show({
                            id: "upload-logo-error",
                            title: "Error",
                            message: "Failed to upload school logo. Please try again.",
                            color: "red",
                            icon: <IconUserExclamation />,
                        });
                    }
                }

                notifications.show({
                    id: "school-update-success",
                    title: "Success",
                    message: "School information updated successfully.",
                    color: "green",
                    icon: <IconPencilCheck />,
                });

                if (onSchoolUpdate) onSchoolUpdate(updatedSchool);
            } catch (error) {
                customLogger.error("Failed to update school:", error);
                notifications.show({
                    id: "school-update-error",
                    title: "Error",
                    message: "Failed to update school information. Please try again later.",
                    color: "red",
                    icon: <IconSendOff />,
                });
            } finally {
                setIndex(null);
                setEditSchool(null);
                setEditSchoolLogo(null);
                setEditSchoolLogoUrl(null);
                setLogoToRemove(false);
                buttonStateHandler.close();
                if (onRefresh) onRefresh();
            }
        }
    }, [
        index,
        editSchool,
        logoToRemove,
        editSchoolLogo,
        setIndex,
        onSchoolUpdate,
        onRefresh,
        fetchSchoolLogo,
        buttonStateHandler,
    ]);

    const setLogo = useCallback(async (file: File | null) => {
        if (file === null) {
            customLogger.debug("No file selected, skipping upload...");
            return;
        }
        setEditSchoolLogo(file);
        setEditSchoolLogoUrl((prevUrl) => {
            if (prevUrl) {
                URL.revokeObjectURL(prevUrl); // Clean up previous URL
            }
            return URL.createObjectURL(file); // Create a new URL for the selected file
        });
    }, []);

    const removeLogo = useCallback(() => {
        if (editSchoolLogoUrl) {
            URL.revokeObjectURL(editSchoolLogoUrl);
        }
        setEditSchoolLogo(null);
        setEditSchoolLogoUrl(null);
        setLogoToRemove(true);
    }, [editSchoolLogoUrl]);

    return (
        <Modal opened={index !== null} onClose={() => setIndex(null)} title="Edit School" centered>
            {editSchool && (
                <Flex direction="column" gap="md">
                    <Center>
                        <Card
                            shadow="sm"
                            radius="xl"
                            withBorder
                            style={{
                                position: "relative",
                                cursor: "pointer",
                            }}
                        >
                            <FileButton onChange={setLogo} accept="image/png,image/jpeg">
                                {(props) => (
                                    <motion.div
                                        whileHover={{ scale: 1.05 }}
                                        style={{ position: "relative" }}
                                        {...props}
                                    >
                                        {editSchoolLogoUrl ? (
                                            <Image
                                                id="edit-school-logo"
                                                src={editSchoolLogoUrl}
                                                alt="School Logo"
                                                h={150}
                                                w={150}
                                                radius="xl"
                                            />
                                        ) : (
                                            <IconUser size={150} color="gray" />
                                        )}
                                        <motion.div
                                            initial={{ opacity: 0 }}
                                            whileHover={{ opacity: 1 }}
                                            style={{
                                                position: "absolute",
                                                top: 0,
                                                left: 0,
                                                right: 0,
                                                bottom: 0,
                                                backgroundColor: "rgba(0, 0, 0, 0.5)",
                                                borderRadius: "var(--mantine-radius-xl)",
                                                display: "flex",
                                                alignItems: "center",
                                                justifyContent: "center",
                                                color: "white",
                                                fontWeight: 500,
                                            }}
                                        >
                                            Upload Picture
                                        </motion.div>
                                    </motion.div>
                                )}
                            </FileButton>
                        </Card>
                    </Center>
                    {(editSchoolLogo || editSchoolLogoUrl) && (
                        <Button variant="outline" color="red" mt="md" onClick={removeLogo}>
                            Remove School Logo
                        </Button>
                    )}
                    <TextInput
                        label="School Name"
                        value={editSchool.name ? editSchool.name : ""}
                        onChange={(e) =>
                            setEditSchool({
                                ...editSchool,
                                name: e.currentTarget.value,
                            })
                        }
                    />
                    <TextInput
                        label="Address"
                        value={editSchool.address ? editSchool.address : ""}
                        onChange={(e) =>
                            setEditSchool({
                                ...editSchool,
                                address: e.currentTarget.value,
                            })
                        }
                        rightSection={
                            <IconTrash
                                size={16}
                                color="red"
                                onClick={() => setEditSchool({ ...editSchool, address: null })}
                                style={{
                                    opacity: 0,
                                    cursor: "pointer",
                                    transition: "opacity 0.2s ease",
                                }}
                                onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
                                onMouseLeave={(e) => (e.currentTarget.style.opacity = "0")}
                            />
                        }
                    />
                    <TextInput
                        label="Phone Number"
                        value={editSchool.phone ? editSchool.phone : ""}
                        onChange={(e) =>
                            setEditSchool({
                                ...editSchool,
                                phone: e.currentTarget.value,
                            })
                        }
                        rightSection={
                            <IconTrash
                                size={16}
                                color="red"
                                onClick={() => setEditSchool({ ...editSchool, phone: null })}
                                style={{
                                    opacity: 0,
                                    cursor: "pointer",
                                    transition: "opacity 0.2s ease",
                                }}
                                onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
                                onMouseLeave={(e) => (e.currentTarget.style.opacity = "0")}
                            />
                        }
                    />
                    <TextInput
                        label="Email Address"
                        value={editSchool.email ? editSchool.email : ""}
                        onChange={(e) =>
                            setEditSchool({
                                ...editSchool,
                                email: e.currentTarget.value,
                            })
                        }
                        rightSection={
                            <IconTrash
                                size={16}
                                color="red"
                                onClick={() => setEditSchool({ ...editSchool, email: null })}
                                style={{
                                    opacity: 0,
                                    cursor: "pointer",
                                    transition: "opacity 0.2s ease",
                                }}
                                onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
                                onMouseLeave={(e) => (e.currentTarget.style.opacity = "0")}
                            />
                        }
                    />
                    <TextInput
                        label="Website"
                        value={editSchool.website ? editSchool.website : ""}
                        onChange={(e) =>
                            setEditSchool({
                                ...editSchool,
                                website: e.currentTarget.value,
                            })
                        }
                        rightSection={
                            <IconTrash
                                size={16}
                                color="red"
                                onClick={() => setEditSchool({ ...editSchool, website: null })}
                                style={{
                                    opacity: 0,
                                    cursor: "pointer",
                                    transition: "opacity 0.2s ease",
                                }}
                                onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
                                onMouseLeave={(e) => (e.currentTarget.style.opacity = "0")}
                            />
                        }
                    />
                    <Switch
                        label="Deactivate School"
                        checked={editSchool.deactivated || false}
                        onChange={(e) =>
                            setEditSchool({
                                ...editSchool,
                                deactivated: e.currentTarget.checked,
                            })
                        }
                        description="Deactivate the school and prevent it from being used in any future operations."
                    />
                    <Button loading={buttonLoading} rightSection={<IconDeviceFloppy />} onClick={handleSave}>
                        Save
                    </Button>
                </Flex>
            )}
        </Modal>
    );
}
