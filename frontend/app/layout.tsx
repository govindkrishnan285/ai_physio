import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

import { AuthProvider } from "@/context/AuthContext";
import { PoseProvider } from "@/context/PoseContext";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AI Physio — Rehabilitation Assistant",
  description:
    "Camera-based movement tracking and real-time feedback for guided rehabilitation exercises.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-slate-950 text-slate-100">
        {/* Auth wraps pose: the pose layer calls authenticated endpoints, so the
            session has to resolve first. */}
        <AuthProvider>
          {/* Session state is shared across both modes so a session survives navigation. */}
          <PoseProvider>{children}</PoseProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
