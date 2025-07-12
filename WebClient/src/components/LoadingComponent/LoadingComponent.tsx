import { customLogger } from "@/lib/api/customLogger";
import { LocalStorage, randomLoadingMessages } from "@/lib/info";
import { Center, Container, Image, Loader, Paper, Stack, Text } from "@mantine/core";
import { motion } from "motion/react";
import { useEffect, useState } from "react";

type LoadingComponentProps = {
    message?: string; // The message to display below the title
    withBorder?: boolean; // Whether to show a border around the loading screen
};

/**
 * Display a loading screen with a rotating logo and a message.
 * @param {LoadingComponentProps} props - The properties for the loading component.
 * @returns {JSX.Element} The loading component.
 */
export const LoadingComponent: React.FC<LoadingComponentProps> = ({
    message = undefined,
    withBorder = true,
}: LoadingComponentProps): JSX.Element => {
    const [loadingMessage, setLoadingMessage] = useState(message);
    customLogger.debug("Returning LoadingComponent", { message });

    useEffect(() => {
        if (!message) {
            setLoadingMessage(randomLoadingMessages[Math.floor(Math.random() * randomLoadingMessages.length)]);
            customLogger.debug("Random message: ", message);
        }
    }, [message]);
    return (
        <Container size={420} my={40} style={{ paddingTop: "150px" }}>
            <Center>
                <Paper withBorder={withBorder} radius="md">
                    <Stack align="center" justify="center" gap="xs">
                        <motion.div
                            key="logo"
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ ease: "easeOut", duration: 0.5 }}
                        >
                            <Image
                                src="/assets/logos/BENTO.svg"
                                alt="BENTO Logo"
                                width={100}
                                height={100}
                                component={motion.img}
                                animate={{ rotate: 360 }}
                                transition={{
                                    repeat: Infinity,
                                    repeatType: "loop",
                                    duration: 4,
                                    ease: "linear",
                                    type: "spring",
                                    stiffness: 100,
                                    damping: 20,
                                }}
                                style={{ originX: 0.5, originY: 0.5 }}
                                drag
                                dragElastic={{ top: 0.25, left: 0.25, right: 0.25, bottom: 0 }}
                                dragConstraints={{ top: 0, left: 0, right: 0, bottom: 0 }}
                            />
                        </motion.div>
                        <motion.div
                            key="text"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ duration: 0.5 }}
                        >
                            <Stack align="center" justify="center" gap="xs">
                                {typeof window !== "undefined" &&
                                localStorage.getItem(LocalStorage.useBasicLoader) === "true" ? (
                                    <Loader color="blue" type="bars" />
                                ) : (
                                    <Text c="dimmed" ta="center" data-testid="loading-message">
                                        {loadingMessage}
                                    </Text>
                                )}
                            </Stack>
                        </motion.div>
                    </Stack>
                </Paper>
            </Center>
        </Container>
    );
};
