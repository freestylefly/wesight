import { expect, test } from 'vitest';

import { ProviderName } from '../../shared/providers';
import { normalizeMoonshotToolSchema, removeLargestMoonshotToolForSchemaSizeError, sanitizeToolsForMoonshot } from './moonshotToolSchema';
import { JsonSchemaKeyword as Keyword, JsonSchemaType as Type, MoonshotApiHost, MoonshotSchemaError, OpenAIFunctionTool } from './moonshotToolSchema/constants';

// Distilled from the installed REA MCP capture_native_ui_scenario schema.
function reaScenarioSchema() {
  return {
    type: Type.Object,
    properties: { steps: { $ref: `#/${Keyword.Defs}/__schema6` } },
    required: ['steps'],
    additionalProperties: false,
    $defs: {
      __schema6: { minItems: 1, type: Type.Array, items: { $ref: `#/${Keyword.Defs}/__schema7` } },
      __schema7: {
        oneOf: [
          {
            type: Type.Object,
            properties: {
              kind: { type: Type.String, const: 'click' },
              path: { maxItems: 32, type: Type.Array, items: { $ref: `#/${Keyword.Defs}/__schema8` } },
            },
            required: ['kind', 'path'],
            additionalProperties: false,
          },
          {
            type: Type.Object,
            properties: {
              kind: { type: Type.String, const: 'wait' },
              milliseconds: { type: Type.Integer, minimum: 0, maximum: 180000 },
            },
            required: ['kind', 'milliseconds'],
            additionalProperties: false,
          },
        ],
      },
      __schema8: { type: Type.Integer, minimum: 0, maximum: 9007199254740991 },
    },
  };
}

test('expands the observed REA steps references into a finite Moonshot-compatible schema without dropping constraints', () => {
  const schema = reaScenarioSchema();
  const original = structuredClone(schema);
  const normalized = normalizeMoonshotToolSchema(schema) as typeof schema;
  expect(normalized.properties.steps).toEqual({
    minItems: 1,
    type: Type.Array,
    items: {
      anyOf: [
        {
          type: Type.Object,
          properties: {
            kind: { type: Type.String, enum: ['click'] },
            path: { maxItems: 32, type: Type.Array, items: { type: Type.Integer, minimum: 0, maximum: 9007199254740991 } },
          },
          required: ['kind', 'path'],
          additionalProperties: false,
        },
        {
          type: Type.Object,
          properties: {
            kind: { type: Type.String, enum: ['wait'] },
            milliseconds: { type: Type.Integer, minimum: 0, maximum: 180000 },
          },
          required: ['kind', 'milliseconds'],
          additionalProperties: false,
        },
      ],
    },
  });
  expect(normalized.required).toEqual(['steps']);
  expect(normalized.additionalProperties).toBe(false);
  expect(JSON.stringify(normalized)).not.toContain(`"${Keyword.Ref}"`);
  expect(schema).toEqual(original);
});

test('resolves escaped JSON pointer names and legacy definitions, preserving reference descriptions', () => {
  const schema = {
    type: Type.Object,
    properties: { label: { $ref: `#/${Keyword.Definitions}/a~1b~0c`, description: 'Visible label' } },
    definitions: { 'a/b~c': { type: Type.String, minLength: 1, maxLength: 20 } },
  };
  expect(normalizeMoonshotToolSchema(schema)).toMatchObject({
    properties: { label: { type: Type.String, minLength: 1, maxLength: 20, description: 'Visible label' } },
  });
});

test('preserves real recursive references, their definitions and nullable termination branches', () => {
  const nodeRef = `#/${Keyword.Defs}/node`;
  const schema = {
    type: Type.Object,
    properties: { head: { $ref: nodeRef } },
    $defs: {
      node: {
        type: Type.Object,
        properties: { next: { anyOf: [{ $ref: nodeRef }, { type: Type.Null }] } },
        required: ['next'],
      },
    },
  };
  const normalized = normalizeMoonshotToolSchema(schema);
  expect(normalized).toMatchObject({
    properties: { head: schema.$defs.node },
    $defs: { node: schema.$defs.node },
  });
  expect(JSON.stringify(normalized)).toContain(nodeRef);
  expect(JSON.stringify(normalized).length).toBeLessThan(2000);
  expect(normalizeMoonshotToolSchema({ $ref: '#' })).toEqual({ $ref: '#' });
});

