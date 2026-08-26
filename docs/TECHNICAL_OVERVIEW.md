# AI-Powered Physiotherapy & Rehabilitation Assistant — Technical Overview

> Viva / review / interview preparation document. Written from the actual
> codebase, not from a template. Where the common assumptions about a project
> like this are **wrong for this implementation**, that is called out explicitly
> — because being able to correct the examiner is worth more than reciting
> buzzwords.

**Read this first — three things people get wrong about this project:**

1. **There is no "exercise classifier."** The user picks the exercise. The AI does not guess which exercise is being performed. The AI job is to *score how well* a chosen exercise is being done, against a learned reference.
2. **The scoring engine is Dynamic Time Warping (DTW) template matching, not deep learning.** It is deterministic numpy. It works with zero neural networks.
3. **TensorFlow is optional and is an *anomaly detector*, not a classifier.** It's a one-class LSTM autoencoder trained only on correct reps; it flags reps that reconstruct poorly. It is disabled by default (`ENABLE_TF=false`).

---

## 1. Project Overview

**Title:** AI-Powered Physiotherapy & Rehabilitation Assistant ("AI Physio").

**Purpose.** Let a patient perform rehabilitation exercises in front of an ordinary webcam and receive the two things unsupervised home rehab normally lacks: **objective per-repetition scoring** and **real-time form correction** — while giving their physiotherapist a way to assign protocols and monitor progress remotely.

**Main objective.** Replace "do these exercises at home and hope you're doing them right" with a system that (a) measures joint angles and range of motion from video, (b) compares each rep to a therapist-approved reference movement, (c) gives corrective cues, and (d) records a clinical history that both patient and therapist can review.

### Overall workflow (end to end)

1. A therapist (or the offline pipeline) **teaches the AI an exercise** by supplying reference video(s). The backend extracts pose → biomechanical features → cuts the video into reps → builds a **mean/std movement template**. This template is the "correct movement."
2. A patient logs in, picks an exercise, and starts a **live session**. The browser runs MediaPipe pose estimation on the webcam feed locally.
3. A **calibration gate** scores the scene (lighting, framing, full-body visibility, stability). Tracking is blocked until quality passes and auto-pauses if it degrades.
4. Per-frame joint angles drive a **rule-based rep counter**. When a rep completes, its landmark buffer is POSTed to the backend, which scores it with **DTW** against the template and returns accuracy, per-joint deviations, symmetry, tempo, and corrective cues.
5. On session end, a **clinical summary** (duration, reps, accuracy, ROM, joint-angle averages, feedback log, mistakes) is saved to PostgreSQL, owned by the authenticated patient.
6. **Dashboards** surface progress; a rule engine **recommends** the next exercise.

### High-level architecture

```
Browser (Next.js 16 / React 19 / TS / Tailwind v4)
  ├─ MediaPipe PoseLandmarker (WASM, on-device)   ← video never leaves the machine
  ├─ Rep counter + calibration + live cue (client)
  └─ REST + JWT ──────────────────────────────────►  FastAPI (Python 3.11)
                                                        ├─ Auth / RBAC (JWT, bcrypt)
                                                        ├─ Clinical endpoints (sessions, progress, reports)
                                                        ├─ AI engine (numpy: features, DTW, segmentation)
                                                        ├─ Optional TensorFlow (LSTM autoencoder)
                                                        └─ SQLModel ORM
                                                              │
                                                        PostgreSQL 17  (+ Alembic migrations)
```

**Privacy-by-design boundary:** the webcam frame is processed in the browser. Only *derived pose landmarks* (numbers) cross the network — never the video.

### End-to-end data flow (one rep)

`webcam frame → MediaPipe 33 landmarks → One-Euro smoothing → joint angles (3D world landmarks) → rep state machine → on rep completion, buffered landmarks → POST /analyze/rep → server features (angles + trunk incline) → time-normalize to 100 samples → DTW vs template → {accuracy, deviations, cues} → UI + feedback log → on session end → POST /sessions → PostgreSQL → dashboards read back via /progress, /reports`.

### User flow

- **Patient:** register → verify email → login → dashboard → pick exercise → live session (calibrate → reps → live cue + per-rep review) → stop & save → progress / reports.
- **Therapist:** login → (dashboard planned) → assigned patients → review sessions/reports → train an exercise from reference video → assign/modify protocol.
- **Administrator:** login → (dashboard planned) → manage users, assign therapists, manage exercise library, monitor system.

