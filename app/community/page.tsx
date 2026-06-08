"use client";

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";
import MapPanel from "../components/MapPanel";

const slug = (s: unknown) =>
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
  scope_beneficiaries?: string | null;
  ease?: string | null;
  funding?: {
    spent?: number;
    contracted?: number;
    available?: number;
    total?: number;
    original?: number;
  };
};

type CommunityProperties = {
  community_id?: string | number | null;
  COMMUNITY_NAME_x?: string | null;
  COMMUNITY_NAME_y?: string | null;
  SHORT_NAME?: string | null;
};

type CommunityGeoJson = FeatureCollection<Polygon | MultiPolygon, CommunityProperties>;

type StrategySummary = {
  name: string;
  totalFunding: number;
  availableFunding: number;
  hasFunding: boolean;
  hasAvailableFunding: boolean;
  hasAccessibleFundingRecords: boolean;
  rowCount: number;
  subcategories: {
    name: string;
    count: number;
    totalFunding: number;
    availableFunding: number;
    hasFunding: boolean;
    hasAvailableFunding: boolean;
    hasAccessibleFundingRecords: boolean;
  }[];
};

type PieDatum = {
  label: string;
  count: number;
  color: string;
};

type SummaryBreakdown = {
  title: string;
  data: PieDatum[];
};

type CommunityOption = {
  id: string;
  name: string;
  nameKey: string;
  rowCount: number;
  isAll?: boolean;
};

const ALL_INCLUDED_ID = "all_included_communities";
const NOT_APPLICABLE_COLOR = "#D3D3D3";
const SOFT_GREENS = ["#6aa84f", "#b6d7a8", "#93c47d"];
const SOFT_BLUES = ["#a6d8ff", "#80bfff", "#66aaff"];
const SOFT_PURPLES = ["#9c7fc2", "#d8b9f2", "#b699d8"];
const CAPACITY_COLORS: Record<string, string> = {
  "1_emission_reduction": "#66aaff",
  "2_exposure_mitigation": "#80bfff",
  "3_community_investment": "#a6d8ff",
};
const ADOPTION_PATHWAY_COLORS: Record<string, string> = {
  "1_public_agencies": "#6aa84f",
  "1_universal_benefits": "#6aa84f",
  "2_community_members": "#93c47d",
  "2_targeted_benefits": "#93c47d",
  "3_industries": "#b6d7a8",
};
const EASE_COLORS: Record<string, string> = {
  "1_easy": "#9c7fc2",
  "2_moderate": "#b699d8",
  "3_difficult": "#d8b9f2",
};
const NOT_APPLICABLE_KEYS = new Set(["not_applicable", "not_included", "n_a", "na"]);

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);

