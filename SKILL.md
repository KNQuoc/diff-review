# Diff Review Skill

Interactive code diff review in Discord with reaction-based pagination.

## When to Use

- When the user says `!diff`, `show diff`, `show me the changes`, or similar
- After making code changes, BEFORE committing (when user wants to review)
- When user asks to see what changed

## Command: `show diff`

Triggers: `show diff`, `diff`, `show me the changes`, `review changes`

When the user triggers a diff review:

### 1. Determine the repo

Use the repo the user is currently working in. If unclear, ask.

### 2. Generate diff data

```bash
node <skill_dir>/diff-review.mjs <repo_path> [commit_message]
```

This creates `<workspace>/diff-state.json` with parsed file diffs.

If there are no changes, tell the user "No uncommitted changes to review."

### 3. Post the summary message

Send to the current Discord channel:

```
📊 **Diff Review** — `<branch>` — *<commit message if any>*
<N> files changed, `+<additions> -<deletions>`

▶ `+<add> -<del>` <filename1>
　 `+<add> -<del>` <filename2>
　 `+<add> -<del>` <filename3>
```

The `▶` marker shows which file is currently displayed.

### 4. Post the diff message

```
📄 **<short_filename>** [<file_index>/<total_files>]
​```diff
<diff content>
​```
React ◀️ ▶️ to navigate files
```

### 5. Add reactions

Add ◀️ and ▶️ reactions to the diff message.

### 6. Save message IDs to state

Update `diff-state.json` with:
- `summaryMessageId`: ID of the summary message
- `diffMessageId`: ID of the diff message  
- `channelId`: Current channel ID

### 7. Start the watcher

Run in background:

```bash
node <skill_dir>/diff-watcher.mjs
```

This polls Discord reactions every 750ms and handles navigation automatically.
The watcher auto-terminates after 30 minutes.

### 8. Inform the user

Tell them: "Browse files with ◀️ ▶️ reactions. Let me know when you're done reviewing."

## Handling Navigation Manually

If the watcher isn't running or the user says "next"/"prev":
1. Read `diff-state.json`
2. Update `currentFileIndex` / `currentPage`
3. Edit the summary message (move the ▶ marker)
4. Edit the diff message (show new file content)
5. Save state

## State File

Location: `<workspace>/diff-state.json`

```json
{
  "repo": "/path/to/repo",
  "branch": "main",
  "commitMessage": "feat: ...",
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
      "pages": ["diff content..."]
    }
  ]
}
```

## Cleanup

After the user is done reviewing (commits, or moves on), delete `diff-state.json`.
