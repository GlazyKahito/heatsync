"""Extract Maharashtra's districts from geoBoundaries IND ADM1/ADM2, compute border adjacency and centroids.

Outputs (in ./out):
  mh-raw.geojson     unsimplified district polygons (input for mapshaper)
  districts.json     district metadata + adjacency list, ordered by id  (copy to src/data/)

Then simplify for the web, keeping shared borders:
  npx mapshaper out/mh-raw.geojson -simplify 6% keep-shapes -clean -o out/mh-simple.geojson precision=0.0001
  (copy out/mh-simple.geojson to src/data/mh-districts.geo.json)
"""
import json
import os
import sys
import unicodedata
from pathlib import Path

from shapely.geometry import shape, mapping
from shapely.ops import unary_union

# geoBoundaries IND ADM1 + ADM2 GeoJSON (https://www.geoboundaries.org), saved as raw/adm1.geojson and raw/adm2.geojson
SRC = Path(os.environ.get("GEO_SRC", Path(__file__).parent / "raw"))
OUT = Path(__file__).parent / "out"
OUT.mkdir(exist_ok=True)

# Canonical (current official) names, former names as aliases, IMD met subdivision, revenue division,
# coastal flag (IMD uses a separate heatwave criterion for coastal stations) and district HQ PIN.
META = {
    "Mumbai City": dict(aliases=["Mumbai", "Bombay"], sub="Konkan", div="Konkan", coastal=True, pin="400001"),
    "Mumbai Suburban": dict(aliases=["Bandra", "Mumbai Suburb"], sub="Konkan", div="Konkan", coastal=True, pin="400051"),
    "Thane": dict(aliases=[], sub="Konkan", div="Konkan", coastal=True, pin="400601"),
    "Palghar": dict(aliases=[], sub="Konkan", div="Konkan", coastal=True, pin="401404"),
    "Raigad": dict(aliases=["Alibag", "Kolaba"], sub="Konkan", div="Konkan", coastal=True, pin="402201"),
    "Ratnagiri": dict(aliases=[], sub="Konkan", div="Konkan", coastal=True, pin="415612"),
    "Sindhudurg": dict(aliases=["Oros"], sub="Konkan", div="Konkan", coastal=True, pin="416812"),
    "Pune": dict(aliases=["Poona"], sub="Madhya Maharashtra", div="Pune", coastal=False, pin="411001"),
    "Satara": dict(aliases=[], sub="Madhya Maharashtra", div="Pune", coastal=False, pin="415001"),
    "Sangli": dict(aliases=[], sub="Madhya Maharashtra", div="Pune", coastal=False, pin="416416"),
    "Solapur": dict(aliases=["Sholapur"], sub="Madhya Maharashtra", div="Pune", coastal=False, pin="413001"),
    "Kolhapur": dict(aliases=[], sub="Madhya Maharashtra", div="Pune", coastal=False, pin="416001"),
    "Nashik": dict(aliases=["Nasik"], sub="Madhya Maharashtra", div="Nashik", coastal=False, pin="422001"),
    "Dhule": dict(aliases=["Dhulia"], sub="Madhya Maharashtra", div="Nashik", coastal=False, pin="424001"),
    "Nandurbar": dict(aliases=[], sub="Madhya Maharashtra", div="Nashik", coastal=False, pin="425412"),
    "Jalgaon": dict(aliases=[], sub="Madhya Maharashtra", div="Nashik", coastal=False, pin="425001"),
    "Ahilyanagar": dict(aliases=["Ahmednagar", "Ahmadnagar"], sub="Madhya Maharashtra", div="Nashik", coastal=False, pin="414001"),
    "Chhatrapati Sambhajinagar": dict(aliases=["Aurangabad"], sub="Marathwada", div="Chhatrapati Sambhajinagar", coastal=False, pin="431001"),
    "Jalna": dict(aliases=[], sub="Marathwada", div="Chhatrapati Sambhajinagar", coastal=False, pin="431203"),
    "Beed": dict(aliases=["Bid", "Bhir"], sub="Marathwada", div="Chhatrapati Sambhajinagar", coastal=False, pin="431122"),
    "Parbhani": dict(aliases=[], sub="Marathwada", div="Chhatrapati Sambhajinagar", coastal=False, pin="431401"),
    "Hingoli": dict(aliases=[], sub="Marathwada", div="Chhatrapati Sambhajinagar", coastal=False, pin="431513"),
    "Nanded": dict(aliases=[], sub="Marathwada", div="Chhatrapati Sambhajinagar", coastal=False, pin="431601"),
    "Latur": dict(aliases=[], sub="Marathwada", div="Chhatrapati Sambhajinagar", coastal=False, pin="413512"),
    "Dharashiv": dict(aliases=["Osmanabad"], sub="Marathwada", div="Chhatrapati Sambhajinagar", coastal=False, pin="413501"),
    "Amravati": dict(aliases=["Amraoti"], sub="Vidarbha", div="Amravati", coastal=False, pin="444601"),
    "Akola": dict(aliases=[], sub="Vidarbha", div="Amravati", coastal=False, pin="444001"),
    "Washim": dict(aliases=["Basim"], sub="Vidarbha", div="Amravati", coastal=False, pin="444505"),
    "Buldhana": dict(aliases=["Buldana"], sub="Vidarbha", div="Amravati", coastal=False, pin="443001"),
    "Yavatmal": dict(aliases=["Yeotmal"], sub="Vidarbha", div="Amravati", coastal=False, pin="445001"),
    "Nagpur": dict(aliases=[], sub="Vidarbha", div="Nagpur", coastal=False, pin="440001"),
    "Wardha": dict(aliases=[], sub="Vidarbha", div="Nagpur", coastal=False, pin="442001"),
    "Bhandara": dict(aliases=[], sub="Vidarbha", div="Nagpur", coastal=False, pin="441904"),
    "Gondia": dict(aliases=["Gondiya"], sub="Vidarbha", div="Nagpur", coastal=False, pin="441601"),
    "Chandrapur": dict(aliases=["Chanda"], sub="Vidarbha", div="Nagpur", coastal=False, pin="442401"),
    "Gadchiroli": dict(aliases=[], sub="Vidarbha", div="Nagpur", coastal=False, pin="442605"),
}

