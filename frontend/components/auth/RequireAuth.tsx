"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { HOME_FOR_ROLE, useAuth } from "@/context/AuthContext";
import { Role } from "@/lib/api";

/**
 * Client-side route guard.
 *
 * This is a UX guard, not a security boundary: it stops the wrong UI rendering,
 * but the real enforcement is the backend rejecting requests without a valid
 * token. Never rely on this to keep data safe.
 */
export default function RequireAuth({
  children,
  roles,
}: {
  children: React.ReactNode;
  /** Roles allowed here. Omit to allow any signed-in user. */
  roles?: Role[];
}) {
  const { user, loading } = useAuth();
  const router = useRouter();

  const allowed = user !== null && (!roles || roles.includes(user.role));

  useEffect(() => {
    if (loading) return;
    if (!user) {
      // Remember where they were headed so login can return them there.
      const next = encodeURIComponent(
        window.location.pathname + window.location.search
      );
      router.replace(`/login?next=${next}`);
    } else if (!allowed) {
      // Signed in, wrong role: send them to their own home rather than a
      // dead end.
      router.replace(HOME_FOR_ROLE[user.role] ?? "/");
    }
  }, [loading, user, allowed, router]);

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="text-sm text-gray-500 dark:text-gray-400">Loading…</div>
      </div>
    );
  }

  // Render nothing while the redirect above is in flight, so protected content
  // never flashes.
  if (!allowed) return null;

  return <>{children}</>;
}
