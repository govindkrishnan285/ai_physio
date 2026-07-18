"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Camera,
  Dumbbell,
  LineChart,
  ClipboardList,
  Settings,
  Activity,
  BrainCircuit,
} from "lucide-react";

const menu = [
  { title: "Dashboard", href: "/", icon: LayoutDashboard },
  { title: "Live Session", href: "/live-session", icon: Camera },
  { title: "Exercises", href: "/exercises", icon: Dumbbell },
  { title: "Train Model", href: "/reference", icon: BrainCircuit },
  { title: "Progress", href: "/progress", icon: LineChart },
  { title: "Reports", href: "/reports", icon: ClipboardList },
  { title: "Settings", href: "/settings", icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 shrink-0 bg-slate-900 border-r border-slate-800 h-screen sticky top-0 flex flex-col">

      {/* Logo */}

      <div className="flex items-center gap-3 p-6 border-b border-slate-800">

        <div className="bg-teal-700 p-2.5 rounded-lg">
          <Activity size={20} />
        </div>

        <div>
          <h1 className="font-semibold text-base text-white tracking-tight">
            AI Physio
          </h1>

          <p className="text-xs text-slate-400">
            Rehabilitation Assistant
          </p>
        </div>

      </div>

      {/* Navigation */}

      <nav className="flex-1 px-3 py-6 space-y-1">

        {menu.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href;

          return (
            <Link
              key={item.title}
              href={item.href}
              className={`flex items-center gap-3 w-full rounded-lg px-4 py-2.5 text-sm transition-colors ${
                active
                  ? "bg-teal-700/20 text-teal-300 border border-teal-800"
                  : "text-slate-400 border border-transparent hover:bg-slate-800 hover:text-slate-200"
              }`}
            >
              <Icon size={18} />

              <span>{item.title}</span>
            </Link>
          );
        })}

      </nav>

      {/* Footer */}

      <div className="border-t border-slate-800 p-4">

        <div className="bg-slate-800/60 rounded-lg px-4 py-3">

          <p className="text-slate-300 text-xs font-medium">
            System Status
          </p>

          <div className="flex items-center gap-2 mt-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-teal-500" />
            <p className="text-slate-400 text-xs">
              Pose engine online
            </p>
          </div>

        </div>

      </div>

    </aside>
  );
}
