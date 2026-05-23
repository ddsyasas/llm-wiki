# LLM Wiki

> An open source, local-first knowledge base maintained by an LLM agent.

LLM Wiki turns your scattered articles, papers, PDFs, and notes into a structured, interlinked markdown wiki that grows smarter with every source you add. The LLM does the writing, cross-referencing, and bookkeeping. You curate sources and ask questions.

This is an implementation of [Andrej Karpathy's LLM Wiki pattern](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f).

## Why this exists

Most ways to use LLMs with documents are stateless. You upload files, ask a question, the model retrieves chunks, gives an answer, forgets everything. Nothing is built up.

LLM Wiki is different. Sources feed into a persistent, interlinked wiki that the LLM maintains. When you add a new paper, the agent reads it, updates existing pages, flags contradictions, strengthens cross-links, and appends to a log. Knowledge compounds. Your second question costs less than your first.

## Install

```bash
npm install -g @yasas/llm-wiki
```

Then in any folder you want to be a wiki:

```bash
llm-wiki start
```

This opens a browser window. Set up your OpenRouter API key in Settings (see [OpenRouter setup guide](docs/openrouter-setup.md)), and start adding sources.

## What's in the box

- **Ingest** any file (PDF, DOCX, Markdown, HTML, plain text) or paste content directly
- **Browse** the auto-generated wiki with cross-links and backlinks
- **Chat** with the wiki in saved threads, organized into folders
- **Query** for one-off questions with citations
- **Lint** the wiki for contradictions, orphans, and gaps
- **Edit** any page by hand whenever you want, your wiki is just markdown files

## Why local-first

- Your wiki is real `.md` files in a folder you choose
- Git the folder, sync with iCloud or Dropbox, edit in Obsidian, do whatever you want
- No subscription, no cloud, no telemetry
- Use any model via OpenRouter (Claude, GPT, Gemini, Llama, etc.)

## Roadmap

- **V1** (current): CLI install, browser UI, all features above
- **V2**: Native desktop installer for Mac/Windows/Linux via Tauri
- **V3**: MCP server mode so other AI tools can use your wiki as memory

## Credits

Built by [Yasas](https://github.com/ddsyasas).

Pattern by [Andrej Karpathy](https://karpathy.ai/). Read his [original gist](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) for the design philosophy.

## License

MIT. See [LICENSE](LICENSE).

## Contributing

This is open source and contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.
