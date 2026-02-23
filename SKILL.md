# Diff Review Skill

Interactive code diff review in Discord with pagination.

## When to Use

After making code changes, BEFORE committing. Post diffs for review so the user can browse files.

## Workflow

### 1. Generate diff data

Run the diff script to parse `git diff` into a state file:

```
node <skill_dir>/diff-review.mjs <repo_path> [commit_message]
```

This creates `<workspace>/diff-state.json` with parsed file diffs.

### 2. Post the first file

Read `diff-state.json`. Post a summary + first file diff using the `message` tool:

- **Summary message**: file list with stats, current file indicator
- **Diff message**: code block with the current file's diff content
- Add reactions: ◀️ ▶️ on the diff message for navigation

Save the message IDs back to `diff-state.json`.

### 3. Handle navigation

When the user reacts ▶️ or ◀️ (or says "next"/"prev"):
1. Read `diff-state.json`, update `currentFileIndex` / `currentPage`
2. **Edit** the existing diff message with the new file content using `message` tool `edit` action
3. **Edit** the summary message to update the current file indicator
4. Save state

### 4. Done

When the user is satisfied, commit and push as normal. Delete `diff-state.json`.

## State File Format

```json
{
  "repo": "C:\\path\\to\\repo",
  "branch": "sponsor-mash",
  "commitMessage": "feat: ...",
  "summaryMessageId": "123...",
  "diffMessageId": "456...",
  "channelId": "1470492867632955485",
  "currentFileIndex": 0,
  "currentPage": 0,
  "files": [
    {
      "filename": "src/lib/foo.ts",
      "additions": 10,
      "deletions": 3,
      "pages": ["diff content page 1...", "diff content page 2..."]
    }
  ]
}
```

## Navigation Reactions

- ◀️ Previous file (or previous page if multi-page)
- ▶️ Next file (or next page if multi-page)

## Message Format

### Summary
```
📊 **Diff Review** — `branch-name`
3 files changed, +235 -12

▶ `+89 -0` src/lib/minimax-model.ts
   `+120 -12` src/components/ChatPanel.tsx
   `+26 -0` src/app/api/stt/route.ts
```

### Diff (editable)
```
📄 **src/lib/minimax-model.ts** [1/3]
​```diff
+added line
-removed line
​```
```
