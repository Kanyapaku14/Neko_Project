const DEFAULT_CAMERA_API_BASE = 'http://192.168.1.108:5000';

const normalizeBase = (raw) => String(raw || '').trim().replace(/\/+$/, '');

export const CAMERA_API_BASE = normalizeBase(
  process.env.EXPO_PUBLIC_CAMERA_API_BASE || DEFAULT_CAMERA_API_BASE
);

export const CAMERA_STREAM_QUERY = 'fps=12&quality=52&width=720';
export const CAMERA_STREAM_URL_RAW = `${CAMERA_API_BASE}/api/video_feed_raw`;
export const CAMERA_STREAM_URL_MODEL = `${CAMERA_API_BASE}/api/video_feed_model`;

// Default app stream should be raw/live
export const CAMERA_STREAM_URL = CAMERA_STREAM_URL_RAW;

