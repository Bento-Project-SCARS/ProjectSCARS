"use client";

import {
    Accordion,
    Button,
    Container,
    Group,
    LoadingOverlay,
    MultiSelect,
    NumberInput,
    Paper,
    PasswordInput,
    Stack,
    Switch,
    Text,
    TextInput,
    ThemeIcon,
    Title,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { IconBrandGithub, IconInfoCircle, IconLockAccess, IconTool } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { GetServerConfig, UpdateServerConfig, ServerConfig } from "@/lib/api/config";
import { Program } from "@/lib/info";
import { customLogger } from "@/lib/api/customLogger";

export default function SettingsPage() {
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [hasPermission, setHasPermission] = useState(false);

    const form = useForm<ServerConfig>({
        mode: "uncontrolled",
        initialValues: {
            debug: {
                enabled: false,
                logenv_optout: true,
                show_sql: false,
                hot_reload: false,
            },
            connection: {
                host: "0.0.0.0",
                port: 8081,
                base_url: "http://localhost:8080",
            },
            logging: {
                filepath: "./logs/centralserver.log",
                max_bytes: 10485760,
                backup_count: 5,
                encoding: "utf-8",
                log_format: "%(asctime)s:%(name)s:%(levelname)s:%(message)s",
                date_format: "%d-%m-%y_%H-%M-%S",
            },
            security: {
                allow_origins: ["http://127.0.0.1:8080", "http://localhost:8080"],
                allow_credentials: true,
                allow_methods: ["*"],
                allow_headers: ["*"],
                failed_login_notify_attempts: 2,
                failed_login_lockout_attempts: 5,
                failed_login_lockout_minutes: 15,
            },
            mailing: {
                enabled: false,
                server: "",
                port: 587,
                from_address: "",
                username: "",
                templates_dir: "./templates/mail/",
                templates_encoding: "utf-8",
            },
            authentication: {
                signing_algorithm: "HS256",
                encryption_algorithm: "A256GCM",
                encrypt_jwt: true,
                encoding: "utf-8",
                access_token_expire_minutes: 30,
                refresh_token_expire_minutes: 129600,
                recovery_token_expire_minutes: 15,
                otp_nonce_expire_minutes: 5,
            },
        },
    });

    useEffect(() => {
        const fetchConfiguration = async () => {
            try {
                setLoading(true);
                const config = await GetServerConfig();
                form.setValues(config);
                setHasPermission(true);
            } catch (error) {
                customLogger.error("Failed to fetch configuration:", error);
                notifications.show({
                    title: "Error",
                    message: "Failed to load server configuration. You may not have permission to access this page.",
                    color: "red",
                });
                setHasPermission(false);
            } finally {
                setLoading(false);
            }
        };

        fetchConfiguration();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const handleSubmit = async (values: ServerConfig) => {
        try {
            setSubmitting(true);
            const result = await UpdateServerConfig({ config: values });

            notifications.show({
                title: "Success",
                message: result.message,
                color: "green",
            });
        } catch (error) {
            customLogger.error("Failed to update configuration:", error);
            notifications.show({
                title: "Error",
                message: "Failed to update server configuration.",
                color: "red",
            });
        } finally {
            setSubmitting(false);
        }
    };

    if (!hasPermission) {
        return (
            <Container size="sm" pt="md">
                <Stack align="center" justify="center" style={{ height: "100vh" }}>
                    <Paper shadow="sm" p="md" radius="md" style={{ textAlign: "center" }}>
                        <IconLockAccess size={48} />
                        <Title order={3} c="red" mb="md">
                            Access Denied
                        </Title>
                        <Text>You do not have permission to access server configuration settings.</Text>
                        <Text size="sm" c="dimmed" mt="sm">
                            Only Website Administrators can modify server configuration.
                        </Text>
                    </Paper>
                </Stack>
            </Container>
        );
    }

    return (
        <Container size="md" pt="md" style={{ position: "relative" }}>
            <LoadingOverlay visible={loading} />

            <Title order={2} mb="md">
                Server Configuration
            </Title>
            <Text size="sm" c="dimmed" mb="xl">
                Manage central server configuration settings. Changes require a server restart to take effect.
            </Text>

            <form onSubmit={form.onSubmit(handleSubmit)}>
                <Stack gap="xl">
                    <Accordion variant="contained" multiple>
                        <Accordion.Item value="connection">
                            <Accordion.Control>Connection Settings</Accordion.Control>
                            <Accordion.Panel>
                                <Stack>
                                    <TextInput
                                        label="Base URL"
                                        placeholder="http://localhost:8080"
                                        description="The base URL used for generating links and redirects"
                                        key={form.key("connection.base_url")}
                                        {...form.getInputProps("connection.base_url")}
                                    />
                                </Stack>
                            </Accordion.Panel>
                        </Accordion.Item>

                        <Accordion.Item value="security">
                            <Accordion.Control>Security Settings</Accordion.Control>
                            <Accordion.Panel>
                                <Stack>
                                    <MultiSelect
                                        label="Allow Origins"
                                        placeholder="Add allowed origins"
                                        data={[
                                            "http://127.0.0.1:8080",
                                            "http://localhost:8080",
                                            "https://127.0.0.1:8080",
                                            "https://localhost:8080",
                                        ]}
                                        searchable
                                        description="CORS allowed origins"
                                        key={form.key("security.allow_origins")}
                                        {...form.getInputProps("security.allow_origins")}
                                    />
                                    <Switch
                                        label="Allow Credentials"
                                        description="Allow credentials in CORS requests"
                                        key={form.key("security.allow_credentials")}
                                        {...form.getInputProps("security.allow_credentials", { type: "checkbox" })}
                                    />
                                    <MultiSelect
                                        label="Allow Methods"
                                        placeholder="Add allowed methods"
                                        data={["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"]}
                                        searchable
                                        description="CORS allowed HTTP methods"
                                        key={form.key("security.allow_methods")}
                                        {...form.getInputProps("security.allow_methods")}
                                    />
                                    <MultiSelect
                                        label="Allow Headers"
                                        placeholder="Add allowed headers"
                                        data={["Content-Type", "Authorization", "Accept", "Origin", "X-Requested-With"]}
                                        searchable
                                        description="CORS allowed headers"
                                        key={form.key("security.allow_headers")}
                                        {...form.getInputProps("security.allow_headers")}
                                    />
                                    <NumberInput
                                        label="Failed Login Notify Attempts"
                                        placeholder="2"
                                        min={1}
                                        description="Number of failed attempts before notifying user"
                                        key={form.key("security.failed_login_notify_attempts")}
                                        {...form.getInputProps("security.failed_login_notify_attempts")}
                                    />
                                    <NumberInput
                                        label="Failed Login Lockout Minutes"
                                        placeholder="15"
                                        min={1}
                                        description="Duration to lock account after too many failed attempts"
                                        key={form.key("security.failed_login_lockout_minutes")}
                                        {...form.getInputProps("security.failed_login_lockout_minutes")}
                                    />
                                </Stack>
                            </Accordion.Panel>
                        </Accordion.Item>

                        <Accordion.Item value="mailing">
                            <Accordion.Control>Mail Settings</Accordion.Control>
                            <Accordion.Panel>
                                <Stack>
                                    <Switch
                                        label="Enable Mailing"
                                        description="Enable email notifications and alerts"
                                        key={form.key("mailing.enabled")}
                                        {...form.getInputProps("mailing.enabled", { type: "checkbox" })}
                                    />
                                    <TextInput
                                        label="SMTP Server"
                                        placeholder="smtp.gmail.com"
                                        key={form.key("mailing.server")}
                                        {...form.getInputProps("mailing.server")}
                                    />
                                    <NumberInput
                                        label="SMTP Port"
                                        placeholder="587"
                                        min={1}
                                        max={65535}
                                        key={form.key("mailing.port")}
                                        {...form.getInputProps("mailing.port")}
                                    />
                                    <TextInput
                                        label="From Address"
                                        placeholder="example@gmail.com"
                                        key={form.key("mailing.from_address")}
                                        {...form.getInputProps("mailing.from_address")}
                                    />
                                    <TextInput
                                        label="Username"
                                        placeholder="example@gmail.com"
                                        key={form.key("mailing.username")}
                                        {...form.getInputProps("mailing.username")}
                                    />
                                    <PasswordInput
                                        label="Password"
                                        placeholder="Enter SMTP password"
                                        description="Leave empty to keep current password"
                                    />
                                </Stack>
                            </Accordion.Panel>
                        </Accordion.Item>

                        <Accordion.Item value="authentication">
                            <Accordion.Control>Authentication Settings</Accordion.Control>
                            <Accordion.Panel>
                                <Stack>
                                    <NumberInput
                                        label="Access Token Expire Minutes"
                                        placeholder="30"
                                        min={1}
                                        description="How long access tokens remain valid"
                                        key={form.key("authentication.access_token_expire_minutes")}
                                        {...form.getInputProps("authentication.access_token_expire_minutes")}
                                    />
                                    <NumberInput
                                        label="Refresh Token Expire Minutes"
                                        placeholder="129600"
                                        min={1}
                                        description="How long refresh tokens remain valid"
                                        key={form.key("authentication.refresh_token_expire_minutes")}
                                        {...form.getInputProps("authentication.refresh_token_expire_minutes")}
                                    />
                                    <NumberInput
                                        label="Recovery Token Expire Minutes"
                                        placeholder="15"
                                        min={1}
                                        description="How long password recovery tokens remain valid"
                                        key={form.key("authentication.recovery_token_expire_minutes")}
                                        {...form.getInputProps("authentication.recovery_token_expire_minutes")}
                                    />
                                    <NumberInput
                                        label="OTP Nonce Expire Minutes"
                                        placeholder="5"
                                        min={1}
                                        description="How long OTP nonces remain valid"
                                        key={form.key("authentication.otp_nonce_expire_minutes")}
                                        {...form.getInputProps("authentication.otp_nonce_expire_minutes")}
                                    />
                                </Stack>
                            </Accordion.Panel>
                        </Accordion.Item>
                    </Accordion>

                    <Group justify="flex-end">
                        <Button type="submit" loading={submitting} size="lg">
                            Save Configuration
                        </Button>
                    </Group>
                </Stack>
            </form>

            <Paper shadow="sm" p="md" radius="md" mt="xl">
                <Title order={4} mb="xs">
                    <Group gap="xs">
                        <IconInfoCircle /> <Text size="lg">About</Text>
                    </Group>
                </Title>
                <Stack>
                    <Group>
                        <ThemeIcon variant="light" color="blue">
                            <IconTool size={18} />
                        </ThemeIcon>
                        <Text size="sm">Version: {Program.version}</Text>
                    </Group>
                    <Group>
                        <ThemeIcon variant="light" color="gray">
                            <IconBrandGithub size={18} />
                        </ThemeIcon>
                        <Text
                            size="sm"
                            component="a"
                            href="https://github.com/Bento-Project-SCARS/ProjectSCARS"
                            target="_blank"
                        >
                            View on GitHub
                        </Text>
                    </Group>
                </Stack>
            </Paper>
        </Container>
    );
}
