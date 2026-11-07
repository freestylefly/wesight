import { isDeepStrictEqual } from 'util';

import { ProviderName } from '../../shared/providers';
import { JsonSchemaAnnotation, JsonSchemaKeyword, JsonSchemaType, MoonshotApiHost, MoonshotSchemaError, OpenAIFunctionTool, ToolSchemaField } from './moonshotToolSchema/constants';

type SchemaObject = Record<string, unknown>;

const schemaMaps = new Set<string>([
  JsonSchemaKeyword.Defs,
  JsonSchemaKeyword.Definitions,
  JsonSchemaKeyword.Properties,
  JsonSchemaKeyword.PatternProperties,
  JsonSchemaKeyword.DependentSchemas,
]);
const schemaArrays = new Set<string>([
  JsonSchemaKeyword.AllOf,
  JsonSchemaKeyword.AnyOf,
  JsonSchemaKeyword.OneOf,
  JsonSchemaKeyword.PrefixItems,
]);
const schemaValues = new Set<string>([
  JsonSchemaKeyword.Items,
  JsonSchemaKeyword.AdditionalItems,
  JsonSchemaKeyword.AdditionalProperties,
  JsonSchemaKeyword.UnevaluatedItems,
  JsonSchemaKeyword.UnevaluatedProperties,
  JsonSchemaKeyword.Contains,
  JsonSchemaKeyword.PropertyNames,
  JsonSchemaKeyword.ContentSchema,
  JsonSchemaKeyword.Not,
  JsonSchemaKeyword.If,
  JsonSchemaKeyword.Then,
  JsonSchemaKeyword.Else,
]);
const annotations = new Set<string>(Object.values(JsonSchemaAnnotation));
const moonshotApiHosts = new Set<string>(Object.values(MoonshotApiHost));

function asObject(value: unknown): SchemaObject | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as SchemaObject
    : undefined;
}

function resolveLocalReference(root: unknown, reference: string): unknown {
  if (reference === '#') return root;
  if (!reference.startsWith('#/')) return undefined;
  let current: unknown = root;
  let pointer: string;
  try {
    pointer = decodeURIComponent(reference.slice(2));
  } catch {
    return undefined;
  }
  for (const part of pointer.split('/')) {
    const key = part.replace(/~1/g, '/').replace(/~0/g, '~');
    if (current === null || typeof current !== 'object' || !Object.hasOwn(current, key)) return undefined;
    current = (current as SchemaObject)[key];
  }
  return current;
}

function appendConstraint(output: SchemaObject, constraint: unknown): void {
  const existing = output[JsonSchemaKeyword.AllOf];
  output[JsonSchemaKeyword.AllOf] = Array.isArray(existing) ? [...existing, constraint] : [constraint];
}

function combineReference(target: unknown, siblings: SchemaObject): unknown {
  if (Object.keys(siblings).length === 0) return target;
  if (target === true) return siblings;
  const targetObject = asObject(target);
  const overlaps = targetObject && Object.keys(siblings).some(key => (
    Object.hasOwn(targetObject, key) && !annotations.has(key) && !isDeepStrictEqual(targetObject[key], siblings[key])
  ));
  if (!targetObject || overlaps) {
    // Keep sibling definitions at their original JSON pointer locations.
    const combined = { ...siblings };
    appendConstraint(combined, target);
    return combined;
  }
  return { ...targetObject, ...siblings };
}

function hasSchemaReference(schema: unknown): boolean {
  const source = asObject(schema);
  if (!source) return false;
  if (Object.hasOwn(source, JsonSchemaKeyword.Ref)) return true;
  for (const [key, child] of Object.entries(source)) {
    const map = asObject(child);
    if ((schemaMaps.has(key) || key === JsonSchemaKeyword.Dependencies) && map) {
      if (Object.values(map).some(item => !Array.isArray(item) && hasSchemaReference(item))) return true;
    } else if ((schemaArrays.has(key) || key === JsonSchemaKeyword.Items) && Array.isArray(child)) {
      if (child.some(hasSchemaReference)) return true;
    } else if (schemaValues.has(key) && hasSchemaReference(child)) {
      return true;
    }
  }
  return false;
}

