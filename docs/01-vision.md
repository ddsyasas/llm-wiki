# 01 Vision

## What this is

LLM Wiki is an open source, local-first knowledge base where an LLM agent reads your sources, writes the wiki pages, maintains cross-links, and keeps everything coherent over time. The user adds sources and asks questions. The agent does the writing.

It implements the pattern Andrej Karpathy described in his April 2026 gist. Three layers (raw sources, wiki, schema), three operations (ingest, query, lint), one folder of markdown files.

## Why it exists

Existing tools fall into two camps. RAG-based chat tools (NotebookLM, ChatGPT file uploads) rediscover knowledge from scratch on every query. Note-taking apps (Obsidian, Notion) put all the maintenance burden on the human. The first is stateless. The second is high-friction. Karpathy's insight: an LLM can do the maintenance, and the result is a knowledge base that compounds.

## Target users for V1

**Primary: tech-curious knowledge workers** who can run a command in their terminal. Researchers, grad students, journalists, analysts, lawyers who do deep research, indie hackers, technical founders, ML practitioners. They are comfortable installing CLI tools and pasting API keys.

**Not yet for V1**: truly non-technical users. They will get V2 with a native installer.

## What success looks like

A user installs LLM Wiki with one command, points it at a folder, adds an OpenRouter key, drops in 10 PDFs of papers they care about, and within 30 minutes has a navigable wiki with cross-linked pages they didn't write. They can ask "what's the connection between X and Y" and get an answer with citations. They come back a week later, add 10 more sources, and the wiki integrates them. After three months they have a personal Wikipedia for their topic.

## Non-goals

- We are not building a multi-user collaboration tool. Single user per wiki.
- We are not building a chat tool. Chat is one feature; the wiki is the main artifact.
- We are not building a hosted SaaS. Local-first only.
- We are not training models. We use existing ones via OpenRouter.
- We are not implementing fancy retrieval (graph RAG, advanced reranking). Karpathy's index-first pattern is enough at the scale we target.

## Design principles

1. **Files over databases.** Every artifact the user might want to keep is a markdown file. SQLite holds only operational metadata.
2. **The user owns their data.** They can delete the app and still have their wiki.
3. **No lock-in.** Open standards (Markdown, SQLite) and BYOK for the LLM.
4. **The agent does the work.** The user shouldn't have to manually update cross-references, generate summaries, or maintain an index.
5. **Honest costs.** Each operation tells the user roughly what it will cost in tokens before running.
6. **Boring tech.** Battle-tested libraries, no bleeding edge dependencies in V1.

## What makes this different from existing tools

| Tool | What it does | What it doesn't |
|------|--------------|-----------------|
| NotebookLM | RAG chat over uploaded docs | No persistent wiki, no maintenance |
| Obsidian | Manual markdown notes | No LLM maintenance |
| AnythingLLM | RAG with multiple sources | No structured wiki output |
| Logseq | Markdown blocks, local | No LLM integration |
| **LLM Wiki** | Persistent LLM-maintained wiki | Single user, local-first |

The wedge is the combination: LLM maintenance + local markdown files + chat folders + bring-your-own-model.

## North star quote (Karpathy's gist)

> "Obsidian is the IDE; the LLM is the programmer; the wiki is the codebase."

Build with this framing in mind. We are giving the user an LLM-as-knowledge-engineer for their personal corpus.
