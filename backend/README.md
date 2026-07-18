# AI Physio — Backend (pose-learning engine)

FastAPI service that learns rehabilitation exercises from reference videos and
scores live movement against the learned template.

## What it does

1. **Ingest** — download reference videos (YouTube via yt-dlp, or file upload).
2. **Pose extraction** — MediaPipe Pose → 33 landmarks per frame (`services/pose.py`).
3. **Biomechanics** — joint angles, ROM, limb orientation, symmetry, velocity,
   acceleration (`services/biomechanics.py`).
4. **Learn a template** — segment reps, time-normalize each to 100 samples,
   average into a mean ± σ trajectory per exercise (`services/reference.py`).
5. **Score live reps** — align a user's rep to the template with **DTW**
   (`services/dtw.py`, `services/comparison.py`), produce a 0–100 accuracy score,
   detect posture / ROM / alignment / asymmetry / timing errors, and emit
   corrective cues (`services/feedback.py`).
6. **(Optional) TensorFlow** — an LSTM autoencoder trained *only on correct reps*
   (one-class anomaly detection) adds a learned quality score (`services/mlmodel.py`).
7. **History & recommendations** — sessions in PostgreSQL; rule-based next-exercise
   suggestions (`services/recommend.py`).

### Why DTW templates, not a trained correct-vs-wrong classifier

Reference videos contain only *correct* examples. A supervised classifier needs
negative examples too, so it can't be trained from references alone. The template
+ DTW approach learns "correct" and measures deviation from it — explainable and
works with no GPU. The autoencoder is the honest way to "train on TensorFlow"
from correct-only data (it learns to reconstruct correct movement; poor
reconstruction = anomaly).

## Requirements

TensorFlow and MediaPipe do **not** publish Python 3.13 wheels yet — use **3.11**.

```bash
cd backend
py -3.11 -m venv .venv
.venv\Scripts\activate            # Windows;  source .venv/bin/activate on *nix
pip install -r requirements.txt
copy .env.example .env            # cp on *nix, then edit DATABASE_URL
```

Postgres (Docker):

```bash
docker run --name physio-pg -e POSTGRES_USER=physio -e POSTGRES_PASSWORD=physio \
  -e POSTGRES_DB=physio -p 5432:5432 -d postgres:16
```

## Run

```bash
uvicorn app.main:app --reload --port 8000
```

Interactive docs at http://localhost:8000/docs. Tables auto-create on startup and
the default exercises seed on first `GET /exercises`.

## Key endpoints

| Method | Path | Purpose |
|---|---|---|
| GET  | `/exercises` | list exercises (+ whether each has a trained profile) |
| POST | `/exercises/{id}/train` | learn from `{ "youtube_urls": [...], "train_tf": false }` |
| GET  | `/exercises/{id}/profile` | trained template metadata |
| POST | `/analyze/rep` | score one rep `{ exercise_id, fps, frames:[[[x,y,z,vis]*33]*T] }` |
| POST | `/sessions` | save a completed session |
| GET  | `/sessions?patient_id=` | session history |
| GET  | `/recommendations?patient_id=` | next-exercise suggestions |
| GET  | `/health` | status + TF availability |

## Verify the core without heavy deps

The DTW engine (biomechanics → template → comparison → feedback) is pure numpy:

```bash
python -m tests.test_core
```

This fabricates synthetic reps and asserts a faithful rep outscores a shallow one
and that the shallow rep is flagged — no MediaPipe/TensorFlow/GPU needed.

## Enabling TensorFlow

Set `ENABLE_TF=true` in `.env`, install completes the `tensorflow` requirement,
and pass `"train_tf": true` when training. Needs several reps to be meaningful.
