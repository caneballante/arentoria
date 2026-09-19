# Arentoria DM City Index

A local-first, live-session reference for the city of Arentoria. The app imports the municipal map, authored overlays, and the separate full census/relationship CSV set into a searchable relational SQLite archive.

## Current capabilities

- Interactive 1,676-building SVG map with pan, zoom, district filtering, layer controls, keyboard selection, and synchronized record highlighting.
- Categorized SQLite FTS5 search across buildings, people, factions, roads, and authored street prompts.
- Building, person, faction, road, infrastructure, and prompt detail views.
- Narrative-first At-the-Table cards derived deterministically from canonical facts, with a persistent DM story layer for demeanor, wants, knowledge, secrets, current problems, and memorable details.
- Full 10,000-resident census with normalized home, household, group-quarter, workplace, coworker, family-employment, and faction links.
- Authored `AR-0738` → Bilious's Magic Shoppe → Bilious → home/workplace vertical slice.
- Persistent recently viewed records and Tonight's Session pins.
- Person home/workplace map actions, district context cards, authored street-detail selection, and named map hover readouts.
- Validated, transactional imports with source provenance, dry-run reporting, and automatic pre-import database backups.
- Source-aware detail notices that distinguish current v20 census facts from v19 relationship/workforce edges.

## Run locally

Requirements: Node.js 20.9 or newer.

```powershell
npm install
npm run data:prepare
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Verification

```powershell
npm run import:check
npm run typecheck
npm run lint
npm run test
npm run build
```

## Source handling

The six root-level handoff artifacts and the eleven files under `source/full-census` are immutable inputs. The v21 workbook is a faction overlay; it is not the full census. Current people/building facts come from the v20 CSVs, while the v19 relationship CSVs supply household, family, workplace, establishment, and group-quarter edges.

The running app reads SQLite and prepared map assets only. CSV/XLSX files are read exclusively by the import/re-import script. See [`docs/source-audit.md`](docs/source-audit.md) for the source contract and [`docs/data-model.md`](docs/data-model.md) for table-level source mapping.

For planning and feature-coverage reviews, use the searchable [`docs/build-prompt-reference.md`](docs/build-prompt-reference.md) mirror. It is generated from the immutable Word prompt by `scripts/export-build-prompt.py`; `AGENTS.md` records the checksum and refresh workflow for future Codex sessions.
