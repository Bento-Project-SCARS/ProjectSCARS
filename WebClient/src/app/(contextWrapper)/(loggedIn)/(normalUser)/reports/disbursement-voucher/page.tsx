"use client";

import { LoadingComponent } from "@/components/LoadingComponent/LoadingComponent";
import { SignatureCanvas } from "@/components/SignatureCanvas/SignatureCanvas";
import { customLogger } from "@/lib/api/customLogger";
import { useUser } from "@/lib/providers/user";
import * as csclient from "@/lib/api/csclient";
import {
    Alert,
    ActionIcon,
    Badge,
    Box,
    Button,
    Card,
    Checkbox,
    Container,
    Divider,
    Flex,
    Group,
    Image,
    Modal,
    NumberInput,
    Radio,
    SimpleGrid,
    Stack,
    Table,
    Text,
    Textarea,
    TextInput,
    Title,
    ScrollArea,
} from "@mantine/core";
import { DateInput } from "@mantine/dates";
import "@mantine/dates/styles.css";
import { notifications } from "@mantine/notifications";
import { IconAlertCircle, IconEdit, IconFileText, IconHistory, IconSearch, IconX } from "@tabler/icons-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import dayjs from "dayjs";

const report_type = {
    operating_expenses: "Operating Expenses",
    administrative_expenses: "Administrative Expenses",
    supplementary_feeding_fund: "Supplementary Feeding Fund",
    clinic_fund: "Clinic Fund",
    faculty_stud_dev_fund: "Faculty and Student Development Fund",
    he_fund: "HE Fund",
    school_operations_fund: "School Operations Fund",
    revolving_fund: "Revolving Fund",
};

// Helper function to convert number to words
const numberToWords = (num: number): string => {
    const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine"];
    const teens = [
        "Ten",
        "Eleven",
        "Twelve",
        "Thirteen",
        "Fourteen",
        "Fifteen",
        "Sixteen",
        "Seventeen",
        "Eighteen",
        "Nineteen",
    ];
    const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
    const thousands = ["", "Thousand", "Million", "Billion"];

    if (num === 0) return "Zero";

    const convertHundreds = (n: number): string => {
        let result = "";
        if (n >= 100) {
            result += ones[Math.floor(n / 100)] + " Hundred ";
            n %= 100;
        }
        if (n >= 20) {
            result += tens[Math.floor(n / 10)] + " ";
            n %= 10;
        } else if (n >= 10) {
            result += teens[n - 10] + " ";
            n = 0;
        }
        if (n > 0) {
            result += ones[n] + " ";
        }
        return result;
    };

    let result = "";
    let groupIndex = 0;

    while (num > 0) {
        const group = num % 1000;
        if (group > 0) {
            result = convertHundreds(group) + thousands[groupIndex] + " " + result;
        }
        num = Math.floor(num / 1000);
        groupIndex++;
    }

    return result.trim();
};

function DisbursementVoucherContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const category = searchParams.get("category");
    const userCtx = useUser();

    // Form state
    const [fundCluster, setFundCluster] = useState("101101");
    const [date, setDate] = useState<Date | null>(new Date());
    const [dvNo, setDvNo] = useState("");
    const [modeOfPayment, setModeOfPayment] = useState<string>("");
    const [otherPaymentMode, setOtherPaymentMode] = useState("");
    const [payee, setPayee] = useState("");
    const [tinEmployeeNo, setTinEmployeeNo] = useState("");
    const [orsBursNo, setOrsBursNo] = useState("");
    const [address, setAddress] = useState("");
    const [responsibilityCenter, setResponsibilityCenter] = useState("");
    const [mfoPap, setMfoPap] = useState("");
    const [totalAmount, setTotalAmount] = useState(0);
    const [accountCode, setAccountCode] = useState("");
    const [grossAmount, setGrossAmount] = useState(0);
    const [taxAmount, setTaxAmount] = useState(0);
    const [netAmount, setNetAmount] = useState(0);

    // Certified checkboxes
    const [cashAvailable, setCashAvailable] = useState(false);
    const [subjectToAuthority, setSubjectToAuthority] = useState(false);
    const [supportingDocuments, setSupportingDocuments] = useState(false);

    // Signature state
    const [certifiedByUser, setCertifiedByUser] = useState<csclient.UserSimple | null>(null);
    const [approvedByUser, setApprovedByUser] = useState<csclient.UserSimple | null>(null);
    const [certifiedBySignatureUrl, setCertifiedBySignatureUrl] = useState<string | null>(null);
    const [approvedBySignatureUrl, setApprovedBySignatureUrl] = useState<string | null>(null);
    const [currentUserSignatureUrl, setCurrentUserSignatureUrl] = useState<string | null>(null);
    const [payeeSignature, setPayeeSignature] = useState<string | null>(null);
    const [payeeSignatureModalOpened, setPayeeSignatureModalOpened] = useState(false);

    // Receipt of payment
    const [receiptDate, setReceiptDate] = useState<Date | null>(new Date());
    const [checkAdaNo, setCheckAdaNo] = useState("");
    const [bankNameAccount, setBankNameAccount] = useState("");
    const [jevNo, setJevNo] = useState("");
    const [signatureDate, setSignatureDate] = useState<Date | null>(null);

    // User selection
    const [schoolUsers, setSchoolUsers] = useState<csclient.UserSimple[]>([]);
    const [userSelectModalOpened, setUserSelectModalOpened] = useState(false);
    const [selectingFor, setSelectingFor] = useState<"certified" | "approved">("certified");
    const [searchTerm, setSearchTerm] = useState("");

    // Approval states
    const [certifiedApprovalModalOpened, setCertifiedApprovalModalOpened] = useState(false);
    const [approvedApprovalModalOpened, setApprovedApprovalModalOpened] = useState(false);
    const [certifiedApprovalCheckbox, setCertifiedApprovalCheckbox] = useState(false);
    const [approvedApprovalCheckbox, setApprovedApprovalCheckbox] = useState(false);
    const [certifiedApprovalConfirmed, setCertifiedApprovalConfirmed] = useState(false);
    const [approvedApprovalConfirmed, setApprovedApprovalConfirmed] = useState(false);

    // Loading states
    const [isLoading, setIsLoading] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Load liquidation report data
    useEffect(() => {
        const loadLiquidationData = async () => {
            if (!userCtx.userInfo?.schoolId || !category) return;

            setIsLoading(true);
            try {
                const currentDate = new Date();
                const year = currentDate.getFullYear();
                const month = currentDate.getMonth() + 1;

                const response = await csclient.getLiquidationReportV1ReportsLiquidationSchoolIdYearMonthCategoryGet({
                    path: {
                        school_id: userCtx.userInfo.schoolId,
                        year,
                        month,
                        category,
                    },
                });

                if (response.data?.entries) {
                    const total = response.data.entries.reduce((sum, entry) => {
                        return sum + (entry.quantity || 1) * (entry.unitPrice || entry.amount || 0);
                    }, 0);

                    setTotalAmount(total);
                    setGrossAmount(total);
                    setNetAmount(total);

                    // TODO: Auto-generate DV number (101-{year}-{month}-001)?
                    const dvNumber = `${userCtx.userInfo.schoolId}-${year}-${month
                        .toString()
                        .padStart(2, "0")}-${category}`;
                    setDvNo(dvNumber);
                }
            } catch (error) {
                customLogger.error("Failed to load liquidation report data:", error);
            }
            setIsLoading(false);
        };

        loadLiquidationData();
    }, [userCtx.userInfo?.schoolId, category]);

    // Load school users
    useEffect(() => {
        const loadSchoolUsers = async () => {
            if (!userCtx.userInfo?.schoolId) return;

            try {
                const response = await csclient.getUsersSimpleEndpointV1UsersSimpleGet();
                if (response.data) {
                    setSchoolUsers(response.data);
                }
            } catch (error) {
                customLogger.error("Failed to load school users:", error);
            }
        };

        loadSchoolUsers();
    }, [userCtx.userInfo?.schoolId]);

    // Load prepared by/current user signature
    useEffect(() => {
        const loadCurrentUserSignature = async () => {
            if (userCtx.userInfo?.signatureUrn) {
                try {
                    const response = await csclient.getUserSignatureEndpointV1UsersSignatureGet({
                        query: { fn: userCtx.userInfo.signatureUrn },
                    });
                    if (response.data) {
                        setCurrentUserSignatureUrl(URL.createObjectURL(response.data as Blob));
                    }
                } catch (error) {
                    customLogger.error("Failed to load current user signature:", error);
                }
            }
        };

        loadCurrentUserSignature();
    }, [userCtx.userInfo?.signatureUrn]);

    // Update net amount when gross and tax change
    useEffect(() => {
        setNetAmount(grossAmount - taxAmount);
    }, [grossAmount, taxAmount]);

    const handleClose = () => {
        if (category) {
            router.push(`/reports/liquidation-report?category=${category}`);
        } else {
            router.push("/reports");
        }
    };

    const handleUserSelect = async (user: csclient.UserSimple) => {
        if (selectingFor === "certified") {
            setCertifiedByUser(user);
            if (user.signatureUrn) {
                try {
                    const response = await csclient.getUserSignatureEndpointV1UsersSignatureGet({
                        query: { fn: user.signatureUrn },
                    });
                    if (response.data) {
                        setCertifiedBySignatureUrl(URL.createObjectURL(response.data as Blob));
                    }
                } catch (error) {
                    customLogger.error("Failed to load signature:", error);
                }
            }
        } else {
            setApprovedByUser(user);
            if (user.signatureUrn) {
                try {
                    const response = await csclient.getUserSignatureEndpointV1UsersSignatureGet({
                        query: { fn: user.signatureUrn },
                    });
                    if (response.data) {
                        setApprovedBySignatureUrl(URL.createObjectURL(response.data as Blob));
                    }
                } catch (error) {
                    customLogger.error("Failed to load signature:", error);
                }
            }
        }
        setUserSelectModalOpened(false);
    };

    const openUserSelectModal = (type: "certified" | "approved") => {
        setSelectingFor(type);
        setUserSelectModalOpened(true);
    };

    const saveSignature = (signatureDataUrl: string) => {
        setPayeeSignature(signatureDataUrl);
        setSignatureDate(new Date());
        setPayeeSignatureModalOpened(false);
    };

    const openCertifiedApprovalModal = () => {
        setCertifiedApprovalModalOpened(true);
    };

    const openApprovedApprovalModal = () => {
        setApprovedApprovalModalOpened(true);
    };

    const handleCertifiedApprovalConfirm = () => {
        setCertifiedApprovalConfirmed(true);
        setCertifiedApprovalModalOpened(false);
        setCertifiedApprovalCheckbox(false);
        // TODO: save approval status
    };

    const handleApprovedApprovalConfirm = () => {
        setApprovedApprovalConfirmed(true);
        setApprovedApprovalModalOpened(false);
        setApprovedApprovalCheckbox(false);
        // TODO: save approval status
    };

    const handleSubmit = async () => {
        // Validation
        if (!payee || !totalAmount || !date) {
            notifications.show({
                title: "Validation Error",
                message: "Please fill in all required fields.",
                color: "red",
            });
            return;
        }

        setIsSubmitting(true);
        try {
            // TODO: save disbursement voucher
            notifications.show({
                title: "Success",
                message: "Disbursement voucher created successfully!",
                color: "green",
            });
            // Navigate back to liquidation report or reports page
            handleClose();
        } catch (error) {
            customLogger.error("Failed to create disbursement voucher:", error);
            notifications.show({
                title: "Error",
                message: "Failed to create disbursement voucher. Please try again.",
                color: "red",
            });
        }
        setIsSubmitting(false);
    };

    if (isLoading) {
        return <LoadingComponent message="Loading disbursement voucher..." />;
    }

    return (
        <Container size="xl" py={{ base: "sm", sm: "md", lg: "xl" }}>
            <div className="max-w-7xl mx-auto p-4 sm:p-6">
                <Stack gap="lg">
                    {/* Header */}
                    <Flex justify="space-between" align="center" direction={{ base: "column", sm: "row" }} gap="md">
                        <Group gap="md">
                            <div className="p-2 bg-blue-100 rounded-lg">
                                <IconHistory size={28} />
                            </div>
                            <div>
                                <Title order={2} className="text-gray-800">
                                    Disbursement Voucher
                                </Title>
                                <Text size="sm" c="dimmed">
                                    {category
                                        ? `For ${report_type[category as keyof typeof report_type]}`
                                        : "Create disbursement voucher"}
                                </Text>
                            </div>
                        </Group>
                        <Group gap="md">
                            <ActionIcon
                                variant="subtle"
                                color="gray"
                                size="lg"
                                onClick={handleClose}
                                className="hover:bg-gray-100"
                            >
                                <IconX size={20} />
                            </ActionIcon>
                        </Group>
                    </Flex>

                    {/* Basic Information */}
                    <Card withBorder>
                        <Stack gap="md">
                            <Group justify="flex-end" gap="xl">
                                <Stack gap="xs">
                                    <Text size="xs" fw={700}>
                                        Fund Cluster:
                                    </Text>
                                    <TextInput
                                        value={fundCluster}
                                        onChange={(e) => setFundCluster(e.currentTarget.value)}
                                        size="sm"
                                        w={100}
                                        required
                                    />
                                </Stack>
                                <Stack gap="xs">
                                    <Text size="xs" fw={700}>
                                        Date:
                                    </Text>
                                    <DateInput
                                        value={date}
                                        onChange={(value) => setDate(value ? new Date(value) : null)}
                                        size="sm"
                                        w={120}
                                        required
                                    />
                                </Stack>
                                <Stack gap="xs">
                                    <Text size="xs" fw={700}>
                                        DV No.:
                                    </Text>
                                    <TextInput
                                        value={dvNo}
                                        onChange={(e) => setDvNo(e.currentTarget.value)}
                                        size="sm"
                                        w={120}
                                        required
                                    />
                                </Stack>
                            </Group>

                            <Divider my="xs" />

                            {/* Mode of Payment */}
                            <Group gap="md" align="center">
                                <Text size="sm" fw={700}>
                                    Mode of Payment:
                                </Text>
                                <Radio.Group value={modeOfPayment} onChange={setModeOfPayment}>
                                    <Group gap="md">
                                        <Radio value="mds" label="MDS Check" />
                                        <Radio value="commercial" label="Commercial Check" />
                                        <Radio value="ada" label="ADA" />
                                        <Radio value="others" label="Others (Please specify)" />
                                    </Group>
                                </Radio.Group>
                                {modeOfPayment === "others" && (
                                    <TextInput
                                        placeholder="Please specify..."
                                        value={otherPaymentMode}
                                        onChange={(e) => setOtherPaymentMode(e.currentTarget.value)}
                                        size="sm"
                                        w={150}
                                    />
                                )}
                            </Group>

                            <Divider my="xs" />

                            {/* Payee Information */}
                            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                                <TextInput
                                    label="Payee Information"
                                    value={payee}
                                    placeholder="Enter payee name"
                                    onChange={(e) => setPayee(e.currentTarget.value)}
                                    required
                                    styles={{
                                        label: { fontWeight: 700 },
                                    }}
                                />
                                <Group gap="md">
                                    <TextInput
                                        label="TIN/Employee No."
                                        value={tinEmployeeNo}
                                        placeholder="Enter TIN or Employee No."
                                        onChange={(e) => setTinEmployeeNo(e.currentTarget.value)}
                                        flex={1}
                                    />
                                    <TextInput
                                        label="ORS/BURS No."
                                        value={orsBursNo}
                                        placeholder="Enter ORS/BURS No."
                                        onChange={(e) => setOrsBursNo(e.currentTarget.value)}
                                        flex={1}
                                    />
                                </Group>
                            </SimpleGrid>
                            <TextInput
                                label="Address"
                                value={address}
                                placeholder="Enter payee address"
                                onChange={(e) => setAddress(e.currentTarget.value)}
                                required
                            />
                        </Stack>
                    </Card>

                    {/* Particulars */}
                    <Card withBorder>
                        <Stack gap="md">
                            <ScrollArea>
                                <Table striped withColumnBorders withRowBorders>
                                    <Table.Thead>
                                        <Table.Tr>
                                            <Table.Th w="60%">Particulars</Table.Th>
                                            <Table.Th w="15%" ta="center">
                                                Responsibility Center
                                            </Table.Th>
                                            <Table.Th w="15%" ta="center">
                                                MFO/PAP
                                            </Table.Th>
                                            <Table.Th w="10%" ta="center">
                                                Amount
                                            </Table.Th>
                                        </Table.Tr>
                                    </Table.Thead>
                                    <Table.Tbody>
                                        <Table.Tr>
                                            <Table.Td style={{ verticalAlign: "top" }} p="md">
                                                <Flex direction="column" justify="space-between" h={200}>
                                                    <Box>
                                                        <Text size="sm" mb="lg">
                                                            Representing payment for{" "}
                                                            {category
                                                                ? report_type[category as keyof typeof report_type]
                                                                : "expenses"}{" "}
                                                            for the period of {dayjs().format("MMMM YYYY")} amounting to{" "}
                                                            {numberToWords(totalAmount)} Pesos Only (
                                                            {totalAmount.toLocaleString("en-PH", {
                                                                style: "currency",
                                                                currency: "PHP",
                                                            })}
                                                            )
                                                        </Text>
                                                        <ScrollArea>
                                                            <Box mb="lg">
                                                                <Table>
                                                                    <Table.Thead>
                                                                        <Table.Tr>
                                                                            <Table.Th fz="xs" p="xs" ta="center">
                                                                                Account Name
                                                                            </Table.Th>
                                                                            <Table.Th fz="xs" p="xs" ta="center">
                                                                                Account Code
                                                                            </Table.Th>
                                                                            <Table.Th fz="xs" p="xs" ta="center">
                                                                                Gross
                                                                            </Table.Th>
                                                                            <Table.Th fz="xs" p="xs" ta="center">
                                                                                Tax
                                                                            </Table.Th>
                                                                            <Table.Th fz="xs" p="xs" ta="center">
                                                                                Net
                                                                            </Table.Th>
                                                                        </Table.Tr>
                                                                    </Table.Thead>
                                                                    <Table.Tbody>
                                                                        <Table.Tr>
                                                                            <Table.Td p="xs">
                                                                                <Text size="sm">
                                                                                    {category
                                                                                        ? report_type[
                                                                                              category as keyof typeof report_type
                                                                                          ]
                                                                                        : "N/A"}
                                                                                </Text>
                                                                            </Table.Td>
                                                                            <Table.Td p="xs">
                                                                                <TextInput
                                                                                    value={accountCode}
                                                                                    onChange={(e) =>
                                                                                        setAccountCode(
                                                                                            e.currentTarget.value
                                                                                        )
                                                                                    }
                                                                                    size="xs"
                                                                                    variant="filled"
                                                                                    placeholder="Enter code"
                                                                                    ta="center"
                                                                                />
                                                                            </Table.Td>
                                                                            <Table.Td p="xs">
                                                                                <NumberInput
                                                                                    value={grossAmount}
                                                                                    onChange={(value) =>
                                                                                        setGrossAmount(
                                                                                            Number(value) || 0
                                                                                        )
                                                                                    }
                                                                                    size="xs"
                                                                                    variant="filled"
                                                                                    hideControls
                                                                                    thousandSeparator=","
                                                                                    decimalScale={2}
                                                                                    fixedDecimalScale
                                                                                    ta="center"
                                                                                    placeholder="0.00"
                                                                                />
                                                                            </Table.Td>
                                                                            <Table.Td p="xs">
                                                                                <NumberInput
                                                                                    value={taxAmount}
                                                                                    onChange={(value) =>
                                                                                        setTaxAmount(Number(value) || 0)
                                                                                    }
                                                                                    size="xs"
                                                                                    variant="filled"
                                                                                    hideControls
                                                                                    thousandSeparator=","
                                                                                    decimalScale={2}
                                                                                    fixedDecimalScale
                                                                                    ta="center"
                                                                                    placeholder="0.00"
                                                                                />
                                                                            </Table.Td>
                                                                            <Table.Td p="xs" ta="center">
                                                                                <Text fw={500} size="sm">
                                                                                    {netAmount.toLocaleString("en-PH", {
                                                                                        minimumFractionDigits: 2,
                                                                                        maximumFractionDigits: 2,
                                                                                    })}
                                                                                </Text>
                                                                            </Table.Td>
                                                                        </Table.Tr>
                                                                    </Table.Tbody>
                                                                </Table>
                                                            </Box>
                                                        </ScrollArea>
                                                    </Box>
                                                    <Box ta="center">
                                                        <Text fw={700} size="sm">
                                                            Amount Due
                                                        </Text>
                                                    </Box>
                                                </Flex>
                                            </Table.Td>
                                            <Table.Td style={{ verticalAlign: "top" }} p="md">
                                                <Textarea
                                                    value={responsibilityCenter}
                                                    onChange={(e) => setResponsibilityCenter(e.currentTarget.value)}
                                                    size="sm"
                                                    variant="filled"
                                                    placeholder="Enter responsibility center"
                                                    autosize
                                                    minRows={8}
                                                    resize="vertical"
                                                />
                                            </Table.Td>
                                            <Table.Td style={{ verticalAlign: "top" }} p="md">
                                                <Textarea
                                                    value={mfoPap}
                                                    onChange={(e) => setMfoPap(e.currentTarget.value)}
                                                    size="sm"
                                                    variant="filled"
                                                    placeholder="Enter MFO/PAP details"
                                                    autosize
                                                    minRows={8}
                                                    resize="vertical"
                                                />
                                            </Table.Td>
                                            <Table.Td style={{ verticalAlign: "top" }} p="md" ta="right">
                                                <Flex direction="column" justify="space-between" h={200}>
                                                    <Text fw={500} size="sm">
                                                        {totalAmount.toLocaleString("en-PH", {
                                                            minimumFractionDigits: 2,
                                                            maximumFractionDigits: 2,
                                                        })}
                                                    </Text>
                                                    <Box
                                                        style={{ borderTop: "1px solid var(--mantine-color-gray-4)" }}
                                                        pt="xs"
                                                    >
                                                        <Text fw={600} size="sm">
                                                            {totalAmount.toLocaleString("en-PH", {
                                                                minimumFractionDigits: 2,
                                                                maximumFractionDigits: 2,
                                                            })}
                                                        </Text>
                                                    </Box>
                                                </Flex>
                                            </Table.Td>
                                        </Table.Tr>
                                    </Table.Tbody>
                                </Table>
                            </ScrollArea>
                        </Stack>
                    </Card>

                    {/* Certified Signature Section */}
                    <Card withBorder>
                        <Stack gap="md">
                            <Group justify="space-between" align="flex-start">
                                <Group gap="sm">
                                    <Text fw={500}>
                                        A. Certified: Expenses/Cash Advance necessary, lawful and incurred under my
                                        direct supervision
                                    </Text>
                                    <Badge size="sm" color={certifiedByUser ? "yellow" : "gray"} variant="light">
                                        {certifiedByUser ? "Selected" : "Not Selected"}
                                    </Badge>
                                </Group>
                                <Button size="xs" variant="light" onClick={() => openUserSelectModal("certified")}>
                                    {certifiedByUser ? "Change User" : "Select User"}
                                </Button>
                            </Group>
                            <Stack gap="sm" align="center">
                                <Box
                                    w={200}
                                    h={80}
                                    style={{
                                        border: "1px solid #dee2e6",
                                        borderRadius: "8px",
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        backgroundColor: "#f8f9fa",
                                        overflow: "hidden",
                                    }}
                                >
                                    {certifiedApprovalConfirmed && certifiedBySignatureUrl ? (
                                        <Image
                                            src={certifiedBySignatureUrl}
                                            alt="Certified signature"
                                            fit="contain"
                                            w="100%"
                                            h="100%"
                                        />
                                    ) : (
                                        <Stack align="center" gap="xs">
                                            <Text size="xs" c="dimmed">
                                                {certifiedByUser ? "Awaiting Approval" : "Signature"}
                                            </Text>
                                        </Stack>
                                    )}
                                </Box>
                                <div style={{ textAlign: "center" }}>
                                    <Text fw={600} size="sm">
                                        {certifiedByUser
                                            ? `${certifiedByUser.nameFirst} ${certifiedByUser.nameLast}`.trim()
                                            : "NAME"}
                                    </Text>
                                    <Text size="xs" c="dimmed">
                                        {certifiedByUser?.position || "Position"}
                                    </Text>
                                    {certifiedByUser &&
                                        !certifiedApprovalConfirmed &&
                                        certifiedByUser.id === userCtx.userInfo?.id && (
                                            <Button
                                                size="xs"
                                                variant="light"
                                                color="blue"
                                                onClick={openCertifiedApprovalModal}
                                                disabled={!certifiedByUser.signatureUrn}
                                                mt="xs"
                                                mb="xs"
                                            >
                                                Approve & Sign
                                            </Button>
                                        )}
                                </div>
                            </Stack>
                        </Stack>
                    </Card>

                    {/* Accounting Entry */}
                    <Card withBorder>
                        <Stack gap="xs">
                            <Group gap="xs" align="center">
                                <Text fw={500}>B. Accounting Entry</Text>
                            </Group>
                            <Table striped={false} withTableBorder withColumnBorders withRowBorders>
                                <Table.Thead>
                                    <Table.Tr>
                                        <Table.Th ta="center" fw={500} p="sm">
                                            Account Title
                                        </Table.Th>
                                        <Table.Th ta="center" fw={500} p="sm" w={120}>
                                            UACS Code
                                        </Table.Th>
                                        <Table.Th ta="center" fw={500} p="sm" w={120}>
                                            Debit
                                        </Table.Th>
                                        <Table.Th ta="center" fw={500} p="sm" w={120}>
                                            Credit
                                        </Table.Th>
                                    </Table.Tr>
                                </Table.Thead>
                                <Table.Tbody>
                                    <Table.Tr>
                                        <Table.Td p="sm">
                                            <Text size="sm">
                                                {category
                                                    ? report_type[category as keyof typeof report_type]
                                                    : "Administrative Expense"}
                                            </Text>
                                        </Table.Td>
                                        <Table.Td p="xs">
                                            <TextInput placeholder="" size="xs" variant="unstyled" />
                                        </Table.Td>
                                        <Table.Td p="sm" ta="right">
                                            <Text size="sm" fw={500}>
                                                {totalAmount.toLocaleString("en-US", {
                                                    minimumFractionDigits: 2,
                                                    maximumFractionDigits: 2,
                                                })}
                                            </Text>
                                        </Table.Td>
                                        <Table.Td p="sm" ta="center"></Table.Td>
                                    </Table.Tr>
                                    <Table.Tr>
                                        <Table.Td p="sm">
                                            <Text size="sm">Advances for Operating Expenses</Text>
                                        </Table.Td>
                                        <Table.Td p="sm" ta="center">
                                            <Text size="sm">1-99-01-010</Text>
                                        </Table.Td>
                                        <Table.Td p="sm" ta="center"></Table.Td>
                                        <Table.Td p="sm" ta="right">
                                            <Text size="sm" fw={500}>
                                                {totalAmount.toLocaleString("en-US", {
                                                    minimumFractionDigits: 2,
                                                    maximumFractionDigits: 2,
                                                })}
                                            </Text>
                                        </Table.Td>
                                    </Table.Tr>
                                </Table.Tbody>
                            </Table>
                        </Stack>
                    </Card>

                    {/* Certified and Approved Section */}
                    <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
                        {/* Certified Card */}
                        <Card withBorder p="md">
                            <Stack gap="md">
                                <Text fw={500}>C. Certified:</Text>

                                <Stack gap="xs" pl="md">
                                    <Checkbox
                                        label="Cash available"
                                        checked={cashAvailable}
                                        onChange={(event) => setCashAvailable(event.currentTarget.checked)}
                                        size="sm"
                                    />
                                    <Checkbox
                                        label="Subject to Authority to Debit Account (when applicable)"
                                        checked={subjectToAuthority}
                                        onChange={(event) => setSubjectToAuthority(event.currentTarget.checked)}
                                        size="sm"
                                    />
                                    <Checkbox
                                        label="Supporting documents complete and amount claimed proper"
                                        checked={supportingDocuments}
                                        onChange={(event) => setSupportingDocuments(event.currentTarget.checked)}
                                        size="sm"
                                    />
                                </Stack>

                                {/* Certified Signature */}
                                <Card withBorder>
                                    <Stack gap="md">
                                        <Text>Prepared by</Text>
                                        <Stack gap="sm" align="center">
                                            <Box
                                                w={200}
                                                h={80}
                                                style={{
                                                    border: "1px solid #dee2e6",
                                                    borderRadius: "8px",
                                                    display: "flex",
                                                    alignItems: "center",
                                                    justifyContent: "center",
                                                    backgroundColor: "#f8f9fa",
                                                    overflow: "hidden",
                                                }}
                                            >
                                                {currentUserSignatureUrl ? (
                                                    <Image
                                                        src={currentUserSignatureUrl}
                                                        alt="User signature"
                                                        fit="contain"
                                                        w="100%"
                                                        h="100%"
                                                    />
                                                ) : (
                                                    <Text size="xs" c="dimmed">
                                                        No Signature
                                                    </Text>
                                                )}
                                            </Box>
                                            <div style={{ textAlign: "center" }}>
                                                <Text fw={600} size="sm">
                                                    {userCtx.userInfo
                                                        ? `${userCtx.userInfo.nameFirst || ""} ${
                                                              userCtx.userInfo.nameLast || ""
                                                          }`.trim()
                                                        : "NAME"}
                                                </Text>
                                                <Text size="xs" c="dimmed">
                                                    {userCtx.userInfo?.position || "Position"}
                                                </Text>
                                            </div>
                                        </Stack>
                                    </Stack>
                                </Card>
                            </Stack>
                        </Card>
                        {/* Approved for Payment Card */}
                        <Card withBorder p="md">
                            <Stack gap="md">
                                <Group justify="space-between" align="flex-start">
                                    <Group gap="sm">
                                        <Text fw={500}>D. Approved for Payment</Text>
                                        <Badge size="sm" color={approvedByUser ? "yellow" : "gray"} variant="light">
                                            {approvedByUser ? "Selected" : "Not Selected"}
                                        </Badge>
                                    </Group>
                                    <Button size="xs" variant="light" onClick={() => openUserSelectModal("approved")}>
                                        {approvedByUser ? "Change User" : "Select User"}
                                    </Button>
                                </Group>

                                <Stack gap="xs" align="center" mt="md">
                                    <Text size="sm" fw={500}>
                                        Signature
                                    </Text>
                                    <Box
                                        w={200}
                                        h={80}
                                        style={{
                                            border: "1px solid #dee2e6",
                                            borderRadius: "8px",
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "center",
                                            backgroundColor: "#f8f9fa",
                                            overflow: "hidden",
                                        }}
                                    >
                                        {approvedApprovalConfirmed && approvedBySignatureUrl ? (
                                            <Image
                                                src={approvedBySignatureUrl}
                                                alt="Approved signature"
                                                fit="contain"
                                                w="100%"
                                                h="100%"
                                            />
                                        ) : (
                                            <Stack align="center" gap="xs">
                                                <Text size="xs" c="dimmed">
                                                    {approvedByUser ? "Awaiting Approval" : "Signature"}
                                                </Text>
                                            </Stack>
                                        )}
                                    </Box>
                                    <Stack gap="xs" align="center">
                                        <Text fw={600} size="sm">
                                            {approvedByUser
                                                ? `${approvedByUser.nameFirst} ${approvedByUser.nameLast}`.trim()
                                                : "NAME"}
                                        </Text>
                                        <Text size="xs" c="dimmed">
                                            {approvedByUser?.position || "Position"}
                                        </Text>
                                        <Text size="xs" c="dimmed">
                                            Agency Head/Authorized Representative
                                        </Text>
                                        {approvedByUser &&
                                            !approvedApprovalConfirmed &&
                                            approvedByUser.id === userCtx.userInfo?.id && (
                                                <Button
                                                    size="xs"
                                                    variant="light"
                                                    color="blue"
                                                    onClick={openApprovedApprovalModal}
                                                    disabled={!approvedByUser.signatureUrn}
                                                    mt="xs"
                                                    mb="xs"
                                                >
                                                    Approve & Sign
                                                </Button>
                                            )}
                                    </Stack>
                                </Stack>
                            </Stack>
                        </Card>
                    </SimpleGrid>

                    {/* Receipt of Payment Section */}
                    <Card withBorder>
                        <Stack gap="lg">
                            <Text fw={500}>E. Receipt of Payment</Text>

                            {/* Payment Details */}
                            <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="md">
                                <TextInput
                                    label="Check/ADA No."
                                    value={checkAdaNo}
                                    onChange={(e) => setCheckAdaNo(e.currentTarget.value)}
                                    placeholder="Enter check or ADA number"
                                    size="sm"
                                />
                                <DateInput
                                    label="Date Received"
                                    value={receiptDate}
                                    onChange={(value) => setReceiptDate(value ? new Date(value) : null)}
                                    size="sm"
                                    placeholder="Select receipt date"
                                    required
                                />
                                <TextInput
                                    label="Bank Name & Account Number"
                                    value={bankNameAccount}
                                    onChange={(e) => setBankNameAccount(e.currentTarget.value)}
                                    placeholder="Enter bank name and account number"
                                    size="sm"
                                />
                            </SimpleGrid>
                            <TextInput
                                label="JEV No."
                                value={jevNo}
                                onChange={(e) => setJevNo(e.currentTarget.value)}
                                placeholder="Enter Journal Entry Voucher number"
                                size="sm"
                            />

                            {/* Payee Signature */}
                            <Card withBorder p="md" bg="gray.0">
                                <Stack gap="md">
                                    <Text fw={500}>Payee Acknowledgment</Text>
                                    {/* Signature Area */}
                                    <Stack gap="sm" align="center">
                                        <Text size="sm" fw={500} c="dimmed">
                                            Signature
                                        </Text>
                                        <Box
                                            w={250}
                                            h={100}
                                            style={{
                                                border: "2px solid #dee2e6",
                                                borderRadius: "8px",
                                                display: "flex",
                                                alignItems: "center",
                                                justifyContent: "center",
                                                backgroundColor: "white",
                                                cursor: "pointer",
                                                position: "relative",
                                            }}
                                            onClick={() => setPayeeSignatureModalOpened(true)}
                                        >
                                            {payeeSignature ? (
                                                <Image
                                                    src={payeeSignature}
                                                    alt="Payee signature"
                                                    fit="contain"
                                                    w="100%"
                                                    h="100%"
                                                />
                                            ) : (
                                                <Text size="xs" c="dimmed" ta="center">
                                                    Click to sign
                                                </Text>
                                            )}
                                        </Box>

                                        {/* Payee name and signature date */}
                                        <Stack gap="xs" align="center">
                                            <Text size="sm" fw={500}>
                                                {payee}
                                            </Text>
                                            {payeeSignature && signatureDate && (
                                                <Text size="xs" c="dimmed">
                                                    {dayjs(signatureDate).format("MM/DD/YYYY")}
                                                </Text>
                                            )}
                                        </Stack>
                                    </Stack>
                                </Stack>
                            </Card>

                            {/* Official Receipt Label */}
                            <Card withBorder p="sm">
                                <Stack gap="xs">
                                    <Text size="sm" fw={500}>
                                        Official Receipt No. & Date/Other Documents
                                    </Text>
                                </Stack>
                            </Card>
                        </Stack>
                    </Card>

                    {/* Action Buttons */}
                    <Group justify="flex-end" gap="md">
                        <Button variant="outline" onClick={handleClose} disabled={isSubmitting}>
                            Cancel
                        </Button>
                        <Button
                            leftSection={<IconFileText size={16} />}
                            onClick={handleSubmit}
                            disabled={isSubmitting || !payee || !totalAmount}
                            loading={isSubmitting}
                        >
                            {isSubmitting ? "Creating..." : "Create Disbursement Voucher"}
                        </Button>
                    </Group>

                    {/* User Selection Modal */}
                    <Modal
                        opened={userSelectModalOpened}
                        onClose={() => setUserSelectModalOpened(false)}
                        title={`Select User for ${selectingFor === "certified" ? "Certification" : "Approval"}`}
                        size="lg"
                    >
                        <Stack gap="md">
                            <TextInput
                                placeholder="Search users..."
                                leftSection={<IconSearch size={16} />}
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.currentTarget.value)}
                            />
                            <div style={{ maxHeight: "300px", overflowY: "auto" }}>
                                {(() => {
                                    const filteredUsers = schoolUsers.filter(
                                        (user) =>
                                            `${user.nameFirst} ${user.nameLast}`
                                                .toLowerCase()
                                                .includes(searchTerm.toLowerCase()) ||
                                            (user.position || "").toLowerCase().includes(searchTerm.toLowerCase())
                                    );
                                    return filteredUsers.length === 0 ? (
                                        <Text size="sm" c="dimmed" ta="center" py="md">
                                            No users found
                                        </Text>
                                    ) : (
                                        <Stack gap="xs">
                                            {filteredUsers.map((user) => (
                                                <Card
                                                    key={user.id}
                                                    withBorder
                                                    p="sm"
                                                    style={{
                                                        cursor: "pointer",
                                                        transition: "all 0.2s ease",
                                                    }}
                                                    className="hover:bg-gray-50"
                                                    onClick={() => handleUserSelect(user)}
                                                >
                                                    <Group justify="space-between" align="center">
                                                        <div>
                                                            <Text fw={500} size="sm">
                                                                {`${user.nameFirst} ${user.nameLast}`.trim()}
                                                            </Text>
                                                            <Text size="xs" c="dimmed">
                                                                {user.position || "No position"}
                                                            </Text>
                                                        </div>
                                                        <Badge
                                                            variant="light"
                                                            color={user.signatureUrn ? "green" : "gray"}
                                                            size="xs"
                                                        >
                                                            {user.signatureUrn ? "Has Signature" : "No Signature"}
                                                        </Badge>
                                                    </Group>
                                                </Card>
                                            ))}
                                        </Stack>
                                    );
                                })()}
                            </div>
                        </Stack>
                    </Modal>

                    {/* Signature Canvas Modal */}
                    <Modal
                        opened={payeeSignatureModalOpened}
                        onClose={() => {
                            setPayeeSignatureModalOpened(false);
                        }}
                        title={
                            <Group gap="sm">
                                <IconEdit size={20} />
                                <Text fw={500}>{`Signature for ${payee || "Payee"}`}</Text>
                            </Group>
                        }
                        centered
                        size="md"
                    >
                        <Stack gap="md">
                            <div>
                                <Text size="sm" fw={500} mb="sm">
                                    Please sign below to acknowledge payment:
                                </Text>
                                <SignatureCanvas
                                    onSave={saveSignature}
                                    onCancel={() => {
                                        setPayeeSignatureModalOpened(false);
                                    }}
                                    width={400}
                                    height={150}
                                />
                            </div>
                        </Stack>
                    </Modal>

                    {/* Certified Approval Modal */}
                    <Modal
                        opened={certifiedApprovalModalOpened}
                        onClose={() => {
                            setCertifiedApprovalModalOpened(false);
                            setCertifiedApprovalCheckbox(false);
                        }}
                        title={
                            <Group gap="sm">
                                <Text fw={500}>Approve Certification</Text>
                            </Group>
                        }
                        centered
                        size="md"
                    >
                        <Stack gap="md">
                            <Alert
                                variant="light"
                                color="blue"
                                title="Important Notice"
                                icon={<IconAlertCircle size={16} />}
                            >
                                You are about to certify this disbursement voucher as{" "}
                                <strong>
                                    {certifiedByUser?.nameFirst} {certifiedByUser?.nameLast}
                                </strong>
                                . This action will apply your digital signature to the document.
                            </Alert>

                            <Text size="sm">By certifying this voucher, you confirm that:</Text>

                            <Stack gap="xs" pl="md">
                                <Text size="sm">
                                    • Expenses/Cash Advance are necessary, lawful and incurred under your direct
                                    supervision
                                </Text>
                                <Text size="sm">• You have reviewed all entries and data</Text>
                                <Text size="sm">• The information is accurate and complete</Text>
                                <Text size="sm">• You authorize the use of the digital signature</Text>
                            </Stack>

                            <Checkbox
                                label="I confirm that I have the authority to certify this voucher and apply the digital signature"
                                checked={certifiedApprovalCheckbox}
                                onChange={(event) => setCertifiedApprovalCheckbox(event.currentTarget.checked)}
                            />

                            <Group justify="flex-end" gap="sm">
                                <Button
                                    variant="outline"
                                    onClick={() => {
                                        setCertifiedApprovalModalOpened(false);
                                        setCertifiedApprovalCheckbox(false);
                                    }}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    onClick={handleCertifiedApprovalConfirm}
                                    disabled={!certifiedApprovalCheckbox}
                                    color="green"
                                >
                                    Certify & Sign
                                </Button>
                            </Group>
                        </Stack>
                    </Modal>

                    {/* Approved for Payment Modal */}
                    <Modal
                        opened={approvedApprovalModalOpened}
                        onClose={() => {
                            setApprovedApprovalModalOpened(false);
                            setApprovedApprovalCheckbox(false);
                        }}
                        title={
                            <Group gap="sm">
                                <Text fw={500}>Approve for Payment</Text>
                            </Group>
                        }
                        centered
                        size="md"
                    >
                        <Stack gap="md">
                            <Alert
                                variant="light"
                                color="blue"
                                title="Important Notice"
                                icon={<IconAlertCircle size={16} />}
                            >
                                You are about to approve this disbursement voucher for payment as{" "}
                                <strong>
                                    {approvedByUser?.nameFirst} {approvedByUser?.nameLast}
                                </strong>
                                . This action will apply your digital signature to the document.
                            </Alert>

                            <Text size="sm">By approving this voucher for payment, you confirm that:</Text>

                            <Stack gap="xs" pl="md">
                                <Text size="sm">• You have reviewed all entries and data</Text>
                                <Text size="sm">• The disbursement is authorized and proper</Text>
                                <Text size="sm">• The information is accurate and complete</Text>
                                <Text size="sm">• You authorize the use of the digital signature</Text>
                            </Stack>

                            <Checkbox
                                label="I confirm that I have the authority to approve this voucher for payment and apply the digital signature"
                                checked={approvedApprovalCheckbox}
                                onChange={(event) => setApprovedApprovalCheckbox(event.currentTarget.checked)}
                            />

                            <Group justify="flex-end" gap="sm">
                                <Button
                                    variant="outline"
                                    onClick={() => {
                                        setApprovedApprovalModalOpened(false);
                                        setApprovedApprovalCheckbox(false);
                                    }}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    onClick={handleApprovedApprovalConfirm}
                                    disabled={!approvedApprovalCheckbox}
                                    color="green"
                                >
                                    Approve & Sign
                                </Button>
                            </Group>
                        </Stack>
                    </Modal>
                </Stack>
            </div>
        </Container>
    );
}

export default function DisbursementVoucherPage() {
    return (
        <Suspense fallback={<LoadingComponent />}>
            <DisbursementVoucherContent />
        </Suspense>
    );
}
