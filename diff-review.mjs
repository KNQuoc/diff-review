#!/usr/bin/env node
/**
 * diff-review.mjs — Parse git diff into a state file for Discord review.
 *
 * Usage: node diff-review.mjs <repo_path> [commit_message]
 * Output: <workspace>/diff-state.json
 */

import { execSync } from 'child_process';
import { writeFileSync } from 'fs';
import { join } from 'path';

const PAGE_LIMIT = 1800; // chars per page (fits in Discord code block)
const WORKSPACE = process.env.OPENCLAW_WORKSPACE || join(process.env.USERPROFILE, '.openclaw', 'workspace');

const repoPath = process.argv[2];
const commitMessage = process.argv[3] || '';

if (!repoPath) {
  console.error('Usage: node diff-review.mjs <repo_path> [commit_message]');
  process.exit(1);
}

// Get git info
const gitOpts = { cwd: repoPath, encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 };
const branch = execSync('git branch --show-current', gitOpts).trim();

// Get changed files with stats
const statOutput = execSync('git diff --stat --no-color', gitOpts).trim();
const diffFiles = execSync('git diff --name-only', gitOpts).trim().split('\n').filter(Boolean);

// Also include staged files
const stagedFiles = execSync('git diff --cached --name-only', gitOpts).trim().split('\n').filter(Boolean);
const allFiles = [...new Set([...diffFiles, ...stagedFiles])];

if (allFiles.length === 0) {
  console.log('No changes to review.');
  process.exit(0);
}

// Parse each file's diff
const files = allFiles.map((filename) => {
  let diff = '';
  try {
    // Try unstaged first, then staged
    diff = execSync(`git diff --no-color -- "${filename}"`, gitOpts).trim();
    if (!diff) {
      diff = execSync(`git diff --cached --no-color -- "${filename}"`, gitOpts).trim();
    }
  } catch {
    diff = '(could not read diff)';
  }

  // Count additions/deletions
  const lines = diff.split('\n');
  let additions = 0, deletions = 0;
  for (const line of lines) {
    if (line.startsWith('+') && !line.startsWith('+++')) additions++;
    if (line.startsWith('-') && !line.startsWith('---')) deletions++;
  }

  // Strip the header (--- +++ @@ lines) for cleaner display, keep @@ for context
  const cleanDiff = lines
    .filter(l => !l.startsWith('diff --git') && !l.startsWith('index ') && !l.startsWith('--- ') && !l.startsWith('+++ '))
    .join('\n')
    .trim();

  // Paginate
  const pages = [];
  if (cleanDiff.length <= PAGE_LIMIT) {
    pages.push(cleanDiff);
  } else {
    const diffLines = cleanDiff.split('\n');
    let current = '';
    for (const line of diffLines) {
      if ((current + '\n' + line).length > PAGE_LIMIT && current.length > 0) {
        pages.push(current);
        current = line;
      } else {
        current = current ? current + '\n' + line : line;
      }
    }
    if (current) pages.push(current);
  }

  return { filename, additions, deletions, pages };
});

// Build state
const state = {
  repo: repoPath,
  branch,
  commitMessage,
  summaryMessageId: null,
  diffMessageId: null,
  channelId: null,
  currentFileIndex: 0,
  currentPage: 0,
  files,
  totalAdditions: files.reduce((s, f) => s + f.additions, 0),
  totalDeletions: files.reduce((s, f) => s + f.deletions, 0),
};

const outPath = join(WORKSPACE, 'diff-state.json');
writeFileSync(outPath, JSON.stringify(state, null, 2));
console.log(`✅ Parsed ${files.length} files → ${outPath}`);
console.log(`   Branch: ${branch}`);
console.log(`   +${state.totalAdditions} -${state.totalDeletions}`);
files.forEach((f, i) => {
  const pages = f.pages.length > 1 ? ` (${f.pages.length} pages)` : '';
  console.log(`   [${i + 1}/${files.length}] ${f.filename} +${f.additions} -${f.deletions}${pages}`);
});
