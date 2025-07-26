"use client";

import { CreateUserComponent } from "@/components/UserManagement/CreateUserComponent";
import { EditUserComponent } from "@/components/UserManagement/EditUserComponent";
import { InviteUserComponent } from "@/components/UserManagement/InviteUserComponent";
import { UserFilters } from "@/components/UserManagement/UserFilters";
import {
    Role,
    School,
    UserDelete,
    UserPublic,
    UserUpdate,
    deleteUserAvatarEndpointV1UsersAvatarDelete,
    deleteUserInfoEndpointV1UsersDelete,
    getAllRolesV1AuthRolesGet,
    getAllUsersEndpointV1UsersAllGet,
    getUserAvatarEndpointV1UsersAvatarGet,
    requestVerificationEmailAdminV1AuthEmailRequestAdminPost,
    updateUserAvatarEndpointV1UsersAvatarPatch,
    updateUserEndpointV1UsersPatch,
} from "@/lib/api/csclient";
import { customLogger } from "@/lib/api/customLogger";
import { GetAllSchools } from "@/lib/api/school";
import { useUserManagementWebSocket } from "@/lib/hooks/useUserManagementWebSocket";
import { roles } from "@/lib/info";
import { useUser } from "@/lib/providers/user";
import { GetAccessTokenHeader } from "@/lib/utils/token";
import {
    ActionIcon,
    Alert,
    Anchor,
    Avatar,
    Button,
    Checkbox,
    Flex,
    Group,
    Menu,
    Modal,
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
    IconAlertTriangle,
    IconCheck,
    IconChevronDown,
    IconChevronUp,
    IconCircleDashedCheck,
    IconCircleDashedX,
    IconEdit,
    IconKey,
    IconLock,
    IconLockOpen,
    IconMail,
    IconMailPlus,
    IconPlus,
    IconSchool,
    IconSearch,
    IconSelector,
    IconSendOff,
    IconUser,
    IconUserCheck,
    IconUserExclamation,
    IconUserOff,
    IconX,
} from "@tabler/icons-react";
import { motion } from "motion/react";
import { JSX, useEffect, useState } from "react";

const userPerPageOptions: number[] = [10, 25, 50, 100];

