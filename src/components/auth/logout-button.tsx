"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export function LogoutButton() {
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
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleLogout}
        disabled={loading}
        aria-busy={loading}
        className="inline-flex h-10 items-center justify-center rounded-md border border-line-strong bg-surface px-5 text-sm font-medium text-fg transition-colors hover:bg-bg disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? "Sedang keluar..." : "Logout"}
      </button>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
