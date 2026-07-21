"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import {
  ERROR_BOX,
  FIELD,
  LABEL,
  LINK,
  PRIMARY_BUTTON,
} from "@/components/auth/formStyles";
import { useAuth } from "@/context/AuthContext";

function LoginForm() {
  const { signIn } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await signIn(email, password);
      // signIn routes to the role's home; honour an explicit ?next when the
      // user was bounced here from a protected page.
      if (next) router.replace(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign in.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-white">Welcome back</h2>
        <p className="mt-1 text-sm text-slate-400">
          Sign in to continue your rehabilitation.
        </p>
      </div>

      <div>
        <label htmlFor="email" className={LABEL}>
          Email
        </label>
        <input
          id="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={FIELD}
        />
      </div>

      <div>
        <div className="flex items-center justify-between">
          <label htmlFor="password" className={LABEL}>
            Password
          </label>
          <Link href="/forgot-password" className={`text-xs ${LINK}`}>
            Forgot password?
          </Link>
        </div>
        <input
          id="password"
          type="password"
          required
          autoComplete="current-password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={FIELD}
        />
      </div>

      {error && (
        <p role="alert" className={ERROR_BOX}>
          {error}
        </p>
      )}

      <button type="submit" disabled={busy} className={PRIMARY_BUTTON}>
        {busy ? "Signing in…" : "Sign in"}
      </button>

      <p className="text-center text-sm text-slate-400">
        No account?{" "}
        <Link href="/register" className={LINK}>
          Create one
        </Link>
      </p>
    </form>
  );
}

export default function LoginPage() {
  // useSearchParams needs a Suspense boundary to avoid opting the whole route
  // into client-side rendering.
  return (
    <Suspense
      fallback={<div className="text-sm text-slate-500">Loading…</div>}
    >
      <LoginForm />
    </Suspense>
  );
}
