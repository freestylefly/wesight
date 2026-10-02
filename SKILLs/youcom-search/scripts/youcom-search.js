#!/usr/bin/env node
'use strict';

/**
 * You.com Search Skill - API-based web search via https://api.you.com/v1/search
 *
 * Usage: node youcom-search.js "query" [max_results] [options]
 *   --freshness <day|week|month|year|YYYY-MM-DDtoYYYY-MM-DD>
 *   --country <cc>          e.g. us, cn, de, jp
 *   --safesearch <off|moderate|strict>
 *   --include <domains>     comma-separated allowlist
 *   --exclude <domains>     comma-separated denylist
 *   --offset <n>            pagination offset (multiples of count)
 *   --json                  print raw JSON response
 *
 * Environment:
 *   YDC_API_KEY              (required) You.com API key
 *   YOUCOM_SEARCH_TIMEOUT    request timeout ms (default 15000)
 *   YOUCOM_SEARCH_SAFESEARCH default safesearch (default moderate)
 *
 * Output: Markdown (web-search skill format) or raw JSON with --json.
 * Exits non-zero with a clear message on missing key / HTTP / network errors
 * so agents can fall back to the Playwright web-search skill.
 */

const API_URL = 'https://api.you.com/v1/search';
const DEFAULT_COUNT = 10;
const MAX_COUNT = 20;
const DEFAULT_TIMEOUT = 15000;

// ---- Argument parsing ----------------------------------------------------

function usage() {
  console.error(
    'Usage: youcom-search.js <query|@file> [max_results] [options]\n' +
      'Options:\n' +
      '  --freshness <day|week|month|year|YYYY-MM-DDtoYYYY-MM-DD>\n' +
      '  --country <cc>      country focus, e.g. us, cn, de, jp\n' +
      '  --safesearch <off|moderate|strict>\n' +
      '  --include <domains> comma-separated domain allowlist\n' +
      '  --exclude <domains> comma-separated domain denylist\n' +
      '  --offset <n>        pagination offset (multiples of count)\n' +
      '  --json              print raw JSON instead of Markdown\n' +
      'Environment: YDC_API_KEY (required), YOUCOM_SEARCH_TIMEOUT, YOUCOM_SEARCH_SAFESEARCH'
  );
  process.exit(1);
}

function fail(message, code) {
  console.error(`Error: ${message}`);
  process.exit(code || 1);
}

const args = process.argv.slice(2);
const options = {
  count: DEFAULT_COUNT,
  offset: 0,
  freshness: null,
  country: null,
  safesearch: process.env.YOUCOM_SEARCH_SAFESEARCH || 'moderate',
  includeDomains: null,
  excludeDomains: null,
  json: false,
};

const positional = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  const next = () => (i + 1 < args.length ? args[++i] : usage());
  switch (a) {
    case '--freshness':
      options.freshness = next();
      break;
    case '--country':
      options.country = next();
      break;
    case '--safesearch':
      options.safesearch = next();
      break;
    case '--include':
      options.includeDomains = next()
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      break;
    case '--exclude':
      options.excludeDomains = next()
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      break;
    case '--offset':
      options.offset = parseInt(next(), 10);
      if (!Number.isFinite(options.offset) || options.offset < 0) usage();
      break;
    case '--json':
      options.json = true;
      break;
    case '-h':
    case '--help':
      usage();
      break;
    default:
      positional.push(a);
  }
}

// @file syntax for non-ASCII queries (matches web-search skill behavior)
let query = positional[0];
if (query && query.startsWith('@')) {
  const fs = require('fs');
  const filepath = query.slice(1);
  if (!fs.existsSync(filepath)) fail(`Query file not found: ${filepath}`);
  query = fs.readFileSync(filepath, 'utf8').trim();
}
if (!query) usage();

if (positional[1] !== undefined) {
  const n = parseInt(positional[1], 10);
  if (Number.isFinite(n) && n > 0) options.count = Math.min(n, MAX_COUNT);
}

// ---- Request -------------------------------------------------------------

const apiKey = process.env.YDC_API_KEY;
if (!apiKey) {
  fail(
    'YDC_API_KEY is not set. Create a key at https://you.com/platform/api-keys ' +
      'and export it (or put it in SKILLs/youcom-search/.env). ' +
      'Alternatively, fall back to the web-search skill, which needs no key.'
  );
}

const body = { query, count: options.count, safesearch: options.safesearch };
if (options.freshness) body.freshness = options.freshness;
if (options.country) body.country = options.country;
if (options.offset) body.offset = options.offset;
if (options.includeDomains && options.includeDomains.length) {
  body.include_domains = options.includeDomains;
} else if (options.excludeDomains && options.excludeDomains.length) {
  body.exclude_domains = options.excludeDomains;
}

const timeoutMs = parseInt(process.env.YOUCOM_SEARCH_TIMEOUT, 10);
const timeout = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_TIMEOUT;

const started = Date.now();

fetch(API_URL, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': apiKey,
  },
  body: JSON.stringify(body),
  signal: AbortSignal.timeout(timeout),
})
  .then(async (resp) => {
    if (resp.status === 401 || resp.status === 403) {
      fail(`Authentication failed (HTTP ${resp.status}). Check YDC_API_KEY at https://you.com/platform/api-keys.`, 2);
    }
    if (resp.status === 422) {
      const text = await resp.text().catch(() => '');
      fail(`Invalid request (HTTP 422). Note: include_domains cannot be combined with exclude_domains. ${text}`.trim(), 2);
    }
    if (!resp.ok) {
      fail(`You.com API error (HTTP ${resp.status}).`, 2);
    }
    const data = await resp.json();
    if (options.json) {
      console.log(JSON.stringify(data, null, 2));
      return;
    }
    printMarkdown(query, data, Date.now() - started);
  })
  .catch((err) => {
    if (err && err.name === 'TimeoutError') {
      fail(`Request timed out after ${timeout}ms. Falling back to the web-search skill is recommended.`, 3);
    }
    fail(`Network error: ${err.message}. Falling back to the web-search skill is recommended.`, 3);
  });

// ---- Markdown rendering (web-search skill output shape) -------------------

function escapeMd(s) {
  return String(s || '').replace(/([\\`*_\[\]])/g, '\\$1');
}

function printMarkdown(query, data, elapsedMs) {
  const web = (data.results && data.results.web) || [];
  const news = (data.results && data.results.news) || [];
  const lines = [];
  lines.push(`# You.com Search Results: ${escapeMd(query)}`);
  lines.push('');
  lines.push(`**Query:** ${escapeMd(query)}`);
  lines.push(`**Results:** ${web.length}${news.length ? ` (+${news.length} news)` : ''}`);
  lines.push(`**Elapsed:** ${elapsedMs}ms`);
  lines.push('');
  const section = (items, label) => {
    if (!items.length) return;
    if (label) {
      lines.push(`## ${label}`);
      lines.push('');
    }
    for (const hit of items) {
      const desc = hit.description || (hit.snippets && hit.snippets.join(' — ')) || '';
      lines.push(`---`);
      lines.push('');
      lines.push(`## ${escapeMd(hit.title || hit.url)}`);
      lines.push('');
      lines.push(`**URL:** [${hit.url}]`);
      lines.push('');
      if (desc) lines.push(escapeMd(desc));
      if (hit.page_age) lines.push(`**Published:** ${escapeMd(hit.page_age)}`);
      lines.push('');
    }
  };
  section(web, null);
  section(news, 'News');
  lines.push('---');
  lines.push('');
  lines.push('Powered by [You.com](https://you.com)');
  console.log(lines.join('\n'));
}
