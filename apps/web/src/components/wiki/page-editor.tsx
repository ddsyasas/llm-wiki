"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { MarkdownView } from "@/components/wiki/markdown-view";

const PAGE_TYPES = ["entity", "concept", "source", "comparison", "overview"] as const;

type Props = {
  slug: string;
  initialTitle: string;
  initialType: (typeof PAGE_TYPES)[number];
  initialContent: string;
  knownSlugs: ReadonlyArray<string>;
  onCancel: () => void;
  onSaved: () => void;
};

export function PageEditor({
  slug,
  initialTitle,
  initialType,
  initialContent,
  knownSlugs,
  onCancel,
  onSaved,
}: Props) {
  const router = useRouter();
  const [title, setTitle] = useState(initialTitle);
  const [type, setType] = useState<(typeof PAGE_TYPES)[number]>(initialType);
  const [content, setContent] = useState(initialContent);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/pages/${encodeURIComponent(slug)}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, type, content }),
      });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      // Refresh the route's server component data so the rendered view + sidebar
      // see the new content.
      router.refresh();
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title"
          className="flex-1"
        />
        <select
          value={type}
          onChange={(e) => setType(e.target.value as (typeof PAGE_TYPES)[number])}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        >
          {PAGE_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Markdown
          </h3>
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="min-h-[480px] font-mono text-[13px] leading-relaxed"
          />
        </div>
        <div>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Preview
          </h3>
          <div className="min-h-[480px] rounded-md border border-border bg-card p-4">
            <MarkdownView content={content} knownSlugs={knownSlugs} />
          </div>
        </div>
      </div>

      {error ? (
        <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <div className="flex gap-2">
        <Button onClick={onSave} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
        <Button variant="outline" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
