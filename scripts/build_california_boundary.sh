#!/usr/bin/env bash
set -euo pipefail

SOURCE_PATH="${1:-/Users/courtney/Downloads/calenviroscreen40shpf2021shp/CES4 Final Shapefile.shp}"
OUT_PATH="${2:-public/data/california_boundary.geojson}"
TMP_PATH="$(mktemp /tmp/california_boundary.XXXXXX.geojson)"
TMP_OUT_PATH="$(mktemp /tmp/california_boundary_exterior.XXXXXX.geojson)"

ogr2ogr \
  -f GeoJSON "$TMP_PATH" "$SOURCE_PATH" \
  -dialect SQLite \
  -sql "SELECT ST_SimplifyPreserveTopology(ST_UnaryUnion(ST_Collect(ST_MakeValid(geometry))), 500) AS geometry, 'California' AS name FROM 'CES4 Final Shapefile'" \
  -t_srs EPSG:4326

python3 - "$TMP_PATH" "$TMP_OUT_PATH" <<'PY'
import json
import sys

in_path, out_path = sys.argv[1], sys.argv[2]

with open(in_path) as source:
    geojson = json.load(source)

for feature in geojson.get("features", []):
    geometry = feature.get("geometry")
    if not geometry:
        continue

    if geometry.get("type") == "Polygon":
        rings = geometry.get("coordinates") or []
        geometry["coordinates"] = rings[:1]
    elif geometry.get("type") == "MultiPolygon":
        geometry["coordinates"] = [
            polygon[:1] for polygon in geometry.get("coordinates", []) if polygon
        ]

with open(out_path, "w") as target:
    json.dump(geojson, target, separators=(",", ":"))
PY

mv "$TMP_OUT_PATH" "$OUT_PATH"
rm -f "$TMP_PATH"
echo "Wrote $OUT_PATH"
