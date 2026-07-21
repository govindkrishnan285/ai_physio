// Shared field vocabulary for the auth pages, so login/register/reset don't
// drift apart. Matches the dashboard: slate surfaces, teal focus, xl radii.

export const LABEL = "block text-sm font-medium text-slate-300";

export const FIELD =
  "mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-950/60 px-3.5 py-2.5 text-sm text-slate-100 " +
  "placeholder:text-slate-600 outline-none transition " +
  "focus:border-teal-600 focus:ring-1 focus:ring-teal-600/50";

export const PRIMARY_BUTTON =
  "w-full rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white transition " +
  "hover:bg-teal-500 disabled:cursor-not-allowed disabled:opacity-60";

export const LINK = "text-teal-400 transition hover:text-teal-300";

export const HINT = "mt-1.5 text-xs text-slate-500";

export const ERROR_BOX =
  "rounded-xl border border-red-900/60 bg-red-950/40 px-3.5 py-2.5 text-sm text-red-300";
