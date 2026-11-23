import { zipSync, strToU8 } from "fflate";
import { readSheet } from "read-excel-file/node";
import type { BuildingContext, BuildingProposal } from "./campaign-buildings";
import { clearToken } from "./campaign-buildings";

export const workbookHeaders = [
  "Building ID", "District", "Address", "Imported name", "Imported primary use",
  "Imported specific use", "Residents", "Households", "Group quarters", "Workplace",
  "Workplace staff", "Source snapshot", "Action", "Proposed campaign name",
  "Proposed primary use", "Proposed specific use", "Building subtype", "Faith or deity",
  "Faction ID", "Occupant disposition", "DM notes", "Source or reason",
] as const;

const xmlEscape = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");

function columnName(index: number) {
  let value = index + 1;
  let name = "";
  while (value > 0) {
    value -= 1;
    name = String.fromCharCode(65 + value % 26) + name;
    value = Math.floor(value / 26);
  }
  return name;
}

function sheetXml(rows: Array<Array<string | number | null>>, frozenColumns: number) {
  const body = rows.map((row, rowIndex) => `<row r="${rowIndex + 1}">${row.map((value, columnIndex) => {
    if (value === null || value === "") return "";
    const reference = `${columnName(columnIndex)}${rowIndex + 1}`;
    const style = rowIndex === 0 ? columnIndex < frozenColumns ? 1 : 2 : columnIndex < frozenColumns ? 3 : 4;
    if (typeof value === "number") return `<c r="${reference}" s="${style}"><v>${value}</v></c>`;
    return `<c r="${reference}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`;
  }).join("")}</row>`).join("");
  const last = rows.length || 1;
  const lastColumn = columnName(Math.max(0, ...rows.map((row) => row.length - 1)));
  const widths = rows[0]?.map((_, index) => `<col min="${index + 1}" max="${index + 1}" width="${index === 11 ? 67 : index === 20 ? 48 : index === 0 ? 16 : 24}" customWidth="1"/>`).join("") ?? "";
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="A1:${lastColumn}${last}"/>
  <sheetViews><sheetView workbookViewId="0"><pane xSplit="${frozenColumns}" ySplit="1" topLeftCell="${columnName(frozenColumns)}2" activePane="bottomRight" state="frozen"/></sheetView></sheetViews>
  <cols>${widths}</cols><sheetData>${body}</sheetData>
  <autoFilter ref="A1:${lastColumn}${last}"/>
</worksheet>`;
}

export function exportCampaignWorkbook(contexts: BuildingContext[]) {
  const rows: Array<Array<string | number | null>> = [
    [...workbookHeaders],
    ...contexts.map((context) => [
      context.buildingId,
      context.district,
      context.address,
      context.importedName,
      context.importedPrimaryUse,
      context.importedSpecificUse,
      context.residents,
      context.households.length,
      context.groupQuarters.length,
      context.workplace?.name ?? null,
      context.workplace?.staffCount ?? 0,
      context.sourceHash,
      null,
      context.override?.campaign_name ?? null,
      context.override?.primary_use ?? null,
      context.override?.specific_use ?? null,
      context.override?.subtype ?? null,
      context.override?.faith ?? null,
      context.override?.faction_id ?? null,
      context.override?.occupant_disposition ?? null,
      context.override?.dm_notes ?? null,
      context.override?.source_reason ?? null,
    ]),
  ];
  const guide = [
    ["Campaign building overrides", "How to use this workbook"],
    ["1", "Edit the green columns on the Buildings sheet. The gray columns show imported census facts."],
    ["2", "Keep Building ID and Source snapshot unchanged. Empty editable cells leave existing approved values unchanged."],
    ["3", `Enter ${clearToken} to clear one approved field. Enter DELETE under Action to remove the entire override.`],
    ["4", "For a changed building use with residents or staff, choose an occupant disposition."],
    ["5", "Upload the workbook in Campaign buildings, inspect every conflict, then approve selected rows."],
    ["Occupant dispositions", "keep; reference_only; reassignment_planned; manual_resolved"],
    ["Source reference", "Original census rows and occupant links remain intact; approved changes are stored separately."],
  ];
  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(`<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`),
    "_rels/.rels": strToU8(`<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`),
    "xl/workbook.xml": strToU8(`<?xml version="1.0" encoding="UTF-8"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="Buildings" sheetId="1" r:id="rId1"/><sheet name="Guide" sheetId="2" r:id="rId2"/></sheets></workbook>`),
    "xl/_rels/workbook.xml.rels": strToU8(`<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`),
    "xl/styles.xml": strToU8(`<?xml version="1.0" encoding="UTF-8"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="3"><font><sz val="11"/><name val="Aptos"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Aptos"/></font><font><color rgb="FF1F533F"/><sz val="11"/><name val="Aptos"/></font></fonts>
<fills count="5"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF3B4540"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FF3D765A"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF1F2EF"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="5"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFill="1"/><xf numFmtId="0" fontId="1" fillId="3" borderId="0" xfId="0" applyFill="1"/><xf numFmtId="0" fontId="0" fillId="4" borderId="0" xfId="0" applyFill="1"/><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0"/></cellXfs>
</styleSheet>`),
    "xl/worksheets/sheet1.xml": strToU8(sheetXml(rows, 12)),
    "xl/worksheets/sheet2.xml": strToU8(sheetXml(guide, 1)),
  };
  return Buffer.from(zipSync(files, { level: 6 }));
}

function stringCell(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") return String(value);
  return value.trim() || null;
}

export async function parseCampaignWorkbook(buffer: Buffer): Promise<BuildingProposal[]> {
  if (buffer.length > 10_000_000) throw new Error("Workbook is too large (10 MB maximum).");
  const rows = await readSheet(buffer, "Buildings");
  if (!rows.length || workbookHeaders.some((header, index) => rows[0]?.[index] !== header)) {
    throw new Error("The Buildings sheet headers do not match a Campaign Building Overrides export.");
  }
  if (rows.length > 2001) throw new Error("Workbook has more than 2,000 building rows.");
  return rows.slice(1).filter((row) => row.some((cell) => cell !== null && cell !== "")).map((row) => ({
    buildingId: stringCell(row[0]) ?? "",
    sourceHash: stringCell(row[11]) ?? "",
    action: stringCell(row[12]) ?? "",
    campaignName: stringCell(row[13]),
    primaryUse: stringCell(row[14]),
    specificUse: stringCell(row[15]),
    subtype: stringCell(row[16]),
    faith: stringCell(row[17]),
    factionId: stringCell(row[18]),
    occupantDisposition: stringCell(row[19]),
    dmNotes: stringCell(row[20]),
    sourceReason: stringCell(row[21]),
  }));
}
