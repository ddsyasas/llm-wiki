"use client";

import { useEffect, useState } from "react";

type BreakdownRow = {
  model: string;
  operation: "ingest" | "query" | "lint" | "chat";
  call_count: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cost_cents: number;
};

type UsageResponse = {
  breakdown: BreakdownRow[];
  totals: {
    cost_cents: number;
    calls: number;
    input_tokens: number;
    output_tokens: number;
  };
};

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

function fmtCost(cents: number): string {
  if (cents === 0) return "—";
  return `$${(cents / 100).toFixed(2)}`;
}

export function CostsTab() {
  const [data, setData] = useState<UsageResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setError(null);
    try {
      const res = await fetch("/api/usage", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as UsageResponse;
      setData(json);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  if (error) {
    return (
      <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
        {error}
      </p>
    );
  }
  if (!data) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium">Cumulative usage</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Counts every LLM call this wiki has made. Stored in{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">
            .llm-wiki/meta.sqlite
          </code>
          ; deleting that file resets these numbers.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric label="Calls" value={data.totals.calls.toString()} />
        <Metric label="Input tokens" value={fmtTokens(data.totals.input_tokens)} />
        <Metric label="Output tokens" value={fmtTokens(data.totals.output_tokens)} />
        <Metric label="Cost (recorded)" value={fmtCost(data.totals.cost_cents)} />
      </div>

      {data.breakdown.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No LLM calls recorded yet. Ingest a source or run a query to start tracking.
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-secondary/40 text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Model</th>
                <th className="px-3 py-2 font-medium">Op</th>
                <th className="px-3 py-2 text-right font-medium">Calls</th>
                <th className="px-3 py-2 text-right font-medium">In</th>
                <th className="px-3 py-2 text-right font-medium">Out</th>
                <th className="px-3 py-2 text-right font-medium">Cost</th>
              </tr>
            </thead>
            <tbody>
              {data.breakdown.map((r, i) => (
                <tr key={`${r.model}-${r.operation}-${i}`} className="border-t border-border">
                  <td className="px-3 py-2 font-mono text-[12px]">{r.model}</td>
                  <td className="px-3 py-2 capitalize">{r.operation}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.call_count}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {fmtTokens(r.total_input_tokens)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {fmtTokens(r.total_output_tokens)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {fmtCost(r.total_cost_cents)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Costs are recorded only when the local pricing table knows the model. Unknown models
        show <code>—</code> in the Cost column; token counts are always accurate.
      </p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-card p-3">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}
