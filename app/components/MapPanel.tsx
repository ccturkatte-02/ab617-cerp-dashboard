"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import type { FeatureCollection, MultiPolygon, Polygon, Position } from "geojson";
import "maplibre-gl/dist/maplibre-gl.css";

type CommunityProperties = {
  community_id?: string | number | null;
  COMMUNITY_NAME_x?: string | null;
  COMMUNITY_NAME_y?: string | null;
  SHORT_NAME?: string | null;
  has_strategies?: boolean;
};

type CommunityGeoJson = FeatureCollection<Polygon | MultiPolygon, CommunityProperties>;
type CaliforniaBoundaryGeoJson = FeatureCollection<Polygon | MultiPolygon, { name?: string }>;
type CalEnviroScreenGeoJson = FeatureCollection<
  Polygon | MultiPolygon,
  {
    Tract?: number | null;
    County?: string | null;
    ApproxLoc?: string | null;
    TotPop19?: number | null;
    CIscore?: number | null;
    CIscoreP?: number | null;
  }
>;

type Props = {
  geojson: CommunityGeoJson | null;
  selectedIds: string[];
  includedCommunitySlugs: string[];
  onSelect: (communityId: string) => void;
};

const STREET_MAP_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors",
    },
  },
  layers: [
    {
      id: "osm-tiles",
      type: "raster",
      source: "osm",
      minzoom: 0,
      maxzoom: 19,
    },
  ],
};

const DEFAULT_CALIFORNIA_BOUNDS: maplibregl.LngLatBoundsLike = [
  [-124.48, 32.53],
  [-114.13, 42.01],
];

const CALENVIROSCREEN_CLASSES = [
  { label: ">90 - 100 (Highest Scores)", color: "#ff6256" },
  { label: ">80 - 90", color: "#ff8752" },
  { label: ">70 - 80", color: "#ffb25b" },
  { label: ">60 - 70", color: "#ffd064" },
  { label: ">50 - 60", color: "#ffec63" },
  { label: ">40 - 50", color: "#eef35f" },
  { label: ">30 - 40", color: "#bfd45a" },
  { label: ">20 - 30", color: "#91b84f" },
  { label: ">10 - 20", color: "#6da452" },
  { label: "0 - 10 (Lowest Scores)", color: "#4f8f49" },
];

const extendBounds = (bounds: maplibregl.LngLatBounds, position: Position) => {
  const [lng, lat] = position;
  bounds.extend([lng, lat]);
};

const getFeatureBounds = (feature: CommunityGeoJson["features"][number]) => {
  const bounds = new maplibregl.LngLatBounds();
  const geometry = feature.geometry;

  if (geometry.type === "Polygon") {
    for (const ring of geometry.coordinates ?? []) {
      for (const position of ring) extendBounds(bounds, position);
    }
  } else if (geometry.type === "MultiPolygon") {
    for (const polygon of geometry.coordinates ?? []) {
      for (const ring of polygon ?? []) {
        for (const position of ring) extendBounds(bounds, position);
      }
    }
  }

  return bounds;
};

const slug = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

