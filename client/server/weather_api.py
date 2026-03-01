from flask import Flask, request, jsonify
from flask_cors import CORS
from urllib.parse import urlencode
from urllib.request import urlopen, Request
from urllib.error import URLError, HTTPError
import json


app = Flask(__name__)
CORS(app)


def _safe_json_get(url, timeout=6):
    req = Request(url, headers={"User-Agent": "NekoProject/1.0"})
    with urlopen(req, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def _normalize_condition(code, is_day=1):
    # Open-Meteo WMO mapping for frontend icons
    if code == 0:
        return ("Clear", "weather-sunny" if is_day else "weather-night")
    if code in (1, 2):
        return ("Partly Cloudy", "weather-partly-cloudy")
    if code == 3:
        return ("Cloudy", "weather-cloudy")
    if code in (45, 48):
        return ("Fog", "weather-fog")
    if code in (51, 53, 55, 56, 57):
        return ("Drizzle", "weather-rainy")
    if code in (61, 63, 65, 66, 67):
        return ("Rain", "weather-pouring")
    if code in (71, 73, 75, 77):
        return ("Snow", "weather-snowy")
    if code in (80, 81, 82):
        return ("Rain Showers", "weather-partly-rainy")
    if code in (95, 96, 99):
        return ("Thunder", "weather-lightning-rainy")
    return ("Unknown", "weather-partly-cloudy")


@app.route("/api/weather-card", methods=["GET"])
def weather_card():
    """
    Non-breaking standalone weather endpoint.
    Query params:
      - lat (optional, default: 13.7563)
      - lon (optional, default: 100.5018)
      - location (optional, default: Home)
      - timezone (optional, default: auto)
    """
    lat = request.args.get("lat", default=13.7563, type=float)
    lon = request.args.get("lon", default=100.5018, type=float)
    location = request.args.get("location", default="Home", type=str)
    timezone = request.args.get("timezone", default="auto", type=str)

    params = {
        "latitude": lat,
        "longitude": lon,
        "current": "temperature_2m,relative_humidity_2m,weather_code,is_day",
        "timezone": timezone,
    }
    url = "https://api.open-meteo.com/v1/forecast?" + urlencode(params)

    try:
        payload = _safe_json_get(url)
        current = payload.get("current", {})
        temp = current.get("temperature_2m")
        humidity = current.get("relative_humidity_2m")
        weather_code = int(current.get("weather_code", 0))
        is_day = int(current.get("is_day", 1))
        condition, icon = _normalize_condition(weather_code, is_day)

        return jsonify({
            "ok": True,
            "source": "open-meteo",
            "location": location,
            "temperatureC": temp,
            "humidity": humidity,
            "condition": condition,
            "icon": icon,
            "weatherCode": weather_code,
            "isDay": is_day,
            "fetchedAt": payload.get("current", {}).get("time"),
        })
    except (URLError, HTTPError, TimeoutError) as e:
        # Keep response shape stable for frontend.
        return jsonify({
            "ok": False,
            "location": location,
            "temperatureC": None,
            "humidity": None,
            "condition": "Unavailable",
            "icon": "weather-cloudy-alert",
            "error": str(e),
        }), 502
    except Exception as e:
        return jsonify({
            "ok": False,
            "location": location,
            "temperatureC": None,
            "humidity": None,
            "condition": "Unavailable",
            "icon": "weather-cloudy-alert",
            "error": str(e),
        }), 500


if __name__ == "__main__":
    print("Weather API running on port 3001")
    app.run(host="0.0.0.0", port=3001, debug=True)