# geoBoundaries 2021 spellings -> canonical names above
def plain(s):
    return "".join(c for c in unicodedata.normalize("NFKD", s) if not unicodedata.combining(c))


RENAME = {
    "Ahmadnagar": "Ahilyanagar", "Ahmednagar": "Ahilyanagar", "Aurangabad": "Chhatrapati Sambhajinagar",
    "Osmanabad": "Dharashiv", "Bid": "Beed", "Gondiya": "Gondia", "Buldana": "Buldhana", "Mumbai": "Mumbai City",
    "Mumbai Suburban": "Mumbai Suburban", "Nasik": "Nashik", "Raigarh": "Raigad",
}


def main():
    adm1 = json.loads((SRC / "adm1.geojson").read_text(encoding="utf-8"))
    mh = next(f for f in adm1["features"] if "maharashtra" in plain(f["properties"]["shapeName"]).lower())
    mh_shape = shape(mh["geometry"]).buffer(0)

    adm2 = json.loads((SRC / "adm2.geojson").read_text(encoding="utf-8"))
    picked = []
    for f in adm2["features"]:
        g = shape(f["geometry"]).buffer(0)
        if mh_shape.contains(g.representative_point()):
            name = plain(f["properties"]["shapeName"]).strip()
            picked.append((RENAME.get(name, name), g))

    names = sorted(n for n, _ in picked)
    print(len(picked), "districts:", names, file=sys.stderr)
    missing = set(META) - set(names)
    extra = set(names) - set(META)
    if missing or extra:
        print("MISSING", missing, "EXTRA", extra, file=sys.stderr)

    # merge duplicates (if a district is split into several features)
    merged = {}
    for n, g in picked:
        merged[n] = unary_union([merged[n], g]) if n in merged else g

    # stable order: by subdivision then name (west -> east roughly by lon inside each)
    order = ["Konkan", "Madhya Maharashtra", "Marathwada", "Vidarbha"]
    keys = sorted(merged, key=lambda n: (order.index(META[n]["sub"]), merged[n].centroid.x))

    feats = []
    districts = []
    for i, n in enumerate(keys):
        g = merged[n]
        rp = g.representative_point()
        m = META[n]
        feats.append({"type": "Feature", "properties": {"id": i, "name": n}, "geometry": mapping(g)})
        districts.append({
            "id": i,
            "name": n,
            "aliases": m["aliases"],
            "subdivision": m["sub"],
            "division": m["div"],
            "coastal": m["coastal"],
            "hqPin": m["pin"],
            "lat": round(rp.y, 4),
            "lon": round(rp.x, 4),
            "areaKm2": round(g.area * (111.32 ** 2) * abs(__import__("math").cos(__import__("math").radians(rp.y)))),
        })

    # adjacency: polygons whose boundaries touch / overlap within ~300 m
    shapes = [merged[n] for n in keys]
    buf = [s.buffer(0.003) for s in shapes]
    for i in range(len(keys)):
        nb = []
        for j in range(len(keys)):
            if i != j and buf[i].intersects(shapes[j]):
                inter = buf[i].intersection(shapes[j])
                if inter.length > 0.01 or inter.area > 1e-5:  # share a real border, not a single corner
                    nb.append(j)
        districts[i]["neighbors"] = nb

    (OUT / "mh-raw.geojson").write_text(json.dumps({"type": "FeatureCollection", "features": feats}), encoding="utf-8")
    (OUT / "districts.json").write_text(json.dumps(districts, indent=1, ensure_ascii=False), encoding="utf-8")
    for d in districts:
        print(d["id"], d["name"], d["subdivision"], "->", [districts[j]["name"] for j in d["neighbors"]], file=sys.stderr)


if __name__ == "__main__":
    main()
