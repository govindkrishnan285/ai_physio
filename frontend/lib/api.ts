// Client for the FastAPI backend. PostgreSQL is the single source of truth for
// all rehabilitation data — the only thing stored client-side is the auth token
// (see lib/authStore.ts).

import {
  clearTokens,
  getAccessToken,
  getRefreshToken,
  setTokens,
} from "./authStore";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") || "http://localhost:8000";

/** Thrown when the server rejects the request; carries the HTTP status. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "ApiError";
  }
}

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

export type Role = "patient" | "therapist" | "admin";

export interface AuthUser {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  is_active: boolean;
  is_verified: boolean;
  created_at: string;
  last_login_at: string | null;
}

export interface PatientProfile {
  id: string;
  user_id: string;
  therapist_id: string | null;
  date_of_birth: string | null;
  phone: string;
  gender: string;
  injury_type: string;
  injury_date: string | null;
  injury_notes: string;
  recovery_stage: string;
  current_program: Record<string, unknown>;
}

export interface TherapistProfile {
  id: string;
  user_id: string;
  specialization: string;
  license_number: string;
  years_experience: number | null;
  bio: string;
}

export interface MeResponse {
  user: AuthUser;
  patient_profile: PatientProfile | null;
  therapist_profile: TherapistProfile | null;
}

export interface SessionCreateInput {
  // No patient_id: the backend derives ownership from the access token.
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

export interface JobAccepted {
  job_id: string;
  status: string;
}

export interface TrainingJob {
  job_id: string;
  exercise_id: number;
  status: "queued" | "running" | "done" | "failed";
  progress: number;
  message: string;
  result: TrainResult | null;
  error: string | null;
  created_at: string;
  updated_at: string;
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
/** Endpoints that must not carry a token or trigger a refresh. */
const PUBLIC_PATHS = ["/auth/login", "/auth/register", "/auth/refresh", "/health"];

// A single in-flight refresh shared by all callers. Without this, a page that
// fires several requests at once would kick off one refresh each, and the
// losers would install a token the backend had already rotated past.
let refreshInFlight: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {
  const refresh = getRefreshToken();
  if (!refresh) return false;

  const res = await fetch(`${API_BASE}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refresh }),
  });
  if (!res.ok) {
    clearTokens();
    return false;
  }
  const body = await res.json();
  setTokens(body.access_token, body.refresh_token);
  return true;
}

function ensureRefresh(): Promise<boolean> {
  refreshInFlight ??= refreshAccessToken().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

async function send(path: string, init?: RequestInit): Promise<Response> {
  const token = getAccessToken();
  const headers = new Headers(init?.headers);
  // FormData sets its own multipart boundary; forcing JSON here would corrupt
  // video uploads.
  if (!(init?.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (token && !PUBLIC_PATHS.some((p) => path.startsWith(p))) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  return fetch(`${API_BASE}${path}`, { ...init, headers });
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res = await send(path, init);

  // Access tokens expire after 30 minutes. Refresh once and retry, so an
  // expiry mid-session doesn't surface to the user at all.
  if (res.status === 401 && !PUBLIC_PATHS.some((p) => path.startsWith(p))) {
    if (await ensureRefresh()) {
      res = await send(path, init);
    } else {
      clearTokens();
    }
  }

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      // FastAPI validation errors arrive as a list of objects, not a string.
      if (typeof body.detail === "string") {
        detail = body.detail;
      } else if (Array.isArray(body.detail) && body.detail.length > 0) {
        detail = body.detail[0]?.msg ?? detail;
      }
    } catch {
      // non-JSON error body; keep statusText
    }
    throw new ApiError(detail, res.status);
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
  /** Case-insensitive partial match on exercise name (global search). */
  search?: string;
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

  // --- Auth ---
  async register(input: {
    email: string;
    password: string;
    full_name: string;
    role: Role;
  }): Promise<AuthUser> {
    return request("/auth/register", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  /** Signs in and installs the tokens; callers just await it. */
  async login(email: string, password: string): Promise<void> {
    const pair = await request<{ access_token: string; refresh_token: string }>(
      "/auth/login",
      { method: "POST", body: JSON.stringify({ email, password }) }
    );
    setTokens(pair.access_token, pair.refresh_token);
  },

  logout(): void {
    // Tokens are stateless, so there is nothing to revoke server-side yet.
    clearTokens();
  },

  async me(): Promise<MeResponse> {
    return request("/auth/me");
  },

  async forgotPassword(email: string): Promise<{ detail: string }> {
    return request("/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
  },

  async resetPassword(token: string, password: string): Promise<{ detail: string }> {
    return request("/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ token, password }),
    });
  },

  async verifyEmail(token: string): Promise<AuthUser> {
    return request("/auth/verify-email", {
      method: "POST",
      body: JSON.stringify({ token }),
    });
  },

  async trainFromYoutube(
    exerciseId: number,
    youtubeUrls: string[],
    trainTf = false
  ): Promise<JobAccepted> {
    return request(`/exercises/${exerciseId}/train`, {
      method: "POST",
      body: JSON.stringify({ youtube_urls: youtubeUrls, train_tf: trainTf }),
    });
  },

  // Preferred training path: your own footage, so the reference clip can ship
  // with the app. FormData must not set Content-Type — the browser adds the
  // multipart boundary itself.
  async trainFromUpload(
    exerciseId: number,
    files: File[],
    trainTf = false
  ): Promise<JobAccepted> {
    const form = new FormData();
    files.forEach((f) => form.append("files", f));
    form.append("train_tf", String(trainTf));

    const res = await fetch(`${API_BASE}/exercises/${exerciseId}/train-upload`, {
      method: "POST",
      body: form,
    });
    if (!res.ok) {
      let detail = res.statusText;
      try {
        detail = (await res.json()).detail ?? detail;
      } catch {
        // non-JSON error body
      }
      throw new Error(detail);
    }
    return res.json() as Promise<JobAccepted>;
  },

  async getTrainingJob(jobId: string): Promise<TrainingJob> {
    return request(`/training-jobs/${jobId}`);
  },

  /** Polls a training job until it finishes, reporting progress along the way. */
  async waitForTrainingJob(
    jobId: string,
    onProgress?: (job: TrainingJob) => void,
    intervalMs = 1500
  ): Promise<TrainResult> {
    for (;;) {
      const job = await this.getTrainingJob(jobId);
      onProgress?.(job);
      if (job.status === "done") {
        if (!job.result) throw new Error("Training finished without a result.");
        return job.result;
      }
      if (job.status === "failed") {
        throw new Error(job.error ?? "Training failed.");
      }
      await new Promise((r) => setTimeout(r, intervalMs));
    }
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
        search: q.search,
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

  async getProgress(patientId?: string): Promise<ProgressResponse> {
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

  async getRecommendations(patientId?: string): Promise<Recommendation[]> {
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
