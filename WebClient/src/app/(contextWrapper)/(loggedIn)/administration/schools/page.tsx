"use client";

import { CreateSchoolComponent } from "@/components/SchoolManagement/CreateSchoolComponent";
import { EditSchoolComponent } from "@/components/SchoolManagement/EditSchoolComponent";
import SchoolStatusFilter from "@/components/SchoolManagement/SchoolStatusFilter";
import { School } from "@/lib/api/csclient";
import { customLogger } from "@/lib/api/customLogger";
import { GetAllSchools, GetSchoolLogo, GetSchoolQuantity } from "@/lib/api/school";
import { useUser } from "@/lib/providers/user";
import {
    ActionIcon,
    Anchor,
    Avatar,
    Checkbox,
    Flex,
    Group,
    Pagination,
    Select,
    Stack,
    Table,
    TableTbody,
    TableTd,
    TableTh,
    TableThead,
    TableTr,
    Text,
    TextInput,
    Tooltip,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
    IconEdit,
    IconLock,
    IconLockOpen,
    IconPlus,
    IconSearch,
    IconUser,
    IconUserExclamation,
} from "@tabler/icons-react";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { JSX, useEffect, useState } from "react";

const userPerPageOptions: number[] = [10, 25, 50, 100];

dayjs.extend(relativeTime);

