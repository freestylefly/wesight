import BetterSqlite3 from 'better-sqlite3';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, expect, test, vi } from 'vitest';

import { ExternalAgentConfigSource } from '../shared/cowork/constants';
import { DB_FILENAME } from './appConstants';
import { SqliteStore } from './sqliteStore';

vi.mock('electron', () => ({
  app: {
    getAppPath: () => process.cwd(),
    getPath: () => os.tmpdir(),
  },
}));

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('migrates the old Codex config source default to local CLI', () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wesight-sqlite-'));
  tempDirs.push(userDataDir);
  const dbPath = path.join(userDataDir, DB_FILENAME);
  const db = new BetterSqlite3(dbPath);
  const now = Date.now();
  db.exec(`
    CREATE TABLE kv (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE cowork_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
  db
    .prepare('INSERT INTO cowork_config (key, value, updated_at) VALUES (?, ?, ?)')
    .run('codexConfigSource', ExternalAgentConfigSource.WesightModel, now);
  db.close();

  const store = SqliteStore.create(userDataDir);
  const row = store
    .getDatabase()
    .prepare("SELECT value FROM cowork_config WHERE key = 'codexConfigSource'")
    .get() as { value: string } | undefined;
  const migrationFlag = store.get<string>('cowork.codexConfigSource.defaultLocalCli.v1.completed');
  store.close();

  expect(row?.value).toBe(ExternalAgentConfigSource.LocalCli);
  expect(migrationFlag).toBe('1');
});

test('initializes creator production asset tables', () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wesight-sqlite-'));
  tempDirs.push(userDataDir);

  const store = SqliteStore.create(userDataDir);
  const rows = store
    .getDatabase()
    .prepare(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'table'
        AND name IN (
          'production_assets',
          'production_runs',
          'creator_projects',
          'creator_asset_collections',
          'creator_asset_collection_items',
          'creator_asset_selections'
        )
    `)
    .all() as Array<{ name: string }>;
  const runColumns = store
    .getDatabase()
    .prepare('PRAGMA table_info(production_runs)')
    .all() as Array<{ name: string }>;
  const assetColumns = store
    .getDatabase()
    .prepare('PRAGMA table_info(production_assets)')
    .all() as Array<{ name: string }>;
  store.close();

  const tableNames = new Set(rows.map((row) => row.name));
  const runColumnNames = new Set(runColumns.map((column) => column.name));
  const assetColumnNames = new Set(assetColumns.map((column) => column.name));
  expect(tableNames.has('production_assets')).toBe(true);
  expect(tableNames.has('production_runs')).toBe(true);
  expect(tableNames.has('creator_projects')).toBe(true);
  expect(tableNames.has('creator_asset_collections')).toBe(true);
  expect(tableNames.has('creator_asset_collection_items')).toBe(true);
  expect(tableNames.has('creator_asset_selections')).toBe(true);
  expect(runColumnNames.has('domain')).toBe(true);
  expect(runColumnNames.has('provider')).toBe(true);
  expect(runColumnNames.has('output_asset_ids_json')).toBe(true);
  expect(runColumnNames.has('variant_of_asset_id')).toBe(true);
  expect(assetColumnNames.has('title')).toBe(true);
  expect(assetColumnNames.has('project_id')).toBe(true);
  expect(assetColumnNames.has('variant_of_asset_id')).toBe(true);
  expect(assetColumnNames.has('source_session_id')).toBe(true);
  expect(assetColumnNames.has('prompt_spec_json')).toBe(true);
  expect(assetColumnNames.has('adoption_status')).toBe(true);
  expect(assetColumnNames.has('tags_json')).toBe(true);
  expect(assetColumnNames.has('license_note')).toBe(true);
  expect(assetColumnNames.has('usage_note')).toBe(true);
});