export default function UsersPage(): JSX.Element {
    const userCtx = useUser();
    const [userPerPage, setUserPerPage] = useState(userPerPageOptions[0]);
    const [totalUsers, setTotalUsers] = useState(0);
    const [searchTerm, setSearchTerm] = useState("");
    const [avatars, setAvatars] = useState<Map<string, string>>(new Map());
    const [avatarsRequested, setAvatarsRequested] = useState<Set<string>>(new Set());
    const [availableRoles, setAvailableRoles] = useState<Role[]>([]);
    const [availableSchools, setAvailableSchools] = useState<School[]>([]); // Assuming schools are strings for simplicity

    const [users, setUsers] = useState<UserPublic[]>([]);
    //const [filteredUsers, setFilteredUsers] = useState<UserPublicType[]>([]); remnants of previous filtering logic
    const [selected, setSelected] = useState<Set<number>>(new Set());

    const [fetchUsersErrorShown, setFetchUsersErrorShown] = useState(false);
    const [fetchRolesErrorShown, setFetchRolesErrorShown] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);

    const [selectedUser, setSelectedUser] = useState<UserPublic | null>(null);
    const [selectedUserIndex, setSelectedUserIndex] = useState<number | null>(null);

    const [openInviteUserModal, setOpenInviteUserModal] = useState(false);
    const [openCreateUserModal, setOpenCreateUserModal] = useState(false);
    const [openBulkSchoolModal, setOpenBulkSchoolModal] = useState(false);

    const [roleFilter, setRoleFilter] = useState<string | null>(null);
    const [schoolFilter, setSchoolFilter] = useState<string | null>(null);
    const [statusFilter, setStatusFilter] = useState<string | null>(null);
    const [updateFilter, setUpdateFilter] = useState<string | null>(null);

    const [allUsers, setAllUsers] = useState<UserPublic[]>([]);

    // Sorting state
    const [sortField, setSortField] = useState<string | null>(null);
    const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

    // WebSocket integration for real-time user management updates
    useUserManagementWebSocket({
        onUserCreated: (newUser) => {
            customLogger.info("User created via WebSocket", newUser);

            // Check if user already exists to prevent duplication
            setAllUsers((prevUsers) => {
                const userExists = prevUsers.some((user) => user.id === newUser.id);
                if (userExists) {
                    customLogger.debug("User already exists in list, skipping WebSocket add", newUser.id);
                    return prevUsers;
                }
                return [newUser, ...prevUsers];
            });

            // Show notification
            // notifications.show({
            //     id: `user-created-${newUser.id}`,
            //     title: "New User Created",
            //     message: `User ${newUser.username} has been created.`,
            //     color: "green",
            //     icon: <IconUserCheck />,
            // });
        },
        onUserUpdated: (userId, updateData) => {
            customLogger.info("User updated via WebSocket", { userId, updateData });
            setAllUsers((prevUsers) =>
                prevUsers.map((user) =>
                    user.id === userId ? { ...user, ...(updateData.user as Partial<UserPublic>) } : user
                )
            );
        },
        onUserDeactivated: (userId) => {
            customLogger.info("User deactivated via WebSocket", userId);

            setAllUsers((prevUsers) => {
                const updatedUsers = prevUsers.map((user) => {
                    if (user.id === userId) {
                        return { ...user, deactivated: true };
                    }
                    return user;
                });
                return updatedUsers;
            });

            // Show notification if user was found
            // if (userToNotify) {
            //     notifications.show({
            //         id: `user-deactivated-${userId}`,
            //         title: "User Deactivated",
            //         message: `User ${userToNotify.username} has been deactivated.`,
            //         color: "orange",
            //         icon: <IconUserOff />,
            //     });
            // }
        },
        onUserReactivated: (userId) => {
            customLogger.info("User reactivated via WebSocket", userId);

            setAllUsers((prevUsers) => {
                const updatedUsers = prevUsers.map((user) => {
                    if (user.id === userId) {
                        return { ...user, deactivated: false };
                    }
                    return user;
                });
                return updatedUsers;
            });

            // Show notification if user was found
            // if (userToNotify) {
            //     notifications.show({
            //         id: `user-reactivated-${userId}`,
            //         title: "User Reactivated",
            //         message: `User ${userToNotify.username} has been reactivated.`,
            //         color: "green",
            //         icon: <IconUserCheck />,
            //     });
            // }
        },
        enabled: true,
    });

    // Wrapper functions to maintain compatibility with EditUserComponent
    const UpdateUserInfo = async (userUpdate: UserUpdate): Promise<UserPublic> => {
        const result = await updateUserEndpointV1UsersPatch({
            body: userUpdate,
            headers: { Authorization: GetAccessTokenHeader() },
        });

        if (result.error) {
            throw new Error(`Failed to update user: ${result.response.status} ${result.response.statusText}`);
        }

        return result.data as UserPublic;
    };

    const UploadUserAvatar = async (user_id: string, file: File): Promise<UserPublic> => {
        const result = await updateUserAvatarEndpointV1UsersAvatarPatch({
            query: { user_id },
            body: { img: file },
            headers: { Authorization: GetAccessTokenHeader() },
        });

        if (result.error) {
            throw new Error(`Failed to upload avatar: ${result.response.status} ${result.response.statusText}`);
        }

        return result.data as UserPublic;
    };

    const RemoveUserAvatar = async (user_id: string): Promise<void> => {
        const result = await deleteUserAvatarEndpointV1UsersAvatarDelete({
            query: { user_id },
            headers: { Authorization: GetAccessTokenHeader() },
        });

        if (result.error) {
            throw new Error(`Failed to remove avatar: ${result.response.status} ${result.response.statusText}`);
        }
    };

    const DeleteUserInfo = async (userDelete: UserDelete): Promise<void> => {
        const result = await deleteUserInfoEndpointV1UsersDelete({
            body: userDelete,
            headers: { Authorization: GetAccessTokenHeader() },
        });

        if (result.error) {
            throw new Error(`Failed to delete user fields: ${result.response.status} ${result.response.statusText}`);
        }
    };

    const applyFilters = (users: UserPublic[]) => {
        let filtered = [...users];

        if (roleFilter) {
            filtered = filtered.filter((user) => user.roleId.toString() === roleFilter);
        }
        if (schoolFilter) {
            filtered = filtered.filter((user) => user.schoolId != null && user.schoolId.toString() === schoolFilter);
        }
        if (statusFilter) {
            filtered = filtered.filter((user) =>
                statusFilter === "deactivated" ? user.deactivated : !user.deactivated
            );
        }
        if (updateFilter) {
            filtered = filtered.filter((user) =>
                updateFilter === "required" ? user.forceUpdateInfo : !user.forceUpdateInfo
            );
        }

        if (searchTerm.trim()) {
            const lower = searchTerm.trim().toLowerCase();
            filtered = filtered.filter(
                (user) =>
                    user.username?.toLowerCase().includes(lower) ||
                    user.nameFirst?.toLowerCase().includes(lower) ||
                    user.nameLast?.toLowerCase().includes(lower)
            );
        }

        // Apply sorting
        if (sortField) {
            filtered.sort((a, b) => {
                let aValue: string;
                let bValue: string;

                switch (sortField) {
                    case "username":
                        aValue = a.username?.toLowerCase() || "";
                        bValue = b.username?.toLowerCase() || "";
                        break;
                    case "email":
                        aValue = a.email?.toLowerCase() || "";
                        bValue = b.email?.toLowerCase() || "";
                        break;
                    case "name":
                        aValue = `${a.nameFirst || ""} ${a.nameLast || ""}`.toLowerCase().trim();
                        bValue = `${b.nameFirst || ""} ${b.nameLast || ""}`.toLowerCase().trim();
                        break;
                    case "school":
                        const aSchool = availableSchools.find((school) => school.id === a.schoolId)?.name || "";
                        const bSchool = availableSchools.find((school) => school.id === b.schoolId)?.name || "";
                        aValue = aSchool.toLowerCase();
                        bValue = bSchool.toLowerCase();
                        break;
                    case "role":
                        aValue = roles[a.roleId]?.toLowerCase() || "";
                        bValue = roles[b.roleId]?.toLowerCase() || "";
                        break;
                    case "status":
                        aValue = a.deactivated ? "deactivated" : "active";
                        bValue = b.deactivated ? "deactivated" : "active";
                        break;
                    case "twoFactor":
                        aValue = a.otpVerified ? "enabled" : "disabled";
                        bValue = b.otpVerified ? "enabled" : "disabled";
                        break;
                    case "forceUpdate":
                        aValue = a.forceUpdateInfo ? "required" : "not required";
                        bValue = b.forceUpdateInfo ? "required" : "not required";
                        break;
                    default:
                        return 0;
                }

                if (aValue < bValue) return sortDirection === "asc" ? -1 : 1;
                if (aValue > bValue) return sortDirection === "asc" ? 1 : -1;
                return 0;
            });
        }

        return filtered;
    };

    const handleFilterChange = () => {
        setCurrentPage(1);
    };

    const handleSelectAll = (checked: boolean) => {
        if (checked) {
            setSelected(new Set(users.map((_, idx) => idx)));
        } else {
            setSelected(new Set());
        }
    };

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

    const handleCreate = () => {
        customLogger.debug("Creating new user");
        // Clear selected user when opening create modal
        setSelectedUser(null);
        setSelectedUserIndex(null);
        setOpenCreateUserModal(true);
    };

    const handleInvite = () => {
        customLogger.debug("Inviting new user");
        // Clear selected user when opening invite modal
        setSelectedUser(null);
        setSelectedUserIndex(null);
        setOpenInviteUserModal(true);
    };

    const handleEdit = (index: number, user: UserPublic) => {
        customLogger.debug(`Editing user ${index}`, user);
        setSelectedUserIndex(index);
        setSelectedUser(user);
    };

    const handleResendInvitation = async (user: UserPublic) => {
        try {
            // Call the new resend invitation endpoint
            const response = await fetch(`${process.env.NEXT_PUBLIC_CENTRAL_SERVER_ENDPOINT}/v1/auth/resend-invite`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: GetAccessTokenHeader(),
                },
                body: JSON.stringify({ user_id: user.id }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || `HTTP ${response.status}: ${response.statusText}`);
            }

            await response.json(); // Parse response but don't need to use it

            notifications.show({
                id: "invitation-resent",
                title: "Invitation Resent",
                message: `User invitation has been resent to ${user.email}. The user should check their email for new login credentials.`,
                color: "blue",
                icon: <IconMail />,
            });
        } catch (error) {
            if (error instanceof Error) {
                notifications.show({
                    id: "invitation-resend-error",
                    title: "Error",
                    message: `Failed to resend invitation: ${error.message}`,
                    color: "red",
                    icon: <IconSendOff />,
                });
            } else {
                notifications.show({
                    id: "invitation-resend-error-unknown",
                    title: "Error",
                    message: "Failed to resend invitation. Please try again later.",
                    color: "red",
                    icon: <IconSendOff />,
                });
            }
        }
    };

    // Handle bulk actions for selected users
    const handleBulkAction = async (action: "deactivate" | "reactivate") => {
        const selectedUsers = Array.from(selected).map((idx) => users[idx]);
        const isDeactivate = action === "deactivate";

        try {
            // Update all selected users
            await Promise.all(
                selectedUsers.map(async (user) => {
                    const result = await updateUserEndpointV1UsersPatch({
                        body: {
                            id: user.id,
                            deactivated: isDeactivate,
                        },
                        headers: { Authorization: GetAccessTokenHeader() },
                    });

                    if (result.error) {
                        throw new Error(
                            `Failed to update user: ${result.response.status} ${result.response.statusText}`
                        );
                    }

                    return result.data;
                })
            );

            // Update local state to reflect changes
            const updatedUsers = [...users];
            Array.from(selected).forEach((idx) => {
                updatedUsers[idx] = {
                    ...updatedUsers[idx],
                    deactivated: isDeactivate,
                };
            });
            setUsers(updatedUsers);

            // Clear selection
            setSelected(new Set());

            notifications.show({
                title: "Success",
                message: `Successfully ${isDeactivate ? "deactivated" : "reactivated"} ${selectedUsers.length} user(s)`,
                color: "green",
                icon: isDeactivate ? <IconUserOff /> : <IconUserCheck />,
            });
        } catch (error) {
            customLogger.error("Bulk action error:", error);
            notifications.show({
                title: "Error",
                message: `Failed to ${isDeactivate ? "deactivate" : "reactivate"} users`,
                color: "red",
                icon: <IconUserExclamation />,
            });
        }
    };

    // Handle bulk school assignment for selected users
    const handleBulkSchoolAssignment = async (schoolId: number | null) => {
        const selectedUsers = Array.from(selected).map((idx) => users[idx]);

        // Filter to only process users with valid roles (principals and canteen managers)
        const usersToUpdate = selectedUsers.filter((user) => user.roleId === 4 || user.roleId === 5);

        if (usersToUpdate.length === 0) {
            notifications.show({
                title: "No Valid Users",
                message: "No users can be updated. Only principals and canteen managers can be assigned to schools.",
                color: "red",
                icon: <IconUserExclamation />,
            });
            return;
        }

        try {
            // Update only the valid users with the new school assignment
            await Promise.all(
                usersToUpdate.map(async (user) => {
                    const result = await updateUserEndpointV1UsersPatch({
                        body: {
                            id: user.id,
                            schoolId: schoolId,
                        },
                        headers: { Authorization: GetAccessTokenHeader() },
                    });

                    if (result.error) {
                        throw new Error(
                            `Failed to update user: ${result.response.status} ${result.response.statusText}`
                        );
                    }

                    return result.data;
                })
            );

            // Update local state to reflect changes for only the valid users
            const updatedAllUsers = [...allUsers];
            usersToUpdate.forEach((userToUpdate) => {
                const allUsersIndex = updatedAllUsers.findIndex((u) => u.id === userToUpdate.id);
                if (allUsersIndex !== -1) {
                    updatedAllUsers[allUsersIndex] = {
                        ...updatedAllUsers[allUsersIndex],
                        schoolId: schoolId,
                    };
                }
            });
            setAllUsers(updatedAllUsers);

            // Clear selection
            setSelected(new Set());
            setOpenBulkSchoolModal(false);

            const schoolName = schoolId
                ? availableSchools.find((school) => school.id === schoolId)?.name || "Unknown School"
                : "No School (Unassigned)";

            const skippedCount = selectedUsers.length - usersToUpdate.length;
            const successMessage =
                skippedCount > 0
                    ? `Successfully assigned ${usersToUpdate.length} user(s) to ${schoolName}. ${skippedCount} user(s) were skipped due to role restrictions.`
                    : `Successfully assigned ${usersToUpdate.length} user(s) to ${schoolName}`;

            notifications.show({
                title: "Success",
                message: successMessage,
                color: "green",
                icon: <IconSchool />,
            });
        } catch (error) {
            customLogger.error("Bulk school assignment error:", error);
            notifications.show({
                title: "Error",
                message: "Failed to assign school to users",
                color: "red",
                icon: <IconUserExclamation />,
            });
        }
    };

    // Handle opening the bulk school assignment modal
    const handleOpenBulkSchoolModal = () => {
        setOpenBulkSchoolModal(true);
    };

    // Handle bulk force update info toggle for selected users
    const handleBulkForceUpdateToggle = async (action: "enable" | "disable") => {
        const selectedUsers = Array.from(selected).map((idx) => users[idx]);
        const enableForceUpdate = action === "enable";

        try {
            // Update all selected users with the new forceUpdateInfo status
            await Promise.all(
                selectedUsers.map(async (user) => {
                    const result = await updateUserEndpointV1UsersPatch({
                        body: {
                            id: user.id,
                            forceUpdateInfo: enableForceUpdate,
                        },
                        headers: { Authorization: GetAccessTokenHeader() },
                    });

                    if (result.error) {
                        throw new Error(
                            `Failed to update user: ${result.response.status} ${result.response.statusText}`
                        );
                    }

                    return result.data;
                })
            );

            // Update local state to reflect changes in both users and allUsers arrays
            const updatedUsers = [...users];
            Array.from(selected).forEach((idx) => {
                updatedUsers[idx] = {
                    ...updatedUsers[idx],
                    forceUpdateInfo: enableForceUpdate,
                };
            });
            setUsers(updatedUsers);

            // Also update the allUsers array to maintain consistency
            const updatedAllUsers = [...allUsers];
            Array.from(selected).forEach((idx) => {
                const userToUpdate = users[idx];
                const allUsersIndex = updatedAllUsers.findIndex((u) => u.id === userToUpdate.id);
                if (allUsersIndex !== -1) {
                    updatedAllUsers[allUsersIndex] = {
                        ...updatedAllUsers[allUsersIndex],
                        forceUpdateInfo: enableForceUpdate,
                    };
                }
            });
            setAllUsers(updatedAllUsers);

            // Clear selection
            setSelected(new Set());

            notifications.show({
                title: "Success",
                message: `Successfully ${enableForceUpdate ? "enabled" : "disabled"} Force Update Info for ${
                    selectedUsers.length
                } user(s)`,
                color: "green",
                icon: enableForceUpdate ? <IconCheck /> : <IconX />,
            });
        } catch (error) {
            customLogger.error("Bulk force update toggle error:", error);
            notifications.show({
                title: "Error",
                message: `Failed to ${enableForceUpdate ? "enable" : "disable"} Force Update Info for users`,
                color: "red",
                icon: <IconUserExclamation />,
            });
        }
    };

    const toggleSelected = (index: number) => {
        const updated = new Set(selected);
        if (updated.has(index)) updated.delete(index);
        else updated.add(index);
        setSelected(updated);
    };

    const fetchUserAvatar = (avatarUrn: string): string | undefined => {
        if (avatarsRequested.has(avatarUrn) && avatars.has(avatarUrn)) {
            return avatars.get(avatarUrn);
        } else if (avatarsRequested.has(avatarUrn)) {
            return undefined; // Avatar is requested but not yet available
        }
        setAvatarsRequested((prev) => new Set(prev).add(avatarUrn));

        getUserAvatarEndpointV1UsersAvatarGet({
            query: { fn: avatarUrn },
            headers: { Authorization: GetAccessTokenHeader() },
        })
            .then((result) => {
                if (result.error) {
                    throw new Error(`Failed to fetch avatar: ${result.response.status} ${result.response.statusText}`);
                }

                const blob = result.data as Blob;
                const url = URL.createObjectURL(blob);
                setAvatars((prev) => new Map(prev).set(avatarUrn, url));
                return url;
            })
            .catch((error: Error) => {
                customLogger.error("Failed to fetch user avatar:", error);
                notifications.show({
                    id: "fetch-user-avatar-error",
                    title: "Error",
                    message: "Failed to fetch user avatar.",
                    color: "red",
                    icon: <IconUserExclamation />,
                });
                return undefined;
            });
    };

    const handleFetchError = () => {
        if (!fetchUsersErrorShown) {
            setFetchUsersErrorShown(true);
            notifications.show({
                id: "fetch-users-error",
                title: "Failed to fetch users list",
                message: "Please try again later.",
                color: "red",
                icon: <IconUserExclamation />,
            });
            setUsers([]);
        }
    };

    useEffect(() => {
        const fetchRoles = async () => {
            try {
                const result = await getAllRolesV1AuthRolesGet({
                    headers: { Authorization: GetAccessTokenHeader() },
                });

                if (result.error) {
                    throw new Error(`Failed to get roles: ${result.response.status} ${result.response.statusText}`);
                }

                setAvailableRoles(result.data as Role[]);
            } catch (error) {
                customLogger.error("Failed to fetch roles:", error);
                if (!fetchRolesErrorShown) {
                    setFetchRolesErrorShown(true);
                    notifications.show({
                        id: "fetch-roles-error",
                        title: "Failed to fetch roles",
                        message: "Please try again later.",
                        color: "red",
                        icon: <IconUserExclamation />,
                    });
                    setAvailableRoles([]);
                }
            }
        };
        const fetchSchools = async () => {
            await GetAllSchools(0, 999)
                .then((data) => {
                    setAvailableSchools(data);
                })
                .catch((error) => {
                    customLogger.error("Failed to fetch schools:", error);
                    notifications.show({
                        id: "fetch-schools-error",
                        title: "Error",
                        message: "Failed to fetch schools. Please try again later.",
                        color: "red",
                        icon: <IconUserExclamation />,
                    });
                });
        };

        const fetchAllUsers = async () => {
            try {
                const result = await getAllUsersEndpointV1UsersAllGet({
                    query: {
                        offset: 0,
                        limit: 10000,
                    },
                    headers: { Authorization: GetAccessTokenHeader() },
                });

                if (result.error) {
                    throw new Error(`Failed to fetch users: ${result.response.status} ${result.response.statusText}`);
                }

                const data = result.data as UserPublic[];
                setAllUsers(data);
            } catch (error) {
                customLogger.error("Failed to fetch users:", error);
                handleFetchError();
            }
        };

        const timeoutId = setTimeout(() => {
            fetchRoles();
            fetchAllUsers();
            fetchSchools();
        }, 300);

        return () => {
            avatars.forEach((url) => URL.revokeObjectURL(url));
            setAvatars(new Map());
            setAvatarsRequested(new Set());
            clearTimeout(timeoutId);
        };
    }, [fetchRolesErrorShown, setUsers, fetchUsersErrorShown]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        const filtered = applyFilters(allUsers);

        setTotalUsers(filtered.length);
        setTotalPages(Math.max(1, Math.ceil(filtered.length / userPerPage)));

        // If currentPage is out of bounds, reset to 1
        const safePage = Math.min(currentPage, Math.ceil(filtered.length / userPerPage) || 1);
        if (safePage !== currentPage) setCurrentPage(safePage);

        const start = (safePage - 1) * userPerPage;
        const end = start + userPerPage;
        setUsers(filtered.slice(start, end));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        allUsers,
        roleFilter,
        schoolFilter,
        statusFilter,
        updateFilter,
        searchTerm,
        userPerPage,
        currentPage,
        sortField,
        sortDirection,
        availableSchools,
    ]);

    //Function to for Hover and Mouse Tracking on User Card
    // const [hoveredUser, setHoveredUser] = useState<UserPublicType | null>(null);
    // const [mouseX, setMouseX] = useState(0);
    // const [mouseY, setMouseY] = useState(0);
    //
    // useEffect(() => {
    //     const handleMouseMove = (e: MouseEvent) => {
    //         setMouseX(e.clientX);
    //         setMouseY(e.clientY);
    //     };
    //     window.addEventListener("mousemove", handleMouseMove);
    //     return () => window.removeEventListener("mousemove", handleMouseMove);
    // }, []);

    customLogger.debug("Rendering UsersPage");
    return (
        <>
            <Stack gap="md">
                <Flex mih={50} gap="xl" justify="flex-start" align="center" direction="row" wrap="wrap">
                    <TextInput
                        placeholder="Search for users"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.currentTarget.value)}
                        size="md"
                        style={{ width: "400px" }}
                    />
                    <Flex ml="auto" gap="sm" align="center">
                        <ActionIcon
                            disabled={!userCtx.userPermissions?.includes("users:create")}
                            size="input-md"
                            variant="filled"
                            color="blue"
                            onClick={handleInvite}
                        >
                            <IconMailPlus size={18} />
                        </ActionIcon>
                        <ActionIcon
                            disabled={!userCtx.userPermissions?.includes("users:create")}
                            size="input-md"
                            variant="filled"
                            color="blue"
                            onClick={handleCreate}
                        >
                            <IconPlus size={18} />
                        </ActionIcon>
                        <ActionIcon size="input-md" variant="default" onClick={handleSearch}>
                            <IconSearch size={16} />
                        </ActionIcon>
                    </Flex>
                </Flex>

                <UserFilters
                    roleFilter={roleFilter}
                    setRoleFilter={setRoleFilter}
                    schoolFilter={schoolFilter}
                    setSchoolFilter={setSchoolFilter}
                    statusFilter={statusFilter}
                    setStatusFilter={setStatusFilter}
                    updateFilter={updateFilter}
                    setUpdateFilter={setUpdateFilter}
                    availableRoles={availableRoles}
                    availableSchools={availableSchools}
                    onFilterChange={handleFilterChange}
                />

                <Table.ScrollContainer minWidth={1200} type="native">
                    <Table highlightOnHover stickyHeader>
                        <TableThead>
                            <TableTr>
                                <TableTh>
                                    <Group wrap="nowrap">
                                        <Checkbox
                                            checked={selected.size === users.length && users.length > 0}
                                            indeterminate={selected.size > 0 && selected.size < users.length}
                                            onChange={(event) => handleSelectAll(event.currentTarget.checked)}
                                        />
                                        {selected.size > 0 &&
                                            (userCtx.userPermissions?.includes("users:global:deactivate") ||
                                                userCtx.userPermissions?.includes("users:global:modify:school") ||
                                                userCtx.userPermissions?.includes("users:global:forceupdate")) && (
                                                <Menu shadow="md" width={200}>
                                                    <Menu.Target>
                                                        <Button variant="light" size="xs">
                                                            Actions ({selected.size})
                                                        </Button>
                                                    </Menu.Target>
                                                    <Menu.Dropdown>
                                                        <Menu.Label>Bulk Actions</Menu.Label>
                                                        <Menu.Item
                                                            leftSection={<IconUserOff size={14} />}
                                                            disabled={
                                                                !userCtx.userPermissions?.includes(
                                                                    "users:global:deactivate"
                                                                )
                                                            }
                                                            onClick={() => handleBulkAction("deactivate")}
                                                        >
                                                            Deactivate Users
                                                        </Menu.Item>
                                                        <Menu.Item
                                                            leftSection={<IconUserCheck size={14} />}
                                                            disabled={
                                                                !userCtx.userPermissions?.includes(
                                                                    "users:global:deactivate"
                                                                )
                                                            }
                                                            onClick={() => handleBulkAction("reactivate")}
                                                        >
                                                            Reactivate Users
                                                        </Menu.Item>
                                                        <Menu.Divider />
                                                        <Menu.Item
                                                            leftSection={<IconSchool size={14} />}
                                                            disabled={
                                                                !userCtx.userPermissions?.includes(
                                                                    "users:global:modify:school"
                                                                )
                                                            }
                                                            onClick={handleOpenBulkSchoolModal}
                                                        >
                                                            Assign School
                                                        </Menu.Item>
                                                        <Menu.Divider />
                                                        <Menu.Item
                                                            leftSection={<IconCheck size={14} />}
                                                            disabled={
                                                                !userCtx.userPermissions?.includes(
                                                                    "users:global:forceupdate"
                                                                )
                                                            }
                                                            onClick={() => handleBulkForceUpdateToggle("enable")}
                                                        >
                                                            Enable Force Update Info
                                                        </Menu.Item>
                                                        <Menu.Item
                                                            leftSection={<IconX size={14} />}
                                                            disabled={
                                                                !userCtx.userPermissions?.includes(
                                                                    "users:global:forceupdate"
                                                                )
                                                            }
                                                            onClick={() => handleBulkForceUpdateToggle("disable")}
                                                        >
                                                            Disable Force Update Info
                                                        </Menu.Item>
                                                    </Menu.Dropdown>
                                                </Menu>
                                            )}
                                    </Group>
                                </TableTh>
                                <TableTh
                                    style={{ cursor: "pointer", userSelect: "none" }}
                                    onClick={() => handleSort("username")}
                                >
                                    <Group gap="xs" justify="space-between" wrap="nowrap">
                                        <Text style={{ whiteSpace: "nowrap" }}>Username</Text>
                                        {getSortIcon("username")}
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
                                    onClick={() => handleSort("name")}
                                >
                                    <Group gap="xs" justify="space-between" wrap="nowrap">
                                        <Text style={{ whiteSpace: "nowrap" }}>Name</Text>
                                        {getSortIcon("name")}
                                    </Group>
                                </TableTh>
                                <TableTh
                                    style={{ cursor: "pointer", userSelect: "none" }}
                                    onClick={() => handleSort("school")}
                                >
                                    <Group gap="xs" justify="space-between" wrap="nowrap">
                                        <Text style={{ whiteSpace: "nowrap" }}>Assigned School</Text>
                                        {getSortIcon("school")}
                                    </Group>
                                </TableTh>
                                <TableTh
                                    style={{ cursor: "pointer", userSelect: "none" }}
                                    onClick={() => handleSort("role")}
                                >
                                    <Group gap="xs" justify="space-between" wrap="nowrap">
                                        <Text style={{ whiteSpace: "nowrap" }}>Role</Text>
                                        {getSortIcon("role")}
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
                                    onClick={() => handleSort("twoFactor")}
                                >
                                    <Group gap="xs" justify="space-between" wrap="nowrap">
                                        <Text style={{ whiteSpace: "nowrap" }}>2FA</Text>
                                        {getSortIcon("twoFactor")}
                                    </Group>
                                </TableTh>
                                <TableTh
                                    style={{ cursor: "pointer", userSelect: "none" }}
                                    onClick={() => handleSort("forceUpdate")}
                                >
                                    <Group gap="xs" justify="space-between" wrap="nowrap">
                                        <Text style={{ whiteSpace: "nowrap" }}>Force Update</Text>
                                        {getSortIcon("forceUpdate")}
                                    </Group>
                                </TableTh>
                                <TableTh>Edit</TableTh>
                            </TableTr>
                        </TableThead>
                        <TableTbody>
                            {users.length > 0 ? (
                                users.map((user, index) => (
                                    <TableTr
                                        key={index}
                                        bg={selected.has(index) ? "gray.1" : undefined}
                                        // onMouseEnter={() => setHoveredUser(user)}
                                        // onMouseLeave={() => setHoveredUser(null)}
                                    >
                                        {/* Checkbox and Avatar */}
                                        <TableTd>
                                            <Group wrap="nowrap">
                                                <Checkbox
                                                    checked={selected.has(index)}
                                                    onChange={() => toggleSelected(index)}
                                                />
                                                {user.avatarUrn ? (
                                                    <Avatar radius="xl" src={fetchUserAvatar(user.avatarUrn)}>
                                                        <IconUser />
                                                    </Avatar>
                                                ) : (
                                                    <Avatar
                                                        radius="xl"
                                                        name={user.nameFirst + " " + user.nameLast}
                                                        color="initials"
                                                    />
                                                )}
                                            </Group>
                                        </TableTd>
                                        <TableTd c={user.deactivated ? "dimmed" : undefined}>{user.username}</TableTd>
                                        <TableTd c={user.deactivated ? "dimmed" : undefined}>
                                            <Group gap="xs" align="center" wrap="nowrap">
                                                {user.email &&
                                                    (user.lastLoggedInTime === null ? (
                                                        <Tooltip
                                                            label={
                                                                userCtx.userPermissions?.includes("users:create")
                                                                    ? "Resend User Invitation"
                                                                    : "Permission required to resend invitation"
                                                            }
                                                            position="bottom"
                                                            withArrow
                                                        >
                                                            <motion.div
                                                                whileTap={{
                                                                    scale: userCtx.userPermissions?.includes(
                                                                        "users:create"
                                                                    )
                                                                        ? 0.9
                                                                        : 1,
                                                                }}
                                                                whileHover={{
                                                                    scale: userCtx.userPermissions?.includes(
                                                                        "users:create"
                                                                    )
                                                                        ? 1.05
                                                                        : 1,
                                                                }}
                                                                style={{
                                                                    display: "flex",
                                                                    alignItems: "center",
                                                                    justifyContent: "center",
                                                                    cursor: userCtx.userPermissions?.includes(
                                                                        "users:create"
                                                                    )
                                                                        ? "pointer"
                                                                        : "not-allowed",
                                                                    opacity: userCtx.userPermissions?.includes(
                                                                        "users:create"
                                                                    )
                                                                        ? 1
                                                                        : 0.5,
                                                                }}
                                                            >
                                                                <IconMailPlus
                                                                    size={16}
                                                                    color="var(--mantine-color-blue-6)"
                                                                    onClick={() => handleResendInvitation(user)}
                                                                />
                                                            </motion.div>
                                                        </Tooltip>
                                                    ) : user.emailVerified ? (
                                                        <Tooltip label="Email verified" position="bottom" withArrow>
                                                            <IconCircleDashedCheck size={16} color="green" />
                                                        </Tooltip>
                                                    ) : (
                                                        <Tooltip
                                                            label={
                                                                userCtx.userPermissions?.includes(
                                                                    "users:global:modify:email"
                                                                )
                                                                    ? "Email not verified (Click to send verification mail)"
                                                                    : "Email not verified (Permission required to send verification mail)"
                                                            }
                                                            position="bottom"
                                                            withArrow
                                                        >
                                                            <motion.div
                                                                whileTap={{
                                                                    scale: userCtx.userPermissions?.includes(
                                                                        "users:global:modify:email"
                                                                    )
                                                                        ? 0.9
                                                                        : 1,
                                                                }}
                                                                whileHover={{
                                                                    scale: userCtx.userPermissions?.includes(
                                                                        "users:global:modify:email"
                                                                    )
                                                                        ? 1.05
                                                                        : 1,
                                                                }}
                                                                style={{
                                                                    display: "flex",
                                                                    alignItems: "center",
                                                                    justifyContent: "center",
                                                                    cursor: userCtx.userPermissions?.includes(
                                                                        "users:global:modify:email"
                                                                    )
                                                                        ? "pointer"
                                                                        : "not-allowed",
                                                                    opacity: userCtx.userPermissions?.includes(
                                                                        "users:global:modify:email"
                                                                    )
                                                                        ? 1
                                                                        : 0.5,
                                                                }}
                                                            >
                                                                <IconCircleDashedX
                                                                    size={16}
                                                                    color="gray"
                                                                    onClick={async () => {
                                                                        // Check permission before proceeding
                                                                        if (
                                                                            !userCtx.userPermissions?.includes(
                                                                                "users:global:modify:email"
                                                                            )
                                                                        ) {
                                                                            notifications.show({
                                                                                id: "verification-email-permission-denied",
                                                                                title: "Permission Denied",
                                                                                message:
                                                                                    "You don't have permission to send verification emails for other users.",
                                                                                color: "red",
                                                                                icon: <IconSendOff />,
                                                                            });
                                                                            return;
                                                                        }

                                                                        try {
                                                                            const result =
                                                                                await requestVerificationEmailAdminV1AuthEmailRequestAdminPost(
                                                                                    {
                                                                                        query: {
                                                                                            user_id: user.id,
                                                                                        },
                                                                                        headers: {
                                                                                            Authorization:
                                                                                                GetAccessTokenHeader(),
                                                                                        },
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
                                                                                message: `Verification email has been sent to ${user.email}. The user should check their email and click the link to verify.`,
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
                                                                />
                                                            </motion.div>
                                                        </Tooltip>
                                                    ))}
                                                {user.email ? (
                                                    <Anchor
                                                        href={`mailto:${user.email}`}
                                                        underline="never"
                                                        size="sm"
                                                        rel="noopener noreferrer"
                                                    >
                                                        {user.email}
                                                    </Anchor>
                                                ) : (
                                                    <Text size="sm" c="dimmed">
                                                        N/A
                                                    </Text>
                                                )}
                                            </Group>
                                        </TableTd>
                                        <TableTd c={user.deactivated ? "dimmed" : undefined}>
                                            {user.nameFirst == null &&
                                                user.nameMiddle == null &&
                                                user.nameLast == null && (
                                                    <Text size="sm" c="dimmed">
                                                        N/A
                                                    </Text>
                                                )}
                                            {user.nameFirst}{" "}
                                            {user.nameMiddle
                                                ? user.nameMiddle
                                                      .split(" ")
                                                      .map((n) => n[0])
                                                      .join(".") + ". "
                                                : ""}
                                            {user.nameLast}
                                        </TableTd>
                                        <TableTd c={user.deactivated ? "dimmed" : undefined}>
                                            {user.schoolId ? (
                                                availableSchools.find((school) => school.id === user.schoolId)
                                                    ?.name || (
                                                    <Text size="sm" c="dimmed">
                                                        N/A
                                                    </Text>
                                                )
                                            ) : (
                                                <Text size="sm" c="dimmed">
                                                    N/A
                                                </Text>
                                            )}
                                        </TableTd>
                                        <TableTd c={user.deactivated ? "dimmed" : undefined}>
                                            {roles[user.roleId]}
                                        </TableTd>
                                        <TableTd>
                                            <Tooltip
                                                label={user.deactivated ? "User is deactivated" : "User is active"}
                                                position="bottom"
                                                withArrow
                                            >
                                                {user.deactivated ? (
                                                    <IconLock color="gray" />
                                                ) : (
                                                    <IconLockOpen color="green" />
                                                )}
                                            </Tooltip>
                                        </TableTd>
                                        <TableTd>
                                            <Tooltip label="Two-Factor Authentication" position="bottom" withArrow>
                                                {user.otpVerified ? (
                                                    <IconKey color="green" />
                                                ) : (
                                                    <IconKey color="gray" />
                                                )}
                                            </Tooltip>
                                        </TableTd>
                                        <TableTd>
                                            <Tooltip label="Force Update Required" position="bottom" withArrow>
                                                {user.forceUpdateInfo ? (
                                                    <IconCheck color="gray" />
                                                ) : (
                                                    <IconX color="gray" />
                                                )}
                                            </Tooltip>
                                        </TableTd>
                                        <TableTd>
                                            <Group gap="xs" justify="center" align="center">
                                                <Tooltip label="Edit User" position="bottom" openDelay={500} withArrow>
                                                    <ActionIcon
                                                        variant="light"
                                                        size="md"
                                                        disabled={
                                                            !userCtx.userPermissions?.includes("users:global:modify")
                                                        }
                                                        onClick={() => handleEdit(index, user)}
                                                    >
                                                        <IconEdit size={16} />
                                                    </ActionIcon>
                                                </Tooltip>
                                            </Group>
                                        </TableTd>
                                    </TableTr>
                                ))
                            ) : (
                                <TableTr>
                                    <TableTd colSpan={9}>
                                        <Text c="dimmed" size="sm" ta="center" py="xl">
                                            No users available
                                        </Text>
                                    </TableTd>
                                </TableTr>
                            )}
                        </TableTbody>
                    </Table>
                </Table.ScrollContainer>
                {/* <AnimatePresence>
                    {hoveredUser && (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            transition={{ type: "spring", stiffness: 300, damping: 20 }}
                            style={{
                                position: "fixed",
                                top: mouseY + 16,
                                left: mouseX + 16,
                                zIndex: 1000,
                                pointerEvents: "none",
                            }}
                        >
                            <Card shadow="md" radius="md" withBorder style={{ width: 250 }}>
                                <Stack gap="xs">
                                    <Group>
                                        {hoveredUser.avatarUrn ? (
                                            <Avatar radius="xl" src={fetchUserAvatar(hoveredUser.avatarUrn)}>
                                                <IconUser />
                                            </Avatar>
                                        ) : (
                                            <Avatar
                                                radius="xl"
                                                name={hoveredUser.nameFirst + " " + hoveredUser.nameLast}
                                                color="initials"
                                            />
                                        )}
                                        <Stack gap={0}>
                                            <Text fw={ 500}>
                                                {hoveredUser.nameFirst}{" "}
                                                {hoveredUser.nameMiddle
                                                    ? hoveredUser.nameMiddle
                                                          .split(" ")
                                                          .map((n) => n[0])
                                                          .join(".") + ". "
                                                    : ""}
                                                {hoveredUser.nameLast}
                                            </Text>
                                            <Text size="sm" c="dimmed">
                                                {hoveredUser.email}
                                            </Text>
                                            <Text size="xs" c="dimmed">
                                                {roles[hoveredUser.roleId]}
                                            </Text>
                                        </Stack>
                                    </Group>
                                </Stack>
                            </Card>
                        </motion.div>
                    )}
                </AnimatePresence> */}
                <Group justify="space-between" align="center" m="md">
                    <div></div>
                    <Stack align="center" justify="center" gap="sm">
                        <Pagination value={currentPage} onChange={setCurrentPage} total={totalPages} mt="md" />
                        <Text size="sm" c="dimmed">
                            {totalUsers > 0
                                ? `${(currentPage - 1) * userPerPage + 1}-${Math.min(
                                      currentPage * userPerPage,
                                      totalUsers
                                  )} of ${totalUsers} users`
                                : "No users found"}
                        </Text>
                    </Stack>
                    <Select
                        value={userPerPage.toString()}
                        onChange={(value) => {
                            if (value) {
                                const newUserPerPage = parseInt(value);
                                setUserPerPage(newUserPerPage);
                                setCurrentPage(1); // Reset to first page
                            }
                        }}
                        data={userPerPageOptions.map((num) => ({ value: num.toString(), label: num.toString() }))}
                        size="md"
                        style={{ width: "100px" }}
                        allowDeselect={false}
                    />
                </Group>
                {selectedUserIndex !== null && selectedUser !== null && (
                    <EditUserComponent
                        index={selectedUserIndex}
                        user={selectedUser}
                        availableSchools={availableSchools}
                        availableRoles={availableRoles}
                        setIndex={setSelectedUserIndex}
                        UpdateUserInfo={UpdateUserInfo}
                        UploadUserAvatar={UploadUserAvatar}
                        RemoveUserAvatar={RemoveUserAvatar}
                        DeleteUserInfo={DeleteUserInfo}
                        fetchUserAvatar={fetchUserAvatar}
                        onUserUpdate={(updatedUser) => {
                            setAllUsers((prev) => {
                                const idx = prev.findIndex((u) => u.id === updatedUser.id);
                                if (idx === -1) return prev;
                                const newArr = [...prev];
                                newArr[idx] = updatedUser;
                                return newArr;
                            });
                        }}
                    />
                )}
                {openInviteUserModal === true && (
                    <InviteUserComponent
                        modalOpen={openInviteUserModal}
                        setModalOpen={setOpenInviteUserModal}
                        availableSchools={availableSchools}
                        availableRoles={availableRoles}
                        onUserInvite={() => {
                            // setAllUsers((prev) => [newUser, ...prev]);
                        }}
                    />
                )}
                {openCreateUserModal === true && (
                    <CreateUserComponent
                        modalOpen={openCreateUserModal}
                        setModalOpen={setOpenCreateUserModal}
                        availableSchools={availableSchools}
                        availableRoles={availableRoles}
                        onUserCreate={() => {
                            // setAllUsers((prev) => [newUser, ...prev]);
                        }}
                    />
                )}
                {/* Bulk School Assignment Modal */}
                <Modal
                    opened={openBulkSchoolModal}
                    onClose={() => setOpenBulkSchoolModal(false)}
                    title="Assign School to Selected Users"
                    size="md"
                >
                    <Stack gap="md">
                        {(() => {
                            const selectedUsers = Array.from(selected).map((idx) => users[idx]);
                            const invalidRoleUsers = selectedUsers.filter(
                                (user) => user.roleId !== 4 && user.roleId !== 5
                            );
                            const validUsers = selectedUsers.filter((user) => user.roleId === 4 || user.roleId === 5);

                            return (
                                <>
                                    <Text size="sm" c="dimmed">
                                        Select a school to assign to {selected.size} selected user(s):
                                    </Text>

                                    {invalidRoleUsers.length > 0 && (
                                        <Alert
                                            color="yellow"
                                            title="Role Restriction Warning"
                                            icon={<IconAlertTriangle />}
                                        >
                                            <Text size="sm">
                                                {invalidRoleUsers.length} selected user(s) cannot be assigned to schools
                                                because they are not principals or canteen managers. Only valid users
                                                will be updated.
                                            </Text>
                                        </Alert>
                                    )}

                                    {validUsers.length === 0 ? (
                                        <Alert color="red" title="No Valid Users" icon={<IconX />}>
                                            <Text size="sm">
                                                None of the selected users can be assigned to schools. Only principals
                                                and canteen managers can be assigned to schools.
                                            </Text>
                                        </Alert>
                                    ) : (
                                        <Select
                                            placeholder="Select a school"
                                            data={[
                                                { value: "null", label: "No School (Unassign)" },
                                                ...availableSchools
                                                    .filter((school) => school.id != null)
                                                    .map((school) => ({
                                                        value: school.id!.toString(),
                                                        label: school.name,
                                                    })),
                                            ]}
                                            searchable
                                            clearable
                                            onChange={(value) => {
                                                if (value !== null) {
                                                    const schoolId = value === "null" ? null : parseInt(value);
                                                    handleBulkSchoolAssignment(schoolId);
                                                }
                                            }}
                                        />
                                    )}
                                </>
                            );
                        })()}
                        <Group justify="flex-end" mt="md">
                            <Button variant="outline" onClick={() => setOpenBulkSchoolModal(false)}>
                                Cancel
                            </Button>
                        </Group>
                    </Stack>
                </Modal>
            </Stack>
        </>
    );
}
