#!/usr/bin/env node

const fs = require('fs');
const https = require('https');
const path = require('path');

const args = process.argv.slice(2);
const value = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

const prompt = value('--prompt');
const region = value('--region', 'global');
const model = value('--model', 'MiniMax-H3');
const resolution = value('--resolution', '2K');
const duration = Number(value('--duration', '6'));
const ratio = value('--ratio', 'adaptive');
const output = path.resolve(value('--output', 'minimax-video.mp4'));
const pollInterval = Number(value('--poll-interval', '5')) * 1000;
const apiKey = process.env.MINIMAX_API_KEY;
const host = region === 'cn' ? 'api.minimaxi.com' : 'api.minimax.io';

if (!prompt || !apiKey) {
  console.error('Both --prompt and MINIMAX_API_KEY are required.');
  process.exit(1);
}
if (!Number.isInteger(duration) || duration < 4 || duration > 15) {
  console.error('--duration must be an integer from 4 to 15.');
  process.exit(1);
}

function request(method, requestPath, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : undefined;
    const req = https.request({
      hostname: host,
      path: requestPath,
      method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        const parsed = JSON.parse(data || '{}');
        if (res.statusCode < 200 || res.statusCode >= 300) reject(new Error(parsed.message || `HTTP ${res.statusCode}`));
        else resolve(parsed);
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function download(url) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(output), { recursive: true });
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) return download(res.headers.location).then(resolve, reject);
      if (res.statusCode !== 200) return reject(new Error(`Download failed: HTTP ${res.statusCode}`));
      const file = fs.createWriteStream(output);
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
      file.on('error', reject);
    }).on('error', reject);
  });
}

async function main() {
  const created = await request('POST', '/v2/video_generation', {
    model,
    content: [{ type: 'text', text: prompt }],
    resolution,
    duration,
    ratio,
  });
  if (!created.task_id) throw new Error('The create response did not include task_id.');

  while (true) {
    const result = await request('GET', `/v2/query/video_generation/${encodeURIComponent(created.task_id)}`);
    const task = result.task || result;
    if (task.status === 'Success' || task.status === 'success' || task.status === 'completed') {
      if (!task.content?.url) throw new Error('The completed task did not include task.content.url.');
      await download(task.content.url);
      console.log(output);
      return;
    }
    if (task.status === 'Failed' || task.status === 'failed') throw new Error(task.error || 'Video generation failed.');
    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