### AI / Backend / Frontend / Database workflows — how modules talk

- **Frontend → Backend:** a single `request()` helper in `lib/api.ts` attaches the JWT and transparently refreshes it on 401. Pose runs client-side; only landmark arrays and session summaries are sent.
- **Backend → AI:** routers call **services** (`biomechanics`, `reference`, `comparison`, `dtw`, `feedback`, `segmentation`, `pose`, `mlmodel`). Services are pure functions where possible (numpy only) so they unit-test without MediaPipe/TF.
- **Backend → Database:** SQLModel models + a request-scoped `Session`. Ownership is derived from the token, never the request body.
- **Training:** `routers/videos.py` enqueues an in-memory background **job** (`services/jobs.py`); a worker runs `services/training.py` (pose → features → segment → template → optional TF) and writes a `ReferenceProfile`.

---

## 2. Folder Structure

### Repository root
| Folder / file | Why it exists |
|---|---|
| `frontend/` | The Next.js 16 web app (patient/therapist/admin UI + on-device pose). |
| `backend/` | The FastAPI service: auth, clinical API, AI engine, migrations. |
| `design/` | Stitch (Google) UI design export — reference mockups + HTML, used to restyle the app. Not shipped/imported. |
| `docs/` | This document. |
| `README.md` | Project pitch, architecture diagram, setup, offline training guide. |
| `init_postgres.sql` | One-time role+DB bootstrap for local PostgreSQL. |

### Backend (`backend/app/`)
| Folder / file | Purpose | How it interacts |
|---|---|---|
| `main.py` | FastAPI app factory: CORS, lifespan (JWT-secret guard + `init_db`), mounts routers + static reference media. | Entry point; wires every router. |
| `config.py` | `pydantic-settings` config from `.env` (DB URL, JWT, CORS, TF flag, data dir). | Imported everywhere via `get_settings()`. |
| `db.py` | SQLAlchemy engine, `get_session` dependency, `init_db` (first-run `create_all`). | Every router/service that touches the DB. |
| `models.py` | Clinical SQLModel tables (Exercise, ReferenceProfile, RehabSession, JointMeasurement, ExerciseFeedback). Integer PKs. | The clinical domain. |
| `auth_models.py` | Identity tables (User, PatientProfile, TherapistProfile, AuthToken). **UUID PKs.** | Auth + RBAC + ownership. |
| `schemas.py` / `auth_schemas.py` | Pydantic request/response DTOs (validation boundary). | Routers' input/output contracts. |
| `deps.py` | FastAPI dependencies: current user, role gates (`require_admin`/`require_therapist`), `resolve_target_patient` (the single authorization choke point for clinical reads). | Every protected endpoint. |
| `routers/` | HTTP layer, one file per domain (auth, sessions, progress, reports, recommendations, exercises, videos/training, analysis). | Call services + DB. |
| `services/` | Business + AI logic (see §5, §7). Pure where possible. | Called by routers; independent of HTTP. |
| `alembic/` | Migrations (baseline schema; session-ownership FK migration). | Schema source of truth. |
| `scripts/` | `create_admin.py` (bootstrap the first admin), `train_local.py` (offline training). | Ops / CLI. |
| `tests/` | `test_auth.py`, `test_clinical_access.py` (pytest, RBAC/isolation), `test_core.py`, `test_segmentation.py` (deterministic engine, run as scripts). | CI / regression. |

There is **no** `controllers/` or `repositories/` folder — this uses FastAPI's router+service pattern, and SQLModel *is* the ORM (SQLAlchemy + Pydantic), so a separate repository layer would be redundant ceremony.

