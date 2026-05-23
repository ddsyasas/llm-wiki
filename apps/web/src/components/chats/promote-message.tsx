"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const PAGE_TYPES = ["entity", "concept", "source", "comparison", "overview"] as const;
type PageType = (typeof PAGE_TYPES)[number];

type Props = {
  message: { content: string };
  chatTitle: string;
  onClose: () => void;
};

function defaultSlug(chatTitle: string): string {
  return chatTitle
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "promoted-answer";
}

export function PromoteMessageDialog({ message, chatTitle, onClose }: Props) {
  const [slug, setSlug] = useState(defaultSlug(chatTitle));
  const [title, setTitle] = useState(chatTitle);
  const [type, setType] = useState<PageType>("concept");
  const [content, setContent] = useState(message.content);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<string | null>(null);

  // Esc closes the modal (unless the user is still mid-save).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !saving) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, saving]);

  async function onSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/pages", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug, title, type, content }),
      });
      const json = (await res.json()) as { ok?: true; slug?: string; error?: string };
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setCreated(slug);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-lg border border-border bg-card p-6 text-card-foreground shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-medium">Save assistant message as a wiki page</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          The page content starts as the assistant&apos;s reply. Tweak it before saving.
        </p>

        {created ? (
          <div className="mt-6 rounded-md bg-emerald-500/10 px-4 py-3 text-sm">
            Saved.{" "}
            <Link href={`/wiki/${created}`} className="text-primary underline underline-offset-2">
              Open page →
            </Link>
            <div className="mt-2 text-right">
              <Button variant="outline" onClick={onClose}>
                Close
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Slug
                </label>
                <Input
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  placeholder="kebab-case"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Type
                </label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as PageType)}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  {PAGE_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Title
              </label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Content (markdown)
              </label>
              <Textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="min-h-[200px] font-mono text-[13px] leading-relaxed"
              />
            </div>
            {error ? (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            ) : null}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={onClose} disabled={saving}>
                Cancel
              </Button>
              <Button onClick={onSave} disabled={saving || !slug.trim() || !title.trim()}>
                {saving ? "Saving…" : "Create page"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
