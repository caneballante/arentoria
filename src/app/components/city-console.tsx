"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { recordRecentView, saveStoryProfile, toggleSessionPin } from "@/app/actions";
import type {
  DashboardSnapshot,
  EntityDetail,
  EntityKind,
  EntityLink,
  PlaceCategorySummary,
  PlaceSearchResult,
  ConnectionSummary,
  PersonConnections,
  SearchResult,
  StoryProfile,
} from "@/lib/types";

const fullViewBox = { x: 0, y: 0, width: 2042.02, height: 1993.07 };

const kindLabels: Record<EntityKind, string> = {
  building: "Building",
  person: "Person",
  faction: "Faction",
  road: "Road",
  prompt: "Street prompt",
  district: "District",
  infrastructure: "Infrastructure",
};

function entityLinkFromDetail(detail: EntityDetail): EntityLink {
  return {
    stableId: detail.stableId,
    kind: detail.kind,
    label: detail.title,
    detail: detail.subtitle,
    storyLine: detail.atTable.summary.match(/^.*?[.!?](?:\s|$)/)?.[0]?.trim() ?? detail.atTable.summary,
    mapTargetId: detail.map ? detail.stableId : detail.mapTargets[0]?.stableId ?? null,
  };
}

const storyFields: Array<{
  key: keyof StoryProfile;
  label: string;
  placeholder: string;
}> = [
  { key: "demeanor", label: "Demeanor / portrayal", placeholder: "Tired, formal, suspicious of officials…" },
  { key: "wants", label: "Wants", placeholder: "What outcome matters right now?" },
  { key: "knows", label: "Knows", placeholder: "Useful information they can reveal…" },
  { key: "currentProblem", label: "Current problem", placeholder: "An immediate pressure or complication…" },
  { key: "recentEvent", label: "Recent event", placeholder: "What just happened to them or here?" },
  { key: "loyalties", label: "Personal loyalties", placeholder: "App-owned loyalties beyond imported memberships…" },
  { key: "dislikes", label: "Dislikes / friction", placeholder: "People, institutions, or habits they oppose…" },
  { key: "memorableDetail", label: "Memorable detail", placeholder: "A physical or behavioral detail to retain…" },
  { key: "secret", label: "Secret · DM only", placeholder: "A persistent secret; never shown as canonical census data…" },
];

function StoryEditor({
  detail,
  onSaved,
}: {
  detail: EntityDetail;
  onSaved: (nextDetail: EntityDetail) => void;
}) {
  const [draft, setDraft] = useState(detail.story);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setStatus(null);
    try {
      const normalized = Object.fromEntries(
        Object.entries(draft).map(([key, value]) => [key, value?.trim() || null]),
      ) as StoryProfile;
      const nextDetail = await saveStoryProfile(detail.stableId, normalized);
      setDraft(nextDetail.story);
      onSaved(nextDetail);
      setStatus("Saved to the persistent DM story layer.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "The story layer could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <details className="story-editor">
      <summary>
        <span>DM narrative, gossip &amp; secrets</span>
        <small>Add or edit persistent campaign details</small>
      </summary>
      <form onSubmit={handleSubmit}>
        <p>These details are app-owned campaign canon. Re-importing the census will not replace them.</p>
        <div className="story-field-grid">
          {storyFields.map((field) => (
            <label key={field.key}>
              <span>{field.label}</span>
              <textarea
                value={draft[field.key] ?? ""}
                placeholder={field.placeholder}
                maxLength={1200}
                rows={2}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, [field.key]: event.target.value }))
                }
              />
            </label>
          ))}
        </div>
        <div className="story-save-row">
          <button type="submit" disabled={saving}>{saving ? "Saving…" : "Save story layer"}</button>
          {status ? <span>{status}</span> : null}
        </div>
      </form>
    </details>
  );
}

function normalizedTypeTerms(value: string) {
  return value
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((term) => (term.length > 3 && term.endsWith("s") ? term.slice(0, -1) : term));
}

function ConnectionCard({
  connection,
  compact = false,
  onOpen,
}: {
  connection: ConnectionSummary;
  compact?: boolean;
  onOpen: (stableId: string) => void;
}) {
  return (
    <button
      className={`connection-card ${compact ? "is-compact" : ""}`}
      type="button"
      onClick={() => onOpen(connection.stableId)}
    >
      <span className={`kind-icon kind-${connection.kind}`}>{connection.kind.slice(0, 1).toUpperCase()}</span>
      <span className="connection-card-body">
        <span className="connection-card-heading">
          <strong>{connection.label}</strong>
          <em>{connection.connectionLabel}</em>
        </span>
        <span className="connection-context">{connection.context}</span>
      </span>
      <code>{connection.stableId}</code>
    </button>
  );
}

