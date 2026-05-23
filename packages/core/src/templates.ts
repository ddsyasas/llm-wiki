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
