"use client";

import { type ReactNode, useState } from "react";
import { authClient } from "@/lib/auth-client";

type LogoutButtonProps = {
  /** The default appearance is preserved for authentication and admin screens. */
  variant?: "default" | "sidebar";
  icon?: ReactNode;
};

export function LogoutButton({
  variant = "default",
  icon,
}: LogoutButtonProps = {}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleLogout() {
    if (loading) return;

    setLoading(true);
    setError("");

    try {
      const result = await authClient.signOut();

      if (result.error) {
        setError("Gagal keluar. Silakan coba lagi.");
        return;
      }

      window.location.replace("/login");
    } catch {
      setError("Koneksi bermasalah. Silakan coba lagi.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={variant === "sidebar" ? "mt-1 space-y-1" : "space-y-2"}>
      <button
        type="button"
        onClick={handleLogout}
        disabled={loading}
        aria-busy={loading}
        className={
          variant === "sidebar"
            ? "flex h-8 w-full items-center gap-2 rounded-md px-2.5 text-left text-[13px] text-fg/80 transition-colors hover:bg-bg disabled:cursor-not-allowed disabled:opacity-60"
            : "inline-flex h-10 items-center justify-center rounded-md border border-line-strong bg-surface px-5 text-sm font-medium text-fg transition-colors hover:bg-bg disabled:cursor-not-allowed disabled:opacity-60"
        }
      >
        {variant === "sidebar" && icon}
        {loading
          ? "Sedang keluar..."
          : variant === "sidebar"
            ? "Keluar"
            : "Logout"}
      </button>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
