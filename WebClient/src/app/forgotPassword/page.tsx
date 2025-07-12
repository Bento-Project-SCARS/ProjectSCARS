import { ForgotPasswordComponent } from "@/components/ForgotPasswordComponent/ForgotPasswordComponent";
import { customLogger } from "@/lib/api/customLogger";

/**
 * Forgot password page component.
 * @returns {JSX.Element} The rendered component.
 */
export default function ForgotPasswordPage() {
    customLogger.debug("Rendering ForgotPasswordPage");
    return <ForgotPasswordComponent />;
}
