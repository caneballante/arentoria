# Arentoria SQLite data model

## Runtime boundary

`scripts/import-sources.mjs` is the only code path that reads CSV/XLSX source files. The running Next.js application reads `data/arentoria.sqlite`; the interactive map reads the prepared SVG and JSON map index. Re-imports are transactional and back up the prior database first.

## Source-to-table mapping

| SQLite table | Source input | Purpose |
| --- | --- | --- |
| `entity`, `person`, `resident_profile` | `residents_current_v20.csv`, plus prompt/faction references | Stable `P-*` identity and current demographic, home, work, and faction fields |
| `building`, `building_census` | `Arentoria_master_map.svg`, `buildings_current_v20.csv`, authored overlays | Stable `AR-*` geometry plus current address, use, population, and workplace totals |
| `household` | `households_workforce_v19.csv` | Stable `HH-*` household units and leads |
| `household_member` | `residents_current_v20.csv` | Person-to-household membership by stable IDs |
| `household_relationship` | `household_relationships_v19.csv` | Directed family/household relationship labels between two `P-*` IDs |
| `group_quarter` | `group_quarters_workforce_v19.csv` | Stable `GQ-*` units mapped to `AR-*` buildings |
| `group_quarter_member` | `residents_current_v20.csv` | Person-to-group-quarter membership |
| `workplace` | `establishments_staffed_v19.csv` | Establishment facts and lead person at each workplace `AR-*` |
| `workplace_staff` | `workplace_staff_v19.csv` | Person-to-workplace staffing and coworker edges |
| `family_employment_link` | `family_employment_links_v19.csv` | Lead/employee family links, shared household, and role |
| `faction`, `faction_membership` | `Arentoria_factions_pressure_network_v21.xlsx`, reconciled with v20 resident faction fields | Stable `FAC-*` organizations and person memberships |
| `district_prompt`, `prompt_entity_link` | `Arentoria_district_prompts_v21.csv` | Authored prompt links to `P-*` and `AR-*` records |
| `road` | `Arentoria_road_names_complete_v15.csv` | Stable road records and map markers |
| `location_overlay`, `relationship`, `infrastructure` | v21 faction workbook | Authored pressure-network overlays |
| `source_snapshot`, `source_record`, `import_run` | Every import source | File hashes, row provenance, and import history |
| `app_note`, `lore_record`, `lore_link`, `story_profile`, `session_pin`, `recent_view` | App-owned | Persistent DM story fields and user/session data preserved independently of source re-imports |
| `campaign_building_override`, `campaign_building_revision` | App-owned | Approved building identity, occupant disposition, source fingerprint, and reversible change history |

## Narrative projection boundary

`src/lib/narrative.ts` converts normalized SQLite facts into deterministic table-ready prose. The derived prose is not stored and never invents canon. `story_profile` stores the separate DM-authored layer (demeanor, wants, knowledge, secrets, current pressures, recent events, loyalties, dislikes, and memorable details); the importer creates but never clears or updates that table.

The v19 `residents_workforce` and `buildings_workforce` files are imported into provenance records and validated against the v20 stable-ID sets. They do not override current v20 identity or building fields.
