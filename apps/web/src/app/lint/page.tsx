import { LintView } from "./lint-view";
import { requireSetup } from "@/lib/server-wiki";

export const dynamic = "force-dynamic";

// Server wrapper that gates the lint UI behind requireSetup(). Without
// this, a direct bookmark to /lint with no API key would fall through to
// the client view and fail loud at /api/lint with a no-key error instead
// of redirecting to onboarding.
export default async function LintPage() {
  await requireSetup();
  return <LintView />;
}
