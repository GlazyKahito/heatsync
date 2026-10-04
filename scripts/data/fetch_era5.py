"""Fetch real ERA5 reanalysis (via Open-Meteo's archive API) for the 36 district points.

  out/era5-season.json   daily Tmax, 1 Mar - 30 Jun, 2015-2025 (one request per year, all districts)
  out/era5-replay.json   May 2024 daily (Tmax, feels-like max, RH mean, wind max) + hourly Tmax/RH, 15 May - 5 Jun 2024

Open-Meteo counts long or multi-location requests as several calls, so requests are spaced out to stay well inside the
free tier (600 weighted calls / minute).
"""
import json
import sys
import time
from pathlib import Path

import requests
import truststore

truststore.inject_into_ssl()  # use the OS certificate store

OUT = Path(__file__).parent / "out"
URL = "https://archive-api.open-meteo.com/v1/archive"
districts = json.loads((OUT / "districts.json").read_text(encoding="utf-8"))
LAT = ",".join(str(d["lat"]) for d in districts)
LON = ",".join(str(d["lon"]) for d in districts)


def get(params, label):
    for attempt in range(8):
        r = requests.get(URL, params={"latitude": LAT, "longitude": LON, "timezone": "Asia/Kolkata", **params}, timeout=120)
        if r.status_code == 200:
            data = r.json()
            print(f"ok {label}", file=sys.stderr, flush=True)
            return data if isinstance(data, list) else [data]
        wait = 30 * (attempt + 1)
        print(f"{label}: HTTP {r.status_code} {r.text[:160]} - retry in {wait}s", file=sys.stderr, flush=True)
        time.sleep(wait)
    raise SystemExit(f"giving up on {label}")


def season():
    years = list(range(2015, 2026))
    dates, tmax = [], [[] for _ in districts]
    for i, y in enumerate(years):
        rows = get({"start_date": f"{y}-03-01", "end_date": f"{y}-06-30", "daily": "temperature_2m_max"}, f"season {y}")
        dates += rows[0]["daily"]["time"]
        for k, row in enumerate(rows):
            tmax[k] += row["daily"]["temperature_2m_max"]
        if i < len(years) - 1:
            time.sleep(40)
    # store as integer tenths of a degree to keep the file small
    packed = [[None if v is None else round(v * 10) for v in series] for series in tmax]
    (OUT / "era5-season.json").write_text(
        json.dumps({"source": "ERA5 reanalysis via Open-Meteo archive API (CC BY 4.0)", "unit": "0.1 degC", "dates": dates, "tmax": packed}, separators=(",", ":")),
        encoding="utf-8",
    )


def replay():
    daily = get(
        {"start_date": "2024-05-01", "end_date": "2024-05-31",
         "daily": "temperature_2m_max,apparent_temperature_max,relative_humidity_2m_mean,wind_speed_10m_max"},
        "replay daily",
    )
    time.sleep(20)
    hourly = get({"start_date": "2024-05-15", "end_date": "2024-06-05", "hourly": "temperature_2m,relative_humidity_2m"}, "replay hourly")
    out = {
        "source": "ERA5 reanalysis via Open-Meteo archive API (CC BY 4.0)",
        "daily": {"time": daily[0]["daily"]["time"], "districts": [r["daily"] for r in daily]},
        "hourly": {"time": hourly[0]["hourly"]["time"], "districts": [r["hourly"] for r in hourly]},
    }
    for d in out["daily"]["districts"]:
        d.pop("time", None)
    for h in out["hourly"]["districts"]:
        h.pop("time", None)
    (OUT / "era5-replay.json").write_text(json.dumps(out, separators=(",", ":")), encoding="utf-8")


if __name__ == "__main__":
    which = sys.argv[1] if len(sys.argv) > 1 else "all"
    if which in ("replay", "all"):
        replay()
        time.sleep(30)
    if which in ("season", "all"):
        season()
    print("done", file=sys.stderr)