### Frontend (`frontend/`)
| Folder | Purpose |
|---|---|
| `app/` | Next.js App Router. **Route groups:** `(auth)` = login/register/reset shell; `(dashboard)` = sidebar+navbar shell (dashboard, exercises, progress, reports, reference/train, settings); `(session)` = full-screen live session. `layout.tsx` wraps everything in AuthProvider + PoseProvider. |
| `components/` | UI by area: `auth/` (RequireAuth guard, form styles), `layout/` (Sidebar, Navbar, SearchBox), `session/` (CameraStage, CalibrationOverlay, ReferenceMiniPlayer), `dashboard/` (BarTrendChart), `ui/` (loading/empty/error states). |
| `hooks/` | React hooks: the pose loop, rep counter, joint angles, live metrics, server scoring, per-rep review, live cue, API data, cameras. |
| `lib/` | Framework-free logic: MediaPipe init, One-Euro filter, angle math, calibration scoring, drawing, exercise config, API client, auth token store, CSV export. |
| `context/` | `PoseContext` (shared live-session state), `AuthContext` (session + role routing). |
| `types/` | `pose.ts` — Landmark / JointAngles shared types. |
| `proxy.ts` | Next 16's renamed `middleware` — server-side redirect for unauthenticated routes (a UX gate, not the security boundary). |

---

## 3. File-by-File

### Backend — core & auth
- **`main.py`** — Builds the app; lifespan refuses to boot on the default JWT secret unless `DEV_MODE`; includes all routers; mounts `/reference-media`. `GET /health` reports TF availability.
- **`config.py`** — `Settings`: `database_url`, `jwt_secret`, `access_token_minutes`, `refresh_token_days`, `enable_tf`, `email_backend`, `data_dir`, `cors_origins`. `get_settings()` is `lru_cache`d.
- **`db.py`** — Engine (`pool_pre_ping`), `get_session()` generator dependency, `init_db()` (imports models so metadata registers, then `create_all`; documented to defer to Alembic).
- **`models.py`** — `Exercise` (thresholds, primary_joint, direction), `ReferenceProfile` (mean/std trajectories as JSON, seq_len, feature_names, ml_threshold/path, reference clip window), `RehabSession` (clinical summary + AI signals + `patient_profile_id` FK), `JointMeasurement`, `ExerciseFeedback` (cascade children).
- **`auth_models.py`** — `User` (email, hashed_password, `role` enum, verified/active), `PatientProfile` (injury, recovery_stage, `current_program` JSONB, assigned `therapist_id`), `TherapistProfile`, `AuthToken` (SHA-256-hashed single-use tokens). Deliberately **no** `from __future__ import annotations` (breaks SQLModel relationship resolution).
- **`deps.py`** — `get_current_user` (decodes access JWT), `require_roles` factory, `resolve_target_patient` (patients get their own profile and the `patient_id` query param is ignored for them; therapists/admins must name a patient and are checked against assignment), `assert_can_view_patient`.
- **`services/security.py`** — bcrypt hashing (rejects >72 bytes), JWT encode/decode with a `type` claim (a refresh token can't be used as an access token), SHA-256 one-time-token hashing.
- **`services/mailer.py`** — Pluggable email; `console` backend logs verification/reset links. Single `send()` seam for a real provider.
- **`routers/auth.py`** — register / login / refresh / verify-email / forgot+reset-password / me. Login & forgot-password return identical responses for known/unknown emails (no account enumeration); reset tokens are single-use and rotate.

### Backend — clinical API
- **`routers/sessions.py`** — `POST /sessions` (patients only; owner from token), `GET /sessions` (patient-scoped via `TargetPatient`), `GET/DELETE /sessions/{id}` (cross-patient reads return **404 not 403** to prevent id enumeration). Builds `SessionDetail` with joints + feedback.
- **`routers/progress.py`** — Aggregates a patient's sessions into weekly accuracy, ROM trend, exercise frequency, pain trend.
- **`routers/reports.py`** — Per-session clinical summaries + feedback, paginated.
- **`routers/recommendations.py`** — Wraps `services/recommend.py`.
- **`routers/exercises.py`** — Exercise library (any signed-in user).
- **`routers/videos.py`** — Training: `train-upload` (files) and `train` (YouTube) — therapist/admin only; enqueue a background job; `GET /training-jobs/{id}` polls progress; `/profile` and `/reference-video` are patient-readable (needed for the side-by-side player).
- **`routers/analysis.py`** — `POST /analyze/rep`: the live scoring endpoint. Takes buffered landmark frames, runs the DTW comparison, returns accuracy + cues.

### Backend — AI/ML services (see §7 for the math)
- **`biomechanics.py`** — Pure-numpy feature extraction. `_angle(a,b,c)` (vertex angle via arccos of the dot product), `joint_angles` (10 angles), `trunk_incline`, `FEATURE_ORDER` (11 features), `time_normalize` (linear-interp resample to 100 samples), `velocity`/`acceleration` (finite differences), `primary_angle_series`, `range_of_motion`.
- **`reps.py`** — `segment_reps` (offline: cut an angle series into rep spans) and `LiveRepCounter` (incremental, mirrors the frontend state machine). Rule-based, no ML.
- **`segmentation.py`** — `active_span`: trims intro/talking/outro from reference clips using frame-to-frame motion magnitude + an adaptive threshold + gap bridging; returns the longest sustained active run.
- **`reference.py`** — `build_profile`: aggregates all reps from all reference videos into a time-normalized **mean** and **std** trajectory — the template.
- **`dtw.py`** — `dtw_distance`: pure-numpy DTW with an optional Sakoe-Chiba band, normalized by warp-path length (stays in degree units).
- **`comparison.py`** — `score_rep`: time-normalizes the user rep, DTW vs mean → accuracy; per-feature signed deviation gated by both an absolute floor and a multiple of the reference's own std (so naturally variable joints aren't over-flagged); symmetry, ROM, peak, tempo.
- **`feedback.py`** — `build_feedback`: turns structured errors into physiotherapist-style cues ("Bend your left knee more — increase flexion by ~10°"), ordered major → symmetry → tempo → confirmation.
- **`mlmodel.py`** — Optional LSTM autoencoder (encoder LSTM→dense latent; decoder RepeatVector→LSTM→TimeDistributed). Trains on correct reps only; threshold = mean+2·std of reconstruction error; `anomaly_score` for a live rep. Lazy TF import.
- **`recommend.py`** — Rule engine: mastery (≥85% & ≥24 reps → progress), struggle (<60% → repeat), else next unattempted in protocol order.
- **`pose.py`** — Server pose extraction: OpenCV decode + MediaPipe Tasks PoseLandmarker; downloads/caches the model; uniform subsampling to bound frames; per-frame progress callback.
- **`training.py`** — Orchestrates the whole pipeline (pose → features → segment → template → reference clip → optional TF) for both training endpoints and the offline script.
- **`jobs.py`** — In-memory job registry (status/progress/result) with retention cap. **Per-process, not durable** — fine for single-worker, needs Redis/Celery to scale.