const buildBreakdown = (
  rows: StrategyRow[],
  title: string,
  colors: string[],
  colorByLabel: Record<string, string>,
  getValue: (row: StrategyRow) => string | null | undefined
): SummaryBreakdown => {
  const counts = new Map<string, number>();

  for (const row of rows) {
    const value = getValue(row)?.trim() || "Not specified";
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return {
    title,
    data: Array.from(counts.entries()).sort(([a], [b]) => a.localeCompare(b)).map(
      ([label, count], index) => ({
        label,
        count,
        color: NOT_APPLICABLE_KEYS.has(slug(label))
          ? NOT_APPLICABLE_COLOR
          : colorByLabel[slug(label)] ?? colors[index % colors.length],
      })
    ),
  };
};

function PieChart({
  breakdown,
  showTitle = true,
}: {
  breakdown: SummaryBreakdown;
  showTitle?: boolean;
}) {
  const total = breakdown.data.reduce((sum, item) => sum + item.count, 0);
  let offset = 0;

  const background =
    total === 0
      ? "#e2e8f0"
      : `conic-gradient(${breakdown.data
          .map((item) => {
            const start = offset;
            const end = offset + (item.count / total) * 100;
            offset = end;
            return `${item.color} ${start}% ${end}%`;
          })
          .join(", ")})`;

  return (
    <div className="min-w-0 border-t border-slate-200 pt-3">
      {showTitle && <div className="text-sm font-medium text-slate-900">{breakdown.title}</div>}
      <div className="mt-3 flex justify-center">
        <div
          className="h-24 w-24 shrink-0 rounded-full ring-1 ring-slate-200"
          style={{ background } as CSSProperties}
        />
      </div>
      <ul className="mt-3 space-y-1 text-xs text-slate-700">
        {breakdown.data.map((item) => (
          <li key={item.label} className="flex items-start justify-between gap-2">
            <span className="flex min-w-0 items-start gap-2">
              <span
                className="mt-1 h-2.5 w-2.5 shrink-0 rounded-sm"
                style={{ backgroundColor: item.color }}
              />
              <span className="min-w-0 break-words">{item.label}</span>
            </span>
            <span className="shrink-0 text-slate-500">({item.count})</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const getCommunityName = (feature: CommunityGeoJson["features"][number] | null) =>
  feature?.properties?.COMMUNITY_NAME_x ||
  feature?.properties?.COMMUNITY_NAME_y ||
  feature?.properties?.SHORT_NAME ||
  null;

const getRowsForCommunity = (strategies: StrategyRow[], communityName: string | null) => {
  if (!communityName) return [];
  const communityKey = slug(communityName);
  return strategies.filter((row) => slug(row.geojson_community_name) === communityKey);
};

const buildStrategySummaries = (rows: StrategyRow[]): StrategySummary[] => {
  const groups = new Map<string, StrategyRow[]>();

  for (const row of rows) {
    const strategy = row.strategy?.trim();
    if (!strategy) continue;
    groups.set(strategy, [...(groups.get(strategy) ?? []), row]);
  }

  return Array.from(groups.entries())
    .map(([name, strategyRows]) => {
      const subcategorySummaries = new Map<
        string,
        {
          count: number;
          totalFunding: number;
          availableFunding: number;
          hasFunding: boolean;
          hasAvailableFunding: boolean;
          hasAccessibleFundingRecords: boolean;
        }
      >();
      let totalFunding = 0;
      let availableFunding = 0;
      let hasFunding = false;
      let hasAvailableFunding = false;
      let hasAccessibleFundingRecords = false;

      for (const row of strategyRows) {
        const subcategory = row.subcategory?.trim() || "Uncategorized";
        const subcategorySummary = subcategorySummaries.get(subcategory) ?? {
          count: 0,
          totalFunding: 0,
          availableFunding: 0,
          hasFunding: false,
          hasAvailableFunding: false,
          hasAccessibleFundingRecords: false,
        };
        subcategorySummary.count += 1;

        const hasAccessibleRecord = row.ease?.trim().toLowerCase() !== "not included";
        if (hasAccessibleRecord) {
          hasAccessibleFundingRecords = true;
          subcategorySummary.hasAccessibleFundingRecords = true;
        }

        const total = row.funding?.total;
        if (typeof total === "number" && Number.isFinite(total)) {
          totalFunding += total;
          hasFunding = true;
          subcategorySummary.totalFunding += total;
          subcategorySummary.hasFunding = true;
        }

        const available = row.funding?.available;
        if (typeof available === "number" && Number.isFinite(available) && available > 0) {
          availableFunding += available;
          hasAvailableFunding = true;
          subcategorySummary.availableFunding += available;
          subcategorySummary.hasAvailableFunding = true;
        }

        subcategorySummaries.set(subcategory, subcategorySummary);
      }

      return {
        name,
        totalFunding,
        availableFunding,
        hasFunding,
        hasAvailableFunding,
          hasAccessibleFundingRecords,
          rowCount: strategyRows.length,
        subcategories: Array.from(subcategorySummaries.entries())
          .map(([subcategoryName, summary]) => ({ name: subcategoryName, ...summary }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
};

const buildSummaryBreakdowns = (rows: StrategyRow[]): SummaryBreakdown[] => [
  buildBreakdown(
    rows,
    "Capacity for Community Health Protection",
    SOFT_BLUES,
    CAPACITY_COLORS,
    (row) => row.capacity_type
  ),
  buildBreakdown(
    rows,
    "Adoption Pathway",
    SOFT_GREENS,
    ADOPTION_PATHWAY_COLORS,
    (row) => row.scope_beneficiaries
  ),
  buildBreakdown(rows, "Ease of Implementation", SOFT_PURPLES, EASE_COLORS, (row) => row.ease),
];

const formatStrategyFunding = (strategy: StrategySummary, showAvailableFunding = true) => {
  if (!strategy.hasAccessibleFundingRecords) return "No available funding records";
  if (!strategy.hasFunding) return "(no total funding listed)";
  if (showAvailableFunding && strategy.hasAvailableFunding) {
    return `(${formatCurrency(strategy.totalFunding)} / ${formatCurrency(strategy.availableFunding)})`;
  }
  return `(${formatCurrency(strategy.totalFunding)})`;
};

const formatSubcategoryFunding = (
  subcategory: StrategySummary["subcategories"][number],
  showAvailableFunding = true
) => {
  if (!subcategory.hasAccessibleFundingRecords) return "No available funding records";
  if (!subcategory.hasFunding) return "(no total funding listed)";
  if (showAvailableFunding && subcategory.hasAvailableFunding) {
    return `(${formatCurrency(subcategory.totalFunding)} / ${formatCurrency(subcategory.availableFunding)})`;
  }
  return `(${formatCurrency(subcategory.totalFunding)})`;
};

function CommunitySelector({
  communityOptions,
  selectedIds,
  onToggle,
  onClear,
  collapsed,
  onCollapsedChange,
}: {
  communityOptions: CommunityOption[];
  selectedIds: string[];
  onToggle: (communityId: string) => void;
  onClear: () => void;
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
}) {
  const allSelected = selectedIds.length === 0 || selectedIds.includes(ALL_INCLUDED_ID);
  const selectedCount = selectedIds.length === 0 ? 1 : selectedIds.length;

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => onCollapsedChange(false)}
        className="absolute right-16 top-3 z-10 rounded-lg bg-white/95 px-3 py-2 text-xs font-medium text-slate-800 shadow-lg ring-1 ring-slate-200 hover:bg-white focus:outline-none focus:ring-2 focus:ring-slate-500"
        aria-label="Expand compare communities"
      >
        Compare ({selectedCount})
      </button>
    );
  }

  return (
    <div className="absolute right-3 top-3 z-10 w-[min(280px,calc(100%-1.5rem))] rounded-lg bg-white/95 p-3 text-slate-900 shadow-lg ring-1 ring-slate-200">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Compare Communities</h2>
          <p className="mt-0.5 text-xs text-slate-600">Select up to 3 communities.</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {selectedIds.length > 0 && (
            <button
              type="button"
              onClick={onClear}
              className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Clear
            </button>
          )}
          <button
            type="button"
            onClick={() => onCollapsedChange(true)}
            className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
            aria-label="Collapse compare communities"
          >
            Hide
          </button>
        </div>
      </div>

      <div className="mt-3 max-h-56 overflow-y-auto rounded-md border border-slate-200">
        {communityOptions.length === 0 ? (
          <div className="p-3 text-xs text-slate-600">Loading communities...</div>
        ) : (
          <ul className="divide-y divide-slate-200">
            <li>
              <label
                className={`flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-xs ${
                  allSelected ? "bg-green-50 text-green-950" : "bg-white text-slate-800 hover:bg-slate-50"
                }`}
              >
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={() => onToggle(ALL_INCLUDED_ID)}
                  className="h-4 w-4 shrink-0 rounded border-slate-300 accent-green-600"
                />
                <span className="min-w-0">
                  <span className="block truncate font-medium">All Included Communities</span>
                  <span className="block text-[11px] text-slate-500">Default overview</span>
                </span>
              </label>
            </li>
            {communityOptions.map((community) => {
              const selected = selectedIds.includes(community.id);
              const disabled = !selected && selectedCount >= 3;

              return (
                <li key={community.id}>
                  <label
                    className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs ${
                      selected
                        ? "bg-green-50 text-green-950"
                        : disabled
                          ? "cursor-not-allowed bg-slate-50 text-slate-400"
                          : "cursor-pointer bg-white text-slate-800 hover:bg-slate-50"
                    }`}
                  >
                    <span className="flex min-w-0 items-start gap-2">
                      <input
                        type="checkbox"
                        checked={selected}
                        disabled={disabled}
                        onChange={() => onToggle(community.id)}
                        className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 accent-green-600"
                      />
                      <span className="min-w-0">
                      <span className="block truncate font-medium">{community.name}</span>
                      <span className="block text-[11px] text-slate-500">
                        {community.rowCount} strategy rows
                      </span>
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function ComparisonMatrix({
  communities,
  strategies,
}: {
  communities: CommunityOption[];
  strategies: StrategyRow[];
}) {
  const analyses = communities.map((community) => {
    const rows = community.isAll ? strategies : getRowsForCommunity(strategies, community.name);
    const strategySummaries = buildStrategySummaries(rows);
    return {
      community,
      rows,
      breakdowns: buildSummaryBreakdowns(rows),
      strategiesByName: new Map(strategySummaries.map((summary) => [summary.name, summary])),
    };
  });
  const summaryTitles = analyses[0]?.breakdowns.map((breakdown) => breakdown.title) ?? [];
  const strategyNames = Array.from(
    new Set(analyses.flatMap((analysis) => Array.from(analysis.strategiesByName.keys())))
  ).sort((a, b) => a.localeCompare(b));

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="min-w-full border-collapse text-sm">
        <thead>
          <tr className="bg-slate-50">
            <th className="w-48 border-b border-r border-slate-200 px-4 py-3 text-left font-semibold text-slate-900">
              Measure
            </th>
            {analyses.map((analysis) => (
              <th
                key={analysis.community.id}
                className="min-w-56 border-b border-r border-slate-200 px-4 py-3 text-left font-semibold text-slate-900 last:border-r-0"
              >
                <div>{analysis.community.name}</div>
                <div className="mt-1 text-xs font-normal text-slate-500">
                  {analysis.rows.length} strategy rows
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td
              colSpan={communities.length + 1}
              className="border-b border-slate-200 bg-slate-100 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600"
            >
              Summary
            </td>
          </tr>
          {summaryTitles.map((title, index) => (
            <tr key={title} className="align-top">
              <th className="border-b border-r border-slate-200 px-4 py-4 text-left font-medium text-slate-900">
                {title}
              </th>
              {analyses.map((analysis) => (
                <td
                  key={`${analysis.community.id}-${title}`}
                  className="border-b border-r border-slate-200 px-4 py-4 last:border-r-0"
                >
                  <PieChart breakdown={analysis.breakdowns[index]} showTitle={false} />
                </td>
              ))}
            </tr>
          ))}
          <tr>
            <td
              colSpan={communities.length + 1}
              className="border-b border-slate-200 bg-slate-100 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600"
            >
              Strategies Present
              <span className="ml-2 font-normal normal-case tracking-normal">
                {communities.some((community) => !community.isAll)
                  ? "Total / Available Funding*"
                  : "Total Funding"}
              </span>
              {communities.some((community) => !community.isAll) && (
                <span className="ml-2 font-normal normal-case tracking-normal text-slate-500">
                  *Only shown when available
                </span>
              )}
            </td>
          </tr>
          {strategyNames.map((strategyName) => (
            <tr key={strategyName} className="align-top">
              <th className="border-b border-r border-slate-200 px-4 py-4 text-left font-medium text-slate-900">
                {strategyName}
              </th>
              {analyses.map((analysis) => {
                const strategy = analysis.strategiesByName.get(strategyName);
                return (
                  <td
                    key={`${analysis.community.id}-${strategyName}`}
                    className="border-b border-r border-slate-200 px-4 py-4 last:border-r-0"
                  >
                    {!strategy ? (
                      <span className="text-slate-500">Not Included</span>
                    ) : (
                      <div className="space-y-2">
                        <div className="text-sm font-medium text-slate-900">
                          {formatStrategyFunding(strategy, !analysis.community.isAll)}
                        </div>
                        <details className="rounded-md border border-slate-200 bg-white">
                          <summary className="cursor-pointer px-2 py-1.5 text-xs font-medium text-slate-700">
                            Subcategories ({strategy.subcategories.length})
                          </summary>
                          <ul className="border-t border-slate-200 px-2 py-2 text-xs text-slate-700">
                            {strategy.subcategories.map((subcategory) => (
                              <li
                                key={subcategory.name}
                                className="border-b border-slate-100 py-1.5 last:border-b-0"
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <span>{subcategory.name}</span>
                                  <span className="shrink-0 text-slate-500">
                                    ({subcategory.count})
                                  </span>
                                </div>
                                <div className="mt-0.5 text-slate-500">
                                  {formatSubcategoryFunding(
                                    subcategory,
                                    !analysis.community.isAll
                                  )}
                                </div>
                              </li>
                            ))}
                          </ul>
                        </details>
                      </div>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function CommunityPage() {
  const [geojson, setGeojson] = useState<CommunityGeoJson | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [compareCollapsed, setCompareCollapsed] = useState(false);
  const [strategies, setStrategies] = useState<StrategyRow[]>([]);
  
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
        setGeojson(g as CommunityGeoJson);
        setStrategies(s as StrategyRow[]);
      })
      .catch((err) => {
        console.error("Data load failed:", err);
      });
  }, []);

  const includedCommunitySlugs = useMemo(() => {
    const set = new Set<string>();
    for (const row of strategies) {
      const key = slug(row.geojson_community_name);
      if (key) set.add(key);
    }
    return Array.from(set);
  }, [strategies]);

  const communityOptions = useMemo<CommunityOption[]>(() => {
    if (!geojson) return [];
    const included = new Set(includedCommunitySlugs);

    return geojson.features
      .map((feature) => {
        const id = String(feature.properties?.community_id ?? "");
        const name = getCommunityName(feature);
        const nameKey = slug(name);
        if (!id || !name || !included.has(nameKey)) return null;

        return {
          id,
          name,
          nameKey,
          rowCount: getRowsForCommunity(strategies, name).length,
        };
      })
      .filter((option): option is CommunityOption => option !== null)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [geojson, includedCommunitySlugs, strategies]);

  const allIncludedCommunity = useMemo<CommunityOption>(
    () => ({
      id: ALL_INCLUDED_ID,
      name: "All Included Communities",
      nameKey: "all_included_communities",
      rowCount: strategies.length,
      isAll: true,
    }),
    [strategies.length]
  );

  const selectedCommunities = useMemo(
    () =>
      selectedIds
        .map((id) =>
          id === ALL_INCLUDED_ID
            ? allIncludedCommunity
            : communityOptions.find((community) => community.id === id)
        )
        .filter((community): community is CommunityOption => community !== undefined),
    [allIncludedCommunity, communityOptions, selectedIds]
  );
  const comparisonCommunities =
    selectedCommunities.length > 0 ? selectedCommunities : [allIncludedCommunity];

  const toggleCommunity = (communityId: string) => {
    setSelectedIds((current) => {
      if (communityId === ALL_INCLUDED_ID) {
        if (current.length === 0) return [];
        return current.includes(ALL_INCLUDED_ID)
          ? current.filter((id) => id !== ALL_INCLUDED_ID)
          : [ALL_INCLUDED_ID, ...current].slice(0, 3);
      }

      const normalizedCurrent = current.length === 0 ? [ALL_INCLUDED_ID] : current;
      if (normalizedCurrent.includes(communityId)) {
        const next = normalizedCurrent.filter((id) => id !== communityId);
        return next.length === 1 && next[0] === ALL_INCLUDED_ID ? [] : next;
      }
      if (normalizedCurrent.length >= 3) return normalizedCurrent;
      return [...normalizedCurrent, communityId];
    });
  };

  return (
    <div className="min-h-screen p-6">
      <div className="mx-auto mb-6 max-w-7xl">
        <h1 className="text-2xl font-semibold text-slate-950">
          AB 617&apos;s Community Emission Reduction Plan Strategies
        </h1>
        <p className="mt-1 text-sm italic text-slate-600">
          Working version. Last updated: June 8, 2026
        </p>
        <div className="mt-4 w-full rounded-lg border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-700 shadow-sm">
          <p>
            Community Emission Reduction Plans (CERP) from California&apos;s
            Assembly Bill 617 (AB 617) have generated valuable knowledge. The
            goal here is to create comprehensive, accessible comparative
            analysis of which strategies have worked best across different
            contexts.
          </p>
          <p className="mt-3 font-semibold text-slate-900">
            The CERP Dashboard will inform, support, and empower community
            members to improve their air quality - further uplifting the mission
            of AB 617.
          </p>
          <p className="mt-3">
            Use the map to select up to three communities and compare their CERP
            strategies. The dashboard organizes each strategy by three
            implementation-informed criteria, with strategy details listed as
            you scroll down. Turn on the CalEnviroScreen 4.0 checkbox in the
            map&apos;s lower-left corner to view community characteristics. If you
            select three communities, scroll the comparison table horizontally
            to view the third community.
          </p>
        </div>
      </div>
      <div className="max-w-7xl mx-auto grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
        {/* Map */}
        <div className="relative rounded-2xl border bg-white shadow-sm overflow-hidden">
          <MapPanel
            geojson={geojson}
            selectedIds={selectedIds}
            includedCommunitySlugs={includedCommunitySlugs}
            onSelect={toggleCommunity}
          />
          <CommunitySelector
            communityOptions={communityOptions}
            selectedIds={selectedIds}
            onToggle={toggleCommunity}
            onClear={() => setSelectedIds([])}
            collapsed={compareCollapsed}
            onCollapsedChange={setCompareCollapsed}
          />
        </div>

        {/* Right panel */}
        <div className="rounded-2xl border bg-white shadow-sm p-6">
          <div>
            <h1 className="text-xl font-semibold">Community Comparison</h1>
            <p className="mt-1 text-sm text-slate-600">
              Summary charts and strategies are aligned across selected communities.
            </p>
          </div>

          <div className="mt-6">
            <ComparisonMatrix communities={comparisonCommunities} strategies={strategies} />
          </div>
        </div>
      </div>
    </div>
  );
}
