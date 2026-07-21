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
import { useAuth } from "@/context/AuthContext";
import { api, Role } from "@/lib/api";

export default function RegisterPage() {
  const { signIn } = useAuth();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // Administrators are created out-of-band, so the public form offers only
  // these two.
  const [role, setRole] = useState<Role>("patient");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.register({ email, password, full_name: fullName, role });
      // Registration doesn't return tokens, and email verification isn't
      // required to use the app yet, so sign straight in.
      await signIn(email, password);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not create the account."
      );
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-white">Create your account</h2>
        <p className="mt-1 text-sm text-slate-400">
          Start tracking your recovery in real time.
        </p>
      </div>

      <div>
        <label htmlFor="name" className={LABEL}>
          Full name
        </label>
        <input
          id="name"
          required
          autoComplete="name"
          placeholder="Jane Doe"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          className={FIELD}
        />
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
        <label htmlFor="password" className={LABEL}>
          Password
        </label>
        <input
          id="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={FIELD}
        />
        <p className={HINT}>
          At least 8 characters, mixing letters with digits or symbols.
        </p>
      </div>

      <div>
        <label htmlFor="role" className={LABEL}>
          I am a
        </label>
        <select
          id="role"
          value={role}
          onChange={(e) => setRole(e.target.value as Role)}
          className={FIELD}
        >
          <option value="patient">Patient</option>
          <option value="therapist">Physiotherapist</option>
        </select>
      </div>

      {error && (
        <p role="alert" className={ERROR_BOX}>
          {error}
        </p>
      )}

      <button type="submit" disabled={busy} className={PRIMARY_BUTTON}>
        {busy ? "Creating account…" : "Create account"}
      </button>

      <p className="text-center text-sm text-slate-400">
        Already registered?{" "}
        <Link href="/login" className={LINK}>
          Sign in
        </Link>
      </p>
    </form>
  );
}
