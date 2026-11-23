import { getDatabase } from "@/lib/db/client";
import { getBuildingContext, listBuildingIds, listBuildingOptions } from "@/lib/campaign-buildings";
import { exportCampaignWorkbook } from "@/lib/campaign-workbook";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const category = url.searchParams.get("category") ?? "all";
  const district = url.searchParams.get("district") ?? "";
  const query = url.searchParams.get("query") ?? "";
  const ids = url.searchParams.get("ids")?.split(",").filter(Boolean);
  if (district.length > 100 || query.length > 150 || !["all", "institutional", "temple"].includes(category)
      || ids?.length && (ids.length > 1676 || ids.some((id) => !/^AR-\d{4}$/.test(id)))) {
    return Response.json({ error: "Invalid export selection." }, { status: 400 });
  }
  const { sqlite } = getDatabase();
  const chosen = ids?.length ? listBuildingIds(sqlite, { ids }) :
    listBuildingOptions(sqlite, { district, category, query }).map((row) => row.id);
  if (!chosen.length) return Response.json({ error: "No buildings match this export." }, { status: 400 });
  const contexts = chosen.map((id) => getBuildingContext(sqlite, id)).filter((value) => value !== null);
  const workbook = exportCampaignWorkbook(contexts);
  return new Response(new Uint8Array(workbook), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="arentoria-building-overrides-${new Date().toISOString().slice(0, 10)}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
