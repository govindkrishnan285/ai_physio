// Client for the FastAPI backend. PostgreSQL is the single source of truth for
// all rehabilitation data — nothing here reads or writes localStorage.

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") || "http://localhost:8000";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface BackendExercise {
  id: number;
  name: string;
  category: string;
  primary_joint: string;
  direction: string;
  rest_threshold: number;
  work_threshold: number;
  target_rom_min: number;
  target_rom_max: number;
  instructions: string;
  has_profile: boolean;
  has_reference_video: boolean;
}

export interface TrainResult {
  exercise_id: number;
  n_reps: number;
  n_videos: number;
  feature_names: string[];
  seq_len: number;
  tf_trained: boolean;
  ml_threshold: number | null;
  message: string;
}

export interface FeedbackCue {
  text: string;
  severity: string;
}

export interface AnalyzeRepResponse {
  exercise_name: string;
  phase: string;
  accuracy: number;
  avg_deviation: number;
  rom: number;
  peak_angle: number;
  in_range: boolean;
  errors: Record<string, unknown>[];
  feedback: FeedbackCue[];
  tempo: string;
  peak_velocity: number;
  ml_anomaly: number | null;
  ml_flagged: boolean | null;
}

export interface Recommendation {
  exercise_id: number;
  exercise_name: string;
  reason: string;
  priority: number;
}

export interface JointSample {
  timestamp: number;
  knee_angle?: number | null;
  hip_angle?: number | null;
  shoulder_angle?: number | null;
  elbow_angle?: number | null;
  ankle_angle?: number | null;
}

export interface FeedbackEntry {
  timestamp: number;
  feedback: string;
  severity: string;
}

export interface SessionCreateInput {
  patient_id?: string;
  exercise: string;
  exercise_id?: number | null;
  duration_seconds: number;
  repetitions: number;
  accuracy: number;
  average_rom?: number | null;
  maximum_rom?: number | null;
  minimum_rom?: number | null;
  calories?: number | null;
  pain_score?: number | null;
  status?: string;
  average_knee_angle?: number | null;
  average_hip_angle?: number | null;
  average_shoulder_angle?: number | null;
  average_elbow_angle?: number | null;
  average_ankle_angle?: number | null;
  quality_score?: number | null;
  posture_mistakes?: string[];
  fps?: number | null;
  model_confidence?: number | null;
  start_time?: string | null;
  end_time?: string | null;
  joints?: JointSample[];
  feedback?: FeedbackEntry[];
}

export interface SessionSummary {
  id: number;
  patient_id: string;
  exercise: string;
  date: string;
  start_time: string;
  duration_seconds: number;
  repetitions: number;
  accuracy: number;
  average_rom: number | null;
  maximum_rom: number | null;
  calories: number;
  pain_score: number | null;
  quality_score: number | null;
  status: string;
}

export interface SessionListResponse {
  items: SessionSummary[];
  total: number;
  limit: number;
  offset: number;
}

export interface SessionDetail extends SessionSummary {
  exercise_id: number | null;
  end_time: string | null;
  minimum_rom: number | null;
  average_knee_angle: number | null;
  average_hip_angle: number | null;
  average_shoulder_angle: number | null;
  average_elbow_angle: number | null;
  average_ankle_angle: number | null;
  model_confidence: number | null;
  fps: number | null;
  posture_mistakes: string[];
  joints: JointSample[];
  feedback: FeedbackEntry[];
}

export interface ProgressResponse {
  session_count: number;
  total_repetitions: number;
  total_calories: number;
  average_duration_seconds: number;
  weekly_accuracy: { week: string; accuracy: number }[];
  monthly_improvement: { month: string; accuracy: number }[];
  rom_trend: { date: string; average_rom: number }[];
  exercise_frequency: { exercise: string; count: number }[];
  pain_trend: { date: string; pain_score: number }[];
}

export interface ReportItem {
  id: number;
  exercise: string;
  date: string;
  duration_minutes: number;
  repetitions: number;
  average_rom: number | null;
  accuracy: number;
  quality_score: number | null;
  feedback: string[];
}

export interface ReportsResponse {
  items: ReportItem[];
  total: number;
}

export interface ReferenceVideo {
  exercise_id: number;
  url: string; // absolute
  start_sec: number | null;
  end_sec: number | null;
}

// ---------------------------------------------------------------------------
// Fetch helper
// ---------------------------------------------------------------------------
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail ?? detail;
    } catch {
      // non-JSON error body; keep statusText
    }
    throw new Error(detail);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

function query(params: Record<string, string | number | undefined>): string {
  const parts = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`);
  return parts.length ? `?${parts.join("&")}` : "";
}

export interface SessionQuery {
  patientId?: string;
  exercise?: string;
  limit?: number;
  offset?: number;
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------
export const api = {
  base: API_BASE,

  async health(): Promise<{ status: string; tf_enabled: boolean; tf_available: boolean }> {
    return request("/health");
  },

  async listExercises(): Promise<BackendExercise[]> {
    return request("/exercises");
  },

  async trainFromYoutube(
    exerciseId: number,
    youtubeUrls: string[],
    trainTf = false
  ): Promise<TrainResult> {
    return request(`/exercises/${exerciseId}/train`, {
      method: "POST",
      body: JSON.stringify({ youtube_urls: youtubeUrls, train_tf: trainTf }),
    });
  },

  async analyzeRep(
    exerciseId: number,
    frames: number[][][],
    fps = 30
  ): Promise<AnalyzeRepResponse> {
    return request("/analyze/rep", {
      method: "POST",
      body: JSON.stringify({ exercise_id: exerciseId, frames, fps }),
    });
  },

  // --- Sessions (single source of truth) ---
  async getSessions(q: SessionQuery = {}): Promise<SessionListResponse> {
    return request(
      `/sessions${query({
        patient_id: q.patientId,
        exercise: q.exercise,
        limit: q.limit,
        offset: q.offset,
      })}`
    );
  },

  async getSession(id: number): Promise<SessionDetail> {
    return request(`/sessions/${id}`);
  },

  async createSession(payload: SessionCreateInput): Promise<SessionDetail> {
    return request("/sessions", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  async deleteSession(id: number): Promise<void> {
    await request<void>(`/sessions/${id}`, { method: "DELETE" });
  },

  async getProgress(patientId = "default"): Promise<ProgressResponse> {
    return request(`/progress${query({ patient_id: patientId })}`);
  },

  async getReports(q: SessionQuery = {}): Promise<ReportsResponse> {
    return request(
      `/reports${query({
        patient_id: q.patientId,
        limit: q.limit,
        offset: q.offset,
      })}`
    );
  },

  async getRecommendations(patientId = "default"): Promise<Recommendation[]> {
    return request(`/recommendations${query({ patient_id: patientId })}`);
  },

  // Reference clip for the side-by-side player; null when none is trained (404).
  async getReferenceVideo(exerciseId: number): Promise<ReferenceVideo | null> {
    try {
      const r = await request<ReferenceVideo>(
        `/exercises/${exerciseId}/reference-video`
      );
      return { ...r, url: `${API_BASE}${r.url}` };
    } catch {
      return null;
    }
  },
};
