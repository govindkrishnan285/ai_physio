"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import {
  ERROR_BOX,
  FIELD,
  HINT,
  LABEL,
  LINK,
  PRIMARY_BUTTON,
} from "@/components/auth/formStyles";
import { api } from "@/lib/api";

function ResetForm() {
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";

  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.resetPassword(token, password);
      setDone(true);
      setTimeout(() => router.replace("/login"), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reset the password.");
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <div className="space-y-4 text-sm">
        <p className="text-red-300">
          This reset link is missing its token.
        </p>
        <Link href="/forgot-password" className={LINK}>
          Request a new link
        </Link>
      </div>
    );
  }

  if (done) {
    return (
      <p className="text-sm text-slate-300">
        Password updated. Redirecting to sign in…
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label htmlFor="password" className={LABEL}>
          New password
        </label>
        <input
          id="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={FIELD}
        />
        <p className={HINT}>
          At least 8 characters, mixing letters with digits or symbols.
        </p>
      </div>

      {error && (
        <p role="alert" className={ERROR_BOX}>
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={busy}
        className={PRIMARY_BUTTON}
      >
        {busy ? "Updating…" : "Set new password"}
      </button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="text-sm text-slate-500">Loading…</div>}>
      <ResetForm />
    </Suspense>
  );
}
