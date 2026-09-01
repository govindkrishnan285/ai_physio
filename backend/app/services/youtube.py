"""Fetch reference videos from YouTube URLs (or accept direct file uploads).

Note: downloading YouTube content may conflict with YouTube's Terms of Service
and reference clips are frequently copyrighted. Intended for private
research/clinical prototyping. Direct file upload (save_upload) avoids this.
"""

from __future__ import annotations

import os
import shutil
import uuid
from pathlib import Path


class VideoUnavailableError(Exception):
    """The video can't be fetched for reasons the user must resolve
    (private / deleted / region- or age-restricted / login required)."""


def _js_runtime() -> dict:
    """Recent yt-dlp needs a JavaScript runtime to extract YouTube formats.

    Prefer Node (usually already installed for the frontend); fall back to Deno,
    which yt-dlp enables by default. Returning {} lets yt-dlp use its default.
    """
    override = os.environ.get("YTDLP_JS_RUNTIME")  # e.g. "node" or "deno"
    if override:
        return {"js_runtimes": {override: {}}}
    if shutil.which("node"):
        return {"js_runtimes": {"node": {}}}
    return {}


def download_video(url: str, dest_dir: Path) -> Path:
    """Download a single video to dest_dir; return the local file path."""
    import yt_dlp

    dest_dir.mkdir(parents=True, exist_ok=True)
    out_id = uuid.uuid4().hex
    out_tmpl = str(dest_dir / f"{out_id}.%(ext)s")

    ydl_opts = {
        # Prefer a progressive MP4 (no ffmpeg merge needed) capped at 720p.
        "format": "best[ext=mp4][height<=720]/best[height<=720]/best",
        "outtmpl": out_tmpl,
        "quiet": True,
        "no_warnings": True,
        "noprogress": True,
        "noplaylist": True,
        "retries": 3,
        "fragment_retries": 3,
        # YouTube's default `web` client is increasingly blocked — its media
        # URLs 403 or report "format not available". The mobile/tv clients
        # still serve progressive formats, so try them first and fall back to
        # web. yt-dlp uses the first client that yields a usable format.
        "extractor_args": {
            "youtube": {"player_client": ["android", "ios", "tv", "web"]}
        },
        # Optionally reuse the user's YouTube session for restricted videos:
        #   export YTDLP_COOKIES_FROM_BROWSER=chrome
        **_js_runtime(),
    }

    cookies_browser = os.environ.get("YTDLP_COOKIES_FROM_BROWSER")
    if cookies_browser:
        ydl_opts["cookiesfrombrowser"] = (cookies_browser,)

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
            filename = ydl.prepare_filename(info)
    except yt_dlp.utils.DownloadError as exc:
        msg = str(exc).lower()
        if any(
            k in msg
            for k in ("unavailable", "private", "age", "removed", "not available", "sign in", "members-only")
        ):
            raise VideoUnavailableError(
                "YouTube reports this video as unavailable, private, or "
                "restricted. Use a different public video URL, or set "
                "YTDLP_COOKIES_FROM_BROWSER=chrome to use your logged-in session."
            ) from exc
        raise

    path = Path(filename)
    if not path.exists():
        # Extension may differ from the template after remux; find it.
        matches = list(dest_dir.glob(f"{out_id}.*"))
        if not matches:
            raise FileNotFoundError(f"Download produced no file for {url}")
        path = matches[0]
    return path


def save_upload(data: bytes, dest_dir: Path, suffix: str = ".mp4") -> Path:
    """Persist an uploaded video file; return its path."""
    dest_dir.mkdir(parents=True, exist_ok=True)
    path = dest_dir / f"{uuid.uuid4().hex}{suffix}"
    path.write_bytes(data)
    return path
