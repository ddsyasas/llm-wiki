export const DEFAULT_SCHEMA_TEMPLATE = `# Wiki Schema

This file is your operating contract with the LLM agent that maintains this
wiki. Edit it freely to steer what gets written and how.

## Topic

(Describe the topic of this wiki in one or two sentences. The agent reads this
on every ingest and query, so be specific about scope and audience.)

## Style guidelines

- Be concise. This is a personal wiki, not Wikipedia.
- One entity or concept per page.
- Cross-link generously with \`[[slug]]\`.
- Flag contradictions in a \`> [!contradiction]\` callout.

## Page type definitions

- **entity**: a person, organization, product, place
- **concept**: an idea, technique, framework, theorem
- **source**: a single document summary (for important sources only)
- **comparison**: two or more entities/concepts contrasted
- **overview**: high-level synthesis

## Additional instructions

(Add any project-specific rules the LLM should follow when reading sources or
answering questions.)
`;

export const DEFAULT_INDEX_TEMPLATE = `# Wiki Index

_No pages yet. Add a source to get started._
`;

export const DEFAULT_LOG_TEMPLATE = `# Wiki Log
`;

export const DEFAULT_GITIGNORE_TEMPLATE = `# LLM Wiki tooling state (metadata cache, settings, trash, page history).
# Safe to delete; nothing important is lost.
.llm-wiki/
`;

// ---- audience-specific schema templates ---------------------------------
//
// When creating a new wiki via Settings → Wikis, the user can pick one of
// these templates to pre-fill CLAUDE.md instead of the blank default. Each
// template tailors the "Style guidelines" + "Page type definitions" +
// "Additional instructions" sections to a specific audience. The agent
// reads CLAUDE.md on every ingest / query / lint call, so these defaults
// meaningfully change behavior on day one.

export type SchemaTemplateId =
  | "blank"
  | "research"
  | "legal"
  | "clinical"
  | "project"
  | "personal";

export type SchemaTemplate = {
  id: SchemaTemplateId;
  label: string;
  description: string;
  body: string;
};

const RESEARCH_TEMPLATE = `# Wiki Schema — Research

## Topic

(One or two sentences naming the field, sub-field, and your interest. Be
specific: "Quantum error-correction codes for fault-tolerant computing" beats
"Quantum computing".)

## Style guidelines

- Technical register. Use field-standard terminology rather than plain-language
  paraphrases.
- Prefer claims grounded in the source over the LLM's general knowledge. When
  introducing a claim, link the contributing source.
- Flag contradictions between sources explicitly in a \`> [!contradiction]\`
  callout — they're often the most interesting finding.
- Every quantitative claim should include the metric + units + reference.
- Be concise. Don't pad pages to look comprehensive; an honest "open question"
  paragraph is better than confident filler.

## Page type definitions

- **concept**: a technique, framework, theorem, method, model
- **entity**: a researcher, lab, institution, dataset, instrument
- **comparison**: two or more concepts/methods contrasted along measurable axes
- **source**: a single paper / preprint summary (only for landmark sources)
- **overview**: a high-level synthesis tying together a sub-area

## Additional instructions

- Preserve dates and historical sequence — when was a result first published,
  who else replicated, what superseded it.
- When a source disagrees with the consensus, note it as a contradiction
  rather than smoothing it over.
- Use \`> [!open-question]\` callouts for things the current sources don't
  resolve. These become research directions.
`;

const LEGAL_TEMPLATE = `# Wiki Schema — Legal

## Topic

(Name the matter, regulatory area, or jurisdiction. E.g. "California
employment law — wage & hour", "ACME v. Smith litigation file", "EU AI Act
compliance research".)

## Style guidelines

- Precision over fluency. Quote source language verbatim for findings of
  fact, holdings, and statutory text — don't paraphrase.
- Every claim links back to its source page (case, statute, regulation,
  filing).
- Distinguish holding from dicta; majority from concurrence/dissent.
- Flag overruled or distinguished precedents with a \`> [!stale]\` callout.

## Page type definitions

- **entity**: parties, courts, judges, regulatory bodies, law firms
- **concept**: doctrines, tests, standards of review, legal theories
- **comparison**: how courts have applied a doctrine across jurisdictions
- **source**: a single case, statute, regulation, or filing summary
- **overview**: high-level synthesis of a doctrinal area

## Additional instructions

- Preserve citation format (jurisdiction, year, reporter). Don't strip it
  for prose flow.
- Never invent citations or holdings. If a source is ambiguous, say so.
- Flag conflicts between authorities; resolution is the user's call.
- Use \`> [!warning]\` callouts for time-sensitive items (statutes of
  limitations, filing deadlines).
`;