### Frontend — hooks & libs
- **`hooks/usePoseDetection.ts`** — The rAF detection loop: pulls frames, runs MediaPipe, picks the most-centered person, One-Euro-smooths landmarks, throttles React commits to ~15/s; holds the same state object while untracked (avoids re-render storms).
- **`hooks/useRepCounter.ts`** — Rule-based rep state machine (rest ↔ working, peak tracking, in-range check, accuracy). Bails out of re-render when nothing changed.
- **`hooks/useJointAngles.ts`** — Prefers 3D **world-landmark** angles (perspective-robust), falls back to 2D image angles.
- **`hooks/useLiveMetrics.ts`** — Derives phase, ROM, completion %, movement quality, stability, balance, per-joint readings.
- **`hooks/useLiveServerScoring.ts`** — Buffers working-phase landmarks; on rep completion flushes to `/analyze/rep`; degrades silently to client feedback if offline/untrained.
- **`hooks/useRepFormReview.ts`** — **(new)** Grades form at the *peak of each rep* (snapshots joint angles at deepest flexion/extension) → a stable per-rep scorecard, replacing the old jittery per-frame table.
- **`hooks/useLiveCue.ts`** — **(new)** One calm real-time cue (symmetry / tempo / phase-aware depth) with a 700 ms min-hold; detailed correction stays post-rep.
- **`lib/mediapipe.ts`** — Singleton PoseLandmarker init (race-guarded), model selection, filters benign WASM console noise.
- **`lib/oneEuroFilter.ts`** — One-Euro adaptive smoothing (Casiez et al. 2012): low lag on fast motion, strong smoothing when still.
- **`lib/angleCalculator.ts`** — 2D (`calculateAngle`) and 3D (`calculateAngle3D`) angle math.
- **`lib/calibration.ts`** — Scene quality scoring (lighting, framing, visibility, centering, roll, occlusion, stability) + pass/pause thresholds.
- **`lib/exerciseConfig.ts`** — Per-exercise config (thresholds, target range, optimal angles, cues) for the 10 seeded exercises (ACL, Meniscus, Shoulder Abduction, Rotator Cuff, Stroke, Balance, Low Back Pain, Neck, Squat/Lunge Assessment).
- **`lib/api.ts`** — Typed client + auth-aware `request()` (bearer injection, single-flight refresh, typed `ApiError`).
- **`lib/authStore.ts`** — Token storage (localStorage) + non-sensitive marker cookie for `proxy.ts`. **Documented XSS trade-off** (see §5/§Security).
- **`context/PoseContext.tsx`** — Owns live-session state (phase, calibration, accumulation buffers, save) and wires the pose/angle/rep/server hooks together.
- **`context/AuthContext.tsx`** — Resolves `/auth/me`, exposes user/profile, `signIn`/`signOut`, role-home routing, cross-tab sync.

