import { QueryView } from "./query-view";
import { requireSetup } from "@/lib/server-wiki";

export const dynamic = "force-dynamic";

// Server wrapper that gates the query UI behind requireSetup(). Without
// this, a direct bookmark to /query with no API key would fall through to
// the client view and fail loud at /api/query with a no-key error instead
// of redirecting to onboarding.
export default async function QueryPage() {
  await requireSetup();
  return <QueryView />;
}
