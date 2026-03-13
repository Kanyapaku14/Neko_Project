import os
from dotenv import load_dotenv
from supabase import create_client, Client

current_dir = os.path.dirname(os.path.abspath(__file__))
dotenv_path = os.path.join(current_dir, '..', '.env')
load_dotenv(dotenv_path)

SUPABASE_URL = os.getenv("EXPO_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("EXPO_PUBLIC_SUPABASE_ANON_KEY")

try:
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
    res = supabase.table('assessments').select('*').limit(1).execute()
    data = res.data
    if data and len(data) > 0:
        print("COLUMNS:", list(data[0].keys()))
    else:
        # If no data, we can't get columns this way easily, but let's see why
        print("NO DATA RETURNED")
except Exception as e:
    print("ERROR:", e)