const CLINICAL_TEMPLATE = `# Wiki Schema — Clinical

## Topic

(Name the clinical area. E.g. "Hypertension management guidelines", "Type 2
diabetes treatment algorithms", "Pediatric vaccine schedule references".)

## Style guidelines

- Evidence-graded. When summarizing a recommendation, note the evidence level
  (e.g. "Class I, Level A" or guideline body's own grading) and the source.
- Prefer the most recent guideline; flag superseded recommendations with a
  \`> [!stale]\` callout pointing at the newer guidance.
- Distinguish recommendations from observational findings.
- This wiki is a personal reference, NOT clinical decision support. Avoid
  language that reads as patient-specific advice.

## Page type definitions

- **entity**: drugs, diseases, conditions, organizations (guideline bodies),
  diagnostic tests
- **concept**: mechanisms of action, pathophysiology, treatment algorithms,
  clinical pearls
- **comparison**: head-to-head treatment options, diagnostic workups
- **source**: a guideline document or landmark trial summary
- **overview**: synthesis of a condition's evaluation + management

## Additional instructions

- Surface contradictions between guideline bodies (e.g. ACC/AHA vs ESC).
- Flag rare adverse events with \`> [!warning]\` callouts.
- Preserve dose ranges + units exactly as cited; don't round.
- Note off-label uses explicitly when the source flags them.
`;

const PROJECT_TEMPLATE = `# Wiki Schema — Project

## Topic

(Name the project, market, or problem space. E.g. "Building a feedback
collection tool for B2B SaaS", "Competitor research for vertical AI agents",
"Investor + customer notes — pre-seed fundraise".)

## Style guidelines

- Opinionated. Don't hedge; capture what you actually think.
- Decisions get dated: "2026-05-24: chose Postgres over SQLite because…"
- "What we tried, what worked, what failed" beats "what's possible".
- Cross-link to entities (people, companies, competitors) liberally.
- Prefer 1-paragraph pages over 5-paragraph ones. Edit ruthlessly.

## Page type definitions

- **entity**: competitors, customers, investors, advisors, prospective hires
- **concept**: mechanisms (PLG, network effects), patterns (pricing models),
  decisions
- **comparison**: build-vs-buy, this-vs-that for evaluated options
- **overview**: strategy memos, quarterly retrospectives
- **source**: customer interview summaries, investor meeting notes (use the
  per-source promotion; usually the chat or interview transcript IS the source)

## Additional instructions

- Date-stamp opinions. They expire.
- Capture failure modes explicitly. A wiki that only records wins is
  marketing copy.
- Flag decisions you'd revisit if X happened ("\`> [!decision]\` Going with
  Stripe over Lemon Squeezy; would revisit if EU VAT becomes painful").
`;

const PERSONAL_TEMPLATE = `# Wiki Schema — Personal knowledge base

## Topic

(Whatever you want to learn or remember. Multiple areas are fine — books +
podcasts + things-you-keep-googling + …. The agent works best with a stated
theme, even a loose one like "things I read about systems thinking and
adjacent topics".)

## Style guidelines

- Friendly + exploratory. Incomplete is fine; questions are welcome.
- Don't force every page to be a self-contained essay — fragments and
  cross-links count.
- Capture sources for "I want to find this again later" pages even when
  there's nothing to summarize.

## Page type definitions

- **concept**: ideas, frameworks, terms-of-art you encountered
- **entity**: people, books, podcasts, organizations, places
- **comparison**: when you're trying to choose between two things
- **overview**: occasional "what I learned about X" syntheses
- **source**: long-form pieces worth a dedicated summary

## Additional instructions

- Use \`> [!open-question]\` callouts liberally — they're prompts for future
  reading.
- Tag pages with where you found them (book + chapter, podcast + timestamp,
  article + author) so you can re-locate the original.
- If you don't fully understand something, say so. The wiki should reflect
  your actual state of knowledge, not a curated front.
`;

export const SCHEMA_TEMPLATES: ReadonlyArray<SchemaTemplate> = [
  {
    id: "blank",
    label: "Blank",
    description:
      "Default schema with generic style guidelines. Edit later in Settings → Schema.",
    body: DEFAULT_SCHEMA_TEMPLATE,
  },
  {
    id: "research",
    label: "Research",
    description:
      "Academic / scholarly tone. Source-grounded claims, technical register, surfaces open questions.",
    body: RESEARCH_TEMPLATE,
  },
  {
    id: "legal",
    label: "Legal",
    description:
      "Precise quoting, distinguishes holdings from dicta, flags overruled precedents.",
    body: LEGAL_TEMPLATE,
  },
  {
    id: "clinical",
    label: "Clinical",
    description:
      "Evidence-graded, flags superseded guidelines, preserves doses/units exactly.",
    body: CLINICAL_TEMPLATE,
  },
  {
    id: "project",
    label: "Project",
    description:
      "Opinionated, decision-oriented, dates opinions, captures failure modes explicitly.",
    body: PROJECT_TEMPLATE,
  },
  {
    id: "personal",
    label: "Personal KB",
    description:
      "Friendly + exploratory. Open questions welcome, capture sources for re-finding.",
    body: PERSONAL_TEMPLATE,
  },
];

export function getSchemaTemplate(id: SchemaTemplateId): SchemaTemplate {
  return SCHEMA_TEMPLATES.find((t) => t.id === id) ?? SCHEMA_TEMPLATES[0]!;
}
