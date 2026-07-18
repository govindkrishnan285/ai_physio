import Sidebar from "@/components/layout/Sidebar";
import Navbar from "@/components/layout/Navbar";

// Dashboard Mode: the analytics/reports/history/settings shell with persistent
// sidebar + navbar. Live Session Mode lives in the (session) group and renders
// full-screen without this chrome.
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Navbar />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
