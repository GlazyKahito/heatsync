"""Pack the fetched ERA5 data into the compact files the app ships.

  src/data/normals.json     36 x 122 normals (tenths of degC) for 1 Mar - 30 Jun, ERA5 2015-2024 mean, +/-7 day window
  src/data/replay.json      May 2024 daily (Tmax, feels-like, RH, wind) + hourly temperature 15 May - 5 Jun 2024
  public/data/archive.json  daily Tmax 1 Mar - 30 Jun, 2015-2025, all districts (tenths of degC)
"""
import json
from pathlib import Path

HERE = Path(__file__).parent
OUT = HERE / "out"
APP = HERE.parents[1]  # repository root
SEASON_DAYS = 122  # 1 Mar - 30 Jun is 122 days in every year

season = json.loads((OUT / "era5-season.json").read_text(encoding="utf-8"))
replay = json.loads((OUT / "era5-replay.json").read_text(encoding="utf-8"))
dates = season["dates"]
years = sorted({d[:4] for d in dates})
assert len(dates) == SEASON_DAYS * len(years), (len(dates), len(years))

# normals from 2015-2024 (2025 is held out so "today vs normal" is never compared against itself)
normal_years = [y for y in years if y <= "2024"]
normals = []
for series in season["tmax"]:
    by_year = {y: series[i * SEASON_DAYS:(i + 1) * SEASON_DAYS] for i, y in enumerate(years)}
    row = []
    for doy in range(SEASON_DAYS):
        vals = []
        for y in normal_years:
            s = by_year[y]
            for k in range(max(0, doy - 7), min(SEASON_DAYS, doy + 8)):
                if s[k] is not None:
                    vals.append(s[k])
        row.append(round(sum(vals) / len(vals)))
    normals.append(row)

(APP / "src/data/normals.json").write_text(
    json.dumps({"source": "ERA5 via Open-Meteo, mean of 2015-2024, +/-7 days", "unit": "0.1 degC", "start": "03-01", "normals": normals}, separators=(",", ":")),
    encoding="utf-8",
)

t10 = lambda v: None if v is None else round(v * 10)
rp = {
    "source": replay["source"],
    "unit": "0.1 degC (rh: %, wind: km/h)",
    "days": replay["daily"]["time"],
    "tmax": [[t10(v) for v in d["temperature_2m_max"]] for d in replay["daily"]["districts"]],
    "feels": [[t10(v) for v in d["apparent_temperature_max"]] for d in replay["daily"]["districts"]],
    "rh": [[None if v is None else round(v) for v in d["relative_humidity_2m_mean"]] for d in replay["daily"]["districts"]],
    "wind": [[None if v is None else round(v) for v in d["wind_speed_10m_max"]] for d in replay["daily"]["districts"]],
    "hourlyStart": replay["hourly"]["time"][0],
    "hourly": [[t10(v) for v in h["temperature_2m"]] for h in replay["hourly"]["districts"]],
}
(APP / "src/data/replay.json").write_text(json.dumps(rp, separators=(",", ":")), encoding="utf-8")

(APP / "public/data").mkdir(parents=True, exist_ok=True)
(APP / "public/data/archive.json").write_text(
    json.dumps({"source": season["source"], "unit": "0.1 degC", "years": [int(y) for y in years], "seasonStart": "03-01", "seasonDays": SEASON_DAYS, "tmax": season["tmax"]}, separators=(",", ":")),
    encoding="utf-8",
)
for f in ["src/data/normals.json", "src/data/replay.json", "public/data/archive.json"]:
    print(f, (APP / f).stat().st_size // 1024, "KB")
