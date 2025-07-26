"use client";

import { Button } from "@mantine/core";
import { IconSend } from "@tabler/icons-react";
import { useState } from "react";
import { useUser } from "@/lib/providers/user";
import { SubmitForReviewModal } from "../SplitButton/SubmitForReviewModal";

interface SubmitForReviewButtonProps {
    reportType: "daily" | "payroll" | "liquidation" | "monthly";
    reportPeriod: {
        schoolId: number;
        year: number;
        month: number;
        category?: string; // For liquidation reports
    };
    onSuccess?: () => void;
    disabled?: boolean;
    variant?: "filled" | "light" | "outline" | "subtle" | "default" | "gradient" | "transparent" | "white";
    size?: "xs" | "sm" | "md" | "lg" | "xl";
    className?: string;
}

export function SubmitForReviewButton({
    reportType,
    reportPeriod,
    onSuccess,
    disabled = false,
    variant = "filled",
    size = "sm",
    className = "",
}: SubmitForReviewButtonProps) {
    const [modalOpened, setModalOpened] = useState(false);
    const userCtx = useUser();

    // Only show for Canteen Managers (roleId: 5)
    const isCanteenManager = userCtx.userInfo?.roleId === 5;

    if (!isCanteenManager) {
        return null;
    }

    const handleSuccess = () => {
        setModalOpened(false);
        if (onSuccess) {
            onSuccess();
        }
    };

    return (
        <>
            <Button
                leftSection={<IconSend size={16} />}
                variant={variant}
                size={size}
                color="blue"
                onClick={() => setModalOpened(true)}
                disabled={disabled}
                className={className}
            >
                Submit for Review
            </Button>

            <SubmitForReviewModal
                opened={modalOpened}
                onClose={() => setModalOpened(false)}
                reportType={reportType}
                reportPeriod={reportPeriod}
                onSuccess={handleSuccess}
            />
        </>
    );
}
