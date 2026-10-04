# Data pipeline

Reproduces every data file the app ships. Python 3.10+ with `shapely`, `requests` (and `truststore` on networks
with a custom certificate store).

| Step | Command | Output |
|---|---|---|
| 1. Districts + border graph | `python build_geo.py` | `out/districts.json`, `out/mh-raw.geojson` |
| 2. Simplify boundaries | `npx mapshaper out/mh-raw.geojson -simplify 6% keep-shapes -clean -o out/mh-simple.geojson precision=0.0001` | `out/mh-simple.geojson` |
| 3. ERA5 history + replay | `python fetch_era5.py` (≈8 min, rate-limited for the free tier) | `out/era5-season.json`, `out/era5-replay.json` |
| 4. Pack for the app | `python pack_data.py` | `src/data/normals.json`, `src/data/replay.json`, `public/data/archive.json` |

Copy `out/districts.json` → `src/data/districts.json` and `out/mh-simple.geojson` → `src/data/mh-districts.geo.json`.

Sources: geoBoundaries IND ADM1/ADM2 (place the GeoJSON files in `raw/` or point `GEO_SRC` at them), ERA5
reanalysis via the Open-Meteo archive API (CC BY 4.0).
