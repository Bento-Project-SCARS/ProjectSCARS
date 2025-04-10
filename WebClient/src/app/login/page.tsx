"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { LoginForm } from "@/components/login-form";
import { useAuth, AuthProvider } from "@/lib/auth";

/// Wrapper for the entire page
// to enable the use of the AuthProvider
export default function Login() {
  return (
    <AuthProvider>
      <LoginPage />
    </AuthProvider>
  );
}
function LoginPage() {
  const { is_authenticated } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (is_authenticated) {
      router.push("/"); // Redirect to index if already authenticated
    }
  }, [is_authenticated, router]);

  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <LoginForm />
      </div>
    </div>
  );
}