### Frontend — pages & components
- **`(dashboard)/page.tsx`** — Patient dashboard: welcome hero (real name), stat tiles, recovery-overview ring, recovery-stage timeline, recommendations, recent sessions — all from real data with honest empty states.
- **`(session)/live-session/page.tsx`** — The live experience: exercise picker, camera stage, KPIs, AI feedback list, per-rep review panel.
- **`components/session/CameraStage.tsx`** — Webcam + skeleton canvas (now `object-contain` = full frame), phase/FPS/tracking chips, calibration overlay, rep counter, live-correction ticker, controls.
- **`components/auth/RequireAuth.tsx`** — Client role guard (UX gate; the backend is the real boundary).
- **`(dashboard)/reference/page.tsx`** — "Train Model": upload/YouTube → poll job progress.

---

## 4. Frontend Architecture

- **Routing:** Next.js App Router with three **route groups** — `(auth)`, `(dashboard)`, `(session)` — each with its own layout, so signed-out, chrome, and full-screen modes are cleanly separated. `proxy.ts` does server-side redirects; `RequireAuth` handles role routing after hydration.
- **Component hierarchy:** `RootLayout(AuthProvider → PoseProvider)` → group layout → page → feature components. The live session composes `CameraStage` + KPI/feedback panels.
- **State management:** two React Contexts (Auth, Pose) for cross-page/session state; local `useState`/`useRef` for view state; refs for the high-frequency pose loop (to avoid re-render storms). No Redux — the shared state is small and session-scoped.
- **Props flow:** derived metrics flow down as props (e.g. page → `CameraStage` gets `phase/reps/correction`). Live-session state lives in `PoseContext` so it survives navigation.
- **Hooks:** the pose pipeline is a stack of composable hooks (detection → angles → rep counter → metrics → server scoring → review/cue).
- **Tailwind v4:** design tokens live in `@theme` in `globals.css` (the "Aetheris" semantic palette) plus `.glass-card`/`.teal-glow` utilities; no `tailwind.config.js`.

---

## 5. Backend Architecture — a request's journey

**Example: `GET /sessions` as a patient.**
1. `proxy`/CORS pass; FastAPI matches the route.
2. `Depends(get_current_user)` decodes the access JWT → `User`.
3. `Depends(resolve_target_patient)` → since role is `patient`, returns *their own* `PatientProfile` (query param ignored).
4. Handler queries `RehabSession` filtered by `patient_profile_id`.
5. SQLModel → PostgreSQL; rows mapped to `SessionSummary` DTOs.
6. JSON response.

**Example: `POST /analyze/rep` (AI path).** landmarks → `biomechanics.sequence_to_matrix` → `comparison.score_rep` (time-normalize → DTW vs template → deviations/symmetry/tempo) → `feedback.build_feedback` → JSON cues.

- **Authentication:** JWT access+refresh, bcrypt, email verification + password reset (single-use hashed tokens).
- **Authorization (RBAC):** `require_roles` + `assert_can_view_patient`. Admin sees all; patient sees self; therapist sees assigned patients.
- **Routes/Services:** thin routers, logic in services. **No controllers/repositories** — deliberate.
- **AI modules / training pipeline / TensorFlow / MediaPipe:** see §7. Training runs as a background **job** with progress polling.
- **Report generation:** `/reports` + `/progress` aggregate stored sessions; CSV export is client-side (`lib/exportCsv.ts`).
- **Notification system:** **not implemented** (in the assignment spec; not built).

