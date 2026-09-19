# Arentoria source audit

## Supplied artifacts

| Artifact | Role | Current usable coverage |
| --- | --- | --- |
| `Arentoria_master_map.svg` | Master spatial map | 1,676 unique `AR-####` labels and district assignments |
| `Arentoria_factions_pressure_network_v21.xlsx` | Faction/pressure overlay | 20 factions, 387 memberships, 17 faction locations, 23 relationships, 6 infrastructure records |
| `Arentoria_district_prompts_v21.csv` | Authored street prompts | 80 prompts across 10 districts |
| `Arentoria_road_names_complete_v15.csv` | Road index | 130 unique road records and marker coordinates |
| `Arentor_Arentoria_Historical_Canon_v22.docx` | Historical canon | Narrative source; not yet normalized |
| `Arentoria DM City Database App — Codex Build Prompt.docx` | Product specification | Phase-one scope and data rules |
| `source/full-census/residents_current_v20.csv` | Current resident canon | 10,000 residents with stable person, home, work, and faction IDs |
| `source/full-census/buildings_current_v20.csv` | Current building canon | All 1,676 mapped buildings, addresses, uses, resident/workplace totals |
| Nine `source/full-census/*_v19.csv` relationship/workforce files | Normalized relationship inputs | 1,576 households, 6,004 household edges, 432 group quarters, 721 establishments, 3,839 staff links, and 205 family-employment links |

## Material gaps and mismatches

- The build prompt's packaging assumption is incorrect: the v21 workbook is a faction/pressure overlay, while the full census and relationships are supplied as a separate eleven-file CSV set under `source/full-census`.
- Current identity/building fields use v20. The separate v19 workforce files remain authoritative for household, family, workplace, establishment, and group-quarter relationships until matching later relationship files are supplied.
- The workbook filename is v21 while its Summary title says v20.
- The build prompt names `Arentoria_road_names_complete_v15.svg`, but the supplied map is `Arentoria_master_map.svg`; road metadata is supplied separately as CSV.
- The SVG contains one ordinary path per mapped building, but stable building IDs are stored on separate label groups. The map preparation script must match labels to geometry and reject ambiguous mappings.
- District prompt and faction references are reconciled to the current 10,000-person census by stable `P-*` ID.
- Road IDs use two supplied formats (`ROAD-###` and `NEW-##`). Both are preserved unchanged.
- The SVG calls the exterior map region `Unassigned Exterior`; authored atmosphere and prompt sources call the same unmatched tenth region `Outside the Walls / Farm Approaches`. The importer preserves the SVG label as map metadata and uses the authored name as the canonical district.
- Faction headquarters references can target either an `AR-####` building or a `SITE-###` infrastructure entity, so headquarters and relationship links use the shared entity registry rather than a building-only foreign key.

## Import contract

1. Source files remain immutable.
2. Every imported record carries source-file and source-row provenance.
3. Source records are upserted by stable external ID; absent records are not deleted.
4. App-owned notes, lore, events, recent views, and session pins live in separate tables.
5. A non-dry import backs up an existing database before opening a write transaction.
6. The import aborts on duplicate stable IDs, invalid map coverage, malformed district prompt references, or out-of-bounds road markers.
7. Derived IDs are namespaced and deterministic; supplied IDs are never renamed.
8. CSV/XLSX files are ingestion-only inputs. Runtime code reads the imported SQLite database and prepared map assets, never source tables directly.
9. v20 resident/building rows take precedence for current facts; v19 files contribute normalized relationship edges without replacing v20 identities.

## First vertical slice

The validated slice now crosses authored overlay and census data:

`AR-0738` → Bilious's Magic Shoppe → Bilious (`P-08416`) → home `AR-0736` / group quarter `GQ-0736` → coworkers → Grand Market prompt 3.
