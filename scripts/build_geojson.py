import geopandas as gpd
import pandas as pd
from pathlib import Path
import re
import requests

# -------------------------------------------------
# Inputs/outputs
# -------------------------------------------------
EXCEL_PATH = Path("data_raw/calenviroscreen_AB617.xlsx")  # <-- update if your Excel is elsewhere
OUT_PATH = Path("public/data/communities.geojson")

# ArcGIS Online item id you shared
ITEM_ID = "7e0156d661f7490c8c4702157f534ec0"

# -------------------------------------------------
# Helpers
# -------------------------------------------------
def slugify(text):
    if pd.isna(text):
        return None
    text = str(text).lower().strip()
    text = re.sub(r"[^a-z0-9]+", "_", text)
    return text.strip("_")

def get_item_service_url(item_id: str) -> str:
    """Fetch the Feature Service URL from the ArcGIS item metadata."""
    url = f"https://www.arcgis.com/sharing/rest/content/items/{item_id}"
    r = requests.get(url, params={"f": "pjson"}, timeout=60)
    r.raise_for_status()
    js = r.json()
    if "url" not in js or not js["url"]:
        raise RuntimeError(f"Could not find a service URL in item metadata for item {item_id}.")
    return js["url"]

def fetch_layer_geojson(layer_url: str) -> dict:
    """Download ALL features from a FeatureServer layer as GeoJSON (handles paging)."""
    query_url = layer_url.rstrip("/") + "/query"

    # First request: get count (optional but helpful)
    count_params = {
        "where": "1=1",
        "returnCountOnly": "true",
        "f": "pjson",
    }
    rc = requests.get(query_url, params=count_params, timeout=60)
    rc.raise_for_status()
    count_js = rc.json()
    total = int(count_js.get("count", 0))
    print(f"ArcGIS layer feature count: {total}")

    features = []
    offset = 0
    page_size = 2000  # ArcGIS servers often cap around 2000 per request

    while True:
        params = {
            "where": "1=1",
            "outFields": "*",
            "returnGeometry": "true",
            "outSR": "4326",
            "f": "geojson",
            "resultOffset": offset,
            "resultRecordCount": page_size,
        }
        r = requests.get(query_url, params=params, timeout=120)

        # If ArcGIS returns HTML or an error page, show a helpful snippet
        if "application/json" not in r.headers.get("Content-Type", "") and "geojson" not in r.headers.get("Content-Type", ""):
            snippet = r.text[:300].replace("\n", " ")
            raise RuntimeError(
                "ArcGIS did not return GeoJSON/JSON. "
                f"HTTP {r.status_code}. First 300 chars:\n{snippet}"
            )

        r.raise_for_status()
        gj = r.json()
        batch = gj.get("features", [])
        if not batch:
            break

        features.extend(batch)
        offset += len(batch)
        print(f"  downloaded {len(features)} / {total if total else '?'} features...")

        if total and offset >= total:
            break

    return {"type": "FeatureCollection", "features": features}

# -------------------------------------------------
# 1) Download AB 617 boundaries from ArcGIS item
# -------------------------------------------------
print("Getting Feature Service URL from ArcGIS item…")
service_url = get_item_service_url(ITEM_ID)
print("Service URL:", service_url)

# layer 0 (because your link had sublayer=0)
layer0_url = service_url.rstrip("/") + "/0"
print("Downloading layer 0 as GeoJSON…")
geojson = fetch_layer_geojson(layer0_url)

gdf = gpd.GeoDataFrame.from_features(geojson["features"], crs="EPSG:4326")
print("✅ Loaded polygons:", len(gdf))
print("\nSpatial columns:")
print(gdf.columns.tolist())

# -------------------------------------------------
# 2) Load Excel + merge
# -------------------------------------------------
print("\nLoading Excel…")
df = pd.read_excel(EXCEL_PATH)
df.columns = df.columns.str.strip()
print("Excel columns:")
print(df.columns.tolist())

# ---- SET THESE TWO to match real column names ----
SPATIAL_JOIN_COL = "COMMUNITY_NAME"
EXCEL_JOIN_COL = "COMMUNITY_NAME"    # <-- change after you see printed excel columns
# --------------------------------------------------

gdf["_join"] = gdf[SPATIAL_JOIN_COL].astype(str).str.strip().str.lower()
df["_join"]  = df[EXCEL_JOIN_COL].astype(str).str.strip().str.lower()

print("\nMerging spatial + Excel…")
gdf_merged = gdf.merge(df, on="_join", how="left")

# Create stable id for the website (do this BEFORE merge to avoid _x/_y issues)
gdf["community_id"] = gdf[SPATIAL_JOIN_COL].apply(slugify)

print("\nMerging spatial + Excel…")
gdf_merged = gdf.merge(df, on="_join", how="left")

# Clean helper col
gdf_merged = gdf_merged.drop(columns=["_join"])

# -------------------------------------------------
# 3) Export GeoJSON for the website
# -------------------------------------------------
OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
gdf_merged.to_file(OUT_PATH, driver="GeoJSON")

print("\n✅ Wrote:", OUT_PATH)
print("Rows:", len(gdf_merged))
