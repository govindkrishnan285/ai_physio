"use client";

import Link from "next/link";
import { useState } from "react";

import {
  ERROR_BOX,
  FIELD,
  HINT,
  LABEL,
  LINK,
  PRIMARY_BUTTON,
} from "@/components/auth/formStyles";
import { api } from "@/lib/api";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.forgotPassword(email);
    } catch {
      // The endpoint answers identically for registered and unregistered
      // addresses; surfacing an error here would undo that.
    }
    setSent(true);
    setBusy(false);
  }

  if (sent) {
    return (
      <div className="space-y-4 text-sm">
        <p className="text-slate-300">
          If that email is registered, a reset link is on its way.
        </p>
        <p className="text-xs text-slate-500">
          Running locally with the console mail backend? The link is printed in
          the backend terminal.
        </p>
        <Link href="/login" className={`inline-block ${LINK}`}>
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <p className="text-sm text-slate-400">
        Enter your email and we&apos;ll send a link to choose a new password.
      </p>
      <div>
        <label htmlFor="email" className={LABEL}>
          Email
        </label>
        <input
          id="email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={FIELD}
        />
      </div>
      <button
        type="submit"
        disabled={busy}
        className={PRIMARY_BUTTON}
      >
        {busy ? "Sending…" : "Send reset link"}
      </button>
      <p className="text-center text-sm">
        <Link href="/login" className={LINK}>
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
