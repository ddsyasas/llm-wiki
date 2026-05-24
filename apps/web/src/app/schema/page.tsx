import { SchemaEditorView } from "./schema-editor-view";
import { requireSetup } from "@/lib/server-wiki";

export const dynamic = "force-dynamic";

// Server wrapper that gates the editor behind requireSetup(). Without this,
// a direct bookmark to /schema with no API key or topic would fall through
// to the client view, which would then fail loud at the /api/schema layer
// with a "no key" error instead of redirecting to onboarding.
export default async function SchemaPage() {
  await requireSetup();
  return <SchemaEditorView />;
}
