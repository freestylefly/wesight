import fs from 'fs';

// Strips // line comments, /* */ block comments, and trailing commas from JSONC text.
// Implemented as a single-pass scanner rather than a regex so that comment-like
// sequences inside string values (e.g. "https://api.example.com") are preserved.
export const stripJsonComments = (input: string): string => {
  let out = '';
  let inString = false;
  let escaped = false;
  let i = 0;

  while (i < input.length) {
    const char = input[i];
    const next = input[i + 1];

    if (inString) {
      out += char;
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      i += 1;
      continue;
    }

    if (char === '"') {
      inString = true;
      out += char;
      i += 1;
      continue;
    }

    if (char === '/' && next === '/') {
      while (i < input.length && input[i] !== '\n') i += 1;
      continue;
    }

    if (char === '/' && next === '*') {
      i += 2;
      while (i < input.length && !(input[i] === '*' && input[i + 1] === '/')) i += 1;
      i += 2;
      continue;
    }

    out += char;
    i += 1;
  }

  // Remove trailing commas before } or ], which JSONC permits but JSON.parse rejects.
  return out.replace(/,(\s*[}\]])/g, '$1');
};

// Parses JSON text, tolerating JSONC comments and trailing commas when the source
// file uses the .jsonc extension. Returns null for anything that is not a plain object.
export const parseJsonObjectText = (raw: string, filePath?: string): Record<string, unknown> | null => {
  try {
    const text = filePath?.endsWith('.jsonc') ? stripJsonComments(raw) : raw;
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
};

// Reads a JSON or JSONC file into a plain object, or null when missing/unparsable.
export const readJsonOrJsoncObject = (filePath: string): Record<string, unknown> | null => {
  try {
    if (!fs.existsSync(filePath)) return null;
    return parseJsonObjectText(fs.readFileSync(filePath, 'utf8'), filePath);
  } catch {
    return null;
  }
};

// JSON.stringify discards comments, so writing a parsed object back over a .jsonc
// file silently deletes everything the user wrote by hand. These helpers rewrite
// only the top-level values that actually changed, leaving the surrounding text —
// comments, key order, indentation, trailing commas — exactly as it was.

type TopLevelKeySpan = { valueStart: number; valueEnd: number };

// Scans a JSON/JSONC object body and records, for every top-level key, the exact
// character range its value occupies in the source text. String-, comment- and
// depth-aware so that keys nested inside objects or arrays are not mistaken for
// top-level ones.
const mapTopLevelKeySpans = (input: string): Map<string, TopLevelKeySpan> | null => {
  const spans = new Map<string, TopLevelKeySpan>();
  let i = 0;
  let depth = 0;
  let pendingKey: string | null = null;
  let valueStart = -1;

  const skipTrivia = (from: number): number => {
    let j = from;
    while (j < input.length) {
      const char = input[j];
      if (char === '/' && input[j + 1] === '/') {
        while (j < input.length && input[j] !== '\n') j += 1;
        continue;
      }
      if (char === '/' && input[j + 1] === '*') {
        j += 2;
        while (j < input.length && !(input[j] === '*' && input[j + 1] === '/')) j += 1;
        j += 2;
        continue;
      }
      if (char === ' ' || char === '\t' || char === '\n' || char === '\r') {
        j += 1;
        continue;
      }
      break;
    }
    return j;
  };

  const readString = (from: number): { value: string; end: number } | null => {
    if (input[from] !== '"') return null;
    let j = from + 1;
    let value = '';
    while (j < input.length) {
      const char = input[j];
      if (char === '\\') {
        value += char + (input[j + 1] ?? '');
        j += 2;
        continue;
      }
      if (char === '"') return { value, end: j + 1 };
      value += char;
      j += 1;
    }
    return null;
  };

  i = skipTrivia(i);
  if (input[i] !== '{') return null;

  while (i < input.length) {
    i = skipTrivia(i);
    if (i >= input.length) break;
    const char = input[i];

    if (char === '{' || char === '[') {
      depth += 1;
      i += 1;
      continue;
    }

    if (char === '}' || char === ']') {
      if (pendingKey !== null && valueStart >= 0 && depth === 1) {
        spans.set(pendingKey, { valueStart, valueEnd: i });
        pendingKey = null;
        valueStart = -1;
      }
      depth -= 1;
      i += 1;
      continue;
    }

    if (char === ',' && depth === 1) {
      if (pendingKey !== null && valueStart >= 0) {
        spans.set(pendingKey, { valueStart, valueEnd: i });
        pendingKey = null;
        valueStart = -1;
      }
      i += 1;
      continue;
    }

    if (char === '"') {
      const str = readString(i);
      if (!str) return null;
      const afterKey = skipTrivia(str.end);
      if (depth === 1 && input[afterKey] === ':' && pendingKey === null) {
        pendingKey = str.value;
        valueStart = skipTrivia(afterKey + 1);
        i = valueStart;
        continue;
      }
      i = str.end;
      continue;
    }

    i += 1;
  }

  return depth === 0 ? spans : null;
};

// Trims trailing whitespace a value span picked up before the following comma or
// brace, so a replacement does not leave stray blanks behind.
const trimSpanEnd = (input: string, end: number): number => {
  let j = end;
  while (j > 0 && /\s/.test(input[j - 1])) j -= 1;
  return j;
};

// Serializes one top-level value with the indentation the file already uses.
const serializeValue = (value: unknown, indent: string): string => {
  const text = JSON.stringify(value, null, 2) ?? 'null';
  return text.split('\n').join(`\n${indent}`);
};

// Detects the indentation applied to top-level entries, so injected values line up
// with the user's own formatting instead of forcing two spaces.
const detectIndent = (input: string): string => {
  const match = input.match(/\n([ \t]+)"/);
  return match ? match[1] : '  ';
};

/**
 * Applies `updates` to the top-level keys of a JSON/JSONC document while keeping
 * every byte outside the replaced values intact.
 *
 * Returns null when the document cannot be edited safely — malformed input, a
 * non-object root, or a new key that has to be inserted into an empty object. The
 * caller is expected to fall back to a full rewrite in that case, which is what
 * the previous behaviour always did.
 */
export const applyJsoncTopLevelUpdates = (
  raw: string,
  updates: Record<string, unknown>,
): string | null => {
  const keys = Object.keys(updates);
  if (keys.length === 0) return raw;

  const spans = mapTopLevelKeySpans(raw);
  if (!spans) return null;

  const indent = detectIndent(raw);
  const edits: { start: number; end: number; text: string }[] = [];
  const insertions: string[] = [];

  for (const key of keys) {
    const span = spans.get(key);
    const serialized = serializeValue(updates[key], indent);
    if (span) {
      edits.push({
        start: span.valueStart,
        end: trimSpanEnd(raw, span.valueEnd),
        text: serialized,
      });
    } else {
      insertions.push(`${JSON.stringify(key)}: ${serialized}`);
    }
  }

  let out = raw;
  // Apply right-to-left so earlier offsets stay valid.
  for (const edit of edits.sort((a, b) => b.start - a.start)) {
    out = out.slice(0, edit.start) + edit.text + out.slice(edit.end);
  }

  if (insertions.length > 0) {
    const closing = out.lastIndexOf('}');
    if (closing < 0) return null;
    const before = out.slice(0, closing);
    const trimmed = before.replace(/\s+$/, '');
    // An empty object gives no existing entry to anchor formatting to; the caller's
    // full rewrite is a better result than guessing a layout here.
    if (trimmed.endsWith('{')) return null;
    const separator = trimmed.endsWith(',') ? '' : ',';
    out = `${trimmed}${separator}\n${indent}${insertions.join(`,\n${indent}`)}\n${out.slice(closing)}`;
  }

  return out;
};

/**
 * Writes `value` to `filePath`, preserving comments when the target is a .jsonc
 * file that can be edited in place. `changedKeys` limits the surgical edit to the
 * keys the caller actually intends to change; everything else in the file is left
 * untouched.
 *
 * Falls back to a plain pretty-printed JSON rewrite when the file is not .jsonc,
 * does not exist, or cannot be edited safely — i.e. the historical behaviour.
 */
export const stringifyJsoncPreservingComments = (
  filePath: string,
  existingRaw: string | null,
  value: Record<string, unknown>,
  changedKeys: string[],
): string => {
  const fullRewrite = `${JSON.stringify(value, null, 2)}\n`;
  if (!filePath.endsWith('.jsonc') || !existingRaw) return fullRewrite;
  // Nothing to preserve if the file carries no comments.
  if (stripJsonComments(existingRaw) === existingRaw) return fullRewrite;

  const updates: Record<string, unknown> = {};
  for (const key of changedKeys) {
    if (Object.prototype.hasOwnProperty.call(value, key)) updates[key] = value[key];
  }
  // Keys the caller removed cannot be expressed as an in-place value edit.
  const existing = parseJsonObjectText(existingRaw, filePath);
  if (!existing) return fullRewrite;
  if (Object.keys(existing).some((key) => !Object.prototype.hasOwnProperty.call(value, key))) {
    return fullRewrite;
  }
  // Any key the caller changed but did not declare would be silently dropped.
  for (const [key, next] of Object.entries(value)) {
    if (Object.prototype.hasOwnProperty.call(updates, key)) continue;
    if (JSON.stringify(existing[key]) !== JSON.stringify(next)) return fullRewrite;
  }

  const edited = applyJsoncTopLevelUpdates(existingRaw, updates);
  if (edited === null) return fullRewrite;

  // Never ship an edit that does not round-trip to the intended object.
  const verified = parseJsonObjectText(edited, filePath);
  if (!verified || JSON.stringify(verified) !== JSON.stringify(value)) return fullRewrite;
  return edited;
};

/** Reads a file as text, or null when it is missing or unreadable. */
export const readTextFileOrNull = (filePath: string): string | null => {
  try {
    return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : null;
  } catch {
    return null;
  }
};
