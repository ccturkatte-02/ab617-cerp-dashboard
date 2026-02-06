# scripts/build_strategies_json.py
#
# Reads:   data_raw/strategies.xlsx (sheet: "Full")
# Writes:  public/data/strategies_long.json
#
# Usage:
#   python scripts/build_strategies_json.py

import json
import re
from pathlib import Path

import pandas as pd


IN_XLSX = Path("data_raw/strategies.xlsx")
SHEET = "Full"
OUT_JSON = Path("public/data/strategies_long.json")


def slugify(x: object) -> str | None:
    """Stable id for web (lowercase, underscore)."""
    if x is None or (isinstance(x, float) and pd.isna(x)) or str(x).strip() == "":
        return None
    s = str(x).strip().lower()
    s = re.sub(r"[^a-z0-9]+", "_", s)
    return s.strip("_")


def clean_str(x: object) -> str | None:
    if x is None or (isinstance(x, float) and pd.isna(x)):
        return None
    s = str(x).strip()
    return s if s != "" else None


def to_number(x: object) -> float | None:
    if x is None or (isinstance(x, float) and pd.isna(x)):
        return None
    # Remove common formatting ($, commas)
    s = str(x).replace("$", "").replace(",", "").strip()
    if s == "":
        return None
    try:
        return float(s)
    except ValueError:
        return None


def none_if_nan(x: object):
    """Convert pandas NaN/None to None so JSON stays valid."""
    if x is None:
        return None
    if isinstance(x, float) and pd.isna(x):
        return None
    return x


def norm_yes(x: object) -> bool:
    s = ("" if x is None or (isinstance(x, float) and pd.isna(x)) else str(x)).strip().lower()
    return s in {"yes", "y", "true", "1"}


def main() -> None:
    if not IN_XLSX.exists():
        raise FileNotFoundError(
            f"Could not find {IN_XLSX}. Put your Excel at that path (or update IN_XLSX)."
        )

    df = pd.read_excel(IN_XLSX, sheet_name=SHEET)
    df.columns = df.columns.str.strip()

    required = {"community_id", "include", "strategy"}
    missing = required - set(df.columns)
    if missing:
        raise ValueError(f"Missing required column(s): {sorted(missing)}")

    # Filter include == yes
    df = df[df["include"].apply(norm_yes)].copy()

    # Funding columns (coerce)
    funding_cols = [
        "original_funding",
        "available_funding",
        "contracted_funding",
        "spent_funding",
        "total_funding",
    ]
    for c in funding_cols:
        if c in df.columns:
            df[c] = df[c].apply(to_number)

    # Build output rows
    rows: list[dict] = []
    for _, r in df.iterrows():
        community_id = clean_str(r.get("community_id"))
        if not community_id:
            # If community_id is blank, skip (can't link to map)
            continue

        strategy_name = clean_str(r.get("strategy"))
        subcategory = clean_str(r.get("subcategory"))
        subsubcategory = clean_str(r.get("subsubcategory"))

        # Create a stable strategy_id (prefer strategy + subcategory + subsubcategory)
        strategy_id_parts = [strategy_name, subcategory, subsubcategory]
        strategy_id = slugify(" - ".join([p for p in strategy_id_parts if p]))

        # Funding: force NaN -> None
        funding = {
            "original": none_if_nan(r.get("original_funding")) if "original_funding" in df.columns else None,
            "available": none_if_nan(r.get("available_funding")) if "available_funding" in df.columns else None,
            "contracted": none_if_nan(r.get("contracted_funding")) if "contracted_funding" in df.columns else None,
            "spent": none_if_nan(r.get("spent_funding")) if "spent_funding" in df.columns else None,
            "total": none_if_nan(r.get("total_funding")) if "total_funding" in df.columns else None,
        }
        funding = {k: v for k, v in funding.items() if v is not None}

        row = {
            "community_id": community_id,
            "community_name": clean_str(r.get("community_name")),
            "geojson_community_name": clean_str(r.get("geojson_community_name")),
            "district": clean_str(r.get("district")),
            "include": True,
            # Strategy taxonomy
            "strategy_id": strategy_id,
            "strategy": strategy_name,
            "subcategory": subcategory,
            "subsubcategory": subsubcategory,
            # Text fields
            "short_description": clean_str(r.get("short_description")),
            "action_description": clean_str(r.get("action_description")),
            "progress": clean_str(r.get("progress")),
            "funding_notes": clean_str(r.get("funding_notes")),
            "includes_other_agencies": clean_str(r.get("includes_other_agencies")),
            "notes": clean_str(r.get("Notes")),
            "sources": clean_str(r.get("Sources")),
            # Criteria / analysis fields
            # (You said "Type of Strategy" = Capacity for Community Health Protection)
            "capacity_type": clean_str(r.get("Type of Strategy")),
            "scope_beneficiaries": clean_str(r.get("Scope of Community Beneficiaries")),
            "ease": clean_str(r.get("Ease of Implementation")),
            # Funding
            "funding": funding,
        }

        rows.append(row)

    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)

    # IMPORTANT: allow_nan=False prevents writing invalid JSON ("NaN")
    OUT_JSON.write_text(
        json.dumps(rows, indent=2, ensure_ascii=False, allow_nan=False),
        encoding="utf-8",
    )

    # Helpful summary
    unique_communities = sorted({x["community_id"] for x in rows if x.get("community_id")})
    unique_strategies = sorted({x["strategy"] for x in rows if x.get("strategy")})
    print(f"✅ Wrote: {OUT_JSON}")
    print(f"Rows: {len(rows)}")
    print(f"Unique community_id: {len(unique_communities)}")
    print(f"Unique strategies: {len(unique_strategies)}")


if __name__ == "__main__":
    main()