function PersonConnectionsPanel({
  connections,
  onOpen,
}: {
  connections: PersonConnections;
  onOpen: (stableId: string) => void;
}) {
  const otherCount = connections.groups.reduce((total, group) => total + group.items.length, 0);
  return (
    <section className="record-section connection-section">
      <div className="record-section-title">
        <h3>Key connections</h3>
        <span>{connections.key.length}</span>
      </div>
      <details className="connection-criteria">
        <summary>Why these connections are shown</summary>
        <p>
          Ranked from explicit household relationships, family-employment links, and workplace
          leadership through ordinary coworkers. Sharing a residence alone remains in Other
          connections and does not imply a family relationship.
        </p>
      </details>
      {connections.key.length > 0 ? (
        <div className="key-connection-list">
          {connections.key.map((connection) => (
            <ConnectionCard key={`${connection.kind}:${connection.stableId}`} connection={connection} onOpen={onOpen} />
          ))}
        </div>
      ) : (
        <p className="connection-empty">No person meets the current key-connection criteria.</p>
      )}

      {otherCount > 0 ? (
        <details className="other-connections">
          <summary>Other known connections <span>{otherCount}</span></summary>
          <div className="other-connection-groups">
            {connections.groups.map((group) => (
              <section key={group.id}>
                <div><h4>{group.label}</h4><span>{group.items.length}</span></div>
                <div>
                  {group.items.map((connection) => (
                    <ConnectionCard
                      compact
                      key={`${connection.kind}:${connection.stableId}`}
                      connection={connection}
                      onOpen={onOpen}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        </details>
      ) : null}
    </section>
  );
}

function PlaceBrowser({
  categories,
  expanded,
  hidden,
  onClose,
  onToggleExpanded,
  onOpenRecord,
  onShowMatches,
  onClearMatches,
}: {
  categories: PlaceCategorySummary[];
  expanded: boolean;
  hidden: boolean;
  onClose: () => void;
  onToggleExpanded: () => void;
  onOpenRecord: (stableId: string) => void;
  onShowMatches: (specificUse: string, results: PlaceSearchResult[]) => void;
  onClearMatches: () => void;
}) {
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [typeQuery, setTypeQuery] = useState("");
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [results, setResults] = useState<PlaceSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef<AbortController | null>(null);

  useEffect(() => () => requestRef.current?.abort(), []);

  const allTypes = categories
    .flatMap((category) => category.types)
    .sort((left, right) => left.specificUse.localeCompare(right.specificUse));
  const selectedCategory = categories.find((category) => category.id === categoryId) ?? null;
  const queryTerms = normalizedTypeTerms(typeQuery);
  const visibleTypes = (queryTerms.length > 0 ? allTypes : selectedCategory?.types ?? []).filter(
    (type) => {
      const normalizedLabel = normalizedTypeTerms(type.specificUse);
      return queryTerms.every((term) =>
        normalizedLabel.some((labelTerm) => labelTerm.includes(term) || term.includes(labelTerm)),
      );
    },
  );
  const quickTypes = ["Magic-item shop", "Armorer"]
    .map((specificUse) => allTypes.find((type) => type.specificUse === specificUse))
    .filter((type): type is NonNullable<typeof type> => Boolean(type));

  const selectType = async (specificUse: string) => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setSelectedType(specificUse);
    setResults([]);
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/places?type=${encodeURIComponent(specificUse)}`, {
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("Those places could not be loaded.");
      const payload = (await response.json()) as { results: PlaceSearchResult[] };
      setResults(payload.results);
      onShowMatches(specificUse, payload.results);
    } catch (loadError) {
      if (loadError instanceof DOMException && loadError.name === "AbortError") return;
      setError(loadError instanceof Error ? loadError.message : "Those places could not be loaded.");
      onClearMatches();
    } finally {
      if (requestRef.current === controller) setLoading(false);
    }
  };

  return (
    <div className="record-view place-directory-view" hidden={hidden}>
      <div className="record-header place-directory-header">
        <div className="record-id-row">
          <span className="record-kind">Place directory</span>
          <code>{allTypes.length} imported types</code>
          <button
            className="record-expand"
            type="button"
            aria-pressed={expanded}
            onClick={onToggleExpanded}
          >
            {expanded ? "↦ Standard width" : "↤ Expand panel"}
          </button>
        </div>
        <h2>Browse places</h2>
        <p>Choose a broad category, then an exact imported place type.</p>
        <button className="directory-close" type="button" onClick={onClose}>← Return to current record</button>
      </div>

      <div className="record-scroll place-directory-scroll">
        <label className="place-type-search">
          <span>Find a place type</span>
          <input
            type="search"
            value={typeQuery}
            placeholder="Try magic, armor, tavern, temple…"
            onChange={(event) => {
              const nextQuery = event.target.value;
              setTypeQuery(nextQuery);
              if (nextQuery.trim()) setCategoryId(null);
            }}
          />
        </label>

        <div className="quick-place-types" aria-label="Quick place searches">
          <span>Quick finds</span>
          {quickTypes.map((type) => (
            <button
              type="button"
              className={selectedType === type.specificUse ? "is-active" : ""}
              key={type.specificUse}
              onClick={() => void selectType(type.specificUse)}
            >
              {type.specificUse.replace("Magic-item", "Magic")} <b>{type.count}</b>
            </button>
          ))}
        </div>

        <section className="place-category-section">
          <div className="directory-section-heading">
            <div><span>1</span><h3>Choose a category</h3></div>
            {categoryId ? <button type="button" onClick={() => setCategoryId(null)}>Clear</button> : null}
          </div>
          <div className="place-category-grid">
            {categories.map((category) => (
              <button
                type="button"
                className={categoryId === category.id ? "is-active" : ""}
                aria-pressed={categoryId === category.id}
                key={category.id}
                onClick={() => {
                  setCategoryId(category.id);
                  setTypeQuery("");
                }}
              >
                <strong>{category.label}</strong>
                <span>{category.description}</span>
                <small>{category.types.length} types · {category.count} places</small>
              </button>
            ))}
          </div>
        </section>

        {selectedCategory || queryTerms.length > 0 ? (
          <section className="place-type-section">
            <div className="directory-section-heading">
              <div><span>2</span><h3>{selectedCategory?.label ?? "Matching place types"}</h3></div>
              <small>{visibleTypes.length}</small>
            </div>
            {visibleTypes.length > 0 ? (
              <div className="place-type-list">
                {visibleTypes.map((type) => (
                  <button
                    type="button"
                    className={selectedType === type.specificUse ? "is-active" : ""}
                    key={type.specificUse}
                    onClick={() => void selectType(type.specificUse)}
                  >
                    <span>{type.specificUse}</span><b>{type.count}</b>
                  </button>
                ))}
              </div>
            ) : <p className="directory-empty">No imported place types match that search.</p>}
          </section>
        ) : null}

        {selectedType ? (
          <section className="place-result-section">
            <div className="directory-section-heading result-heading">
              <div><span>3</span><h3>{selectedType}</h3></div>
              {results.length > 0 ? (
                <button type="button" onClick={() => onShowMatches(selectedType, results)}>Fit all on map</button>
              ) : null}
            </div>
            {loading ? <p className="directory-empty">Finding every {selectedType.toLocaleLowerCase()}…</p> : null}
            {error ? <p className="directory-error">{error}</p> : null}
            {!loading && !error && results.length > 0 ? (
              <div className="place-result-list">
                {results.map((place, index) => (
                  <button type="button" key={place.stableId} onClick={() => onOpenRecord(place.stableId)}>
                    <span className="place-result-number">{String(index + 1).padStart(2, "0")}</span>
                    <span>
                      <strong>{place.name}</strong>
                      <small>{place.address} · {place.district} · {place.staffCount} staff</small>
                    </span>
                    <code>{place.stableId}</code>
                  </button>
                ))}
              </div>
            ) : null}
          </section>
        ) : null}
      </div>
    </div>
  );
}

export function CityConsole({ snapshot }: { snapshot: DashboardSnapshot }) {
  const [detail, setDetail] = useState(snapshot.initialDetail);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [mapMarkup, setMapMarkup] = useState("");
  const [mapError, setMapError] = useState<string | null>(null);
  const [hoveredBuilding, setHoveredBuilding] = useState<string | null>(null);
  const [selectedBuildingIds, setSelectedBuildingIds] = useState<string[]>(
    snapshot.initialDetail.map ? [snapshot.initialDetail.stableId] : [],
  );
  const [districtFilter, setDistrictFilter] = useState<string | null>(null);
  const [layers, setLayers] = useState({ labels: true, roads: true, trees: true });
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [pinnedItems, setPinnedItems] = useState(snapshot.pinned);
  const [recent, setRecent] = useState(snapshot.recent);
  const [spotlightPromptId, setSpotlightPromptId] = useState<string | null>(null);
  const [mobilePanel, setMobilePanel] = useState<"map" | "record">("map");
  const [leftRailCollapsed, setLeftRailCollapsed] = useState(false);
  const [recordPanelExpanded, setRecordPanelExpanded] = useState(false);
  const [recordMode, setRecordMode] = useState<"detail" | "places">("detail");
  const [activePlaceType, setActivePlaceType] = useState<string | null>(null);
  const mapStageRef = useRef<HTMLDivElement>(null);
  const sessionDockRef = useRef<HTMLElement>(null);
  const viewBoxRef = useRef(fullViewBox);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    viewBox: typeof fullViewBox;
  } | null>(null);
  const draggedRef = useRef(false);
  const pointerBuildingRef = useRef<string | null>(null);
  const hoveredRef = useRef<string | null>(null);

  const updateViewBox = useCallback((next: typeof fullViewBox) => {
    const stage = mapStageRef.current;
    const svg = stage?.querySelector("svg");
    if (!svg) return;
    const clamped = {
      width: Math.min(fullViewBox.width, Math.max(90, next.width)),
      height: Math.min(fullViewBox.height, Math.max(88, next.height)),
      x: next.x,
      y: next.y,
    };
    clamped.x = Math.min(fullViewBox.width - clamped.width, Math.max(0, clamped.x));
    clamped.y = Math.min(fullViewBox.height - clamped.height, Math.max(0, clamped.y));
    viewBoxRef.current = clamped;
    svg.setAttribute("viewBox", `${clamped.x} ${clamped.y} ${clamped.width} ${clamped.height}`);
  }, []);

  const focusMap = useCallback(
    (nextDetail: EntityDetail, close = false) => {
      if (!nextDetail.map) return;
      const width = close ? 210 : 500;
      const height = width * (fullViewBox.height / fullViewBox.width);
      updateViewBox({
        x: nextDetail.map.x - width / 2,
        y: nextDetail.map.y - height / 2,
        width,
        height,
      });
    },
    [updateViewBox],
  );

  const focusMapOnBuildings = useCallback(
    (stableIds: string[]) => {
      const stage = mapStageRef.current;
      const svg = stage?.querySelector("svg");
      if (!stage || !svg || stableIds.length === 0) return;
      const boxes = stableIds
        .map((stableId) =>
          stage.querySelector<SVGGraphicsElement>(`[data-building-id="${CSS.escape(stableId)}"]`),
        )
        .filter((element): element is SVGGraphicsElement => Boolean(element))
        .map((element) => element.getBBox());
      if (boxes.length === 0) return;

      const minX = Math.min(...boxes.map((box) => box.x));
      const minY = Math.min(...boxes.map((box) => box.y));
      const maxX = Math.max(...boxes.map((box) => box.x + box.width));
      const maxY = Math.max(...boxes.map((box) => box.y + box.height));
      const rect = stage.getBoundingClientRect();
      const targetRatio = rect.width > 0 && rect.height > 0 ? rect.width / rect.height : 1;
      const padding = 70;
      let width = Math.max(180, maxX - minX + padding * 2);
      let height = Math.max(176, maxY - minY + padding * 2);
      if (width / height < targetRatio) width = height * targetRatio;
      if (width / height > targetRatio) height = width / targetRatio;
      updateViewBox({
        x: minX + (maxX - minX) / 2 - width / 2,
        y: minY + (maxY - minY) / 2 - height / 2,
        width,
        height,
      });
    },
    [updateViewBox],
  );

  const activateEntity = useCallback(
    async (stableId: string, options?: { focus?: boolean }) => {
      setPendingId(stableId);
      try {
        const response = await fetch(`/api/entities/${encodeURIComponent(stableId)}`);
        if (!response.ok) throw new Error("Record could not be loaded.");
        const nextDetail = (await response.json()) as EntityDetail;
        setDetail(nextDetail);
        setRecordMode("detail");
        setActivePlaceType(null);
        setSpotlightPromptId(null);
        setMobilePanel("record");
        setRecent((current) => {
          const next = entityLinkFromDetail(nextDetail);
          return [next, ...current.filter((item) => item.stableId !== stableId)].slice(0, 8);
        });
        setSelectedBuildingIds(nextDetail.kind === "building" ? [nextDetail.stableId] : []);
        if (options?.focus !== false && nextDetail.map) {
          window.requestAnimationFrame(() => focusMap(nextDetail));
        }
        void recordRecentView(stableId);
      } catch (error) {
        setMapError(error instanceof Error ? error.message : "Record could not be loaded.");
      } finally {
        setPendingId(null);
      }
    },
    [focusMap],
  );

  const revealMapTarget = useCallback(
    async (stableId: string) => {
      setPendingId(stableId);
      try {
        const response = await fetch(`/api/entities/${encodeURIComponent(stableId)}`);
        if (!response.ok) throw new Error("Map location could not be loaded.");
        const targetDetail = (await response.json()) as EntityDetail;
        if (!targetDetail.map) throw new Error("This record has no mapped building location.");
        setActivePlaceType(null);
        setSelectedBuildingIds([targetDetail.stableId]);
        setMobilePanel("map");
        window.requestAnimationFrame(() => focusMap(targetDetail, true));
      } catch (error) {
        setMapError(error instanceof Error ? error.message : "Map location could not be loaded.");
      } finally {
        setPendingId(null);
      }
    },
    [focusMap],
  );

  useEffect(() => {
    const controller = new AbortController();
    fetch("/generated/arentoria-map.svg", { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("The prepared city map is unavailable.");
        return response.text();
      })
      .then(setMapMarkup)
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setMapError(error instanceof Error ? error.message : "The city map could not be loaded.");
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!mapMarkup) return;
    const stage = mapStageRef.current;
    const svg = stage?.querySelector("svg");
    if (!svg) return;
    svg.classList.add("city-map-svg");
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = svg.getBoundingClientRect();
      const current = viewBoxRef.current;
      const pointerX = current.x + ((event.clientX - rect.left) / rect.width) * current.width;
      const pointerY = current.y + ((event.clientY - rect.top) / rect.height) * current.height;
      const factor = event.deltaY < 0 ? 0.82 : 1.22;
      const width = current.width * factor;
      const height = current.height * factor;
      const ratioX = (pointerX - current.x) / current.width;
      const ratioY = (pointerY - current.y) / current.height;
      updateViewBox({
        x: pointerX - width * ratioX,
        y: pointerY - height * ratioY,
        width,
        height,
      });
    };
    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      pointerBuildingRef.current = (event.target as Element)
        .closest<SVGElement>("[data-building-id]")
        ?.dataset.buildingId ?? null;
      dragRef.current = {
        startX: event.clientX,
        startY: event.clientY,
        viewBox: { ...viewBoxRef.current },
      };
      draggedRef.current = false;
      svg.setPointerCapture(event.pointerId);
      svg.classList.add("is-dragging");
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!dragRef.current) return;
      const rect = svg.getBoundingClientRect();
      const deltaX = event.clientX - dragRef.current.startX;
      const deltaY = event.clientY - dragRef.current.startY;
      if (Math.abs(deltaX) + Math.abs(deltaY) > 5) draggedRef.current = true;
      updateViewBox({
        ...dragRef.current.viewBox,
        x: dragRef.current.viewBox.x - (deltaX / rect.width) * dragRef.current.viewBox.width,
        y: dragRef.current.viewBox.y - (deltaY / rect.height) * dragRef.current.viewBox.height,
      });
    };
    const onPointerUp = (event: PointerEvent) => {
      const selectedBuildingId = pointerBuildingRef.current;
      dragRef.current = null;
      svg.classList.remove("is-dragging");
      if (svg.hasPointerCapture(event.pointerId)) svg.releasePointerCapture(event.pointerId);
      window.setTimeout(() => {
        if (pointerBuildingRef.current === selectedBuildingId) pointerBuildingRef.current = null;
        draggedRef.current = false;
      }, 0);
    };
    const onClick = (event: MouseEvent) => {
      const directBuilding = event
        .composedPath()
        .find((node): node is SVGElement => node instanceof SVGElement && Boolean(node.dataset.buildingId));
      const selectedBuildingId = directBuilding?.dataset.buildingId ?? pointerBuildingRef.current;
      pointerBuildingRef.current = null;
      if (draggedRef.current || !selectedBuildingId) {
        draggedRef.current = false;
        return;
      }
      void activateEntity(selectedBuildingId, { focus: false });
    };

    svg.addEventListener("wheel", onWheel, { passive: false });
    svg.addEventListener("pointerdown", onPointerDown);
    svg.addEventListener("pointermove", onPointerMove);
    svg.addEventListener("pointerup", onPointerUp);
    svg.addEventListener("pointercancel", onPointerUp);
    svg.addEventListener("click", onClick);
    updateViewBox(fullViewBox);
    window.requestAnimationFrame(() => focusMap(snapshot.initialDetail));

    return () => {
      svg.removeEventListener("wheel", onWheel);
      svg.removeEventListener("pointerdown", onPointerDown);
      svg.removeEventListener("pointermove", onPointerMove);
      svg.removeEventListener("pointerup", onPointerUp);
      svg.removeEventListener("pointercancel", onPointerUp);
      svg.removeEventListener("click", onClick);
    };
  }, [activateEntity, focusMap, mapMarkup, snapshot.initialDetail, updateViewBox]);

  useEffect(() => {
    const stage = mapStageRef.current;
    if (!stage || !mapMarkup) return;
    stage.querySelectorAll(".arentoria-building.is-selected").forEach((element) => {
      element.classList.remove("is-selected");
    });
    selectedBuildingIds.forEach((stableId) => {
      stage
        .querySelector(`[data-building-id="${CSS.escape(stableId)}"]`)
        ?.classList.add("is-selected");
    });
  }, [mapMarkup, selectedBuildingIds]);

  useEffect(() => {
    const stage = mapStageRef.current;
    if (!stage || !mapMarkup) return;
    stage.querySelectorAll<SVGElement>(".arentoria-building").forEach((element) => {
      element.classList.toggle(
        "is-dimmed",
        Boolean(districtFilter && element.dataset.district !== districtFilter),
      );
    });
  }, [districtFilter, mapMarkup]);

  useEffect(() => {
    const stage = mapStageRef.current;
    if (!stage || !mapMarkup) return;
    const visibility = [
      ["#Building_IDs", layers.labels],
      ["#road_ID_name_review", layers.roads],
      ["#layer-MC12", layers.trees],
    ] as const;
    visibility.forEach(([selector, visible]) => {
      const layer = stage.querySelector<SVGElement>(selector);
      if (layer) layer.style.display = visible ? "" : "none";
    });
  }, [layers, mapMarkup]);

  useEffect(() => {
    if (query.trim().length < 2) {
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(query)}`, { signal: controller.signal })
        .then((response) => response.json())
        .then((payload: { results: SearchResult[] }) => setSearchResults(payload.results))
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError") return;
          setSearchResults([]);
        })
        .finally(() => setSearching(false));
    }, 160);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const handleMapKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const target = event.target as Element;
    const building = target.closest<SVGElement>("[data-building-id]");
    if (!building?.dataset.buildingId) return;
    event.preventDefault();
    void activateEntity(building.dataset.buildingId, { focus: false });
  };

  const handlePin = async () => {
    const stableId = detail.stableId;
    const result = await toggleSessionPin(stableId);
    setPinnedItems((current) =>
      result.pinned
        ? [entityLinkFromDetail(detail), ...current.filter((item) => item.stableId !== stableId)]
        : current.filter((item) => item.stableId !== stableId),
    );
  };

  const currentPinned = pinnedItems.some((item) => item.stableId === detail.stableId);
  const districtLabel = snapshot.districts.find(
    (district) => district.mapDistrict === districtFilter,
  )?.name;
  const hoverDetail = hoveredBuilding ? snapshot.mapBuildings[hoveredBuilding] : null;
  const spotlightPrompt =
    detail.prompts.find((prompt) => prompt.stableId === spotlightPromptId) ?? null;

  const handleStorySaved = (nextDetail: EntityDetail) => {
    setDetail(nextDetail);
    setPinnedItems((current) =>
      current.map((item) =>
        item.stableId === nextDetail.stableId ? entityLinkFromDetail(nextDetail) : item,
      ),
    );
  };

  const giveStreetDetail = () => {
    if (detail.prompts.length === 0) return;
    const currentIndex = detail.prompts.findIndex((prompt) => prompt.stableId === spotlightPromptId);
    const nextPrompt = detail.prompts[(currentIndex + 1) % detail.prompts.length];
    setSpotlightPromptId(nextPrompt.stableId);
  };

  const openPlaceBrowser = () => {
    setRecordMode("places");
    setMobilePanel("record");
  };

  const closePlaceBrowser = () => {
    setRecordMode("detail");
    setActivePlaceType(null);
    setSelectedBuildingIds(detail.kind === "building" ? [detail.stableId] : []);
  };

  const showPlaceMatches = (specificUse: string, results: PlaceSearchResult[]) => {
    const stableIds = results.map((place) => place.stableId);
    setActivePlaceType(specificUse);
    setDistrictFilter(null);
    setSelectedBuildingIds(stableIds);
    setMobilePanel("map");
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => focusMapOnBuildings(stableIds));
    });
  };

  return (
    <main className={`console-shell ${leftRailCollapsed ? "rail-collapsed" : ""}`}>
      <aside className="left-rail">
        <button
          className="rail-collapse"
          type="button"
          aria-expanded={!leftRailCollapsed}
          aria-label={leftRailCollapsed ? "Expand navigation" : "Collapse navigation"}
          title={leftRailCollapsed ? "Expand navigation" : "Collapse navigation"}
          onClick={() => setLeftRailCollapsed((current) => !current)}
        >
          {leftRailCollapsed ? "»" : "«"}
        </button>
        <div className="seal" aria-hidden="true">A</div>
        <div className="brand-block">
          <span className="kicker">Office of Civic Records</span>
          <strong>Arentoria</strong>
          <small>DM city index · local archive</small>
        </div>

        <nav className="primary-nav" aria-label="Primary">
          <button className={`nav-item ${recordMode === "detail" ? "is-active" : ""}`} type="button" title="City map" onClick={() => { setRecordMode("detail"); setMobilePanel("map"); }}><span className="nav-icon">⌖</span><span className="nav-label">City map</span></button>
          <button className="nav-item" type="button" title="Search index" onClick={() => document.querySelector<HTMLInputElement>("#global-search")?.focus()}><span className="nav-icon">⌕</span><span className="nav-label">Search index</span></button>
          <button className={`nav-item ${recordMode === "places" ? "is-active" : ""}`} type="button" title="Browse places" onClick={openPlaceBrowser}><span className="nav-icon">▦</span><span className="nav-label">Browse places</span></button>
          <button className="nav-item" type="button" title="Tonight's session" onClick={() => sessionDockRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })}><span className="nav-icon">◇</span><span className="nav-label">Tonight&apos;s session</span><b>{pinnedItems.length}</b></button>
        </nav>

        <section className="rail-section">
          <div className="section-heading"><span>District registry</span><small>{snapshot.districts.length}</small></div>
          <button
            type="button"
            className={`district-row ${districtFilter === null ? "is-active" : ""}`}
            onClick={() => setDistrictFilter(null)}
          >
            <span>All districts</span><small>{snapshot.counts.buildings}</small>
          </button>
          {snapshot.districts.map((district) => (
            <button
              type="button"
              className={`district-row ${districtFilter === district.mapDistrict ? "is-active" : ""}`}
              key={district.name}
              onClick={() => {
                setDistrictFilter(district.mapDistrict);
                void activateEntity(district.stableId, { focus: false });
              }}
            >
              <span>{district.name}</span><small>{district.buildingCount}</small>
            </button>
          ))}
        </section>

        <section className="rail-section recent-section">
          <div className="section-heading"><span>Recently viewed</span><small>{recent.length}</small></div>
          {recent.length === 0 ? <p className="muted-copy">Records you open will remain here.</p> : null}
          {recent.slice(0, 5).map((item) => (
            <button className="recent-row" type="button" key={item.stableId} onClick={() => void activateEntity(item.stableId)}>
              <span>{item.label}</span><small>{item.stableId}</small>
            </button>
          ))}
        </section>

        <div className="source-status">
          <span className="status-dot" />
          <div><strong>Sources validated</strong><small>Last import · local SQLite</small></div>
        </div>
      </aside>

      <section className={`workspace ${mobilePanel === "record" ? "show-record" : "show-map"} ${pinnedItems.length > 0 ? "has-session-pins" : ""} ${recordPanelExpanded ? "record-expanded" : ""}`}>
        <header className="topbar">
          <div className="search-wrap">
            <span className="search-icon" aria-hidden="true">⌕</span>
            <input
              id="global-search"
              value={query}
              onChange={(event) => {
                const nextQuery = event.target.value;
                setQuery(nextQuery);
                if (nextQuery.trim().length >= 2) {
                  setSearching(true);
                } else {
                  setSearching(false);
                  setSearchResults([]);
                }
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && searchResults[0]) {
                  void activateEntity(searchResults[0].stableId);
                  setQuery("");
                }
              }}
              placeholder="Search Bilious, AR-0738, Vayne, roads, factions…"
              autoComplete="off"
            />
            <kbd>⌘ K</kbd>
            {query.trim().length >= 2 ? (
              <div className="search-results">
                <div className="search-results-head">
                  <span>Categorized results</span><small>{searching ? "Searching…" : searchResults.length}</small>
                </div>
                {!searching && searchResults.length === 0 ? <p>No authored records match.</p> : null}
                {searchResults.map((result) => (
                  <button
                    type="button"
                    key={`${result.kind}:${result.stableId}`}
                    onClick={() => {
                      void activateEntity(result.stableId);
                      setQuery("");
                    }}
                  >
                    <span className={`kind-icon kind-${result.kind}`}>{result.kind.slice(0, 1).toUpperCase()}</span>
                    <span><strong>{result.title}</strong><small>{kindLabels[result.kind]} · {result.subtitle ?? result.stableId}</small></span>
                    <code>{result.stableId}</code>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <div className="top-stats" aria-label="Imported record totals">
            <span><b>{snapshot.counts.buildings.toLocaleString()}</b> buildings</span>
            <span><b>{snapshot.counts.people.toLocaleString()}</b> people</span>
            <span><b>{snapshot.counts.factions}</b> factions</span>
          </div>
        </header>

        <div className="mobile-tabs" role="tablist" aria-label="Workspace view">
          <button type="button" className={mobilePanel === "map" ? "is-active" : ""} onClick={() => setMobilePanel("map")}>Map</button>
          <button type="button" className={mobilePanel === "record" && recordMode === "detail" ? "is-active" : ""} onClick={() => { setRecordMode("detail"); setMobilePanel("record"); }}>Record</button>
          <button type="button" className={mobilePanel === "record" && recordMode === "places" ? "is-active" : ""} onClick={openPlaceBrowser}>Places</button>
        </div>

        <section className="map-panel" aria-label="Interactive city map">
          <div className="map-toolbar">
            <div>
              <span className="kicker">Master survey · 1676 buildings</span>
              <h1>{districtLabel ?? "Citywide registry"}</h1>
            </div>
            <div className="map-actions">
              <button className="map-browse-button" type="button" title="Browse place types" onClick={openPlaceBrowser}>▦ Places</button>
              <button type="button" title="Zoom in" onClick={() => {
                const current = viewBoxRef.current;
                updateViewBox({ x: current.x + current.width * 0.1, y: current.y + current.height * 0.1, width: current.width * 0.8, height: current.height * 0.8 });
              }}>＋</button>
              <button type="button" title="Zoom out" onClick={() => {
                const current = viewBoxRef.current;
                updateViewBox({ x: current.x - current.width * 0.125, y: current.y - current.height * 0.125, width: current.width * 1.25, height: current.height * 1.25 });
              }}>−</button>
              <button type="button" title="Reset map" onClick={() => updateViewBox(fullViewBox)}>⌂</button>
            </div>
          </div>

          <div
            className="map-stage"
            ref={mapStageRef}
            onKeyDown={handleMapKeyDown}
            onPointerMove={(event) => {
              const building = (event.target as Element).closest<SVGElement>("[data-building-id]");
              const nextHovered = building?.dataset.buildingId ?? null;
              if (nextHovered !== hoveredRef.current) {
                hoveredRef.current = nextHovered;
                setHoveredBuilding(nextHovered);
              }
            }}
            onPointerLeave={() => {
              hoveredRef.current = null;
              setHoveredBuilding(null);
            }}
          >
            {!mapMarkup && !mapError ? <div className="map-loading"><span />Preparing municipal survey…</div> : null}
            {mapError ? <div className="map-error">{mapError}</div> : null}
            {mapMarkup ? <div className="map-document" dangerouslySetInnerHTML={{ __html: mapMarkup }} /> : null}
            <div className="map-readout">
              <span>{hoveredBuilding ?? (activePlaceType ? `${selectedBuildingIds.length} matches` : selectedBuildingIds[0] ?? detail.stableId)}</span>
              <strong>{hoverDetail?.label ?? activePlaceType ?? (detail.kind === "building" ? detail.title : "Current record")}</strong>
              <small>{hoverDetail?.address ?? (activePlaceType ? "All matching buildings highlighted" : hoveredBuilding ? "Select building" : detail.subtitle)}</small>
            </div>
            <div className="map-legend">
              <strong>Layers</strong>
              {([
                ["labels", "Building IDs"],
                ["roads", "Roads"],
                ["trees", "Trees"],
              ] as const).map(([key, label]) => (
                <label key={key}><input type="checkbox" checked={layers[key]} onChange={() => setLayers((current) => ({ ...current, [key]: !current[key] }))} /><span />{label}</label>
              ))}
            </div>
          </div>
          <footer className="map-footer">
            <span>Drag to pan · wheel to zoom · select a building for its record</span>
            <span>{activePlaceType ? `${selectedBuildingIds.length} × ${activePlaceType}` : districtFilter ? `Filter: ${districtLabel}` : "All district geometries"}</span>
          </footer>
        </section>

        <aside className="record-panel" aria-live="polite" aria-busy={Boolean(pendingId)}>
          <PlaceBrowser
            categories={snapshot.placeCategories}
            expanded={recordPanelExpanded}
            hidden={recordMode !== "places"}
            onClose={closePlaceBrowser}
            onToggleExpanded={() => setRecordPanelExpanded((current) => !current)}
            onOpenRecord={(stableId) => void activateEntity(stableId)}
            onShowMatches={showPlaceMatches}
            onClearMatches={() => {
              setActivePlaceType(null);
              setSelectedBuildingIds([]);
            }}
          />

          <div className="record-view detail-record-view" hidden={recordMode !== "detail"}>
          <div className="record-header">
            <button className="mobile-back" type="button" onClick={() => setMobilePanel("map")}>← Map</button>
            <div className="record-id-row">
              <span className={`record-kind kind-${detail.kind}`}>{kindLabels[detail.kind]}</span>
              <code>{detail.stableId}</code>
              <button
                className="record-expand"
                type="button"
                aria-pressed={recordPanelExpanded}
                title={recordPanelExpanded ? "Restore standard panel width" : "Expand record panel"}
                onClick={() => setRecordPanelExpanded((current) => !current)}
              >
                {recordPanelExpanded ? "↦ Standard width" : "↤ Expand panel"}
              </button>
            </div>
            <h2>{detail.title}</h2>
            <p>{detail.subtitle}</p>
            <div className="record-actions">
              <button className={currentPinned ? "is-pinned" : ""} type="button" onClick={() => void handlePin()}>{currentPinned ? "◆ Pinned tonight" : "◇ Pin for tonight"}</button>
              {detail.map ? <button type="button" onClick={() => { setSelectedBuildingIds([detail.stableId]); setMobilePanel("map"); focusMap(detail, true); }}>⌖ Reveal on map</button> : null}
              {detail.mapTargets
                .filter((target) => target.stableId !== detail.stableId)
                .map((target) => (
                  <button type="button" key={`${target.label}:${target.stableId}`} onClick={() => void revealMapTarget(target.stableId)}>⌖ {target.label}</button>
                ))}
            </div>
          </div>

          <div className="record-scroll">
            <section className="at-table-card">
              <div className="at-table-heading">
                <span>At the table</span>
                <small>DM + canonical context</small>
              </div>
              <p className="at-table-summary">{detail.atTable.summary}</p>
              {detail.atTable.currentSituation ? (
                <div className="right-now"><strong>Right now</strong><p>{detail.atTable.currentSituation}</p></div>
              ) : (
                <div className="right-now is-empty"><strong>Right now</strong><p>No current incident has been recorded yet.</p></div>
              )}
              {detail.atTable.cues.length > 0 ? (
                <dl className="at-table-cues">
                  {detail.atTable.cues.map((cue, index) => (
                    <div key={`${cue.label}:${index}`}>
                      <dt>{cue.label}<small>{cue.source === "dm" ? "DM story" : "Canonical"}</small></dt>
                      <dd>{cue.value}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}
            </section>

            <StoryEditor key={detail.stableId} detail={detail} onSaved={handleStorySaved} />

            {detail.prompts.length > 0 ? (
              <section className="record-section">
                <div className="record-section-title">
                  <h3>Gossip &amp; authored street context</h3>
                  <span>{detail.prompts.length}</span>
                </div>
                {detail.kind === "district" ? (
                  <button className="street-detail-button" type="button" onClick={giveStreetDetail}>Give me a street detail</button>
                ) : null}
                {spotlightPrompt ? (
                  <article className="street-spotlight">
                    <div><span>{spotlightPrompt.type}</span>{spotlightPrompt.bestTime ? <small>{spotlightPrompt.bestTime}</small> : null}</div>
                    <p>{spotlightPrompt.text}</p>
                    {spotlightPrompt.dmConnection ? <details><summary>DM connection</summary><p>{spotlightPrompt.dmConnection}</p></details> : null}
                  </article>
                ) : null}
                <div className="prompt-list">
                  {detail.prompts.map((prompt) => (
                    <article key={prompt.stableId}>
                      <div><span>{prompt.type}</span>{prompt.bestTime ? <small>{prompt.bestTime}</small> : null}</div>
                      <p>{prompt.text}</p>
                      {prompt.dmConnection ? <details><summary>DM connection</summary><p>{prompt.dmConnection}</p></details> : null}
                    </article>
                  ))}
                </div>
              </section>
            ) : null}

            {detail.connections ? (
              <PersonConnectionsPanel
                connections={detail.connections}
                onOpen={(stableId) => void activateEntity(stableId)}
              />
            ) : detail.related.length > 0 ? (
              <section className="record-section">
                <div className="record-section-title"><h3>People &amp; important connections</h3><span>{detail.related.length}</span></div>
                <div className="related-list">
                  {detail.related.map((item) => (
                    <button type="button" key={`${item.kind}:${item.stableId}`} onClick={() => void activateEntity(item.stableId)}>
                      <span className={`kind-icon kind-${item.kind}`}>{item.kind.slice(0, 1).toUpperCase()}</span>
                      <span><strong>{item.label}</strong><small>{item.detail ?? kindLabels[item.kind]}</small></span>
                      <code>{item.stableId}</code>
                    </button>
                  ))}
                </div>
              </section>
            ) : null}

            {detail.fields.length > 0 ? (
              <details className="canonical-details">
                <summary>Canonical registry fields <span>{detail.fields.length}</span></summary>
                <section className="record-section">
                  <dl>
                    {detail.fields.map((field, index) => <div key={`${field.label}:${index}`}><dt>{field.label}</dt><dd>{field.value}</dd></div>)}
                  </dl>
                </section>
              </details>
            ) : null}

            {detail.notice ? (
              <details className="source-notice">
                <summary>Source scope</summary>
                <p>{detail.notice}</p>
              </details>
            ) : null}
          </div>
          </div>
        </aside>

        <footer className={`session-dock ${pinnedItems.length === 0 ? "is-empty" : ""}`} ref={sessionDockRef}>
          <div className="session-title"><span className="session-gem">◆</span><div><strong>Tonight&apos;s session</strong><small>{pinnedItems.length === 0 ? "Pin records for rapid table access" : `${pinnedItems.length} record${pinnedItems.length === 1 ? "" : "s"} ready`}</small></div></div>
          <div className="session-pins">
            {pinnedItems.length === 0 ? <p>No records pinned yet.</p> : null}
            {pinnedItems.map((item) => (
              <article key={item.stableId}>
                <div><span>{kindLabels[item.kind]}</span><code>{item.stableId}</code></div>
                <strong>{item.label}</strong>
                <p>{item.storyLine ?? item.detail ?? "Open this record for its table view."}</p>
                <div className="session-card-actions">
                  <button type="button" onClick={() => void activateEntity(item.stableId)}>Open</button>
                  {item.mapTargetId ? <button type="button" onClick={() => void revealMapTarget(item.mapTargetId!)}>Reveal</button> : null}
                </div>
              </article>
            ))}
          </div>
        </footer>
      </section>
    </main>
  );
}
