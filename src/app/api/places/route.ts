import { getPlacesByType } from "@/lib/data";

export async function GET(request: Request) {
  const specificUse = new URL(request.url).searchParams.get("type")?.trim() ?? "";
  if (!specificUse || specificUse.length > 160) {
    return Response.json({ error: "A valid place type is required." }, { status: 400 });
  }
  return Response.json({ results: getPlacesByType(specificUse) });
}
