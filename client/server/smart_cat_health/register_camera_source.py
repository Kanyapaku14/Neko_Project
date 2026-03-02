import os
import argparse

from dotenv import load_dotenv
from supabase import create_client


def get_supabase():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    load_dotenv(os.path.join(base_dir, "..", "..", ".env"))
    url = os.getenv("EXPO_PUBLIC_SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_KEY")
    if not (url and key):
        raise RuntimeError("Missing EXPO_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_KEY in .env")
    return create_client(url, key)


def main():
    parser = argparse.ArgumentParser(description="Register stream source per camera (account-separated)")
    parser.add_argument("--camera-id", required=True, help="UUID in cameras.id")
    parser.add_argument(
        "--source",
        required=True,
        help="Example: webcam:0, C:\\videos\\cat1.mp4, rtsp://....",
    )
    args = parser.parse_args()

    supabase = get_supabase()
    payload = {"stream_source": args.source}
    supabase.table("cameras").update(payload).eq("id", args.camera_id).execute()
    print(f"Updated camera {args.camera_id} stream_source={args.source}")


if __name__ == "__main__":
    main()