**Security note (be ready for this in viva):** tokens are returned in the JSON body and stored in `localStorage`, so any XSS on the origin could read them — documented in `lib/authStore.ts`. The stronger design is httpOnly+Secure+SameSite cookies. Acceptable for a prototype; must change before real PHI.

---

## 6. Database

- **Engine:** PostgreSQL 17. **Why Postgres:** relational integrity for the patient↔therapist↔session graph (foreign keys, cascades), **JSONB** for semi-structured data (movement templates, mistakes, program), transactional migrations via Alembic, and it scales far past SQLite (which is kept only as a demo fallback).
- **ORM:** SQLModel (SQLAlchemy core + Pydantic). Alembic is the schema source of truth.

### Tables (what each stores)
| Table | PK | Stores |
|---|---|---|
| `user` | UUID | Login identity, role, verified/active flags. |
| `patientprofile` | UUID | Injury, recovery stage, `current_program` (JSONB), assigned therapist FK. |
| `therapistprofile` | UUID | Specialization, license, bio. |
| `authtoken` | UUID | Single-use, **hashed** verify/reset tokens + expiry. |
| `exercise` | int | Exercise definition: primary joint, direction, thresholds, target ROM. |
| `referenceprofile` | int | The learned template: `mean_trajectory`/`std_trajectory` (JSONB), seq_len, feature_names, optional TF model path + threshold, reference clip window. |
| `rehabsession` | int | Clinical summary + AI signals; `patient_profile_id` FK (owner). |
| `jointmeasurement` | int | Time-sampled joint angles for a session (child). |
| `exercisefeedback` | int | Per-cue feedback log for a session (child). |

- **PKs:** UUID on auth/identity tables (non-enumerable, safe to expose); **integer** on `exercise`/`referenceprofile` (trained rows and on-disk model paths already reference them — converting would be a destructive migration for no gain).
- **FKs:** `patientprofile.therapist_id → therapistprofile.id`; `rehabsession.patient_profile_id → patientprofile.id`; children (`jointmeasurement`, `exercisefeedback`) cascade-delete with their session.
- **JSONB:** movement trajectories, `posture_mistakes`, `current_program` — variable-shape data that would be awkward as columns.
- **Indexes:** on `email`, `role`, `patient_profile_id`, `exercise`, `date`, and FK columns — the columns actually filtered on.
- **Query optimization:** patient-scoped filters hit indexed FK columns; pagination via `limit/offset`; aggregates computed in Python over indexed reads (dataset is per-patient and small).

**Data flow front↔back↔db:** frontend `api.ts` → JWT'd REST → router (ownership from token) → SQLModel → PostgreSQL → DTOs → dashboards. Media (reference clips, models, uploads) is stored **on disk** under the data dir; the DB stores only paths — never raw video or TF weights.

---

## 7. AI Pipeline (with the math)

**MediaPipe pose detection.** `PoseLandmarker` returns **33 landmarks** per frame as normalized image coordinates (x,y ∈ [0,1]) plus z and visibility. Browser uses `@mediapipe/tasks-vision` (WASM); server uses the Python MediaPipe Tasks API on OpenCV-decoded frames.

**Joint angles.** For a joint with vertex *B* and neighbors *A*, *C*, the angle is
`θ = arccos( (BA · BC) / (|BA|·|BC|) )` in degrees.
The client prefers **3D world landmarks** (hip-centered metric coordinates), which are perspective-corrected — so angles stay accurate regardless of camera distance/tilt/body proportions — and falls back to 2D. The server works in 2D (single webcam depth is unreliable).

**Trunk incline.** Angle between the mid-shoulder→mid-hip vector and vertical — 0° = upright spine.

**Range of motion.** Peak-to-peak of the primary-joint angle series: `ROM = max(θ) − min(θ)`.

**Pose calibration.** `lib/calibration.ts` scores the scene 0–100 across lighting, framing, full-body visibility, centering, camera roll, occlusion, stability; analysis is gated until it passes and auto-pauses if it degrades.

**Skeleton drawing.** `lib/drawing.ts` connects landmark pairs (`POSE_CONNECTIONS`) on a canvas, mirrored to match the flipped feed, fitted to the `object-contain` video rect.

