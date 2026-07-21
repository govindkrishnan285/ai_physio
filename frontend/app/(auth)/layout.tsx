// Auth Mode: the common landing shell for signed-out visitors. No sidebar or
// navbar — those belong to the dashboard, which requires a session.
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12 dark:bg-gray-950">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-50">
            AI Physio
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Rehabilitation Assistant
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
          {children}
        </div>
      </div>
    </div>
  );
}
