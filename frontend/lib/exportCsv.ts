import { ReportItem } from "@/lib/api";

// Client-side CSV export from data already fetched from Postgres (no localStorage).
export function downloadReportsCsv(items: ReportItem[]) {
  const header = [
    "Date",
    "Exercise",
    "Duration (min)",
    "Reps",
    "Average ROM (deg)",
    "Accuracy (%)",
    "Quality Score",
    "Feedback",
  ];

  const rows = items.map((r) => [
    r.date,
    r.exercise,
    `${r.duration_minutes}`,
    `${r.repetitions}`,
    r.average_rom !== null ? r.average_rom.toFixed(0) : "",
    r.accuracy.toFixed(0),
    r.quality_score !== null ? r.quality_score.toFixed(0) : "",
    r.feedback.join(" | "),
  ]);

  const csv = [header, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `ai-physio-reports-${Date.now()}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
