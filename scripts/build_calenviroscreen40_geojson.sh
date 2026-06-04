#!/usr/bin/env bash
set -euo pipefail

SOURCE_PATH="${1:-/Users/courtney/Downloads/calenviroscreen40shpf2021shp/CES4 Final Shapefile.shp}"
OUT_PATH="${2:-public/data/calenviroscreen40.geojson}"
TMP_PATH="$(mktemp /tmp/calenviroscreen40.XXXXXX.geojson)"

ogr2ogr \
  -f GeoJSON "$TMP_PATH" "$SOURCE_PATH" \
  -dialect SQLite \
  -sql "SELECT ST_SimplifyPreserveTopology(ST_MakeValid(geometry), 80) AS geometry, Tract, County, ApproxLoc, TotPop19, CIscore, CIscoreP FROM 'CES4 Final Shapefile'" \
  -t_srs EPSG:4326

mv "$TMP_PATH" "$OUT_PATH"
echo "Wrote $OUT_PATH"
