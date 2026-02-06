"use client";

import { useEffect, useMemo, useState } from "react";
import MapPanel from "../components/MapPanel";

const slug = (s: any) =>
  String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");


type StrategyRow = {
  community_id: string;
  geojson_community_name?: string | null;
  community_name?: string | null;
  strategy?: string | null;
  subcategory?: string | null;
  subsubcategory?: string | null;
  capacity_type?: string | null;
  ease?: string | null;
  funding?: {
    spent?: number;
    contracted?: number;
    available?: number;
    total?: number;
  };
};

export default function CommunityPage() {
  const [geojson, setGeojson] = useState<any>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [strategies, setStrategies] = useState<StrategyRow[]>([]);
  
  useEffect(() => {
    if (selectedId) console.log("selectedId:", selectedId);
  }, [selectedId]);
  
  useEffect(() => {
    Promise.all([
      fetch("/data/communities.geojson").then((r) => {
        if (!r.ok) throw new Error(`communities.geojson HTTP ${r.status}`);
        return r.json();
      }),
      fetch("/data/strategies_long.json").then((r) => {
        if (!r.ok) throw new Error(`strategies_long.json HTTP ${r.status}`);
        return r.json();
      }),
    ])
      .then(([g, s]) => {
        console.log("loaded polygons:", g?.features?.length);
        console.log("loaded strategy rows:", s?.length);
        setGeojson(g);
        setStrategies(s);
      })
      .catch((err) => {
        console.error("Data load failed:", err);
      });
  }, []);

  const selectedFeature = useMemo(() => {
    if (!geojson || !selectedId) return null;
    return geojson.features?.find((f: any) => f?.properties?.community_id === selectedId) ?? null;
  }, [geojson, selectedId]);

  const selectedName =
    selectedFeature?.properties?.COMMUNITY_NAME_x ||
    selectedFeature?.properties?.COMMUNITY_NAME_y ||
    selectedFeature?.properties?.SHORT_NAME ||
    null;

  const selectedNameKey = slug(selectedName);

  const rows = useMemo(() => {
    if (!selectedName) return [];
    const key = slug(selectedName);
    return strategies.filter((r) => slug(r.geojson_community_name) === key);
  }, [strategies, selectedName]);
  

  const uniqueStrategies = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) if (r.strategy) set.add(r.strategy);
    return Array.from(set).sort();
  }, [rows]);

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Map */}
        <div className="rounded-2xl border bg-white shadow-sm overflow-hidden">
          <MapPanel geojson={geojson} selectedId={selectedId} onSelect={setSelectedId} />
        </div>

        {/* Right panel */}
        <div className="rounded-2xl border bg-white shadow-sm p-6">
          <h1 className="text-xl font-semibold">Map — Search by Community</h1>

          {!selectedId ? (
            <p className="mt-4 text-gray-600">Click a community on the map to see strategies and funding.</p>
          ) : (
            <>
              <div className="mt-4">
                <div className="text-sm text-gray-500">Selected community</div>
                <div className="text-2xl font-semibold">{selectedName ?? selectedId}</div>
                <div className="text-sm text-gray-500 mt-1">community_id: {selectedId}</div>

                <div className="text-sm text-gray-500 mt-1">
                 Matching strategies on geojson_community_name ={" "}
                  <span className="font-mono">{selectedNameKey}</span>
                </div>
              </div>

              <div className="mt-6">
                <h2 className="text-lg font-semibold">Strategies present</h2>
                {uniqueStrategies.length === 0 ? (
                  <p className="mt-2 text-gray-600">
                  No strategies matched geojson_community_name = <span className="font-mono">{selectedNameKey}</span>.
                  </p>
                ) : (
                  <ul className="mt-2 list-disc pl-5 space-y-1">
                    {uniqueStrategies.map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="mt-6">
                <h2 className="text-lg font-semibold">Funding snapshot (first pass)</h2>
                <p className="mt-2 text-gray-600">
                  Next we’ll add the stacked bar chart (spent/contracted/available) grouped by strategy.
                </p>
                <div className="mt-3 text-sm text-gray-500">
                  Rows in strategies_long.json for this community: {rows.length}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
