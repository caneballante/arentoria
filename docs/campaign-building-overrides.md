# Campaign building overrides

The imported map and census are reference material. Approved campaign building identities live in `campaign_building_override`, keyed by the existing `AR-####` ID. Imports never rewrite the source CSVs or move map geometry. The app creates the override and revision tables when it opens the local database.

## DM workflow

1. Start the app with `npm run dev` and open **Campaign buildings** from the left navigation.
2. Filter by district, institutional use, or existing temples and chapels. Select specific buildings or export all matching buildings as an `.xlsx` workbook.
3. In the workbook's **Buildings** sheet, review gray imported columns and edit green campaign columns. The **Guide** sheet explains the fields. Keep the building ID and source snapshot unchanged.
4. For a use change at an occupied or staffed building, choose an occupant disposition: `keep`, `reference_only`, `reassignment_planned`, or `manual_resolved`. The app never relocates anybody automatically.
5. Upload the workbook and inspect each row's status, occupants, staff, NPCs, and source-change warnings. Select only the changes you approve, then click **Apply selected changes**.
6. The app saves a SQLite backup before applying a batch, records each changed building in revision history, and offers **Restore prior version**. The original census fields remain available in each building's **Source Reference** section.

Empty editable cells preserve existing approved values. Enter `[CLEAR]` to clear one field. Enter `DELETE` in **Action** to remove an override. Blank rows do nothing. If the source changed after export, export a fresh workbook and review again.

Approved names and uses appear in building records, map hover labels, search, and the place directory. A building subtype appears as an additional searchable place type. `reference_only` hides the affected source occupants and staff from current building and person presentations while keeping their census records available in the source registry.

## Temple planning

The seven planned faiths and preferred districts in the task brief are planning preferences. This feature assigns none of them automatically. The existing `AR-0172` Temple of Dawnfire and Starfall receives a review warning if proposed for change because Dawnfire is underground in campaign canon. No clergy, residents, or religions are generated or assigned.

## Data ownership and future export

`campaign_building_override` holds approved field values, occupant disposition, approval time, source reason, and the source snapshot fingerprint. `campaign_building_revision` holds before and after states for restore. The importer owns `building`, `building_census`, `workplace`, and resident and relationship tables; it never updates the campaign tables. A changed imported row is flagged against the fingerprint until the DM approves an updated workbook.

Download **Export approved canon JSON** from the Campaign buildings page for a machine-readable snapshot suitable for future transfer to a separate canon repository. No cross-repository synchronization occurs.
