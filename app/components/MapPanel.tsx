"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

type Props = {
  geojson: any;
  selectedId: string | null;
  onSelect: (communityId: string) => void;
};

export default function MapPanel({ geojson, selectedId, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  // Create map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: "https://demotiles.maplibre.org/style.json",
      center: [-119.5, 36.5],
      zoom: 5,
    });

    map.addControl(new maplibregl.NavigationControl(), "top-right");
    mapRef.current = map;

    // Zoom to show all of California (approx bounds)
    map.fitBounds(
      [
        [-124.48, 32.53], // SW (lon, lat)
        [-114.13, 42.01], // NE
      ],
      { padding: 30, duration: 0 }
    );


    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Add or update GeoJSON layers whenever geojson is available/changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !geojson) return;

    const ensureLayers = () => {
      const source = map.getSource("communities") as maplibregl.GeoJSONSource | undefined;

      if (!source) {
        map.addSource("communities", { type: "geojson", data: geojson });

        // 🔍 DEBUG: check whether MapLibre ingested the features
        setTimeout(() => {
          const feats = map.querySourceFeatures("communities");
          console.log("querySourceFeatures communities:", feats.length);
        }, 500);

        // SUPER visible fill + outline
        map.addLayer({
          id: "communities-fill",
          type: "fill",
          source: "communities",
          paint: {
            "fill-color" : "#2563eb",
            "fill-opacity": 0.55,
          },
        });

        map.addLayer({
          id: "communities-outline",
          type: "line",
          source: "communities",
          paint: {
            "line-color": "#111827",
            "line-width": 3,
            "line-opacity": 0.9,
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
          filter: ["==", ["get", "community_id"], selectedId ?? ""],
        });

        // Click handler
        map.on("click", "communities-fill", (e) => {
          const feat: any = e.features?.[0];
          const id = feat?.properties?.community_id;
          if (id) onSelect(String(id));
        });

        map.on("mouseenter", "communities-fill", () => (map.getCanvas().style.cursor = "pointer"));
        map.on("mouseleave", "communities-fill", () => (map.getCanvas().style.cursor = ""));

        // Fit bounds to all features
        const bounds = new maplibregl.LngLatBounds();
        for (const f of geojson.features ?? []) {
          const g = f.geometry;
          if (!g) continue;

          if (g.type === "Polygon") {
            for (const ring of g.coordinates ?? []) {
              for (const [lng, lat] of ring) bounds.extend([lng, lat]);
            }
          } else if (g.type === "MultiPolygon") {
            for (const poly of g.coordinates ?? []) {
              for (const ring of poly ?? []) {
                for (const [lng, lat] of ring) bounds.extend([lng, lat]);
              }
            }
          }
        }
        if (!bounds.isEmpty()) {
          map.fitBounds(bounds, { padding: 40, duration: 0 });
        }
      } else {
        source.setData(geojson);
      }
    };

    if (map.isStyleLoaded()) ensureLayers();
    else map.once("load", ensureLayers);
  }, [geojson, onSelect, selectedId]);

  // Update selection highlight
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getLayer("communities-selected")) return;
    map.setFilter("communities-selected", ["==", ["get", "community_id"], selectedId ?? ""]);
  }, [selectedId]);

  return <div ref={containerRef} className="h-[75vh] w-full" />;
}
