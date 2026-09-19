import { getDatabase } from "@/lib/db/client";

export async function GET() {
  try {
    getDatabase().sqlite.prepare("SELECT 1").get();
    return Response.json({ status: "healthy" });
  } catch {
    return Response.json({ status: "unhealthy" }, { status: 503 });
  }
}
