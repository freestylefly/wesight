import type { ChildProcess } from 'child_process';
import { spawn } from 'child_process';
import { app } from 'electron';
import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';

const TASKBOARD_PORT = Number(process.env.TASKBOARD_PORT || 47824);
const TASKBOARD_HOST = '127.0.0.1';
const HEALTH_PATH = '/api/projects';

let spawnedChild: ChildProcess | null = null;
let started = false;

const taskboardRoot = (): string =>
  app.isPackaged
    ? path.join(process.resourcesPath, 'taskboard')
    : path.join(__dirname, '..', 'resources', 'taskboard');

export const getTaskboardDataDir = (): string =>
  process.env.TASKBOARD_DATA_DIR || path.join(app.getPath('userData'), 'taskboard');

const pingTaskboard = (timeoutMs = 800): Promise<boolean> =>
  new Promise((resolve) => {
    const req = http.get(
      { host: TASKBOARD_HOST, port: TASKBOARD_PORT, path: HEALTH_PATH, timeout: timeoutMs },
      (res) => {
        res.resume();
        resolve(res.statusCode === 200);
      },
    );
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    req.on('error', () => resolve(false));
  });

const waitForTaskboard = async (attempts = 20, intervalMs = 250): Promise<boolean> => {
  for (let i = 0; i < attempts; i += 1) {
    if (await pingTaskboard()) return true;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return false;
};

const findLegacyDataDir = (): string | null => {
  const pluginsRoot = path.join(os.homedir(), '.claude', 'plugins');
  const matches: string[] = [];
  const walk = (dir: string, depth: number) => {
    if (depth > 5) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const full = path.join(dir, entry.name);
      if (entry.name === '.data' && fs.existsSync(path.join(full, 'taskboard.sqlite'))) {
        matches.push(full);
        continue;
      }
      walk(full, depth + 1);
    }
  };
  walk(pluginsRoot, 0);
  return matches[0] ?? null;
};

const migrateLegacyDataIfNeeded = (dataDir: string) => {
  const dbFile = path.join(dataDir, 'taskboard.sqlite');
  if (fs.existsSync(dbFile)) return;
  const legacyDir = findLegacyDataDir();
  if (!legacyDir) return;
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    for (const file of fs.readdirSync(legacyDir)) {
      fs.copyFileSync(path.join(legacyDir, file), path.join(dataDir, file));
    }
    console.log(`[Taskboard] migrated existing data from ${legacyDir} to ${dataDir}`);
  } catch (error) {
    console.warn('[Taskboard] legacy data migration failed, starting fresh:', error);
  }
};

export const ensureTaskboardServer = async (): Promise<void> => {
  if (started) return;
  started = true;

  if (await pingTaskboard()) {
    console.log(`[Taskboard] external instance already running on ${TASKBOARD_HOST}:${TASKBOARD_PORT}`);
    return;
  }

  const entry = path.join(taskboardRoot(), 'server', 'index.mjs');
  if (!fs.existsSync(entry)) {
    console.warn(`[Taskboard] bundled server not found at ${entry}, skipping autostart`);
    return;
  }

  const dataDir = getTaskboardDataDir();
  migrateLegacyDataIfNeeded(dataDir);
  fs.mkdirSync(dataDir, { recursive: true });

  const logDir = app.getPath('logs');
  fs.mkdirSync(logDir, { recursive: true });
  const logStream = fs.createWriteStream(path.join(logDir, 'taskboard.log'), { flags: 'a' });

  const child = spawn(process.execPath, [entry], {
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      TASKBOARD_PORT: String(TASKBOARD_PORT),
      TASKBOARD_HOST,
      TASKBOARD_DATA_DIR: dataDir,
    },
    stdio: ['ignore', logStream, logStream],
  });
  spawnedChild = child;

  child.on('error', (error) => {
    console.error('[Taskboard] failed to spawn bundled server:', error);
  });
  child.on('exit', (code, signal) => {
    if (spawnedChild === child) spawnedChild = null;
    console.warn(`[Taskboard] bundled server exited (code=${code}, signal=${signal})`);
  });

  const ready = await waitForTaskboard();
  if (ready) {
    console.log(`[Taskboard] bundled server ready at http://${TASKBOARD_HOST}:${TASKBOARD_PORT} (data: ${dataDir})`);
  } else {
    console.warn('[Taskboard] bundled server did not become ready in time, see taskboard.log');
  }
};

export const stopTaskboardServer = (): void => {
  if (spawnedChild) {
    spawnedChild.kill();
    spawnedChild = null;
  }
};
