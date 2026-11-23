import { revalidatePath } from "next/cache";
import { getDatabase } from "@/lib/db/client";
import {
  applyBuildingProposals, listBuildingOptions, listBuildingRevisions,
  restoreBuildingRevision, reviewBuildingProposals,
} from "@/lib/campaign-buildings";
import { parseCampaignWorkbook } from "@/lib/campaign-workbook";

export const runtime = "nodejs";

function errorResponse(error: unknown) {
  return Response.json({ error: error instanceof Error ? error.message : "Campaign building request failed." }, { status: 400 });
}

function checkOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== new URL(request.url).host) throw new Error("This request must come from the local app.");
}

async function workbookFromForm(form: FormData) {
  const file = form.get("file");
  if (!(file instanceof File) || !file.name.toLowerCase().endsWith(".xlsx")) {
    throw new Error("Choose a Campaign Building Overrides .xlsx workbook.");
  }
  if (file.size > 10_000_000) throw new Error("Workbook is too large (10 MB maximum).");
  return parseCampaignWorkbook(Buffer.from(await file.arrayBuffer()));
}

export async function GET(request: Request) {
  const { sqlite } = getDatabase();
  const url = new URL(request.url);
  const district = url.searchParams.get("district") ?? "";
  const category = url.searchParams.get("category") ?? "temple";
  const query = url.searchParams.get("query") ?? "";
  if (district.length > 100 || query.length > 150 || !["all", "institutional", "temple"].includes(category)) {
    return Response.json({ error: "Invalid building filter." }, { status: 400 });
  }
  const districts = sqlite.prepare("SELECT name FROM district ORDER BY name").all() as Array<{ name: string }>;
  return Response.json({
    buildings: listBuildingOptions(sqlite, { district, category, query }),
    districts: districts.map((row) => row.name),
    history: listBuildingRevisions(sqlite),
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const form = await request.formData();
    const mode = form.get("mode");
    const { sqlite } = getDatabase();
    if (mode === "restore") {
      const revisionId = Number(form.get("revisionId"));
      if (!Number.isSafeInteger(revisionId) || revisionId <= 0) throw new Error("Invalid revision ID.");
      const result = await restoreBuildingRevision(sqlite, revisionId);
      revalidatePath("/");
      revalidatePath("/campaign-buildings");
      return Response.json(result);
    }
    const proposals = await workbookFromForm(form);
    if (mode === "preview") return Response.json({ rows: reviewBuildingProposals(sqlite, proposals) });
    if (mode === "apply") {
      const rawSelected = form.get("selectedIds");
      if (typeof rawSelected !== "string") throw new Error("No approved rows were selected.");
      const selectedIds: unknown = JSON.parse(rawSelected);
      if (!Array.isArray(selectedIds) || !selectedIds.length || selectedIds.some((id) => typeof id !== "string")) {
        throw new Error("Select one or more reviewed rows to approve.");
      }
      const result = await applyBuildingProposals(sqlite, proposals, selectedIds);
      revalidatePath("/");
      revalidatePath("/campaign-buildings");
      return Response.json(result);
    }
    throw new Error("Unknown campaign building operation.");
  } catch (error) {
    return errorResponse(error);
  }
}
