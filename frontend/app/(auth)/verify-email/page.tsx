"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { api } from "@/lib/api";

function VerifyInner() {
  const token = useSearchParams().get("token") ?? "";
  const [state, setState] = useState<"working" | "ok" | "failed">("working");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) {
      setState("failed");
      setMessage("This verification link is missing its token.");
      return;
    }
    api
      .verifyEmail(token)
      .then(() => setState("ok"))
      .catch((err) => {
        setState("failed");
        setMessage(err instanceof Error ? err.message : "Verification failed.");
      });
  }, [token]);

  return (
    <div className="space-y-4 text-sm">
      {state === "working" && (
        <p className="text-gray-600 dark:text-gray-400">Verifying your email…</p>
      )}
      {state === "ok" && (
        <p className="text-green-700 dark:text-green-400">
          Email verified. Your account is now active.
        </p>
      )}
      {state === "failed" && (
        <p className="text-red-700 dark:text-red-300">{message}</p>
      )}
      <Link href="/login" className="inline-block text-blue-600 hover:underline dark:text-blue-400">
        Continue to sign in
      </Link>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div className="text-sm text-gray-500">Loading…</div>}>
      <VerifyInner />
    </Suspense>
  );
}
