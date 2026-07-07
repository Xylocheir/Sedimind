# Sedimind

> Manage your Obsidian notes through natural-language chat, and let the **"sediment" layer** turn the AI's fragmented thoughts into searchable, briefable long-term assets.

Sedimind is an Obsidian community plugin that turns an LLM into an "operator" for your Vault. Just tell it what to do in conversation, and it autonomously calls tools to create, edit, search, move, and delete notes — across both local and cloud models.

---

## ✨ Features

### 1. Sediment layer — give the AI's "leftovers" real value

The plugin's flagship original mechanism. AI interactions are often broken into many tiny, fragmented pieces (a confirmation, a retry, half a suggestion) that normal chat simply discards. Sediment records these fragments — each tagged with a `fingerprint` — into the Vault's `.sediment` folder, then:

- **Gravity filtering (gravity-rules)**: keeps important fragments, drops noise.
- **L1 writer + index**: structured persistence with a retrievable index.
- **Daily briefing (daily-briefing)**: rolls scattered deposits into a daily insight.
- **Status-bar indicator**: real-time sediment status.

Turning "discarded context" into recallable, reusable memory assets.

### 2. Real tool-calling, not just chat

The LLM doesn't only generate text — it actually operates your notes, deciding on its own which tool to invoke:

| Tool | Purpose |
|------|---------|
| `create_note` | Create a new note |
| `edit_note` | Edit a note (replace / append / insert) |
| `search_notes` | Search notes |
| `read_note` | Read note content |
| `move_note` | Move / rename a note |
| `delete_note` | Delete a note |
| `list_files` | List files in a directory |
| `get_metadata` | Get note metadata |
| `get_system_time` | Get the system time |

### 3. Multi-provider, local-first

OpenAI, Anthropic, DeepSeek, Ollama, Gemini, plus Claude Code / Codex CLI modes. **Ollama runs fully local with zero network requests.**

### 4. MCP extension

Connect external MCP servers to extend the conversation with arbitrary external tools (desktop only; mobile degrades gracefully with a notice).

### 5. Memory system

Recent-conversation summaries + user-saved memories keep long-range context coherent.

### 6. Full Chinese UX + i18n

The UI is Chinese-localized and also supports en / ja / ko / de / fr / es.

### 7. Feedback module

The settings page gains a new "Feedback" tab where you can submit **Bug / Feature request / Other** reports in one click, with up to 5 screenshot attachments and an optional contact email. Reports are sent through a private Supabase endpoint (RLS policy restricted to insert-only), and no other local data is uploaded — making it easy to collect and triage user issues.

---

## 🧩 How it differs from similar plugins

| Dimension | Sedimind | Claudian | Copilot |
|-----------|-------------------|----------|---------|
| Positioning | Note operator + sediment layer | Brings coding Agents into the Vault | General Copilot + semantic search |
| File ops | Tools read/write directly | Done by CLI Agent | Done by Agent tools |
| Fragmented records | **sediment layer (original)** | None | No dedicated mechanism |
| Local models | Native Ollama | Depends on external CLI | Ollama supported |
| Semantic search | Tool-level retrieval | None | Core capability (vector index) |
| Runtime | Calls LLM API / CLI | Depends on local CLI Agent | Calls LLM API |

> The design draws on a competitive teardown of Claudian and Copilot (see [Claudian_Copilot_竞品分析.md](docs/Claudian_Copilot_竞品分析.md)), adopting their strengths in model management, RAG, and memory.

---

## 🚀 Quick start

### Install (build from source)

```bash
git clone https://github.com/Xylocheir/Sedimind.git
cd Sedimind
npm install
npm run dev      # dev mode, auto-recompile
npm run build    # production build
```

Place the build artifacts `main.js`, `styles.css`, `manifest.json` into your Vault's `.obsidian/plugins/Sedimind/` and enable the plugin.

### Configure

1. Open the chat panel (left ribbon 🤖 icon) → ⚙️ settings in the top-right;
2. Pick a Provider and fill in the API Key (Ollama needs a running local service);
3. Just type instructions in the input box, e.g.:
   - "Create a note about AI"
   - "Search all notes containing 'machine learning'"
   - "Edit the note 'My Note', append content at the end"

---

## 🛠 Architecture

TypeScript + esbuild, built on the Obsidian API. Main modules:

- `src/llm/`: multi-model providers (OpenAI / Ollama / Anthropic / DeepSeek / Gemini / Claude Code / Codex)
- `src/tools/`: note operation toolset
- `src/memory/`: memory manager
- `src/mcp/`: MCP client and manager
- `src/sediment/`: sediment layer (gravity filter / L1 writer / index / briefing / status bar)
- `src/chat/`: chat view, message handling, @-mention menu, AI assistant modal
- `src/feedbackConfig.ts`: feedback reporting config (Supabase endpoint, insert-only RLS)

**Platform compatibility**: macOS / Windows / Linux fully supported; iOS / Android — MCP unavailable, core chat works; HarmonyOS not supported (no official Obsidian build).

---

## 📄 License

MIT License
