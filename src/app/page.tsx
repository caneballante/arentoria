import { CityConsole } from "@/app/components/city-console";
import { getDashboardSnapshot } from "@/lib/data";

export const dynamic = "force-dynamic";

export default function Home() {
  const snapshot = getDashboardSnapshot();
  return <CityConsole snapshot={snapshot} />;
}
