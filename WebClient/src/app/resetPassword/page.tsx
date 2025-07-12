import { ResetPasswordComponent } from "@/components/ResetPasswordComponent/ResetPasswordComponent";
import { customLogger } from "@/lib/api/customLogger";

/**
 * Reset password page component.
 * @returns {JSX.Element} The rendered component.
 */
export default function ResetPasswordPage() {
    customLogger.debug("Rendering ResetPasswordPage");
    return <ResetPasswordComponent />;
}
