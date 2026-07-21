"use client";

import {
  Bell,
  LogOut,
  Moon,
  Sun,
  UserCircle,
} from "lucide-react";
import { useState } from "react";
import { usePathname } from "next/navigation";

import SearchBox from "@/components/layout/SearchBox";
import { useAuth } from "@/context/AuthContext";

const titles: Record<string, { title: string; subtitle: string }> = {
  "/": {
    title: "Dashboard",
    subtitle: "Overview of your rehabilitation progress",
  },
  "/live-session": {
    title: "Live Session",
    subtitle: "Real-time posture monitoring and movement tracking",
  },
  "/exercises": {
    title: "Exercise Library",
    subtitle: "Browse rehabilitation programs by category",
  },
  "/reference": {
    title: "Train Model",
    subtitle: "Teach exercises from reference videos",
  },
  "/progress": {
    title: "Progress",
    subtitle: "Trends across your completed sessions",
  },
  "/reports": {
    title: "Reports",
    subtitle: "Session history and exportable records",
  },
  "/settings": {
    title: "Settings",
    subtitle: "Preferences and data controls",
  },
};

export default function Navbar() {
  const { user, signOut } = useAuth();
  const [dark, setDark] = useState(true);
  const pathname = usePathname();

  const heading = titles[pathname] ?? titles["/"];

  return (
    <header className="h-20 border-b border-slate-800 bg-slate-900/60 backdrop-blur flex items-center justify-between px-8">

      {/* Left */}

      <div>

        <h1 className="text-xl font-semibold text-white tracking-tight">
          {heading.title}
        </h1>

        <p className="text-slate-400 text-sm mt-0.5">
          {heading.subtitle}
        </p>

      </div>

      {/* Center */}

      <SearchBox />

      {/* Right */}

      <div className="flex items-center gap-3">

        {/* Notifications */}
        {/* suppressHydrationWarning: form-filler extensions tag interactive
            elements (fdprocessedid) before React hydrates — see SearchBox. */}

        <button
          suppressHydrationWarning
          className="relative bg-slate-800/60 border border-slate-800 p-2.5 rounded-lg hover:bg-slate-800"
        >

          <Bell size={18} />

          <span className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-rose-500"></span>

        </button>

        {/* Dark mode */}

        <button
          onClick={() => setDark(!dark)}
          suppressHydrationWarning
          className="bg-slate-800/60 border border-slate-800 p-2.5 rounded-lg hover:bg-slate-800"
        >

          {dark ? <Moon size={18} /> : <Sun size={18} />}

        </button>

        {/* User */}

        <div className="flex items-center gap-3 bg-slate-800/60 border border-slate-800 rounded-lg pl-3 pr-2 py-2">

          <UserCircle
            size={28}
            className="text-teal-400"
          />

          <div className="min-w-0">

            <h2 className="text-white text-sm font-medium truncate">
              {user?.full_name || user?.email || "—"}
            </h2>

            <p className="text-slate-500 text-xs capitalize">
              {user?.role ?? ""}
            </p>

          </div>

          <button
            type="button"
            onClick={signOut}
            title="Sign out"
            aria-label="Sign out"
            className="ml-1 rounded-md p-1.5 text-slate-400 transition hover:bg-slate-700/60 hover:text-white"
          >
            <LogOut size={18} />
          </button>

        </div>

      </div>

    </header>
  );
}
