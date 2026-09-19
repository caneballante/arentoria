# Arentoria App Guidance

## Purpose

This repository is a local-first DM reference application for Arentoria. Treat the six handoff artifacts in the repository root and all files in `source/full-census` as immutable source material.

## Sources of Truth

- `Arentoria DM City Database App — Codex Build Prompt.docx` is the immutable product specification.
- Read `docs/build-prompt-reference.md` for normal prompt review, planning, and feature-coverage comparisons. It is a complete searchable text mirror of the DOCX.
- `docs/wednesday-milestone.md` is the current product-decision supplement: normal record views are narrative-first At-the-Table views, with deterministic derived prose and a persistent app-owned DM story layer.
- `docs/source-audit.md` is authoritative when the prompt's source-file assumptions conflict with the files actually supplied. In particular, the v21 workbook is a faction overlay; the separate CSV set supplies the census and relationships.
- `docs/data-model.md` documents the current SQLite runtime boundary and source-to-table mapping.
- Before relying on the prompt mirror, compare the SHA-256 in its header with `Get-FileHash -Algorithm SHA256 -LiteralPath 'Arentoria DM City Database App — Codex Build Prompt.docx'`. If it differs, refresh the mirror with `scripts/export-build-prompt.py` using the bundled workspace Python runtime.

## Commands

- `npm run data:prepare` validates the handoff, prepares the interactive SVG, backs up the current database when present, and imports source-owned data.
- `npm run import:check` performs a read-only source validation.
- `npm run dev` starts the local application.
- `npm run typecheck`, `npm run lint`, `npm run test`, and `npm run build` verify changes.
- `python scripts/export-build-prompt.py` refreshes `docs/build-prompt-reference.md` when the immutable DOCX is intentionally replaced. The script uses only the Python standard library.

## Data Rules

- Preserve external stable IDs exactly as supplied.
- Treat the census CSV set as separate import sources; do not assume the v21 faction workbook contains census tables.
- Runtime application code reads SQLite, never CSV/XLSX source files.
- Do not invent people, buildings, relationships, or canon.
- Keep source-owned records separate from app-owned notes, lore, events, sessions, and overrides.
- Imports may update source-owned fields but must not delete records that disappear from a later source file.
- Never overwrite app-owned data during an import.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
