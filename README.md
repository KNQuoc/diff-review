# diff-review

Interactive code diff review in Discord with reaction-based navigation. Built as an [OpenClaw](https://github.com/openclaw/openclaw) skill.

![Demo](https://img.shields.io/badge/platform-Discord-5865F2?logo=discord&logoColor=white)
![License](https://img.shields.io/badge/license-MIT-green)

## What it does

When your AI agent makes code changes, instead of committing blindly, it posts an interactive diff viewer in Discord:

```
📊 Diff Review — sponsor-mash — feat: add voice input
3 files changed, +235 -12

▶ +89 -0  minimax-model.ts
   +120 -12  ChatPanel.tsx  
   +26 -0  route.ts
```

```diff
📄 minimax-model.ts [1/3]
@@ -13,7 +13,7 @@
-// Force Chat Completions API
+// Force Chat Completions API (MiniMax doesn't support Responses API)
 setOpenAIAPI('chat_completions');
```

Navigate files with ◀️ ▶️ reactions. Long files are automatically paginated.

## Setup

### 1. Install the skill

Copy the skill folder into your OpenClaw workspace:

```bash
# Clone into your OpenClaw skills directory
git clone https://github.com/KNQuoc/diff-review.git ~/.openclaw/workspace/skills/diff-review
```

Or manually copy `SKILL.md`, `diff-review.mjs`, and `diff-watcher.mjs` into `~/.openclaw/workspace/skills/diff-review/`.

### 2. That's it

The skill uses your existing OpenClaw Discord bot token — no extra setup needed.

## Usage

### Command: `show diff`

Type `show diff` (or `diff`, `show me the changes`, `review changes`) in your Discord channel and your OpenClaw agent will:

1. Parse all uncommitted changes in the current repo
2. Post a summary + the first file's diff
3. Start a background watcher for reaction navigation
4. Wait for you to review

### Reactions

| Reaction | Action |
|----------|--------|
| ▶️ | Next file (or next page if file is long) |
| ◀️ | Previous file (or previous page) |

Click a reaction and **leave it** — the watcher detects it, updates the diff, and removes your reaction automatically.

### After reviewing

Just tell your agent to commit, or ask for changes. The diff viewer is informational — it doesn't block anything.

## How it works

### Architecture

```
You type !diff
     ↓
Agent runs diff-review.mjs
     ↓ generates
diff-state.json (parsed diffs, pagination, message IDs)
     ↓
Agent posts summary + diff to Discord
     ↓
Agent starts diff-watcher.mjs (background)
     ↓ polls every 750ms
Discord REST API → detects reactions → edits messages
```

### Files

| File | Purpose |
|------|---------|
| `SKILL.md` | Instructions for the OpenClaw agent |
| `diff-review.mjs` | Parses `git diff` into paginated state JSON |
| `diff-watcher.mjs` | Background process that polls Discord reactions and edits messages |

### State file

The skill stores state in `~/.openclaw/workspace/diff-state.json`:

```json
{
  "repo": "/path/to/repo",
  "branch": "main",
  "commitMessage": "feat: add feature",
  "summaryMessageId": "123...",
  "diffMessageId": "456...",
  "channelId": "789...",
  "currentFileIndex": 0,
  "currentPage": 0,
  "files": [
    {
      "filename": "src/lib/foo.ts",
      "additions": 10,
      "deletions": 3,
      "pages": ["@@ -1,5 +1,7 @@\n ..."]
    }
  ]
}
```

### How the watcher works

`diff-watcher.mjs` runs as a background Node.js process:

- Reads the Discord bot token from your OpenClaw config (`~/.openclaw/openclaw.json`)
- Polls the diff message for reactions every 750ms via Discord REST API
- When it detects your ▶️ or ◀️ reaction, it:
  1. Removes your reaction
  2. Updates the current file/page in state
  3. Edits both the summary and diff messages
- Auto-terminates after 30 minutes

No gateway connection needed — it only uses REST API, so it doesn't conflict with OpenClaw's Discord connection.

## Configuration

The watcher reads these from environment or defaults:

| Variable | Default | Description |
|----------|---------|-------------|
| `OWNER_ID` | `267219855365636106` | Discord user ID allowed to navigate |
| `OPENCLAW_WORKSPACE` | `~/.openclaw/workspace` | Where to read/write state |

Set `OWNER_ID` to your own Discord user ID in your environment.

## Requirements

- [OpenClaw](https://github.com/openclaw/openclaw) with Discord channel configured
- Node.js 18+
- Git

## License

MIT
