import type { Metadata } from "next";
import { ResetPasswordForm } from "@/app/lib/components/auth/reset-password-form";

export const metadata: Metadata = { title: "Choose a new password", robots: { index: false } };

// The page the link in the reset email opens. The token is only read by the form, on submit; opening the link spends nothing.
export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#12170d] px-4 text-white">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-white/[0.03] p-8">
        <ResetPasswordForm token={token ?? ""} />
      </div>
    </div>
  );
}
