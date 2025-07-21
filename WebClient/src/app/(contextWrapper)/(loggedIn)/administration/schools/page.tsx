"use client";

import { CreateSchoolComponent } from "@/components/SchoolManagement/CreateSchoolComponent";
import { EditSchoolComponent } from "@/components/SchoolManagement/EditSchoolComponent";
import SchoolStatusFilter from "@/components/SchoolManagement/SchoolStatusFilter";
import { School } from "@/lib/api/csclient";
import { customLogger } from "@/lib/api/customLogger";
import { GetAllSchools, GetSchoolLogo, GetSchoolQuantity } from "@/lib/api/school";
import { useUser } from "@/lib/providers/user";
import { formatUTCDate, getRelativeTime } from "@/lib/utils/date";
import { useSchoolManagementWebSocket } from "@/lib/hooks/useSchoolManagementWebSocket";
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
    IconChevronDown,
    IconChevronUp,
    IconEdit,
    IconLock,
    IconLockOpen,
    IconPlus,
    IconSearch,
    IconSelector,
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

    // Sorting state
    const [sortField, setSortField] = useState<string | null>(null);
    const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

    // WebSocket integration for real-time school management updates
    useSchoolManagementWebSocket({
        onSchoolCreated: (newSchool) => {
            customLogger.info("School created via WebSocket", newSchool);

            // Check if school already exists to prevent duplication
            setAllSchools((prevSchools) => {
                const schoolExists = prevSchools.some((school) => school.id === newSchool.id);
                if (schoolExists) {
                    customLogger.debug("School already exists in list, skipping WebSocket add", newSchool.id);
                    return prevSchools;
                }
                return [newSchool, ...prevSchools];
            });

            // Show notification
            // notifications.show({
            //     id: `school-created-${newSchool.id}`,
            //     title: "New School Created",
            //     message: `School ${newSchool.name} has been created.`,
            //     color: "green",
            //     icon: <IconPlus />,
            // });
        },
        onSchoolUpdated: (schoolId, updateData) => {
            customLogger.info("School updated via WebSocket", { schoolId, updateData });
            setAllSchools((prevSchools) =>
                prevSchools.map((school) =>
                    school.id?.toString() === schoolId
                        ? { ...school, ...(updateData.school as Partial<School>) }
                        : school
                )
            );
        },
        onSchoolDeactivated: (schoolId) => {
            customLogger.info("School deactivated via WebSocket", schoolId);

            let schoolToNotify: School | undefined;
            setAllSchools((prevSchools) => {
                const updatedSchools = prevSchools.map((school) => {
                    if (school.id?.toString() === schoolId) {
                        schoolToNotify = school;
                        return { ...school, deactivated: true };
                    }
                    return school;
                });
                return updatedSchools;
            });

            // Show notification if school was found
            if (schoolToNotify) {
                notifications.show({
                    id: `school-deactivated-${schoolId}`,
                    title: "School Deactivated",
                    message: `School ${schoolToNotify.name} has been deactivated.`,
                    color: "orange",
                    icon: <IconLock />,
                });
            }
        },
        onSchoolReactivated: (schoolId) => {
            customLogger.info("School reactivated via WebSocket", schoolId);

            let schoolToNotify: School | undefined;
            setAllSchools((prevSchools) => {
                const updatedSchools = prevSchools.map((school) => {
                    if (school.id?.toString() === schoolId) {
                        schoolToNotify = school;
                        return { ...school, deactivated: false };
                    }
                    return school;
                });
                return updatedSchools;
            });

            // Show notification if school was found
            if (schoolToNotify) {
                notifications.show({
                    id: `school-reactivated-${schoolId}`,
                    title: "School Reactivated",
                    message: `School ${schoolToNotify.name} has been reactivated.`,
                    color: "green",
                    icon: <IconLockOpen />,
                });
            }
        },
        enabled: true,
    });

    const handleSearch = () => {
        setCurrentPage(1);
    };

    const handleSort = (field: string) => {
        if (sortField === field) {
            // If clicking the same field, toggle direction
            setSortDirection(sortDirection === "asc" ? "desc" : "asc");
        } else {
            // If clicking a new field, set it and default to ascending
            setSortField(field);
            setSortDirection("asc");
        }
        setCurrentPage(1); // Reset to first page when sorting
    };

    const getSortIcon = (field: string) => {
        if (sortField !== field) {
            return <IconSelector size={14} style={{ opacity: 0.5 }} />;
        }
        return sortDirection === "asc" ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />;
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

        // Apply sorting
        if (sortField) {
            filtered.sort((a, b) => {
                let aValue: string;
                let bValue: string;

                switch (sortField) {
                    case "name":
                        aValue = a.name?.toLowerCase() || "";
                        bValue = b.name?.toLowerCase() || "";
                        break;
                    case "address":
                        aValue = a.address?.toLowerCase() || "";
                        bValue = b.address?.toLowerCase() || "";
                        break;
                    case "phone":
                        aValue = a.phone?.toLowerCase() || "";
                        bValue = b.phone?.toLowerCase() || "";
                        break;
                    case "email":
                        aValue = a.email?.toLowerCase() || "";
                        bValue = b.email?.toLowerCase() || "";
                        break;
                    case "website":
                        aValue = a.website?.toLowerCase() || "";
                        bValue = b.website?.toLowerCase() || "";
                        break;
                    case "status":
                        aValue = a.deactivated ? "deactivated" : "active";
                        bValue = b.deactivated ? "deactivated" : "active";
                        break;
                    case "lastModified":
                        aValue = a.lastModified || "";
                        bValue = b.lastModified || "";
                        break;
                    case "dateCreated":
                        aValue = a.dateCreated || "";
                        bValue = b.dateCreated || "";
                        break;
                    default:
                        return 0;
                }

                if (aValue < bValue) return sortDirection === "asc" ? -1 : 1;
                if (aValue > bValue) return sortDirection === "asc" ? 1 : -1;
                return 0;
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
    }, [allSchools, searchTerm, statusFilter, schoolPerPage, currentPage, sortField, sortDirection]);

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
            <Table.ScrollContainer minWidth={1000} type="native">
                <Table highlightOnHover stickyHeader>
                    <TableThead>
                        <TableTr>
                            <TableTh></TableTh>
                            <TableTh
                                style={{ cursor: "pointer", userSelect: "none" }}
                                onClick={() => handleSort("name")}
                            >
                                <Group gap="xs" justify="space-between" wrap="nowrap">
                                    <Text style={{ whiteSpace: "nowrap" }}>School Name</Text>
                                    {getSortIcon("name")}
                                </Group>
                            </TableTh>
                            <TableTh
                                style={{ cursor: "pointer", userSelect: "none" }}
                                onClick={() => handleSort("address")}
                            >
                                <Group gap="xs" justify="space-between" wrap="nowrap">
                                    <Text style={{ whiteSpace: "nowrap" }}>Address</Text>
                                    {getSortIcon("address")}
                                </Group>
                            </TableTh>
                            <TableTh
                                style={{ cursor: "pointer", userSelect: "none" }}
                                onClick={() => handleSort("phone")}
                            >
                                <Group gap="xs" justify="space-between" wrap="nowrap">
                                    <Text style={{ whiteSpace: "nowrap" }}>Phone Number</Text>
                                    {getSortIcon("phone")}
                                </Group>
                            </TableTh>
                            <TableTh
                                style={{ cursor: "pointer", userSelect: "none" }}
                                onClick={() => handleSort("email")}
                            >
                                <Group gap="xs" justify="space-between" wrap="nowrap">
                                    <Text style={{ whiteSpace: "nowrap" }}>Email</Text>
                                    {getSortIcon("email")}
                                </Group>
                            </TableTh>
                            <TableTh
                                style={{ cursor: "pointer", userSelect: "none" }}
                                onClick={() => handleSort("website")}
                            >
                                <Group gap="xs" justify="space-between" wrap="nowrap">
                                    <Text style={{ whiteSpace: "nowrap" }}>Website</Text>
                                    {getSortIcon("website")}
                                </Group>
                            </TableTh>
                            <TableTh
                                style={{ cursor: "pointer", userSelect: "none" }}
                                onClick={() => handleSort("status")}
                            >
                                <Group gap="xs" justify="space-between" wrap="nowrap">
                                    <Text style={{ whiteSpace: "nowrap" }}>Status</Text>
                                    {getSortIcon("status")}
                                </Group>
                            </TableTh>
                            <TableTh
                                style={{ cursor: "pointer", userSelect: "none" }}
                                onClick={() => handleSort("lastModified")}
                            >
                                <Group gap="xs" justify="space-between" wrap="nowrap">
                                    <Text style={{ whiteSpace: "nowrap" }}>Last Modified</Text>
                                    {getSortIcon("lastModified")}
                                </Group>
                            </TableTh>
                            <TableTh
                                style={{ cursor: "pointer", userSelect: "none" }}
                                onClick={() => handleSort("dateCreated")}
                            >
                                <Group gap="xs" justify="space-between" wrap="nowrap">
                                    <Text style={{ whiteSpace: "nowrap" }}>Date Created</Text>
                                    {getSortIcon("dateCreated")}
                                </Group>
                            </TableTh>
                            <TableTh></TableTh>
                        </TableTr>
                    </TableThead>
                    <TableTbody>
                        {schools.map((school, index) => (
                            <TableTr key={index} bg={selected.has(index) ? "gray.1" : undefined}>
                                {/* Checkbox and Logo */}
                                <TableTd>
                                    <Group>
                                        <Checkbox
                                            checked={selected.has(index)}
                                            onChange={() => toggleSelected(index)}
                                        />
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
                                            {school.website.replace(/^https?:\/\//, "").split("/")[0]}
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
                                <Tooltip label={formatUTCDate(school.lastModified, "YYYY-MM-DD HH:mm:ss")}>
                                    <TableTd c={school.lastModified ? undefined : "dimmed"}>
                                        {getRelativeTime(school.lastModified)}
                                    </TableTd>
                                </Tooltip>
                                <Tooltip label={formatUTCDate(school.dateCreated, "YYYY-MM-DD HH:mm:ss")}>
                                    <TableTd c={school.dateCreated ? undefined : "dimmed"}>
                                        {getRelativeTime(school.dateCreated)}
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
            </Table.ScrollContainer>
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
                onSchoolCreate={() => {
                    // setSchools((prevSchools) => [...prevSchools, newSchool]);
                    // setAllSchools((prevAllSchools) => [...prevAllSchools, newSchool]);
                }}
            />
        </>
    );
}