**Rep counter (rule-based, not ML).** A state machine over the primary-joint angle: `rest → working` when it crosses `work_threshold`, tracks the peak, and counts a rep on return past `rest_threshold`. In-range if the peak sits within the target band.

**Rep scoring (DTW).** The user rep is time-normalized to 100 samples and compared to the reference **mean trajectory** via DTW. DTW cost:
`D(i,j) = d(aᵢ,bⱼ) + min(D(i−1,j−1), D(i−1,j), D(i,j−1))`, normalized by warp-path length, banded (Sakoe-Chiba). Accuracy = `clip(100 − K·avg_deviation)`.

**Posture analysis / feedback.** Per-feature signed deviation (user − reference), flagged only when it exceeds **both** an absolute floor (8°) **and** 1.5× the reference's own std at that joint — so naturally variable joints aren't over-corrected. Templates fill `feedback.py` → cues.

**Recommendation.** Rule engine over session history (mastery / struggle / unattempted).

> Note on the prompt's "TensorFlow exercise classification / posture analysis": **that is not how this works.** Classification would need labelled wrong-form examples, which reference videos don't provide. Instead the DTW template *is* the posture analysis, and the optional TF layer is one-class anomaly detection (§8).

---

## 8. Machine Learning Pipeline

- **Training data:** therapist-curated reference video(s) per exercise (uploaded, or `datasets/<Exercise>/` for the offline script). Only **correct** examples exist.
- **Feature extraction:** each video → OpenCV frames → MediaPipe landmarks → 11-D feature vector per frame (10 joint angles + trunk incline).
- **Segmentation:** `active_span` trims intro/outro to the real exercise window.
- **Rep extraction + normalization:** `segment_reps` cuts reps; each is time-normalized to (100, 11).
- **Template ("model") build:** stack all reps → per-timestep **mean** and **std** trajectories (this *is* the learned model for the default engine).
- **Optional deep model:** LSTM autoencoder trained on the normalized correct reps; **threshold = mean + 2·std** of training reconstruction error. Inference: a live rep with reconstruction error above threshold is flagged anomalous.
- **Inference pipeline:** live rep → normalize → DTW vs mean (+ optional autoencoder error) → accuracy/deviations/cues.
- **Evaluation metrics:** DTW-derived accuracy %, per-joint deviation (degrees), ROM, symmetry gap, tempo; TF reconstruction error. Deterministic engine is regression-tested on synthetic "good vs bad" reps (`tests/test_core.py`).
- **Training a new exercise:** add an `Exercise` row (thresholds/primary joint) → supply reference clips → run training → a `ReferenceProfile` appears and the exercise becomes "trained."

---

## Review / Viva Questions (answered from *this* implementation)

**1. Real-world problem.** Home rehabilitation fails silently: patients do prescribed exercises unsupervised, often with wrong form, get no feedback, and therapists can't see what happened between visits. Combined with a shortage of physiotherapists, this causes poor adherence, slower recovery, and re-injury. This project puts objective per-rep measurement and correction into the patient's own room, and a monitoring channel into the therapist's hands.

**2. SDG.** **SDG 3 — Good Health & Well-being** (primarily 3.4 rehabilitation of non-communicable/musculoskeletal conditions and 3.8 access to quality care), with a secondary tie to **SDG 10 (reduced inequalities)** because a webcam-only tool reaches people who can't afford or travel to frequent clinic visits.

**3. Importance.** *Social:* extends supervised-quality rehab to home and underserved areas. *Economic:* fewer clinic visits and less therapist time per patient, and re-injury from bad form is expensive to treat. *Health:* better form + adherence → measurably faster, safer recovery.

**4. Target users / beneficiaries.** Patients doing home rehab (post-op ACL/meniscus, rotator cuff, stroke, low-back/neck, balance); physiotherapists (remote monitoring + protocol assignment + teaching the AI their own movement); clinics/administrators managing the platform.

**5. Existing solutions & limits.** In-person PT (effective but costly, limited access); printed/video exercise sheets (zero feedback or measurement); tele-rehab video calls (still needs the therapist live, no objective metrics); commercial apps (Physitrack, Kaia, SWORD Health) — often subscription/closed, some need wearables or proprietary hardware; IMU wearables (accurate but require devices and setup). Common gaps: cost, extra hardware, no per-rep biomechanical scoring, and no *therapist-trainable* reference movement.

