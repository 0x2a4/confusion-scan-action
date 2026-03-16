# confusion-scan-action

GitHub Action for [confusion-scan](https://github.com/0x2a4/confusion-scan).

Automatically scans pull requests for confusing code patterns and posts results as a PR comment with inline annotations.

---

## Quickstart

Add this file to your repo:

**.github/workflows/confusion-scan.yml**

```yaml
name: Confusion Scan

on:
  pull_request:

jobs:
  scan:
    runs-on: ubuntu-latest
    permissions:
      checks: write
      pull-requests: write
      contents: read

    steps:
      - uses: actions/checkout@v4
      - uses: 0x2a4/confusion-scan-action@v1
```

That's it. No configuration required.

---

## What it posts

Every PR gets a comment showing only issues introduced in changed files:

**3 issues found in 2 changed files.**
Confusion score: **83/100**

- 1 misleading name
- 1 duplicate logic block
- 1 high-complexity function

| Type | Location | Detail |
|------|----------|--------|
| ⚠ Misleading name | `auth.js:12` | `getUserData()` implies a read but also calls: setItem, delete |
| ⚠ Duplicate logic | — | Identical function body appears in 2 files |
| ⚠ High complexity | `server.js:204` | `handleRequest()` has cyclomatic complexity of 18 |

The comment updates automatically on each new commit. Clean PRs get a ✅.

Inline annotations appear directly in the diff view pointing to the exact lines.

---

## Options

| Input | Description | Default |
|-------|-------------|---------|
| `directory` | Directory to scan | `.` |
| `ignore` | Comma-separated directories to skip | `''` |
| `github-token` | Token for posting comments and creating check runs | `${{ github.token }}` |

**Example with options:**

```yaml
- uses: 0x2a4/confusion-scan-action@v1
  with:
    directory: ./src
    ignore: generated,migrations,__snapshots__
```

---

## Configuration

Add a `.confusionscanrc` file to your project root to override default thresholds:

```json
{
  "maxFileLines": 400,
  "maxFunctionLines": 80,
  "maxComplexity": 15,
  "ignore": ["generated", "vendor"]
}
```

| Option | Default | Description |
|--------|---------|-------------|
| `maxFileLines` | `300` | Flag files over this many lines |
| `maxFunctionLines` | `60` | Flag functions over this many lines |
| `maxComplexity` | `10` | Flag functions over this cyclomatic complexity |
| `ignore` | `[]` | Additional directories to skip |

---

## Permissions

```yaml
permissions:
  checks: write        # required for inline annotations
  pull-requests: write # required for PR comment
  contents: read       # required to checkout code
```

The default `GITHUB_TOKEN` provided by GitHub Actions is sufficient — no secrets setup needed.

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
