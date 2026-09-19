import { getEntityDetail } from "@/lib/data";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ stableId: string }> },
) {
  const { stableId } = await params;
  const detail = getEntityDetail(decodeURIComponent(stableId));
  if (!detail) return Response.json({ error: "Entity not found" }, { status: 404 });
  return Response.json(detail);
}
