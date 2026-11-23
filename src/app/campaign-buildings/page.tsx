"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { BuildingContext, CampaignBuildingOverride, ReviewedBuilding } from "@/lib/campaign-buildings";
import styles from "./page.module.css";

type BuildingOption = {
  id: string; district: string; address: string | null; importedName: string | null;
  importedUse: string | null; campaignName: string | null; campaignUse: string | null;
  disposition: string | null; hasOverride: boolean;
};
type Revision = {
  id: number; building_id: string; action: string; changed_at: string;
  before_json: string | null; after_json: string | null;
};
type Listing = { buildings: BuildingOption[]; districts: string[]; history: Revision[] };

const dispositionLabels: Record<string, string> = {
  keep: "Keep occupants and staff",
  reference_only: "Source reference only",
  reassignment_planned: "Reassignment planned, unresolved",
  manual_resolved: "Manually resolved",
};

const plannedFaiths = [
  ["Lathander", "Commons", "Major; largest congregation"],
  ["Waukeen", "Grand Market", "Major; wealthiest church"],
  ["Tyr", "Crown Ward", "Established, smaller"],
  ["Sune", "High March", "Established, smaller"],
  ["Chauntea", "Outer Ward", "Established, smaller"],
  ["Gond", "Stoneback", "Minor"],
  ["Oghma", "Scholarium", "Minor"],
] as const;

function occupantSummary(context: BuildingContext) {
  return `${context.residents} residents · ${context.households.length} households · ${context.groupQuarters.length} group quarters · ${context.workplace?.staffCount ?? 0} workplace staff`;
}

function sourceLabel(override: CampaignBuildingOverride | null) {
  if (!override) return "No approved override";
  return `${override.campaign_name ?? "Name inherited"} · ${override.specific_use ?? override.primary_use ?? "Use inherited"}`;
}

