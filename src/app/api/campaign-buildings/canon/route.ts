import { getDatabase } from "@/lib/db/client";
import { listApprovedBuildingOverrides } from "@/lib/campaign-buildings";

export const runtime = "nodejs";

export function GET() {
  const { sqlite } = getDatabase();
  return Response.json({
    format: "arentoria-campaign-building-overrides-v1",
    exportedAt: new Date().toISOString(),
    overrides: listApprovedBuildingOverrides(sqlite),
  }, { headers: { "Cache-Control": "no-store" } });
}
