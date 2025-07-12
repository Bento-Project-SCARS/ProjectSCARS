import { customLogger } from "@/lib/api/customLogger";
import { Button, Flex } from "@mantine/core";
import { Spotlight, SpotlightActionData, spotlight } from "@mantine/spotlight";
import { IconDashboard, IconFileText, IconHome, IconSearch } from "@tabler/icons-react";

const actions: SpotlightActionData[] = [
    {
        id: "home",
        label: "Home",
        description: "Get to home page",
        onClick: () => customLogger.log("Home"),
        leftSection: <IconHome size={24} stroke={1.5} />,
    },
    {
        id: "dashboard",
        label: "Dashboard",
        description: "Get full information about current system status",
        onClick: () => customLogger.log("Dashboard"),
        leftSection: <IconDashboard size={24} stroke={1.5} />,
    },
    {
        id: "documentation",
        label: "Documentation",
        description: "Visit documentation to learn more about all features",
        onClick: () => customLogger.log("Documentation"),
        leftSection: <IconFileText size={24} stroke={1.5} />,
    },
];

export function SpotlightComponent() {
    return (
        <Flex mih={50} gap="xl" justify="center" align="center" direction="row" wrap="nowrap">
            <Button
                onClick={spotlight.open}
                leftSection={<IconSearch size={16} />}
                variant="default"
                size="md"
                style={{ width: "400px" }}
            >
                BENTO
            </Button>

            <Spotlight
                actions={actions}
                nothingFound="Nothing found..."
                highlightQuery
                searchProps={{
                    leftSection: <IconSearch size={20} stroke={1.5} />,
                    placeholder: "Search...",
                }}
            />
        </Flex>
    );
}
