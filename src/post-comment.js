#!/usr/bin/env node

const fs = require('fs');

const RESULTS_FILE = process.env.RESULTS_FILE;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPOSITORY = process.env.GITHUB_REPOSITORY;
const PR_NUMBER = process.env.PR_NUMBER;
const HEAD_SHA = process.env.HEAD_SHA;

const COMMENT_MARKER = '<!-- confusion-scan -->';

const SCORE_WEIGHTS = {
  'misleading-name': 5,
  'duplicate-logic': 4,
  'complex-function': 4,
  'large-file': 3,
  'large-function': 3,
  'naming-inconsistency': 2,
  'dead-file': 1,
};

const ANNOTATION_LEVELS = {
  'misleading-name': 'warning',
  'duplicate-logic': 'warning',
  'large-file': 'warning',
  'large-function': 'warning',
  'complex-function': 'failure',
  'naming-inconsistency': 'notice',
  'dead-file': 'notice',
};

const TYPE_LABELS = {
  'misleading-name':      '⚠ Misleading name',
  'naming-inconsistency': '⚠ Naming inconsistency',
  'duplicate-logic':      '⚠ Duplicate logic',
  'large-file':           '⚠ File too large',
  'large-function':       '⚠ Function too large',
  'complex-function':     '⚠ High complexity',
  'dead-file':            '⚠ Dead file',
};

const ISSUE_ORDER = [
  'misleading-name',
  'duplicate-logic',
  'large-file',
  'large-function',
  'complex-function',
  'naming-inconsistency',
  'dead-file',
];

const SUMMARY_LABELS = {
  'misleading-name':      { one: 'misleading name',          many: 'misleading names' },
  'naming-inconsistency': { one: 'naming inconsistency',     many: 'naming inconsistencies' },
  'duplicate-logic':      { one: 'duplicate logic block',    many: 'duplicate logic blocks' },
  'large-file':           { one: 'oversized file',           many: 'oversized files' },
  'large-function':       { one: 'oversized function',       many: 'oversized functions' },
  'complex-function':     { one: 'high-complexity function', many: 'high-complexity functions' },
  'dead-file':            { one: 'dead file',                many: 'dead files' },
};

function computeScore(issues) {
  const deductions = issues.reduce((sum, i) => sum + (SCORE_WEIGHTS[i.type] || 0), 0);
  return Math.max(0, 100 - deductions);
}

function filterToChangedFiles(issues, changedFiles) {
  if (!changedFiles) return issues;
  return issues.filter(issue => {
    if (issue.file && changedFiles.has(issue.file)) return true;
    if (issue.locations) {
      return issue.locations.some(loc => {
        const file = loc.split(':')[0];
        return changedFiles.has(file);
      });
    }
    return false;
  });
}

function formatLocation(issue) {
  if (issue.file && issue.line) return `\`${issue.file}:${issue.line}\``;
  if (issue.file) return `\`${issue.file}\``;
  return '';
}

function formatIssueRow(issue) {
  const label = TYPE_LABELS[issue.type] || issue.type;
  const location = formatLocation(issue);
  const msg = issue.message;

  let row = `| ${label} | ${location} | ${msg} |`;

  if (issue.locations && issue.locations.length > 0) {
    const locs = issue.locations.slice(0, 3).map(l => `\`${l}\``).join(', ');
    const more = issue.locations.length > 3 ? ` +${issue.locations.length - 3} more` : '';
    row += `\n| | | ${locs}${more} |`;
  }

  return row;
}

