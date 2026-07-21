"use client";

import Link from "next/link";
import { useState } from "react";

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
        <p className="text-gray-700 dark:text-gray-300">
          If that email is registered, a reset link is on its way.
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Running locally with the console mail backend? The link is printed in
          the backend terminal.
        </p>
        <Link href="/login" className="inline-block text-blue-600 hover:underline dark:text-blue-400">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <p className="text-sm text-gray-600 dark:text-gray-400">
        Enter your email and we&apos;ll send a link to choose a new password.
      </p>
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          Email
        </label>
        <input
          id="email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
        />
      </div>
      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? "Sending…" : "Send reset link"}
      </button>
      <p className="text-center text-sm">
        <Link href="/login" className="text-blue-600 hover:underline dark:text-blue-400">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
