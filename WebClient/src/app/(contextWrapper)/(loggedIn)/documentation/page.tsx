"use client";

import classes from "@/app/(contextWrapper)/(loggedIn)/documentation/DocumentationPage.module.css";
import { ProgramTitleCenter } from "@/components/ProgramTitleCenter";
import { customLogger } from "@/lib/api/customLogger";
import { useAuth } from "@/lib/providers/auth";
import { Container, Divider, TableOfContents, Text, Title } from "@mantine/core";
import { useAnimation } from "motion/react";

export default function DocumentationPage() {
    const logoControls = useAnimation();
    const { isAuthenticated } = useAuth();

    customLogger.debug("Rendering DocumentationPage", { isAuthenticated });
    return (
        <Container>
            <ProgramTitleCenter classes={classes} logoControls={logoControls} />
            <Title order={2}>Table of Contents</Title>
            <TableOfContents
                variant="filled"
                color="blue"
                size="sm"
                radius="sm"
                scrollSpyOptions={{
                    selector: "h2, h3, h4, h5, h6",
                }}
                getControlProps={({ data }) => ({
                    onClick: () => data.getNode().scrollIntoView(),
                    children: data.value,
                })}
                p="md"
            />
            <Divider pb={25} />
            <Title order={2} pb={15}>
                Introduction
            </Title>
            <Text>
                Bento is a School Canteen Automated Reporting System for the Department of Education (DepEd) Schools
                Division Office (SDO) of the City of Baliwag in the Philippines.
            </Text>
            <Title order={2} pb={15}>
                Quick Start
            </Title>
            <Title order={2} pb={15}>
                Showcase
            </Title>
            <Title order={3} pb={15}>
                Dashboard
            </Title>
            <Title order={3} pb={15}>
                School Statistics
            </Title>
            <Title order={3} pb={15}>
                School Reports
            </Title>
            <Title order={3} pb={15}>
                Statistics Management
            </Title>
            <Title order={3} pb={15}>
                Reports Management
            </Title>
            <Title order={3} pb={15}>
                User Management
            </Title>
            <Title order={3} pb={15}>
                School Management
            </Title>
            <Title order={3} pb={15}>
                Site Management
            </Title>
            <Title order={3} pb={15}>
                Notifications
            </Title>
            <Title order={3} pb={15}>
                Profile
            </Title>
        </Container>
    );
}