function buildComment(results, filteredIssues, changedFileCount) {
  const { scanned, total } = results;
  const score = computeScore(results.issues);
  const showing = filteredIssues.length;
  const isFiltered = changedFileCount != null;

  if (total === 0) {
    return [
      COMMENT_MARKER,
      '## Confusion Scan',
      '',
      `✅ **No issues found across ${scanned} file${scanned === 1 ? '' : 's'}.**`,
      `Confusion score: **100/100**`,
    ].join('\n');
  }

  if (showing === 0) {
    const repoLine = total === 1
      ? `1 total issue still exists across the full repo.`
      : `${total} total issues still exist across the full repo.`;
    return [
      COMMENT_MARKER,
      '## Confusion Scan',
      '',
      '**No issues found in changed files.**',
      `Confusion score: **${score}/100**`,
      '',
      repoLine,
    ].join('\n');
  }

  const sorted = [...filteredIssues].sort((a, b) => {
    const ai = ISSUE_ORDER.indexOf(a.type);
    const bi = ISSUE_ORDER.indexOf(b.type);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  const counts = {};
  for (const issue of filteredIssues) {
    counts[issue.type] = (counts[issue.type] || 0) + 1;
  }

  const issueWord = showing === 1 ? 'issue' : 'issues';
  const fileWord = changedFileCount === 1 ? 'file' : 'files';
  const scopeLine = isFiltered
    ? `**${showing} ${issueWord} found in ${changedFileCount} changed ${fileWord}.**`
    : `**${showing} ${issueWord} found across ${scanned} file${scanned === 1 ? '' : 's'}.**`;

  const countLines = ISSUE_ORDER
    .filter(t => counts[t])
    .map(t => {
      const n = counts[t];
      const labels = SUMMARY_LABELS[t];
      const label = labels ? (n === 1 ? labels.one : labels.many) : t;
      return `- ${n} ${label}`;
    })
    .join('\n');

  const rows = sorted.map(formatIssueRow).join('\n');

  return [
    COMMENT_MARKER,
    '## Confusion Scan',
    '',
    scopeLine,
    `Confusion score: **${score}/100**`,
    '',
    countLines,
    '',
    '| Type | Location | Detail |',
    '|------|----------|--------|',
    rows,
  ].join('\n');
}

async function apiHeaders() {
  return {
    Authorization: `Bearer ${GITHUB_TOKEN}`,
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
  };
}

async function getChangedFiles(owner, repo, prNumber) {
  const url = `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}/files?per_page=100`;
  const res = await fetch(url, { headers: await apiHeaders() });
  if (!res.ok) return null;
  const files = await res.json();
  return new Set(files.map(f => f.filename));
}

async function getExistingComment(owner, repo, prNumber) {
  const url = `https://api.github.com/repos/${owner}/${repo}/issues/${prNumber}/comments?per_page=100`;
  const res = await fetch(url, { headers: await apiHeaders() });
  if (!res.ok) return null;
  const comments = await res.json();
  return comments.find(c => c.body.includes(COMMENT_MARKER)) || null;
}

async function postComment(owner, repo, prNumber, body) {
  const url = `https://api.github.com/repos/${owner}/${repo}/issues/${prNumber}/comments`;
  const res = await fetch(url, {
    method: 'POST',
    headers: await apiHeaders(),
    body: JSON.stringify({ body }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to post comment: ${res.status} ${text}`);
  }
}

async function updateComment(commentId, owner, repo, body) {
  const url = `https://api.github.com/repos/${owner}/${repo}/issues/comments/${commentId}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: await apiHeaders(),
    body: JSON.stringify({ body }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to update comment: ${res.status} ${text}`);
  }
}

async function createCheckRun(owner, repo, issues, score) {
  if (!HEAD_SHA) return;

  const annotations = issues
    .filter(issue => issue.file && issue.line)
    .slice(0, 50)
    .map(issue => ({
      path: issue.file,
      start_line: issue.line,
      end_line: issue.line,
      annotation_level: ANNOTATION_LEVELS[issue.type] || 'warning',
      title: TYPE_LABELS[issue.type]?.replace('⚠ ', '') || issue.type,
      message: issue.message,
    }));

  const conclusion = issues.length === 0 ? 'success' : 'neutral';
  const title = issues.length === 0
    ? 'No confusion found'
    : `${issues.length} issue${issues.length === 1 ? '' : 's'} found`;

  const url = `https://api.github.com/repos/${owner}/${repo}/check-runs`;
  const res = await fetch(url, {
    method: 'POST',
    headers: await apiHeaders(),
    body: JSON.stringify({
      name: 'Confusion Scan',
      head_sha: HEAD_SHA,
      status: 'completed',
      conclusion,
      output: {
        title,
        summary: `Confusion score: ${score}/100`,
        annotations,
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`Failed to create check run: ${res.status} ${text}`);
  }
}

async function main() {
  if (!PR_NUMBER || PR_NUMBER === 'undefined') {
    console.log('Not a pull request — skipping comment.');
    process.exit(0);
  }

  if (!GITHUB_TOKEN) {
    console.error('GITHUB_TOKEN not set.');
    process.exit(1);
  }

  let results;
  try {
    results = JSON.parse(fs.readFileSync(RESULTS_FILE, 'utf8'));
  } catch (err) {
    console.error(`Could not read results file: ${err.message}`);
    process.exit(1);
  }

  const [owner, repo] = GITHUB_REPOSITORY.split('/');
  const score = computeScore(results.issues);

  const changedFiles = await getChangedFiles(owner, repo, PR_NUMBER);
  const filteredIssues = filterToChangedFiles(results.issues, changedFiles);
  const changedFileCount = changedFiles
    ? [...new Set(filteredIssues.map(i => i.file).filter(Boolean))].length
    : null;

  const body = buildComment(results, filteredIssues, changedFileCount);

  const existing = await getExistingComment(owner, repo, PR_NUMBER);
  if (existing) {
    await updateComment(existing.id, owner, repo, body);
    console.log('Updated existing confusion-scan comment.');
  } else {
    await postComment(owner, repo, PR_NUMBER, body);
    console.log('Posted confusion-scan comment.');
  }

  await createCheckRun(owner, repo, filteredIssues, score);
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});
