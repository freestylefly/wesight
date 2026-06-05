import type Database from 'better-sqlite3';

const addColumnIfMissing = (
  db: Database.Database,
  tableName: string,
  columnName: string,
  definition: string
): void => {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
  if (columns.some((column) => column.name === columnName)) {
    return;
  }
  db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
};

export const ensureCreatorProductionSchema = (db: Database.Database): void => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS production_runs (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      domain TEXT NOT NULL DEFAULT 'creator_studio',
      status TEXT NOT NULL,
      session_id TEXT,
      provider TEXT,
      model TEXT,
      agent_id TEXT,
      skill_ids_json TEXT NOT NULL DEFAULT '[]',
      runtime_call_id TEXT,
      input_asset_ids_json TEXT NOT NULL DEFAULT '[]',
      output_asset_ids_json TEXT NOT NULL DEFAULT '[]',
      template_id TEXT,
      variant_of_asset_id TEXT,
      case_ids TEXT NOT NULL DEFAULT '[]',
      prompt_spec TEXT,
      prompt_text TEXT NOT NULL DEFAULT '',
      metadata TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      completed_at INTEGER
    );
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_production_runs_session_id
    ON production_runs(session_id);
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_production_runs_created_at
    ON production_runs(created_at DESC);
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS production_assets (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      title TEXT,
      status TEXT NOT NULL,
      source TEXT NOT NULL,
      run_id TEXT,
      source_run_id TEXT,
      variant_of_asset_id TEXT,
      session_id TEXT,
      source_session_id TEXT,
      message_id TEXT,
      source_message_id TEXT,
      template_id TEXT,
      case_ids TEXT NOT NULL DEFAULT '[]',
      case_ids_json TEXT NOT NULL DEFAULT '[]',
      prompt_spec TEXT,
      prompt_spec_json TEXT,
      prompt_text TEXT NOT NULL DEFAULT '',
      file_path TEXT NOT NULL,
      file_name TEXT NOT NULL,
      mime_type TEXT,
      favorite INTEGER NOT NULL DEFAULT 0,
      metadata TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE(session_id, message_id, file_path)
    );
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_production_assets_created_at
    ON production_assets(created_at DESC);
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_production_assets_session_message
    ON production_assets(session_id, message_id);
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_production_assets_run_id
    ON production_assets(run_id);
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_production_assets_variant_of_asset_id
    ON production_assets(variant_of_asset_id);
  `);

  addColumnIfMissing(db, 'production_runs', 'domain', "TEXT NOT NULL DEFAULT 'creator_studio'");
  addColumnIfMissing(db, 'production_runs', 'provider', 'TEXT');
  addColumnIfMissing(db, 'production_runs', 'model', 'TEXT');
  addColumnIfMissing(db, 'production_runs', 'agent_id', 'TEXT');
  addColumnIfMissing(db, 'production_runs', 'skill_ids_json', "TEXT NOT NULL DEFAULT '[]'");
  addColumnIfMissing(db, 'production_runs', 'runtime_call_id', 'TEXT');
  addColumnIfMissing(db, 'production_runs', 'input_asset_ids_json', "TEXT NOT NULL DEFAULT '[]'");
  addColumnIfMissing(db, 'production_runs', 'output_asset_ids_json', "TEXT NOT NULL DEFAULT '[]'");
  addColumnIfMissing(db, 'production_runs', 'variant_of_asset_id', 'TEXT');

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_production_runs_variant_of_asset_id
    ON production_runs(variant_of_asset_id);
  `);

  addColumnIfMissing(db, 'production_assets', 'title', 'TEXT');
  addColumnIfMissing(db, 'production_assets', 'source_run_id', 'TEXT');
  addColumnIfMissing(db, 'production_assets', 'variant_of_asset_id', 'TEXT');
  addColumnIfMissing(db, 'production_assets', 'source_session_id', 'TEXT');
  addColumnIfMissing(db, 'production_assets', 'source_message_id', 'TEXT');
  addColumnIfMissing(db, 'production_assets', 'case_ids_json', "TEXT NOT NULL DEFAULT '[]'");
  addColumnIfMissing(db, 'production_assets', 'prompt_spec_json', 'TEXT');
};
