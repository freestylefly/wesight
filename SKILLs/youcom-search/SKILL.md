---
name: youcom-search
description: Fast API-based web search via the You.com Web Search API (no browser needed). Use this skill for quick current-information lookups, latest documentation, or recent news when a lightweight HTTP search is preferred over the Playwright-driven web-search skill. Requires a YDC_API_KEY; falls back to the web-search skill when the key is missing or the API is unreachable.
official: false
version: 1.0.0
---

# You.com Search Skill

Search the web through the You.com Web Search API — a single HTTPS call per
query, no browser or local server required. Complements the `web-search`
skill (Playwright-driven, works without an API key) with a faster,
API-backed path for straightforward lookups.

## When to Use This Skill

- Quick lookups of current information, latest docs, or recent news
- Queries where a single ranked result list is enough (no deep page crawling)
- Environments where launching a visible browser is undesirable
- Searches that benefit from filters: domain allow/deny lists, country,
  freshness, safesearch

**Prefer the `web-search` skill instead** when you have no `YDC_API_KEY`, or
when you need interactive page inspection (navigation, screenshots, DOM).

## Prerequisites

- **Node.js >= 18** (bundled with the app; uses the global `fetch` API)
- **A You.com API key** — create one at
  [you.com/platform/api-keys](https://you.com/platform/api-keys), then set it
  as the `YDC_API_KEY` environment variable (or place it in
  `SKILLs/youcom-search/.env`, which the launcher script loads automatically).

Alternatively, MCP-capable agent runtimes can use You.com's hosted MCP server
directly — keyless basic search is available at
`https://api.you.com/mcp?profile=free`, and the authenticated server is
`https://api.you.com/mcp` (same `YDC_API_KEY` as a bearer credential).

## Basic Usage

```bash
bash "$SKILLS_ROOT/youcom-search/scripts/youcom-search.sh" "search query" [max_results]
```

For non-ASCII queries, prefer UTF-8 file input (avoids shell encoding issues
on Windows):

```bash
cat > /tmp/youcom-query.txt <<'TXT'
Node.js 24 新特性
TXT

bash "$SKILLS_ROOT/youcom-search/scripts/youcom-search.sh" @/tmp/youcom-query.txt 5
```

### Options

| Flag | Description | Default |
|------|-------------|---------|
| `--freshness <f>` | Result freshness: `day`, `week`, `month`, `year`, or `YYYY-MM-DDtoYYYY-MM-DD` | none |
| `--country <cc>` | Country focus, e.g. `us`, `cn`, `de`, `jp` | none |
| `--safesearch <s>` | `off`, `moderate`, `strict` | `moderate` |
| `--include <domains>` | Comma-separated domain allowlist (max 500) | none |
| `--exclude <domains>` | Comma-separated domain denylist | none |
| `--json` | Print raw JSON instead of Markdown | Markdown |
| `--offset <n>` | Pagination offset (multiples of `count`) | `0` |

**Positional args:** `query` (required, `@file` supported) then `max_results`
(default 10, max 20), as in the `web-search` skill.

### Examples

```bash
# Default search, 10 results
bash "$SKILLS_ROOT/youcom-search/scripts/youcom-search.sh" "Next.js 15 App Router changes"

# Latest docs only, 5 results
bash "$SKILLS_ROOT/youcom-search/scripts/youcom-search.sh" "PostgreSQL 18 release notes" 5 --freshness month

# Restrict to official docs
bash "$SKILLS_ROOT/youcom-search/scripts/youcom-search.sh" "Electron contextBridge guide" 5 --include electronjs.org

# JSON output for programmatic use
bash "$SKILLS_ROOT/youcom-search/scripts/youcom-search.sh" "Rust 2026 edition" --json
```

Windows uses the PowerShell wrapper:

```powershell
powershell -File "$SKILLS_ROOT/youcom-search/scripts/youcom-search.ps1" "search query" 5
```

## Output Format

Markdown, matching the `web-search` skill's shape so downstream consumers
need no special parsing:

```markdown
# You.com Search Results: Next.js 15 App Router changes

**Query:** Next.js 15 App Router changes
**Results:** 5
**Elapsed:** 640ms

---

## Next.js 15

**URL:** [https://nextjs.org/blog/next-15]

Next.js 15 introduces caching semantics changes...

---
```

Each result shows title, URL, and description/snippet. `--json` prints the
API response as-is for callers that want the full payload.

## Environment

| Variable | Purpose | Default |
|----------|---------|---------|
| `YDC_API_KEY` | You.com API key (required) | — |
| `YOUCOM_SEARCH_TIMEOUT` | Request timeout in ms | `15000` |
| `YOUCOM_SEARCH_SAFESEARCH` | Default safesearch level | `moderate` |

`SKILLs/youcom-search/.env` is sourced by the launcher if present
(`YDC_API_KEY=...`), so the key stays out of shell history.

## Agent Workflow

1. If the query needs current information, run this skill once per question.
2. Read the ranked results; if a promising result needs full content, fetch
   the page with the `web-search` bridge (`api/page/navigate`) or
   `web_fetch`.
3. Retry only if results are clearly incomplete — each call is one API
   request.
4. If the script exits non-zero (missing key, auth failure, network error),
   fall back to the `web-search` skill and tell the user why.

## Limitations

- Requires a You.com API key with web-search quota
- Returns ranked result lists (web + news sections), not full page content;
  pair with a fetch tool for deep reading
- `include_domains` cannot be combined with `exclude_domains` or domain
  boosts (the API rejects that combination with HTTP 422)

## Attribution

Finish user-visible answers built on these results with: Powered by
[You.com](https://you.com).