test('does not interpret reserved property names or annotation and literal values as schemas', () => {
  const literal = { oneOf: [{ const: 'data' }], $ref: `#/${Keyword.Defs}/missing`, definitions: { value: 'data' } };
  const schema = {
    type: Type.Object,
    properties: {
      oneOf: { type: Type.String, const: 'field value' },
      const: { default: literal, examples: [literal], enum: [literal] },
      definitions: { const: literal },
    },
    default: literal,
    examples: [literal],
  };
  const normalized = normalizeMoonshotToolSchema(schema);
  expect(normalized).toEqual({
    ...schema,
    properties: {
      ...schema.properties,
      oneOf: { type: Type.String, enum: ['field value'] },
    },
  });
});

test('retains intersecting reference siblings and multiple combinators instead of overwriting them', () => {
  const schema = {
    $ref: `#/${Keyword.Defs}/base`,
    type: Type.Object,
    properties: { child: { items: [{ const: 0 }, false], additionalProperties: { oneOf: [{ const: null }, { const: true }] } } },
    anyOf: [{ const: 1 }],
    oneOf: [{ const: 2 }],
    $defs: { base: { type: Type.String, minLength: 2 } },
  };
  const normalized = normalizeMoonshotToolSchema(schema);
  expect(normalized).toMatchObject({
    type: Type.Object,
    anyOf: [{ enum: [1] }],
    properties: { child: { items: [{ enum: [0] }, false], additionalProperties: { anyOf: [{ type: Type.Null }, { const: true }] } } },
    allOf: [
      { anyOf: [{ enum: [2] }] },
      { type: Type.String, minLength: 2 },
    ],
  });
  expect(normalized).not.toHaveProperty(Keyword.Defs);
});

test('merges equivalent reference constraints and removes definitions after all finite references are expanded', () => {
  const schema = {
    type: Type.Object,
    properties: { path: { $ref: `#/${Keyword.Defs}/path`, type: Type.String, minLength: 1, description: 'Path' } },
    $defs: { path: { type: Type.String, minLength: 1, pattern: '^[^\\x00]*$' } },
    definitions: { unused: { type: Type.String } },
    default: { $ref: 'literal annotation value' },
  };
  expect(normalizeMoonshotToolSchema(schema)).toEqual({
    type: Type.Object,
    properties: { path: { type: Type.String, minLength: 1, pattern: '^[^\\x00]*$', description: 'Path' } },
    default: schema.default,
  });
});

test('uses the null type and retains exact boolean constants without introducing unsupported enum members', () => {
  expect(normalizeMoonshotToolSchema({ const: null })).toEqual({ type: Type.Null });
  expect(normalizeMoonshotToolSchema({ const: true })).toEqual({ const: true });
  expect(normalizeMoonshotToolSchema({ type: Type.String, const: null })).toEqual({ type: Type.String, const: null });
});

test('keeps recursive root definitions resolvable when a reference and its siblings constrain the same field', () => {
  const reference = `#/${Keyword.Defs}/node`;
  const schema = {
    $ref: reference,
    type: Type.Object,
    minProperties: 2,
    $defs: { node: { type: Type.Object, minProperties: 1, properties: { next: { anyOf: [{ $ref: reference }, { type: Type.Null }] } } } },
  };
  const normalized = normalizeMoonshotToolSchema(schema);
  expect(normalized).toMatchObject({ type: Type.Object, $defs: schema.$defs });
  expect(normalized).toHaveProperty(Keyword.AllOf);
  expect(JSON.stringify(normalized)).toContain(reference);
});

test('preserves unknown or remote references and unconstrained schemas', () => {
  const schema = { properties: { missing: { $ref: `#/${Keyword.Defs}/missing` }, remote: { $ref: 'https://example.test/schema' }, empty: {} } };
  expect(normalizeMoonshotToolSchema(schema)).toEqual(schema);
  expect(normalizeMoonshotToolSchema(false)).toBe(false);
});

test('normalizes nested and flat function tools without mutating the original tool objects', () => {
  const schema = reaScenarioSchema();
  const nested = { function: { name: 'capture', parameters: schema } };
  const flat = { name: 'capture', parameters: schema };
  const request = { tools: [nested, flat] };
  sanitizeToolsForMoonshot(request, ProviderName.Moonshot);
  expect(request.tools[0]).toMatchObject({ function: { parameters: { properties: { steps: { type: Type.Array } } } } });
  expect(request.tools[1]).toMatchObject({ parameters: { properties: { steps: { type: Type.Array } } } });
  expect(nested.function.parameters.properties.steps).toHaveProperty(Keyword.Ref);
  expect(flat.parameters.properties.steps).toHaveProperty(Keyword.Ref);
});

