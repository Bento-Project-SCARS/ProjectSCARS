"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { AuthProvider, useAuth } from "@/lib/auth";

/// Wrapper for the entire page
// to enable the use of the AuthProvider
export default function Login() {
  return (
    <AuthProvider>
      <LogoutPage />
    </AuthProvider>
  );
}

function LogoutPage() {
  const { logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    logout();
    router.push("/");
  }, [logout, router]);

  return (
    <div>
      <p>You have logged out successfully.</p>
    </div>
  );
}