export default function SchoolsPage(): JSX.Element {
    const userCtx = useUser();
    const [schoolPerPage, setSchoolPerPage] = useState(10);
    const [totalSchools, setTotalSchools] = useState(0);
    const [searchTerm, setSearchTerm] = useState("");
    const [logos, setLogos] = useState<Map<string, string>>(new Map());
    const [logosRequested, setLogosRequested] = useState<Set<string>>(new Set());
    const [statusFilter, setStatusFilter] = useState<string>("all");

    const [schools, setSchools] = useState<School[]>([]);
    const [allSchools, setAllSchools] = useState<School[]>([]);
    const [selected, setSelected] = useState<Set<number>>(new Set());
    const [editIndex, setEditIndex] = useState<number | null>(null);
    const [editSchool, setEditSchool] = useState<School | null>(null);

    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);

    //Handler for School Creation
    const [addModalOpen, setAddModalOpen] = useState(false);

    const handleSearch = () => {
        setCurrentPage(1);
    };
    const handleEdit = (index: number, school: School) => {
        setEditIndex(index);
        setEditSchool(school);
    };

    const toggleSelected = (index: number) => {
        const updated = new Set(selected);
        if (updated.has(index)) updated.delete(index);
        else updated.add(index);
        setSelected(updated);
    };

    const fetchSchoolLogo = (logoUrn: string): string | undefined => {
        if (logosRequested.has(logoUrn) && logos.has(logoUrn)) {
            return logos.get(logoUrn);
        } else if (logosRequested.has(logoUrn)) {
            return undefined; // Logo is requested but not yet available
        }
        setLogosRequested((prev) => new Set(prev).add(logoUrn));
        GetSchoolLogo(logoUrn)
            .then((blob) => {
                if (blob.size > 0) {
                    const url = URL.createObjectURL(blob);
                    setLogos((prev) => new Map(prev).set(logoUrn, url));
                    return url;
                } else {
                    customLogger.debug("Logo file is empty, removing from cache");
                    setLogosRequested((prev) => {
                        const newSet = new Set(prev);
                        newSet.delete(logoUrn);
                        return newSet;
                    });
                    return undefined;
                }
            })
            .catch((error) => {
                customLogger.error("Failed to fetch school logo:", error);
                setLogosRequested((prev) => {
                    const newSet = new Set(prev);
                    newSet.delete(logoUrn);
                    return newSet;
                });
                if (!error.message.includes("404")) {
                    notifications.show({
                        id: "fetch-school-logo-error",
                        title: "Error",
                        message: "Failed to fetch school logo.",
                        color: "red",
                        icon: <IconUserExclamation />,
                    });
                }
                return undefined;
            });
        return undefined;
    };

    const fetchSchools = async (page: number, pageLimit: number = schoolPerPage) => {
        setCurrentPage(page);
        const pageOffset = (page - 1) * pageLimit;

        // deselect all schools when fetching new page
        setSelected(new Set());

        try {
            const quantity = await GetSchoolQuantity();
            setTotalSchools(quantity);
            setTotalPages(Math.ceil(quantity / pageLimit));
        } catch (error) {
            customLogger.error("Failed to fetch school quantity:", error);
            notifications.show({
                id: "fetch-school-quantity-error",
                title: "Error",
                message: "Failed to fetch school quantity. Please try again later.",
                color: "red",
                icon: <IconUserExclamation />,
            });
            setTotalPages(1); // Default to 1 page if fetching fails
        }

        try {
            const data = await GetAllSchools(pageOffset, pageLimit);
            setSchools(data);
        } catch (error) {
            customLogger.error("Failed to fetch schools:", error);
            notifications.show({
                id: "fetch-schools-error",
                title: "Failed to fetch schools list",
                message: "Please try again later.",
                color: "red",
                icon: <IconUserExclamation />,
            });
            setSchools([]);
        }
    };

    // Fetch all schools for the dropdown in the add modal
    const fetchAllSchools = async () => {
        try {
            const data = await GetAllSchools(0, 10000); // fetch all schools
            setAllSchools(data);
        } catch (error) {
            if (error instanceof Error) {
                notifications.show({
                    id: "fetch-all-schools-error",
                    title: "Error",
                    message: error.message,
                    color: "red",
                    icon: <IconUserExclamation />,
                });
            } else {
                notifications.show({
                    id: "fetch-schools-error",
                    title: "Failed to fetch schools list",
                    message: "Please try again later.",
                    color: "red",
                    icon: <IconUserExclamation />,
                });
            }
            setAllSchools([]);
        }
    };

    useEffect(() => {
        fetchAllSchools();
    }, []);

    useEffect(() => {
        let filtered = allSchools;
        if (searchTerm.trim()) {
            const lower = searchTerm.trim().toLowerCase();
            filtered = filtered.filter(
                (school) =>
                    school.name?.toLowerCase().includes(lower) ||
                    school.address?.toLowerCase().includes(lower) ||
                    school.email?.toLowerCase().includes(lower)
            );
        }
        if (statusFilter !== "all") {
            filtered = filtered.filter((school) => {
                if (statusFilter === "active") return !school.deactivated;
                if (statusFilter === "deactivated") return !!school.deactivated;
                return true;
            });
        }
        setTotalSchools(filtered.length);
        setTotalPages(Math.max(1, Math.ceil(filtered.length / schoolPerPage)));

        // If currentPage is out of bounds, reset to 1
        const safePage = Math.min(currentPage, Math.ceil(filtered.length / schoolPerPage) || 1);
        if (safePage !== currentPage) setCurrentPage(safePage);

        const start = (safePage - 1) * schoolPerPage;
        const end = start + schoolPerPage;
        setSchools(filtered.slice(start, end));
    }, [allSchools, searchTerm, statusFilter, schoolPerPage, currentPage]);

    customLogger.debug("Rendering SchoolsPage");
    return (
        <>
            <Flex mih={50} gap="xl" justify="flex-start" align="center" direction="row" wrap="nowrap">
                <TextInput
                    placeholder="Search for schools"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.currentTarget.value)}
                    size="md"
                    style={{ width: "400px" }}
                />

                <Flex ml="auto" gap="sm" align="center">
                    <SchoolStatusFilter statusFilter={statusFilter} setStatusFilter={setStatusFilter} />
                    <ActionIcon
                        disabled={!userCtx.userPermissions?.includes("schools:create")}
                        size="input-md"
                        variant="filled"
                        color="blue"
                        onClick={() => setAddModalOpen(true)}
                    >
                        <IconPlus size={18} />
                    </ActionIcon>
                    <ActionIcon size="input-md" variant="default" onClick={handleSearch}>
                        <IconSearch size={16} />
                    </ActionIcon>
                </Flex>
            </Flex>
            <Table highlightOnHover stickyHeader>
                <TableThead>
                    <TableTr>
                        <TableTh></TableTh>
                        <TableTh>School Name</TableTh>
                        <TableTh>Address</TableTh>
                        <TableTh>Phone Number</TableTh>
                        <TableTh>Email</TableTh>
                        <TableTh>Website</TableTh>
                        <TableTh>Status</TableTh>
                        <TableTh>Last Modified</TableTh>
                        <TableTh>Date Created</TableTh>
                        <TableTh></TableTh>
                    </TableTr>
                </TableThead>
                <TableTbody>
                    {schools.map((school, index) => (
                        <TableTr key={index} bg={selected.has(index) ? "gray.1" : undefined}>
                            {/* Checkbox and Logo */}
                            <TableTd>
                                <Group>
                                    <Checkbox checked={selected.has(index)} onChange={() => toggleSelected(index)} />
                                    {school.logoUrn && school.id != null ? (
                                        <Avatar radius="xl" src={fetchSchoolLogo(school.logoUrn)}>
                                            <IconUser />
                                        </Avatar>
                                    ) : (
                                        <Avatar radius="xl" name={school.name} color="initials" />
                                    )}
                                </Group>
                            </TableTd>
                            <TableTd>{school.name}</TableTd>
                            <TableTd c={school.address ? undefined : "dimmed"}>
                                {school.address ? school.address : "N/A"}
                            </TableTd>
                            <TableTd c={school.phone ? undefined : "dimmed"}>
                                {school.phone ? (
                                    <Anchor
                                        href={`tel:${school.phone}`}
                                        underline="never"
                                        size="sm"
                                        rel="noopener noreferrer"
                                    >
                                        {school.phone}
                                    </Anchor>
                                ) : (
                                    <Text size="sm">N/A</Text>
                                )}
                            </TableTd>
                            <TableTd c={school.email ? undefined : "dimmed"}>
                                {school.email ? (
                                    <Anchor
                                        href={`mailto:${school.email}`}
                                        underline="never"
                                        size="sm"
                                        rel="noopener noreferrer"
                                    >
                                        {school.email}
                                    </Anchor>
                                ) : (
                                    <Text size="sm">N/A</Text>
                                )}
                            </TableTd>
                            <TableTd c={school.website ? undefined : "dimmed"}>
                                {school.website ? (
                                    <Anchor
                                        href={
                                            school.website.startsWith("http")
                                                ? school.website
                                                : `https://${school.website}`
                                        }
                                        underline="never"
                                        size="sm"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                    >
                                        {school.website}
                                    </Anchor>
                                ) : (
                                    <Text size="sm">N/A</Text>
                                )}
                            </TableTd>
                            <TableTd>
                                <Tooltip
                                    label={school.deactivated ? "School is deactivated" : "School is active"}
                                    position="bottom"
                                    withArrow
                                >
                                    {school.deactivated ? <IconLock color="red" /> : <IconLockOpen color="green" />}
                                </Tooltip>
                            </TableTd>
                            <Tooltip
                                label={
                                    school.lastModified
                                        ? dayjs(school.lastModified).format("YYYY-MM-DD HH:mm:ss")
                                        : "N/A"
                                }
                            >
                                <TableTd c={school.lastModified ? undefined : "dimmed"}>
                                    {school.lastModified ? dayjs(school.lastModified).fromNow() : "N/A"}
                                </TableTd>
                            </Tooltip>
                            <Tooltip
                                label={
                                    school.dateCreated ? dayjs(school.dateCreated).format("YYYY-MM-DD HH:mm:ss") : "N/A"
                                }
                            >
                                <TableTd c={school.dateCreated ? undefined : "dimmed"}>
                                    {school.dateCreated ? dayjs(school.dateCreated).fromNow() : "N/A"}
                                </TableTd>
                            </Tooltip>
                            <TableTd>
                                <Tooltip label="Edit School" position="bottom" openDelay={500} withArrow>
                                    <ActionIcon
                                        disabled={
                                            userCtx.userInfo?.schoolId === school.id
                                                ? !userCtx.userPermissions?.includes("schools:self:modify")
                                                : !userCtx.userPermissions?.includes("schools:global:modify")
                                        }
                                        variant="light"
                                        onClick={() => handleEdit(index, school)}
                                    >
                                        <IconEdit size={16} />
                                    </ActionIcon>
                                </Tooltip>
                            </TableTd>
                        </TableTr>
                    ))}
                </TableTbody>
            </Table>
            <Group justify="space-between" align="center" m="md">
                <div></div>
                <Stack align="center" justify="center" gap="sm">
                    <Pagination value={currentPage} onChange={setCurrentPage} total={totalPages} mt="md" />
                    <Text size="sm" c="dimmed">
                        {totalSchools > 0
                            ? `${(currentPage - 1) * schoolPerPage + 1}-${Math.min(
                                  currentPage * schoolPerPage,
                                  totalSchools
                              )} of ${totalSchools} schools`
                            : "No schools found"}
                    </Text>
                </Stack>
                <Select
                    value={schoolPerPage.toString()}
                    onChange={async (value) => {
                        if (value) {
                            customLogger.debug("Changing schools per page to", value);
                            const newSchoolPerPage = parseInt(value);
                            setSchoolPerPage(newSchoolPerPage);
                            // Reset to page 1 and fetch users with new page size
                            await fetchSchools(1, newSchoolPerPage);
                        }
                    }}
                    data={userPerPageOptions.map((num) => ({
                        value: num.toString(),
                        label: num.toString(),
                    }))}
                    size="md"
                    style={{ width: "100px" }}
                    allowDeselect={false}
                />
            </Group>

            <EditSchoolComponent
                index={editIndex}
                school={editSchool}
                setIndex={setEditIndex}
                fetchSchoolLogo={fetchSchoolLogo}
                onSchoolUpdate={(updatedSchool) => {
                    // Update the school in the list
                    setSchools((prevSchools) => {
                        const idx = prevSchools.findIndex((s) => s.id === updatedSchool.id);
                        if (idx !== -1) {
                            const updated = [...prevSchools];
                            updated[idx] = updatedSchool;
                            return updated;
                        }
                        return prevSchools;
                    });
                    setAllSchools((prevAllSchools) => {
                        const idx = prevAllSchools.findIndex((s) => s.id === updatedSchool.id);
                        if (idx !== -1) {
                            const updated = [...prevAllSchools];
                            updated[idx] = updatedSchool;
                            return updated;
                        }
                        return prevAllSchools;
                    });
                }}
                onRefresh={() => fetchSchools(currentPage)}
            />

            <CreateSchoolComponent
                modalOpen={addModalOpen}
                setModalOpen={setAddModalOpen}
                onSchoolCreate={(newSchool) => {
                    setSchools((prevSchools) => [...prevSchools, newSchool]);
                    setAllSchools((prevAllSchools) => [...prevAllSchools, newSchool]);
                }}
            />
        </>
    );
}