export default function MapPanel({ geojson, selectedIds, includedCommunitySlugs, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const homeBoundsRef = useRef<maplibregl.LngLatBoundsLike>(DEFAULT_CALIFORNIA_BOUNDS);
  const previousSelectedIdsRef = useRef<string[]>([]);
  const calEnviroScreenOpacityRef = useRef(45);
  const [showCalEnviroScreen, setShowCalEnviroScreen] = useState(false);
  const [calEnviroScreenOpacity, setCalEnviroScreenOpacity] = useState(45);
  const includedCommunities = useMemo(
    () => new Set(includedCommunitySlugs),
    [includedCommunitySlugs]
  );
  const mapGeojson = useMemo<CommunityGeoJson | null>(() => {
    if (!geojson) return null;

    return {
      ...geojson,
      features: geojson.features.map((feature) => {
        const properties = feature.properties ?? {};
        const nameSlug = slug(
          properties.COMMUNITY_NAME_x || properties.COMMUNITY_NAME_y || properties.SHORT_NAME
        );

        return {
          ...feature,
          properties: {
            ...properties,
            has_strategies: includedCommunities.has(nameSlug),
          },
        };
      }),
    };
  }, [geojson, includedCommunities]);

  // Create map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STREET_MAP_STYLE,
      center: [-119.5, 36.5],
      zoom: 5,
    });

    map.addControl(new maplibregl.NavigationControl(), "top-right");
    mapRef.current = map;

    const resizeMap = () => map.resize();
    const resizeObserver = new ResizeObserver(resizeMap);
    resizeObserver.observe(containerRef.current);
    map.once("load", resizeMap);
    requestAnimationFrame(resizeMap);

    map.fitBounds(DEFAULT_CALIFORNIA_BOUNDS, { padding: 30, duration: 0 });


    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    let cancelled = false;

    const addBoundaryLayer = (boundary: CaliforniaBoundaryGeoJson) => {
      if (cancelled || !mapRef.current) return;

      const existingSource = map.getSource("california-boundary") as
        | maplibregl.GeoJSONSource
        | undefined;

      if (existingSource) {
        existingSource.setData(boundary);
        return;
      }

      map.addSource("california-boundary", {
        type: "geojson",
        data: boundary,
      });

      map.addLayer({
        id: "california-boundary",
        type: "line",
        source: "california-boundary",
        paint: {
          "line-color": "#0f172a",
          "line-width": 3,
          "line-opacity": 0.9,
        },
      });
    };

    fetch("/data/california_boundary.geojson")
      .then((response) => {
        if (!response.ok) throw new Error(`california_boundary.geojson HTTP ${response.status}`);
        return response.json() as Promise<CaliforniaBoundaryGeoJson>;
      })
      .then((boundary) => {
        if (map.isStyleLoaded()) addBoundaryLayer(boundary);
        else map.once("load", () => addBoundaryLayer(boundary));
      })
      .catch((error) => {
        console.error("California boundary load failed:", error);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    let cancelled = false;

    const setCalEnviroScreenVisibility = () => {
      const visibility = showCalEnviroScreen ? "visible" : "none";
      if (map.getLayer("calenviroscreen-fill")) {
        map.setLayoutProperty("calenviroscreen-fill", "visibility", visibility);
      }
      if (map.getLayer("calenviroscreen-outline")) {
        map.setLayoutProperty("calenviroscreen-outline", "visibility", visibility);
      }
    };

    const addCalEnviroScreenLayer = (calEnviroScreen: CalEnviroScreenGeoJson) => {
      if (cancelled || !mapRef.current) return;

      if (!map.getSource("calenviroscreen")) {
        map.addSource("calenviroscreen", {
          type: "geojson",
          data: calEnviroScreen,
        });

        const beforeId = map.getLayer("communities-fill") ? "communities-fill" : undefined;

        map.addLayer(
          {
            id: "calenviroscreen-fill",
            type: "fill",
            source: "calenviroscreen",
            layout: {
              visibility: showCalEnviroScreen ? "visible" : "none",
            },
            paint: {
              "fill-color": [
                "step",
                ["coalesce", ["get", "CIscoreP"], 0],
                "#4f8f49",
                10,
                "#6da452",
                20,
                "#91b84f",
                30,
                "#bfd45a",
                40,
                "#eef35f",
                50,
                "#ffec63",
                60,
                "#ffd064",
                70,
                "#ffb25b",
                80,
                "#ff8752",
                90,
                "#ff6256",
              ],
              "fill-opacity": calEnviroScreenOpacityRef.current / 100,
            },
          },
          beforeId
        );

        map.addLayer(
          {
            id: "calenviroscreen-outline",
            type: "line",
            source: "calenviroscreen",
            layout: {
              visibility: showCalEnviroScreen ? "visible" : "none",
            },
            paint: {
              "line-color": "#7f1d1d",
              "line-opacity": 0.18,
              "line-width": 0.5,
            },
          },
          beforeId
        );
      }

      setCalEnviroScreenVisibility();
    };

    if (!showCalEnviroScreen && !map.getSource("calenviroscreen")) return;

    if (map.getSource("calenviroscreen")) {
      setCalEnviroScreenVisibility();
      return;
    }

    fetch("/data/calenviroscreen40.geojson")
      .then((response) => {
        if (!response.ok) throw new Error(`calenviroscreen40.geojson HTTP ${response.status}`);
        return response.json() as Promise<CalEnviroScreenGeoJson>;
      })
      .then((calEnviroScreen) => {
        if (map.isStyleLoaded()) addCalEnviroScreenLayer(calEnviroScreen);
        else map.once("load", () => addCalEnviroScreenLayer(calEnviroScreen));
      })
      .catch((error) => {
        console.error("CalEnviroScreen layer load failed:", error);
      });

    return () => {
      cancelled = true;
    };
  }, [showCalEnviroScreen]);

  useEffect(() => {
    calEnviroScreenOpacityRef.current = calEnviroScreenOpacity;
    const map = mapRef.current;
    if (!map?.getLayer("calenviroscreen-fill")) return;
    map.setPaintProperty("calenviroscreen-fill", "fill-opacity", calEnviroScreenOpacity / 100);
  }, [calEnviroScreenOpacity]);

  // Add or update GeoJSON layers whenever geojson is available/changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapGeojson) return;

    const ensureLayers = () => {
      const source = map.getSource("communities") as maplibregl.GeoJSONSource | undefined;

      if (!source) {
        map.addSource("communities", { type: "geojson", data: mapGeojson });

        map.addLayer({
          id: "communities-fill",
          type: "fill",
          source: "communities",
          paint: {
            "fill-color": [
              "case",
              ["==", ["get", "has_strategies"], true],
              "#ffffff",
              "#94a3b8",
            ],
            "fill-opacity": [
              "case",
              ["==", ["get", "has_strategies"], true],
              0,
              0.22,
            ],
          },
        });

        map.addLayer({
          id: "communities-outline",
          type: "line",
          source: "communities",
          paint: {
            "line-color": [
              "case",
              ["==", ["get", "has_strategies"], true],
              "#111827",
              "#64748b",
            ],
            "line-width": [
              "case",
              ["==", ["get", "has_strategies"], true],
              3,
              2,
            ],
            "line-opacity": [
              "case",
              ["==", ["get", "has_strategies"], true],
              0.95,
              0.7,
            ],
          },
        });

        map.addLayer({
          id: "communities-selected",
          type: "line",
          source: "communities",
          paint: {
            "line-color": "#dc2626",
            "line-width": 6,
            "line-opacity": 1,
          },
          filter: [
            "all",
            ["in", ["get", "community_id"], ["literal", selectedIds]],
            ["==", ["get", "has_strategies"], true],
          ],
        });

        // Click handler
        map.on("click", "communities-fill", (e) => {
          const feat = e.features?.[0];
          if (feat?.properties?.has_strategies !== true) return;
          const id = feat?.properties?.community_id;
          if (id) onSelect(String(id));
        });

        map.on("mousemove", "communities-fill", (e) => {
          const feat = e.features?.[0];
          map.getCanvas().style.cursor =
            feat?.properties?.has_strategies === true ? "pointer" : "";
        });
        map.on("mouseleave", "communities-fill", () => (map.getCanvas().style.cursor = ""));

        // Fit bounds to all features
        const bounds = new maplibregl.LngLatBounds();
        for (const f of mapGeojson.features ?? []) {
          const g = f.geometry;
          if (!g) continue;

          if (g.type === "Polygon") {
            for (const ring of g.coordinates ?? []) {
              for (const position of ring) extendBounds(bounds, position);
            }
          } else if (g.type === "MultiPolygon") {
            for (const poly of g.coordinates ?? []) {
              for (const ring of poly ?? []) {
                for (const position of ring) extendBounds(bounds, position);
              }
            }
          }
        }
        if (!bounds.isEmpty()) {
          homeBoundsRef.current = bounds.toArray() as maplibregl.LngLatBoundsLike;
          map.fitBounds(bounds, { padding: 40, duration: 0 });
        }
      } else {
        source.setData(mapGeojson);
      }
    };

    if (map.isStyleLoaded()) ensureLayers();
    else map.once("load", ensureLayers);
  }, [mapGeojson, onSelect, selectedIds]);

  // Update selection highlight
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getLayer("communities-selected")) return;
    map.setFilter("communities-selected", [
      "all",
      ["in", ["get", "community_id"], ["literal", selectedIds]],
      ["==", ["get", "has_strategies"], true],
    ]);
  }, [selectedIds]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapGeojson) {
      previousSelectedIdsRef.current = selectedIds;
      return;
    }

    const previousSelectedIds = previousSelectedIdsRef.current;
    const latestSelectedId =
      selectedIds.findLast((id) => !previousSelectedIds.includes(id)) ??
      selectedIds[selectedIds.length - 1];

    previousSelectedIdsRef.current = selectedIds;

    if (!latestSelectedId) return;

    const feature = mapGeojson.features.find(
      (candidate) => String(candidate.properties?.community_id) === latestSelectedId
    );
    if (!feature) return;

    const bounds = getFeatureBounds(feature);
    if (!bounds.isEmpty()) {
      map.fitBounds(bounds, {
        padding: 85,
        duration: 1200,
        maxZoom: 10,
      });
    }
  }, [mapGeojson, selectedIds]);

  const resetHomeView = useCallback(() => {
    mapRef.current?.fitBounds(homeBoundsRef.current, {
      padding: 40,
      duration: 600,
    });
  }, []);

  return (
    <div className="relative h-[75vh] min-h-[520px] w-full overflow-hidden bg-slate-100">
      <div ref={containerRef} className="absolute inset-0 h-full w-full" />
      <button
        type="button"
        onClick={resetHomeView}
        className="absolute left-3 top-3 rounded-md bg-white/95 px-3 py-2 text-xs font-medium text-slate-800 shadow-sm ring-1 ring-slate-200 hover:bg-white focus:outline-none focus:ring-2 focus:ring-slate-500"
      >
        Home View
      </button>
      <div className="absolute bottom-3 left-3 rounded-md bg-white/95 px-3 py-2 text-xs text-slate-700 shadow-sm ring-1 ring-slate-200">
        <label className="flex items-center gap-2 font-medium text-slate-800">
          <input
            type="checkbox"
            checked={showCalEnviroScreen}
            onChange={(event) => setShowCalEnviroScreen(event.target.checked)}
            className="h-4 w-4 rounded border-slate-300 accent-red-700"
          />
          CalEnviroScreen 4.0
        </label>
        {showCalEnviroScreen && (
          <div className="mt-2 border-b border-slate-200 pb-2">
            <div className="mb-1 text-xs font-medium text-slate-800">
              CalEnviroScreen 4.0 Results
            </div>
            <label className="mb-2 block text-[10px] text-slate-600">
              Transparency
              <input
                type="range"
                min="10"
                max="90"
                value={calEnviroScreenOpacity}
                onChange={(event) => setCalEnviroScreenOpacity(Number(event.target.value))}
                className="mt-1 block w-full accent-red-700"
              />
            </label>
            <div className="grid gap-1">
              {CALENVIROSCREEN_CLASSES.map((item) => (
                <div key={item.label} className="flex items-center gap-2">
                  <span
                    className="h-3 w-3 shrink-0 border border-slate-400"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="text-[10px] text-slate-700">{item.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="mt-2 flex items-center gap-2">
          <span className="h-3 w-3 rounded-sm border-2 border-black bg-transparent" />
          AB 617 Community included in the analysis
        </div>
        <div className="mt-1 flex items-center gap-2">
          <span className="h-3 w-3 rounded-sm border border-slate-500 bg-slate-400/60" />
          AB 617 Community not included
        </div>
      </div>
    </div>
  );
}
