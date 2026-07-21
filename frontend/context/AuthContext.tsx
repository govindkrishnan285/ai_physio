"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  api,
  ApiError,
  MeResponse,
  PatientProfile,
  Role,
  TherapistProfile,
  AuthUser,
} from "@/lib/api";
import { AUTH_EVENT, clearTokens, hasTokens } from "@/lib/authStore";

interface AuthContextValue {
  user: AuthUser | null;
  patientProfile: PatientProfile | null;
  therapistProfile: TherapistProfile | null;
  /** True until the initial session check settles. Guards must wait on this. */
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => void;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** Where each role lands after signing in. */
export const HOME_FOR_ROLE: Record<Role, string> = {
  patient: "/",
  therapist: "/therapist",
  admin: "/admin",
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!hasTokens()) {
      setMe(null);
      setLoading(false);
      return;
    }
    try {
      setMe(await api.me());
    } catch (err) {
      // 401 here means the refresh token is dead too — the api layer has
      // already given up. Anything else (backend down) shouldn't wipe the
      // session, so the user isn't logged out by a transient blip.
      if (err instanceof ApiError && err.status === 401) {
        clearTokens();
        setMe(null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Keep tabs in sync: signing out in one window must not leave another
  // showing a live dashboard.
  useEffect(() => {
    const onChange = () => void load();
    window.addEventListener(AUTH_EVENT, onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener(AUTH_EVENT, onChange);
      window.removeEventListener("storage", onChange);
    };
  }, [load]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      await api.login(email, password);
      const fresh = await api.me();
      setMe(fresh);
      router.replace(HOME_FOR_ROLE[fresh.user.role] ?? "/");
    },
    [router]
  );

  const signOut = useCallback(() => {
    api.logout();
    setMe(null);
    router.replace("/login");
  }, [router]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user: me?.user ?? null,
      patientProfile: me?.patient_profile ?? null,
      therapistProfile: me?.therapist_profile ?? null,
      loading,
      signIn,
      signOut,
      refresh: load,
    }),
    [me, loading, signIn, signOut, load]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
