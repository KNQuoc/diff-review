#!/usr/bin/env node
/**
 * diff-watcher.mjs — Background process that watches for reactions on diff messages
 * and edits them instantly. No LLM in the loop = fast response.
 *
 * Usage: node diff-watcher.mjs
 * Reads: <workspace>/diff-state.json
 * Requires: DISCORD_TOKEN env var (or reads from openclaw config)
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const WORKSPACE = process.env.OPENCLAW_WORKSPACE || join(process.env.USERPROFILE, '.openclaw', 'workspace');
const STATE_PATH = join(WORKSPACE, 'diff-state.json');
const POLL_INTERVAL = 750; // 750ms
const OWNER_ID = process.env.OWNER_ID || '267219855365636106';

// Get Discord token from openclaw config
function getDiscordToken() {
  if (process.env.DISCORD_TOKEN) return process.env.DISCORD_TOKEN;
  
  try {
    const configPath = join(process.env.USERPROFILE, '.openclaw', 'openclaw.json');
    const config = JSON.parse(readFileSync(configPath, 'utf-8'));
    return config.channels?.discord?.token;
  } catch {
    return null;
  }
}

const DISCORD_TOKEN = getDiscordToken();
if (!DISCORD_TOKEN) {
  console.error('No Discord token found');
  process.exit(1);
}

const API_BASE = 'https://discord.com/api/v10';
const headers = {
  Authorization: `Bot ${DISCORD_TOKEN}`,
  'Content-Type': 'application/json',
};

// ── Discord REST helpers ──────────────────────────

async function getReactions(channelId, messageId, emoji) {
  // Try without and with variation selector (VS16)
  const bare = emoji.replace(/\uFE0F/g, '');
  const withVS = bare + '\uFE0F';
  
  for (const variant of [bare, withVS]) {
    try {
      const encoded = encodeURIComponent(variant);
      const url = `${API_BASE}/channels/${channelId}/messages/${messageId}/reactions/${encoded}`;
      const res = await fetch(url, { headers });
      if (!res.ok) continue;
      const users = await res.json();
      if (Array.isArray(users) && users.length > 0) {
        return { users, variant };
      }
    } catch (e) {
      console.error('getReactions error:', e.message);
    }
  }
  return { users: [], variant: bare };
}

async function removeReaction(channelId, messageId, emoji, userId) {
  const encoded = encodeURIComponent(emoji);
  await fetch(`${API_BASE}/channels/${channelId}/messages/${messageId}/reactions/${encoded}/${userId}`, {
    method: 'DELETE',
    headers,
  });
}

async function editMessage(channelId, messageId, content) {
  await fetch(`${API_BASE}/channels/${channelId}/messages/${messageId}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ content }),
  });
}

// ── State helpers ─────────────────────────────────

function readState() {
  if (!existsSync(STATE_PATH)) return null;
  try {
    return JSON.parse(readFileSync(STATE_PATH, 'utf-8'));
  } catch {
    return null;
  }
}

function saveState(state) {
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

// ── Build messages ────────────────────────────────

function buildSummary(state) {
  const lines = state.files.map((f, i) => {
    const arrow = i === state.currentFileIndex ? '▶' : '　';
    return `${arrow} \`+${f.additions} -${f.deletions}\` ${f.filename.split('/').pop()}`;
  });

  return [
    `📊 **Diff Review** — \`${state.branch}\`${state.commitMessage ? ` — *${state.commitMessage}*` : ''}`,
    `${state.files.length} files changed, \`+${state.totalAdditions} -${state.totalDeletions}\``,
    '',
    ...lines,
  ].join('\n');
}

function buildDiff(state) {
  const file = state.files[state.currentFileIndex];
  const page = file.pages[state.currentPage];
  const pageInfo = file.pages.length > 1
    ? ` (Page ${state.currentPage + 1}/${file.pages.length})`
    : '';
  const shortName = file.filename.split('/').pop();

  return [
    `📄 **${shortName}** [${state.currentFileIndex + 1}/${state.files.length}]${pageInfo}`,
    '```diff',
    page,
    '```',
    'React ◀️ ▶️ to navigate files',
  ].join('\n');
}

// ── Main loop ─────────────────────────────────────

async function poll() {
  const state = readState();
  if (!state || !state.diffMessageId || !state.channelId) {
    return;
  }

  const nextResult = await getReactions(state.channelId, state.diffMessageId, '▶');
  const ownerClickedNext = nextResult.users.some(u => u.id === OWNER_ID);

  // Check for ◀️ reaction from owner
  const prevResult = await getReactions(state.channelId, state.diffMessageId, '◀');
  const ownerClickedPrev = prevResult.users.some(u => u.id === OWNER_ID);

  if (ownerClickedNext) {
    // Remove their reaction (use the variant that matched)
    await removeReaction(state.channelId, state.diffMessageId, nextResult.variant, OWNER_ID);

    const file = state.files[state.currentFileIndex];
    if (file.pages.length > 1 && state.currentPage < file.pages.length - 1) {
      // Next page within file
      state.currentPage++;
    } else if (state.currentFileIndex < state.files.length - 1) {
      // Next file
      state.currentFileIndex++;
      state.currentPage = 0;
    }

    saveState(state);
    await editMessage(state.channelId, state.summaryMessageId, buildSummary(state));
    await editMessage(state.channelId, state.diffMessageId, buildDiff(state));
  }

  if (ownerClickedPrev) {
    await removeReaction(state.channelId, state.diffMessageId, prevResult.variant, OWNER_ID);

    if (state.currentPage > 0) {
      // Previous page within file
      state.currentPage--;
    } else if (state.currentFileIndex > 0) {
      // Previous file (go to last page)
      state.currentFileIndex--;
      state.currentPage = state.files[state.currentFileIndex].pages.length - 1;
    }

    saveState(state);
    await editMessage(state.channelId, state.summaryMessageId, buildSummary(state));
    await editMessage(state.channelId, state.diffMessageId, buildDiff(state));
  }
}

// ── Run ───────────────────────────────────────────

console.log('👀 Diff watcher started — polling every', POLL_INTERVAL, 'ms');
console.log('   State file:', STATE_PATH);

const interval = setInterval(async () => {
  try {
    await poll();
  } catch (err) {
    // Don't crash on transient errors
    if (!err.message?.includes('ENOENT')) {
      console.error('Poll error:', err.message);
    }
  }
}, POLL_INTERVAL);

// Graceful shutdown
process.on('SIGINT', () => {
  clearInterval(interval);
  console.log('\n🛑 Diff watcher stopped');
  process.exit(0);
});

// Stop after 30 minutes (auto-cleanup)
setTimeout(() => {
  clearInterval(interval);
  console.log('⏰ Diff watcher timed out after 30 minutes');
  process.exit(0);
}, 30 * 60 * 1000);
