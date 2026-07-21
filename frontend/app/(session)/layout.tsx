import RequireAuth from "@/components/auth/RequireAuth";

// Live Session Mode renders full-screen without dashboard chrome, but still
// requires a signed-in patient: the session save posts to an authenticated
// endpoint and is owned by the caller.
export default function SessionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <RequireAuth>{children}</RequireAuth>;
}
