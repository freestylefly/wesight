import { afterEach, expect, test, vi } from 'vitest';

import { ProviderName } from '../../shared/providers';
import {
  configureCoworkOpenAICompatProxy,
  getCoworkOpenAICompatProxyBaseURL,
  startCoworkOpenAICompatProxy,
  stopCoworkOpenAICompatProxy,
} from './coworkOpenAICompatProxy';

const upstream = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock('electron', () => ({ session: { defaultSession: upstream } }));

afterEach(async () => {
  await stopCoworkOpenAICompatProxy();
  upstream.fetch.mockReset();
});

// Mirrors the referenced, discriminated step list published by REA's MCP tool.
const parameters = {
  type: 'object',
  properties: { steps: { $ref: '#/$defs/steps' } },
  required: ['steps'],
  $defs: {
    steps: { type: 'array', minItems: 1, items: { $ref: '#/$defs/step' } },
    step: {
      oneOf: [
        {
          type: 'object',
          properties: { kind: { type: 'string', const: 'wait' }, milliseconds: { type: 'integer', minimum: 0 } },
          required: ['kind', 'milliseconds'],
          additionalProperties: false,
        },
        {
          type: 'object',
          properties: { kind: { type: 'string', const: 'click' }, path: { type: 'array', items: { type: 'integer' } } },
          required: ['kind', 'path'],
          additionalProperties: false,
        },
      ],
    },
  },
};

test.each([
  {
    path: '/v1/messages',
    body: { messages: [{ role: 'user', content: 'Reply OK' }], tools: [{ name: 'capture_scenario', input_schema: parameters }] },
  },
  {
    path: '/v1/chat/completions',
    body: { messages: [{ role: 'user', content: 'Reply OK' }], tools: [{ type: 'function', function: { name: 'capture_scenario', parameters } }] },
  },
  {
    path: '/v1/responses',
    body: { input: 'Reply OK', tools: [{ type: 'function', name: 'capture_scenario', parameters }] },
  },
])('normalizes Moonshot tool schemas at the $path upstream boundary', async ({ path, body }) => {
  upstream.fetch.mockImplementation(async () => Response.json({
    id: 'fixture-response',
    model: 'fixture-model',
    choices: [{ index: 0, message: { role: 'assistant', content: 'OK' }, finish_reason: 'stop' }],
  }, { headers: { 'Transfer-Encoding': 'chunked' } }));
  configureCoworkOpenAICompatProxy({
    provider: ProviderName.Moonshot,
    baseURL: 'https://api.moonshot.cn/v1',
    apiKey: 'fixture-key',
    model: 'fixture-model',
  });
  await startCoworkOpenAICompatProxy();
  const response = await fetch(`${getCoworkOpenAICompatProxyBaseURL()}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, model: 'fixture-model', stream: false, max_tokens: 64 }),
  });
  expect(response.status).toBe(200);
  await response.text();
  expect(upstream.fetch).toHaveBeenCalledOnce();
  const forwarded = JSON.parse(upstream.fetch.mock.calls[0][1].body);
  const schema = forwarded.tools[0].function.parameters;
  expect(schema).toMatchObject({
    required: ['steps'],
    properties: {
      steps: {
        type: 'array',
        minItems: 1,
        items: { anyOf: [
          { required: ['kind', 'milliseconds'], properties: { kind: { enum: ['wait'] }, milliseconds: { minimum: 0 } } },
          { required: ['kind', 'path'], properties: { kind: { enum: ['click'] }, path: { items: { type: 'integer' } } } },
        ] },
      },
    },
  });
  expect(JSON.stringify(schema)).not.toContain('"$ref"');
  expect(JSON.stringify(schema)).not.toContain('"oneOf"');
  expect(parameters.$defs.step.oneOf[0].properties.kind.const).toBe('wait');
});

test('retries only the server-rejected schema size while preserving the remaining tools and conversation', async () => {
  const sent: Record<string, unknown>[] = [];
  upstream.fetch.mockImplementation(async (_url, init) => {
    const body = JSON.parse(init.body);
    sent.push(body);
    return body.tools.some((tool: { function: { name: string } }) => tool.function.name === 'oversized_tool')
      ? Response.json({ error: { message: 'Invalid request: tools.function.parameters is not a valid moonshot flavored json schema, details: <At path root: schema exceeds maximum allowed size>' } }, { status: 400 })
      : Response.json({ id: 'recovered-response', choices: [{ index: 0, message: { role: 'assistant', content: 'OK' }, finish_reason: 'stop' }] });
  });
  configureCoworkOpenAICompatProxy({ provider: ProviderName.Moonshot, baseURL: 'https://api.moonshot.cn/v1', model: 'fixture-model' });
  await startCoworkOpenAICompatProxy();
  const response = await fetch(`${getCoworkOpenAICompatProxyBaseURL()}/v1/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'fixture-model',
      messages: [{ role: 'user', content: 'Analyze the project' }],
      tools: [
        { name: 'oversized_tool', input_schema: { type: 'object', description: 'Large definition '.repeat(100), properties: {} } },
        { name: 'Read', input_schema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } },
      ],
      tool_choice: { type: 'tool', name: 'oversized_tool' },
      stream: false,
    }),
  });
  expect(response.status).toBe(200);
  await response.text();
  expect(upstream.fetch).toHaveBeenCalledTimes(2);
  expect(sent[1].tools).toEqual([expect.objectContaining({ function: expect.objectContaining({ name: 'Read' }) })]);
  expect(sent[1].messages).toEqual(sent[0].messages);
  expect(sent[1].tool_choice).toBe('auto');
});
