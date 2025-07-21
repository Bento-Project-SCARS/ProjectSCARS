import { Container, Stack, Title, Text, Button, Center } from "@mantine/core";
import { IconWifi, IconRefresh } from "@tabler/icons-react";
import Link from "next/link";

export default function OfflinePage() {
    const handleRefresh = () => {
        window.location.reload();
    };

    return (
        <Container size="sm" py="xl">
            <Center>
                <Stack align="center" gap="lg">
                    <IconWifi size={64} stroke={1.5} color="var(--mantine-color-gray-5)" />

                    <Stack align="center" gap="sm">
                        <Title order={1} ta="center">
                            You&apos;re Offline
                        </Title>
                        <Text ta="center" c="dimmed" size="lg">
                            It looks like you&apos;re not connected to the internet. Some features may not be available.
                        </Text>
                    </Stack>

                    <Stack gap="sm" w="100%" maw={300}>
                        <Button leftSection={<IconRefresh size={16} />} onClick={handleRefresh} fullWidth>
                            Try Again
                        </Button>

                        <Button component={Link} href="/" variant="light" fullWidth>
                            Go to Home
                        </Button>
                    </Stack>

                    <Text ta="center" c="dimmed" size="sm">
                        This app works offline. You can continue using cached content until your connection is restored.
                    </Text>
                </Stack>
            </Center>
        </Container>
    );
}
