# Curated exercise dataset

Drop therapist-approved reference clips here, one subfolder per exercise. The
folder name is matched to an exercise (by name, or via `FOLDER_ALIASES` in
`scripts/train_local.py`).

```
datasets/
  ACL/                 acl_demo1.mp4  acl_demo2.mp4
  Shoulder/            abduction.mp4
  RotatorCuff/         cuff.mov
  Squat/               wall_squat.mp4
  Meniscus/            ...
  Balance/             ...
```

Supported video types: `.mp4 .mov .avi .mkv .webm`.

## Train (offline, local only)

From the `backend/` directory, with the venv active:

```bash
python scripts/train_local.py --datasets ./datasets            # all exercises
python scripts/train_local.py --exercise ACL                   # one folder
python scripts/train_local.py --datasets ./datasets --train-tf # + TF autoencoder
```

For each exercise the pipeline:
1. runs MediaPipe Pose on every clip,
2. extracts biomechanical features (angles, ROM, velocity, symmetry, orientation),
3. auto-detects and trims the **active-exercise segment** (ignores intro / talking
   / outro) via `services/segmentation.py`,
4. builds the DTW reference template (and optionally the TF autoencoder),
5. copies one clip as the **side-by-side reference video**, storing the active
   window so the player loops only the movement,
6. saves everything to PostgreSQL.

Trained exercises then show the reference clip beside the live camera and score
each rep against the learned movement. No videos are downloaded and no training
happens online.

## Where to source clips

Record or collect therapist-approved demonstrations, or use frames from public
rehabilitation / human-motion datasets you are licensed to use (e.g. PHYTMO,
university physiotherapy demos, open educational rehab videos). Keep only the
clean single-person exercise footage — the segmentation trims dead time, but it
can't fix a clip that is mostly talking-head.