export default function CampaignBuildingsPage() {
  const [district, setDistrict] = useState("");
  const [category, setCategory] = useState("temple");
  const [query, setQuery] = useState("");
  const [listing, setListing] = useState<Listing | null>(null);
  const [selectedBuildings, setSelectedBuildings] = useState<string[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [reviewed, setReviewed] = useState<ReviewedBuilding[] | null>(null);
  const [selectedApprovals, setSelectedApprovals] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    const parameters = new URLSearchParams({ district, category, query });
    fetch(`/api/campaign-buildings?${parameters}`, { signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? "Could not load buildings.");
        return payload as Listing;
      })
      .then((payload) => { setListing(payload); setError(null); })
      .catch((cause) => { if (cause.name !== "AbortError") setError(cause.message); });
    return () => controller.abort();
  }, [district, category, query, message]);

  async function upload(mode: "preview" | "apply") {
    if (!file) { setError("Choose an exported .xlsx workbook first."); return; }
    setBusy(true); setError(null); setMessage(null);
    const form = new FormData();
    form.append("mode", mode);
    form.append("file", file);
    if (mode === "apply") form.append("selectedIds", JSON.stringify(selectedApprovals));
    try {
      const response = await fetch("/api/campaign-buildings", { method: "POST", body: form });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Workbook operation failed.");
      if (mode === "preview") {
        setReviewed(payload.rows as ReviewedBuilding[]);
        setSelectedApprovals([]);
        setMessage(`Reviewed ${payload.rows.length} workbook rows. Select the changes you approve.`);
      } else {
        setReviewed(null);
        setSelectedApprovals([]);
        setFile(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
        setMessage(`Approved ${payload.applied} building change${payload.applied === 1 ? "" : "s"}. A database backup was saved.`);
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Workbook operation failed."); }
    finally { setBusy(false); }
  }

  async function restore(revision: Revision) {
    if (!window.confirm(`Restore ${revision.building_id} to its state before revision ${revision.id}? A database backup will be saved first.`)) return;
    setBusy(true); setError(null); setMessage(null);
    try {
      const form = new FormData();
      form.append("mode", "restore");
      form.append("revisionId", String(revision.id));
      const response = await fetch("/api/campaign-buildings", { method: "POST", body: form });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Restore failed.");
      setMessage(`Restored ${payload.buildingId}. A database backup was saved.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Restore failed."); }
    finally { setBusy(false); }
  }

  function exportUrl(selected: boolean) {
    const parameters = new URLSearchParams({ district, category, query });
    if (selected) parameters.set("ids", selectedBuildings.join(","));
    return `/api/campaign-buildings/export?${parameters}`;
  }

  const reviewCounts = reviewed?.reduce((counts, row) => {
    counts[row.status] = (counts[row.status] ?? 0) + 1;
    return counts;
  }, {} as Record<string, number>);

  return <main className={styles.page}>
    <header className={styles.header}>
      <div><Link href="/" className={styles.back}>← City explorer</Link><p className={styles.eyebrow}>DM campaign layer</p>
        <h1>Campaign building overrides</h1>
        <p>Choose mapped buildings, edit the workbook, review occupant links, and approve only the rows you want.</p></div>
      <a href="/api/campaign-buildings/canon" className={styles.secondary}>Export approved canon JSON</a>
    </header>

    {error && <p className={styles.error} role="alert">{error}</p>}
    {message && <p className={styles.message} role="status">{message}</p>}

    <details className={styles.planning}>
      <summary>Seven faiths to place · planning reference</summary>
      <p>These districts are preferences. No buildings or people are assigned automatically.</p>
      <div className={styles.faiths}>{plannedFaiths.map(([faith, place, importance]) => <div key={faith}>
        <strong>{faith}</strong><span>{place}</span><small>{importance}</small>
      </div>)}</div>
      <p>Review the existing Temple of Dawnfire and Starfall separately. Dawnfire is underground in campaign canon.</p>
    </details>

    <section className={styles.panel}>
      <div className={styles.step}><span>1</span><div><h2>Select buildings</h2><p>Temple planning starts with existing temples and chapels. District and institutional filters help find other sites.</p></div></div>
      <div className={styles.filters}>
        <label>District<select value={district} onChange={(event) => { setDistrict(event.target.value); setSelectedBuildings([]); }}>
          <option value="">All districts</option>{listing?.districts.map((name) => <option key={name}>{name}</option>)}
        </select></label>
        <label>Category<select value={category} onChange={(event) => { setCategory(event.target.value); setSelectedBuildings([]); }}>
          <option value="temple">Temples and chapels</option><option value="institutional">All institutional buildings</option><option value="all">All buildings</option>
        </select></label>
        <label>Find building<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="AR-0172, street, name, use…" /></label>
      </div>
      <div className={styles.toolbar}>
        <span>{listing?.buildings.length ?? "…"} matching · {selectedBuildings.length} selected</span>
        <button type="button" className={styles.secondary} onClick={() => setSelectedBuildings(listing?.buildings.map((row) => row.id) ?? [])}>Select matching</button>
        <button type="button" className={styles.secondary} onClick={() => setSelectedBuildings([])}>Clear selection</button>
        <a className={styles.button} href={exportUrl(false)}>Export matching .xlsx</a>
        {selectedBuildings.length > 0 && <a className={styles.button} href={exportUrl(true)}>Export selected .xlsx</a>}
      </div>
      <div className={styles.list}>
        {listing?.buildings.map((row) => <label className={styles.building} key={row.id}>
          <input type="checkbox" checked={selectedBuildings.includes(row.id)} onChange={(event) => setSelectedBuildings((previous) =>
            event.target.checked ? [...previous, row.id] : previous.filter((id) => id !== row.id))} />
          <span><strong>{row.campaignName ?? row.importedName ?? row.id}</strong><small>{row.id} · {row.address ?? row.district} · {row.district}</small></span>
          <span className={styles.use}>{row.campaignUse ?? row.importedUse ?? "Use not recorded"}{row.hasOverride && <em>Campaign</em>}</span>
        </label>)}
        {listing?.buildings.length === 0 && <p>No buildings match these filters.</p>}
      </div>
    </section>

    <section className={styles.panel}>
      <div className={styles.step}><span>2</span><div><h2>Review workbook</h2><p>Gray columns are imported census reference. Green columns hold your proposals. Empty cells preserve existing approved values; [CLEAR] clears one field.</p></div></div>
      <div className={styles.toolbar}>
        <input ref={fileInputRef} type="file" accept=".xlsx" onChange={(event) => { setFile(event.target.files?.[0] ?? null); setReviewed(null); setSelectedApprovals([]); }} />
        <button type="button" className={styles.button} disabled={!file || busy} onClick={() => void upload("preview")}>Preview changes</button>
      </div>
      {reviewed && <>
        <p className={styles.summary}>{Object.entries(reviewCounts ?? {}).map(([status, count]) => `${count} ${status}`).join(" · ")}</p>
        <div className={styles.reviewList}>{reviewed.map((row) => {
          const selectable = ["new", "updated", "delete"].includes(row.status);
          return <article key={`${row.buildingId}:${row.rowNumber}`} className={styles.reviewRow}>
            <div className={styles.reviewHead}>
              <label><input type="checkbox" disabled={!selectable} checked={selectedApprovals.includes(row.buildingId)} onChange={(event) => setSelectedApprovals((previous) =>
                event.target.checked ? [...previous, row.buildingId] : previous.filter((id) => id !== row.buildingId))} />
                <strong>{row.buildingId}</strong></label>
              <span className={row.status === "invalid" ? styles.invalid : styles.status}>{row.status}</span>
              <small>Workbook row {row.rowNumber}</small>
            </div>
            <p><b>Source:</b> {row.context?.importedName ?? "Unnamed building"} · {row.context?.importedSpecificUse ?? "Use not recorded"} · {row.context?.address ?? ""}</p>
            <p><b>Campaign:</b> {sourceLabel(row.proposed)}</p>
            {row.context && <p><b>Occupants:</b> {occupantSummary(row.context)} · {dispositionLabels[row.proposed?.occupant_disposition ?? ""] ?? "Disposition not set"}</p>}
            {row.errors.map((entry) => <p className={styles.errorText} key={entry}>{entry}</p>)}
            {row.warnings.map((entry) => <p className={styles.warning} key={entry}>{entry}</p>)}
            {row.context && <details><summary>Inspect people and relationships</summary>
              <p>Households: {row.context.households.map((house) => `${house.id} (${house.lead ?? "lead unknown"}, ${house.size})`).join("; ") || "none"}</p>
              <p>Group quarters: {row.context.groupQuarters.map((quarter) => `${quarter.id} (${quarter.residents})`).join("; ") || "none"}</p>
              <p>Workplace: {row.context.workplace ? `${row.context.workplace.name}; lead ${row.context.workplace.lead ?? "unknown"}` : "none"}</p>
              <p>People: {row.context.associatedPeople.map((person) => `${person.name} (${person.id}, ${person.connection})`).join("; ") || "none"}</p>
              <p>Family employment links: {row.context.relationshipCounts.familyEmployment}; authored prompts: {row.context.relationshipCounts.linkedPrompts}</p>
            </details>}
          </article>;
        })}</div>
        <div className={styles.toolbar}><span>{selectedApprovals.length} approved for import</span>
          <button type="button" className={styles.button} disabled={busy || selectedApprovals.length === 0} onClick={() => void upload("apply")}>Apply selected changes</button>
        </div>
      </>}
    </section>

    <section className={styles.panel}>
      <div className={styles.step}><span>3</span><div><h2>Change history</h2><p>Each approval has a database backup. Restore a prior building version here.</p></div></div>
      <div className={styles.history}>{listing?.history.map((revision) => <div key={revision.id}>
        <span><strong>{revision.building_id}</strong> · {revision.action} · {new Date(revision.changed_at).toLocaleString()}</span>
        <button type="button" className={styles.secondary} disabled={busy} onClick={() => void restore(revision)}>Restore prior version</button>
      </div>)}{listing?.history.length === 0 && <p>No campaign building changes have been approved yet.</p>}</div>
    </section>
  </main>;
}
