import argparse
import mimetypes
import os
import sys
from pathlib import Path
from typing import Iterable, List, Optional, Tuple

from dotenv import load_dotenv

try:
    from supabase import create_client
except Exception as exc:  # pragma: no cover
    raise SystemExit(f"Missing supabase package: {exc}")


VIDEO_EXTS = {".mp4", ".webm", ".mov", ".mkv", ".avi", ".m4v"}


def load_env() -> Tuple[str, str]:
    base = Path(__file__).resolve().parent
    load_dotenv(base / "client" / ".env")
    load_dotenv(base / ".env")
    url = os.getenv("EXPO_PUBLIC_SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_KEY")
    if not url or not key:
        raise SystemExit("Missing EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_KEY in .env")
    return url, key


def iter_video_files(files: Iterable[str], videos_dir: Optional[str]) -> List[Path]:
    paths: List[Path] = []
    for f in files:
        p = Path(f).expanduser().resolve()
        if p.is_file():
            paths.append(p)
    if videos_dir:
        d = Path(videos_dir).expanduser().resolve()
        if d.is_dir():
            for p in d.iterdir():
                if p.is_file() and p.suffix.lower() in VIDEO_EXTS:
                    paths.append(p.resolve())
    dedup = []
    seen = set()
    for p in paths:
        if p not in seen:
            seen.add(p)
            dedup.append(p)
    return dedup


def _storage_public_url(storage_client, object_path: str) -> Optional[str]:
    res = storage_client.get_public_url(object_path)
    if isinstance(res, dict):
        data = res.get("data") or {}
        return data.get("publicUrl") or data.get("public_url")
    if hasattr(res, "get"):
        return res.get("publicUrl") or res.get("public_url")
    return str(res) if res else None


def ensure_bucket(supabase, bucket: str, public: bool) -> None:
    def _bucket_name(b):
        if isinstance(b, dict):
            return b.get("name") or b.get("id")
        return getattr(b, "name", None) or getattr(b, "id", None)

    try:
        buckets = supabase.storage.list_buckets() or []
        exists = any(_bucket_name(b) == bucket for b in buckets)
        if not exists:
            created = False
            # supabase-py versions use different signatures for create_bucket.
            for call in (
                lambda: supabase.storage.create_bucket(bucket),
                lambda: supabase.storage.create_bucket(bucket, {"public": public}),
                lambda: supabase.storage.create_bucket(bucket, options={"public": public}),
                lambda: supabase.storage.create_bucket(bucket, public=public),
            ):
                try:
                    call()
                    created = True
                    break
                except Exception:
                    continue
            if created:
                print(f"[OK] created bucket: {bucket}")
            else:
                print(f"[WARN] could not create bucket automatically: {bucket}")
    except Exception as e:
        print(f"[WARN] bucket check/create failed: {e}")


def pick_camera_id(supabase, owner_id: str, camera_id: Optional[str]) -> Optional[str]:
    if camera_id:
        return camera_id
    try:
        row = (
            supabase.table("cameras")
            .select("id")
            .eq("owner_id", owner_id)
            .order("is_primary", desc=True)
            .order("created_at", desc=False)
            .limit(1)
            .maybe_single()
            .execute()
            .data
        )
        return (row or {}).get("id")
    except Exception as e:
        print(f"[WARN] load camera for owner failed: {e}")
        return None


def upload_video(supabase, bucket: str, owner_id: str, camera_id: Optional[str], local_path: Path, upsert: bool) -> Tuple[str, str]:
    folder = camera_id or "no-camera"
    object_path = f"{owner_id}/{folder}/{local_path.name}"
    storage = supabase.storage.from_(bucket)
    mime = mimetypes.guess_type(local_path.name)[0] or "video/mp4"
    with local_path.open("rb") as f:
        storage.upload(object_path, f.read(), {"content-type": mime, "x-upsert": str(upsert).lower()})
    public_url = _storage_public_url(storage, object_path)
    if not public_url:
        raise RuntimeError(f"cannot get public url for {object_path}")
    return object_path, public_url


def upsert_demo_video_row(
    supabase,
    owner_id: str,
    camera_id: Optional[str],
    title: str,
    storage_path: str,
    public_url: str,
    mime_type: Optional[str],
    size_bytes: int,
) -> None:
    payload = {
        "owner_id": owner_id,
        "camera_id": camera_id,
        "title": title,
        "storage_path": storage_path,
        "public_url": public_url,
        "mime_type": mime_type,
        "size_bytes": size_bytes,
        "is_active": True,
    }
    try:
        supabase.table("demo_videos").upsert(payload, on_conflict="storage_path").execute()
    except Exception as e:
        print(f"[WARN] demo_videos upsert skipped: {e}")


def set_camera_stream_source(supabase, camera_id: str, stream_source: str) -> None:
    supabase.table("cameras").update(
        {"stream_source": stream_source, "stream_source_type": "video"}
    ).eq("id", camera_id).execute()


def main() -> int:
    parser = argparse.ArgumentParser(description="Upload demo videos to Supabase Storage and bind to camera stream_source.")
    parser.add_argument("--owner-id", required=True, help="auth.users.id")
    parser.add_argument("--camera-id", default=None, help="public.cameras.id (optional)")
    parser.add_argument("--file", action="append", default=[], help="video file path, can pass multiple --file")
    parser.add_argument("--videos-dir", default=None, help="directory containing video files")
    parser.add_argument("--bucket", default="demo-videos", help="storage bucket name")
    parser.add_argument("--private-bucket", action="store_true", help="create/use private bucket")
    parser.add_argument("--set-active", choices=["first", "last", "none"], default="first", help="which uploaded video to set in cameras.stream_source")
    parser.add_argument("--no-upsert", action="store_true", help="disable storage upsert")
    args = parser.parse_args()

    files = iter_video_files(args.file, args.videos_dir)
    if not files:
        print("No video files found. Use --file or --videos-dir.")
        return 2

    url, key = load_env()
    supabase = create_client(url, key)
    ensure_bucket(supabase, args.bucket, public=not args.private_bucket)

    camera_id = pick_camera_id(supabase, args.owner_id, args.camera_id)
    if not camera_id:
        print("[WARN] no camera_id resolved. videos will upload and metadata will save, but camera stream_source will not be updated.")

    uploaded: List[Tuple[Path, str]] = []
    for p in files:
        try:
            storage_path, public_url = upload_video(
                supabase=supabase,
                bucket=args.bucket,
                owner_id=args.owner_id,
                camera_id=camera_id,
                local_path=p,
                upsert=not args.no_upsert,
            )
            mime = mimetypes.guess_type(p.name)[0] or "video/mp4"
            upsert_demo_video_row(
                supabase=supabase,
                owner_id=args.owner_id,
                camera_id=camera_id,
                title=p.stem,
                storage_path=storage_path,
                public_url=public_url,
                mime_type=mime,
                size_bytes=p.stat().st_size,
            )
            uploaded.append((p, public_url))
            print(f"[OK] uploaded: {p.name}")
            print(f"     url: {public_url}")
        except Exception as e:
            print(f"[ERR] upload failed: {p} -> {e}")

    if not uploaded:
        print("No uploads succeeded.")
        return 1

    if camera_id and args.set_active != "none":
        chosen = uploaded[0][1] if args.set_active == "first" else uploaded[-1][1]
        try:
            set_camera_stream_source(supabase, camera_id, chosen)
            print(f"[OK] cameras.stream_source updated for camera_id={camera_id}")
            print(f"     active source: {chosen}")
        except Exception as e:
            print(f"[ERR] failed to update cameras.stream_source: {e}")
            return 1

    print("\nDone.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