**6. What's innovative here.** (a) **Webcam-only**, no wearables. (b) The therapist can **teach the AI a new exercise from their own reference video** — the trainable `ReferenceProfile` is the core novelty, not a fixed rule set. (c) **DTW template matching** gives per-rep, per-joint, tempo, and symmetry feedback with **one-class learning** (only correct examples needed). (d) **Privacy-by-design** — video stays in the browser; only landmarks are sent. (e) A real **role-based platform** (patient/therapist/admin) around the engine, not just a demo.

**7. Technologies.** Next.js 16 / React 19 / TypeScript / Tailwind v4; MediaPipe PoseLandmarker; FastAPI / Python 3.11; SQLModel + PostgreSQL 17 + Alembic; numpy DTW engine; optional TensorFlow/Keras LSTM autoencoder; JWT auth.

**8. Expected outcome.** A working platform where a patient performs an exercise on webcam and gets live cues + per-rep scoring; sessions persist with a clinical summary; progress/reports dashboards update; therapists assign protocols and train new exercises from video.

**9. Current TRL.** ~**TRL 4** (technology validated in the lab). All components exist and are integrated; the engine is regression-tested on synthetic data and the auth/RBAC layer is unit-tested — but it has **not** been validated with real patients/clinicians in a clinical setting, and angle accuracy hasn't been checked against ground truth (goniometer). Honestly, patient-facing flows are complete while therapist/admin dashboards, notifications, and containerized deployment are not — which keeps it at 4, not higher.

**10. Target TRL.** **TRL 5–6** — demonstrate in a relevant environment: validate measured angles against a goniometer, compare AI feedback to a physiotherapist's assessment on real users, and complete the therapist/admin loop + deployment.

**11. Major technical challenges.** Single-camera depth ambiguity (mitigated with 3D world landmarks + calibration gate); pose jitter (One-Euro filter + throttled commits); robustness across body types/camera angles; building a reliable template from few reference reps (a single rep yields zero variance — handled with a std floor); real-time performance in-browser; per-exercise threshold tuning; the safety/liability of automated advice; the in-memory job registry not surviving restarts/multiple workers; and the lack of clinical validation.

**12. Validation / testing.** *Done:* deterministic engine tests (synthetic good-vs-bad reps rewarded/flagged correctly), segmentation tests, and 52 auth/RBAC + data-isolation tests (including a deliberately reintroduced vulnerability to prove the tests bite). *Planned:* measured-angle vs goniometer accuracy, AI-feedback vs physiotherapist agreement, and usability trials with real patients.

**13. Scaling / extension.** Containerize (Docker Compose: web, API, Postgres, Redis, Nginx — planned in the deployment roadmap); move the job registry to Redis/Celery for durability + multi-worker; deploy to cloud (AWS free-tier roadmap exists); add exercises purely by training from video; build the therapist/admin dashboards and notifications; add a mobile client and tele-health/EHR integration.

**14. Measurable SDG-3 impact.** The app already records the exact metrics to prove impact: **accuracy trend**, **ROM improvement**, **adherence (sessions logged / streak)**, and **error/mistake reduction** over time — plus, at scale, clinic-visits avoided and patients reached in underserved areas.

**15. Next steps before the next review.** (a) Validate the new per-rep review + live cue with a real webcam and tune thresholds. (b) Build the therapist and admin dashboards (currently 404 after login). (c) Wire the notifications system. (d) Containerize + deploy. (e) Run an angle-accuracy check against ground truth. (f) Push and merge the `feat/auth-rbac` branch.

---

## Honest status summary (built vs. planned)

**Built & verified:** on-device pose + calibration + rep counting; DTW scoring engine + feedback; reference-video training with progress polling; JWT auth + RBAC + patient data isolation; patient dashboard, live session, progress, reports, exercises, reference-training pages; PostgreSQL schema + Alembic migrations.

**Partial / planned (do not over-claim in the viva):** therapist & admin dashboards (routes 404 after login); notifications; Docker/Redis/Nginx deployment; the TensorFlow layer (implemented but off by default and unvalidated); httpOnly-cookie auth (currently localStorage); clinical accuracy validation with real users.
