"use client";

import { useEffect, useState } from "react";

import { Box, Divider, Group, Flex, Stack, Space } from "@mantine/core";
import { Avatar, Title, Text, TextInput } from "@mantine/core";
import { Anchor, Button, FileButton, Modal, Switch } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { CentralServerGetUserInfo } from "@/lib/api/auth";
import { CentralServerGetUserAvatar } from "@/lib/api/user";
import { UserPublicType } from "@/lib/types";

export default function ProfilePage() {
    const [avatarBlobUrl, setAvatarBlobUrl] = useState<string | null>(null)
    const [userInfo, setUserInfo] = useState<UserPublicType | null>(null)
    const [opened, { open, close }] = useDisclosure(false);

    // TODO: Implement the file upload logic for uploading user avatars.
    const uploadAvatar = () => { }

    useEffect(() => {
        console.debug("ProfilePage useEffect started");
        const getUserInfo = async () => {
            console.debug("Getting user info...");
            const _userInfo = await CentralServerGetUserInfo()
            setUserInfo(_userInfo)
            console.debug("Getting user avatar...");
            const userAvatarImage = await CentralServerGetUserAvatar()
            if (userAvatarImage !== null) {
                console.debug("Setting avatar blob URL...")
                setAvatarBlobUrl(URL.createObjectURL(userAvatarImage))
            }
            else {
                console.debug("User avatar is null, skipping....")
            }
        }
        getUserInfo()
    }, [])

    console.debug("Rendering ProfilePage");
    return (
        <div>
            <Box mx="auto" p="lg">
                <Title order={3} mb="sm">Profile</Title>
                <Divider mb="lg" />
                <Flex justify="space-between" align="flex-start" wrap="wrap" w="100%">
                    <Group gap={20}>
                        <Avatar
                            variant="light"
                            radius="lg"
                            size={100}
                            color="#258ce6"
                            src={avatarBlobUrl ? avatarBlobUrl : undefined}
                        />
                        <Stack gap={0}>
                            <Text size="sm" c="dimmed">Canteen Manager</Text>
                            <Text fw={600} size="lg">Brian Federin</Text>
                            <Text size="sm" c="dimmed">{userInfo?.username}</Text>
                        </Stack>
                    </Group>

                    <FileButton onChange={uploadAvatar} accept="image/png,image/jpeg">
                        {(props) => (
                            <Button {...props} variant="outline" size="sm">
                                Edit Profile
                            </Button>
                        )}
                    </FileButton>
                </Flex>

                <Divider my="lg" />
                <Title order={4} mb="sm">Account Security</Title>
                <Flex justify="space-between" align="end" w="100%" gap="lg">
                    <Stack w="100%" style={{ flexGrow: 1, minWidth: 0 }}>
                        <TextInput
                            label="Email"
                            placeholder="brianfederin@gmail.com"
                            size="sm"
                            disabled
                            w="100%"
                            style={{ flexGrow: 1, minWidth: 0 }}
                            labelProps={{ style: { marginBottom: 6 } }}
                        />
                    </Stack>

                    <Button
                        variant="outline"
                        size="sm"
                        style={{
                            height: 35,
                            whiteSpace: 'nowrap',
                            width: 165,
                            flexShrink: 0,
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
                            value="********"
                            size="sm"
                            disabled
                            w="100%"
                            style={{ flexGrow: 1, minWidth: 0 }}
                            labelProps={{ style: { marginBottom: 6 } }}
                        />
                    </Stack>

                    <Modal opened={opened} onClose={close} title="Update Password" centered>
                        <Stack>
                            <TextInput
                                label="Current Password"
                                placeholder=""
                                type="password"
                                required
                            />
                            <TextInput
                                label="New Password"
                                placeholder="At least 8 characters"
                                type="password"
                                required
                            />
                            <TextInput
                                label="Confirm Password"
                                placeholder="At least 8 characters"
                                type="password"
                                required
                            />

                            <Button
                                variant="filled"
                                color="blue"
                            >
                                Update Password
                            </Button>

                            <Anchor
                                size="xs"
                                style={{
                                    color: "gray",
                                    textAlign: "center",
                                    cursor: "pointer"
                                }}
                            >
                                Forgotten your password?
                            </Anchor>
                        </Stack>
                    </Modal>

                    <Button
                        variant="outline"
                        size="sm"
                        style={{
                            height: 35,
                            whiteSpace: 'nowrap',
                            width: 165,
                            flexShrink: 0
                        }}
                        onClick={open}
                    >
                        Change password
                    </Button>
                </Flex>

                <Space h="md" />

                <Group justify="space-between" mt="md">
                    <Box>
                        <Text fw={500} size="sm">2-Step Verification</Text>
                        <Text size="xs" c="dimmed">
                            Add an additional layer of security to your account during login.
                        </Text>
                    </Box>
                    <Switch />
                </Group>

            </Box>
        </div>
    );
}
