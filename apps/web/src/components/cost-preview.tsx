"use client";

import { estimateCost, formatCostCents, formatTokens } from "@/lib/cost-estimate";

type Props = {
  text: string;
  model: string;
  /** Extra input tokens from system + index + relevant pages. */
  contextOverhead?: number;
  /** Typical response size for this operation. */
  expectedOutputTokens?: number;
};

export function CostPreview({ text, model, contextOverhead, expectedOutputTokens }: Props) {
  if (!text.trim()) {
    return (
      <p className="text-xs text-muted-foreground">
        Cost preview appears here as you type.
      </p>
    );
  }
  const est = estimateCost(text, model, contextOverhead, expectedOutputTokens);
  return (
    <p className="text-xs text-muted-foreground">
      Estimated:{" "}
      <strong className="text-foreground">{formatCostCents(est.costCents)}</strong>{" "}
      <span className="tabular-nums">
        ({formatTokens(est.inputTokens)} in / {formatTokens(est.outputTokens)} out)
      </span>{" "}
      · <code>{est.model}</code>
      {est.unknownPricing ? (
        <span className="ml-1 italic">pricing unknown for this model</span>
      ) : null}
    </p>
  );
}
