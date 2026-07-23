import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

import { AuthProvider } from "@/context/AuthContext";
import { PoseProvider } from "@/context/PoseContext";

// Inter for the primary UI, JetBrains Mono for data labels / coordinates —
// per the Aetheris design system.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
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
      className={`${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-background text-on-surface">
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