/** Expand finite local references while retaining recursive references and their definitions. */
export function normalizeMoonshotToolSchema(schema: unknown): unknown {
  const root = schema;
  function visit(value: unknown, ancestors: ReadonlySet<object>): unknown {
    const source = asObject(value);
    if (!source) return structuredClone(value);
    const nextAncestors = new Set(ancestors).add(source);
    const output: SchemaObject = {};
    for (const [key, child] of Object.entries(source)) {
      if (key === JsonSchemaKeyword.Ref || key === JsonSchemaKeyword.OneOf || key === JsonSchemaKeyword.Const) continue;
      const map = asObject(child);
      if (schemaMaps.has(key) && map) {
        output[key] = Object.fromEntries(Object.entries(map).map(([name, item]) => [name, visit(item, nextAncestors)]));
      } else if (key === JsonSchemaKeyword.Dependencies && map) {
        output[key] = Object.fromEntries(Object.entries(map).map(([name, item]) => [
          name, Array.isArray(item) ? structuredClone(item) : visit(item, nextAncestors),
        ]));
      } else if ((schemaArrays.has(key) || key === JsonSchemaKeyword.Items) && Array.isArray(child)) {
        output[key] = child.map(item => visit(item, nextAncestors));
      } else if (schemaValues.has(key)) {
        output[key] = visit(child, nextAncestors);
      } else {
        // Annotation and literal values may contain schema-like property names.
        Object.defineProperty(output, key, { value: structuredClone(child), enumerable: true, writable: true, configurable: true });
      }
    }

    const oneOf = source[JsonSchemaKeyword.OneOf];
    if (Array.isArray(oneOf)) {
      const alternatives = oneOf.map(item => visit(item, nextAncestors));
      if (Object.hasOwn(output, JsonSchemaKeyword.AnyOf)) {
        appendConstraint(output, { [JsonSchemaKeyword.AnyOf]: alternatives });
      } else {
        output[JsonSchemaKeyword.AnyOf] = alternatives;
      }
    } else if (Object.hasOwn(source, JsonSchemaKeyword.OneOf)) {
      output[JsonSchemaKeyword.OneOf] = structuredClone(oneOf);
    }

    if (Object.hasOwn(source, JsonSchemaKeyword.Const)) {
      const literal = source[JsonSchemaKeyword.Const];
      if (literal === null && (output[JsonSchemaKeyword.Type] === undefined
        || output[JsonSchemaKeyword.Type] === JsonSchemaType.Null
        || (Array.isArray(output[JsonSchemaKeyword.Type]) && (output[JsonSchemaKeyword.Type] as unknown[]).includes(JsonSchemaType.Null)))) {
        output[JsonSchemaKeyword.Type] = JsonSchemaType.Null;
      } else if (typeof literal === 'string' || typeof literal === 'number') {
        const constraint = { [JsonSchemaKeyword.Enum]: [literal] };
        if (Object.hasOwn(output, JsonSchemaKeyword.Enum)) appendConstraint(output, constraint);
        else output[JsonSchemaKeyword.Enum] = [literal];
      } else {
        output[JsonSchemaKeyword.Const] = structuredClone(literal);
      }
    }

    const reference = source[JsonSchemaKeyword.Ref];
    if (typeof reference === 'string') {
      const target = resolveLocalReference(root, reference);
      if ((target === true || target === false || asObject(target)) && !nextAncestors.has(target as object)) {
        return combineReference(visit(target, nextAncestors), output);
      }
      output[JsonSchemaKeyword.Ref] = reference;
    } else if (Object.hasOwn(source, JsonSchemaKeyword.Ref)) {
      output[JsonSchemaKeyword.Ref] = structuredClone(reference);
    }
    return output;
  }
  const normalized = visit(schema, new Set());
  const rootObject = asObject(normalized);
  if (rootObject && !hasSchemaReference(rootObject)) {
    delete rootObject[JsonSchemaKeyword.Defs];
    delete rootObject[JsonSchemaKeyword.Definitions];
  }
  return normalized;
}

function isMoonshotProvider(provider?: string, baseURL?: string): boolean {
  if (provider === ProviderName.Moonshot) return true;
  if (!baseURL) return false;
  try {
    return moonshotApiHosts.has(new URL(baseURL).hostname.toLowerCase());
  } catch {
    return false;
  }
}

/** Normalize both Chat Completions and Responses function-tool shapes for Moonshot. */
export function sanitizeToolsForMoonshot(request: Record<string, unknown>, provider?: string, baseURL?: string): void {
  if (!isMoonshotProvider(provider, baseURL) || !Array.isArray(request.tools)) return;
  request.tools = request.tools.map(tool => {
    const source = asObject(tool);
    if (!source) return tool;
    const output = { ...source };
    const functionObject = asObject(source.function);
    if (functionObject && Object.hasOwn(functionObject, ToolSchemaField.Parameters)) {
      output.function = { ...functionObject, parameters: normalizeMoonshotToolSchema(functionObject.parameters) };
    }
    if (Object.hasOwn(source, ToolSchemaField.Parameters)) output.parameters = normalizeMoonshotToolSchema(source.parameters);
    return output;
  });
}

/** Recover only after Moonshot explicitly rejects its function-schema size. */
export function removeLargestMoonshotToolForSchemaSizeError(
  request: Record<string, unknown>,
  errorMessage: string,
  provider?: string,
  baseURL?: string,
): string | undefined {
  if (!isMoonshotProvider(provider, baseURL) || !Array.isArray(request.tools)) return undefined;
  const message = errorMessage.toLowerCase();
  if (!message.includes(MoonshotSchemaError.InvalidSchema) || !message.includes(MoonshotSchemaError.MaximumSize)) return undefined;

  const candidates: Array<{ index: number; name: string; bytes: number }> = [];
  request.tools.forEach((tool, index) => {
    const source = asObject(tool);
    if (source?.type !== OpenAIFunctionTool.Type) return;
    const definition = asObject(source.function) ?? source;
    if (typeof definition.name !== 'string' || !definition.name) return;
    try {
      const serialized = JSON.stringify(definition.parameters === undefined ? {} : definition.parameters);
      if (serialized !== undefined) candidates.push({ index, name: definition.name, bytes: Buffer.byteLength(serialized, 'utf8') });
    } catch {
      // An unserializable definition cannot participate in an upstream JSON request.
    }
  });
  if (candidates.length < 2) return undefined;
  const largest = candidates.reduce((current, candidate) => candidate.bytes > current.bytes ? candidate : current);
  request.tools = request.tools.filter((_tool, index) => index !== largest.index);

  const choice = asObject(request.tool_choice);
  const forcedName = asObject(choice?.function)?.name ?? choice?.name;
  if (forcedName === largest.name) request.tool_choice = OpenAIFunctionTool.AutoChoice;
  return largest.name;
}
