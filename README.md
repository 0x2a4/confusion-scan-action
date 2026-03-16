# confusion-scan-action

GitHub Action for [confusion-scan](https://github.com/confusion-scan/confusion-scan).

Scans pull requests for confusing code patterns and posts results as a PR comment.

---

## What it posts

Every PR gets a comment like this:

**3 issues detected** across 18 files.

- 1 misleading name
- 1 high complexity function
- 1 dead file

| Type | Location | Detail |
|------|----------|--------|
| ⚠ Misleading name | `auth.js:12` | `getUserData()` implies a read but also calls: setItem, delete |
| ⚠ High complexity | `server.js:204` | `handleRequest()` has cyclomatic complexity of 18 |
| ⚠ Dead file | `helpers/legacyUtils.js` | `helpers/legacyUtils.js` is never imported |

The comment updates automatically on each new commit to the PR.

---

## Setup

Add this file to your repo:

**.github/workflows/confusion-scan.yml**

```yaml
name: Confusion Scan

on:
  pull_request:
    types: [opened, synchronize, reopened]

jobs:
  scan:
    runs-on: ubuntu-latest
    permissions:
      pull-requests: write
      contents: read

    steps:
      - uses: actions/checkout@v4

      - uses: confusion-scan/confusion-scan-action@v1
        with:
          directory: .
```

That's it. No configuration required.

---

## Options

| Input | Description | Default |
|---|---|---|
| `directory` | Directory to scan | `.` |
| `ignore` | Comma-separated directories to skip | `''` |
| `github-token` | Token used to post PR comments | `${{ github.token }}` |

**Example with options:**

```yaml
- uses: confusion-scan/confusion-scan-action@v1
  with:
    directory: ./src
    ignore: generated,migrations,__snapshots__
```

---

## Permissions

The action needs `pull-requests: write` to post comments.
The default `GITHUB_TOKEN` provided automatically by GitHub is sufficient.

---

## How it works

1. Installs `confusion-scan` via npm
2. Runs `confusion-scan <directory> --json`
3. Formats results as a markdown table
4. Posts or updates a comment on the pull request

On clean scans it posts a ✅ confirmation. On subsequent pushes it updates the existing comment instead of creating a new one.

---

## Detects

- Misleading function names (reads that secretly write)
- Naming inconsistencies (`userId` vs `user_id` vs `userid`)
- Duplicate logic across files
- Oversized files and functions
- High cyclomatic complexity
- Dead files (never imported)

---

## License

MIT