test('accepts only the explicit Moonshot provider or exact official API hosts', () => {
  for (const host of Object.values(MoonshotApiHost)) {
    const request = { tools: [{ parameters: { const: 'value' } }] };
    sanitizeToolsForMoonshot(request, undefined, `https://${host}/v1`);
    expect(request.tools[0].parameters).toEqual({ enum: ['value'] });
  }
  for (const url of ['https://api.kimi.com.attacker.test/v1', 'https://proxy.test/api.moonshot.cn', 'invalid-url']) {
    const request = { tools: [{ parameters: { const: 'value' } }] };
    const originalTools = request.tools;
    sanitizeToolsForMoonshot(request, ProviderName.OpenAI, url);
    expect(request.tools).toBe(originalTools);
    expect(request.tools[0].parameters).toEqual({ const: 'value' });
  }
});

const schemaSizeError = `Invalid request: tools.function.parameters is ${MoonshotSchemaError.InvalidSchema}, details: <At path root: ${MoonshotSchemaError.MaximumSize}>`;

test('recovers a confirmed size error by removing only the largest function schema and preserving history and remaining definitions', () => {
  const small = { type: OpenAIFunctionTool.Type, function: { name: 'read_file', parameters: { type: Type.Object } } };
  const large = { type: OpenAIFunctionTool.Type, function: { name: 'compare_web_captures', parameters: { description: 'large schema '.repeat(100), type: Type.Object } } };
  const otherTool = { type: 'web_search_preview' };
  const messages = [{ role: 'user', content: 'Analyze the project' }];
  const request = { tools: [small, large, otherTool], messages, tool_choice: { type: OpenAIFunctionTool.Type, function: { name: large.function.name } } };
  expect(removeLargestMoonshotToolForSchemaSizeError(request, schemaSizeError, ProviderName.Moonshot)).toBe(large.function.name);
  expect(request.tools).toEqual([small, otherTool]);
  expect(request.tools[0]).toBe(small);
  expect(request.tools[1]).toBe(otherTool);
  expect(request.messages).toBe(messages);
  expect(request.tool_choice).toBe(OpenAIFunctionTool.AutoChoice);
  expect(large.function.parameters.description).toBe('large schema '.repeat(100));
});

test('supports Responses function tools and resets only a forced choice naming the removed tool', () => {
  const small = { type: OpenAIFunctionTool.Type, name: 'read_file', parameters: {} };
  const large = { type: OpenAIFunctionTool.Type, name: 'compare', parameters: { description: 'large schema' } };
  for (const name of [small.name, large.name]) {
    const request = { tools: [small, large], tool_choice: { type: OpenAIFunctionTool.Type, name } };
    expect(removeLargestMoonshotToolForSchemaSizeError(request, schemaSizeError, undefined, `https://${MoonshotApiHost.KimiChina}/coding/v1`)).toBe(large.name);
    expect(request.tools).toEqual([small]);
    expect(request.tool_choice).toEqual(name === large.name ? OpenAIFunctionTool.AutoChoice : { type: OpenAIFunctionTool.Type, name });
  }
});

test('does not remove tools for other errors or providers', () => {
  const tools = [
    { type: OpenAIFunctionTool.Type, name: 'read_file', parameters: {} },
    { type: OpenAIFunctionTool.Type, name: 'compare', parameters: { type: Type.Object } },
  ];
  for (const message of [
    `Invalid request: tools.function.parameters is ${MoonshotSchemaError.InvalidSchema}, details: recursive schema`,
    `Another provider reports ${MoonshotSchemaError.MaximumSize}`,
  ]) {
    const request = { tools };
    expect(removeLargestMoonshotToolForSchemaSizeError(request, message, ProviderName.Moonshot)).toBeUndefined();
    expect(request.tools).toBe(tools);
  }
  const request = { tools };
  expect(removeLargestMoonshotToolForSchemaSizeError(request, schemaSizeError, ProviderName.OpenAI)).toBeUndefined();
  expect(request.tools).toBe(tools);
});

test('keeps the last function tool even when other built-in tool types remain', () => {
  const tools = [{ type: OpenAIFunctionTool.Type, name: 'compare', parameters: { type: Type.Object } }, { type: 'web_search_preview' }];
  const request = { tools };
  expect(removeLargestMoonshotToolForSchemaSizeError(request, schemaSizeError, ProviderName.Moonshot)).toBeUndefined();
  expect(request.tools).toBe(tools);
});
