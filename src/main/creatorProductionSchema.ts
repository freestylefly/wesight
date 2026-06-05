import type Database from 'better-sqlite3';

import { CreatorAssetAdoptionStatus, CreatorStudioDefaultProjectId } from '../shared/creatorStudio/constants';

const CreatorWorkspaceStateKey = {
  CurrentProjectId: 'current_project_id',
} as const;

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
  const now = Date.now();

  db.exec(`
    CREATE TABLE IF NOT EXISTS creator_projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS creator_workspace_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS creator_asset_collections (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_creator_asset_collections_project_id
    ON creator_asset_collections(project_id);
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS creator_asset_collection_items (
      collection_id TEXT NOT NULL,
      asset_id TEXT NOT NULL,
      added_at INTEGER NOT NULL,
      PRIMARY KEY(collection_id, asset_id)
    );
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_creator_asset_collection_items_asset_id
    ON creator_asset_collection_items(asset_id);
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS creator_asset_selections (
      project_id TEXT NOT NULL,
      asset_id TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY(project_id, asset_id)
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS creator_boards (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_creator_boards_project_id
    ON creator_boards(project_id);
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS creator_board_cards (
      id TEXT PRIMARY KEY,
      board_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      title TEXT NOT NULL,
      asset_id TEXT,
      case_id TEXT,
      prompt_text TEXT NOT NULL DEFAULT '',
      prompt_spec_json TEXT,
      direction_json TEXT,
      group_name TEXT,
      notes TEXT,
      position INTEGER NOT NULL,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_creator_board_cards_board_id
    ON creator_board_cards(board_id, position);
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS creator_board_selections (
      board_id TEXT NOT NULL,
      card_id TEXT NOT NULL,
      selected INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY(board_id, card_id)
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS creator_brand_kits (
      project_id TEXT PRIMARY KEY,
      colors_json TEXT NOT NULL DEFAULT '[]',
      logo_asset_id TEXT,
      logo_path TEXT,
      banned_words_json TEXT NOT NULL DEFAULT '[]',
      tone TEXT NOT NULL DEFAULT '',
      visual_preferences TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS creator_batch_runs (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      status TEXT NOT NULL,
      brief_title TEXT NOT NULL,
      prompt_spec_json TEXT NOT NULL,
      prompt_text TEXT NOT NULL,
      summary_json TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      completed_at INTEGER
    );
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_creator_batch_runs_project_created
    ON creator_batch_runs(project_id, created_at DESC);
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS creator_batch_tasks (
      id TEXT PRIMARY KEY,
      batch_run_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      status TEXT NOT NULL,
      direction_id TEXT NOT NULL,
      direction_title TEXT NOT NULL,
      model_id TEXT NOT NULL,
      model_name TEXT NOT NULL,
      template_id TEXT NOT NULL,
      size TEXT NOT NULL,
      prompt_spec_json TEXT NOT NULL,
      prompt_text TEXT NOT NULL,
      asset_ids_json TEXT NOT NULL DEFAULT '[]',
      error TEXT,
      cost_estimate_text TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      completed_at INTEGER
    );
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_creator_batch_tasks_run_position
    ON creator_batch_tasks(batch_run_id, direction_id, model_id, template_id, size);
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_creator_batch_tasks_status
    ON creator_batch_tasks(status);
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS creator_recipes (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      source_prompt_asset_id TEXT,
      prompt_spec_json TEXT NOT NULL,
      default_runtime_json TEXT NOT NULL DEFAULT '{}',
      default_output_json TEXT NOT NULL DEFAULT '{}',
      tags_json TEXT NOT NULL DEFAULT '[]',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_creator_recipes_project_updated
    ON creator_recipes(project_id, updated_at DESC);
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS creator_prompt_versions (
      id TEXT PRIMARY KEY,
      prompt_asset_id TEXT NOT NULL,
      version INTEGER NOT NULL,
      prompt_text TEXT NOT NULL,
      prompt_spec_json TEXT NOT NULL,
      change_note TEXT,
      created_at INTEGER NOT NULL,
      UNIQUE(prompt_asset_id, version)
    );
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_creator_prompt_versions_asset_version
    ON creator_prompt_versions(prompt_asset_id, version DESC);
  `);

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
      prompt_version_id TEXT,
      recipe_id TEXT,
      selected_direction_id TEXT,
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
      project_id TEXT,
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
      parent_prompt_asset_id TEXT,
      prompt_version_id TEXT,
      recipe_id TEXT,
      selected_direction_id TEXT,
      file_path TEXT NOT NULL,
      file_name TEXT NOT NULL,
      mime_type TEXT,
      favorite INTEGER NOT NULL DEFAULT 0,
      adoption_status TEXT NOT NULL DEFAULT 'unset',
      tags_json TEXT NOT NULL DEFAULT '[]',
      license_note TEXT,
      usage_note TEXT,
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

  addColumnIfMissing(db, 'production_runs', 'domain', "TEXT NOT NULL DEFAULT 'creator_studio'");
  addColumnIfMissing(db, 'production_runs', 'provider', 'TEXT');
  addColumnIfMissing(db, 'production_runs', 'model', 'TEXT');
  addColumnIfMissing(db, 'production_runs', 'agent_id', 'TEXT');
  addColumnIfMissing(db, 'production_runs', 'skill_ids_json', "TEXT NOT NULL DEFAULT '[]'");
  addColumnIfMissing(db, 'production_runs', 'runtime_call_id', 'TEXT');
  addColumnIfMissing(db, 'production_runs', 'input_asset_ids_json', "TEXT NOT NULL DEFAULT '[]'");
  addColumnIfMissing(db, 'production_runs', 'output_asset_ids_json', "TEXT NOT NULL DEFAULT '[]'");
  addColumnIfMissing(db, 'production_runs', 'variant_of_asset_id', 'TEXT');
  addColumnIfMissing(db, 'production_runs', 'prompt_version_id', 'TEXT');
  addColumnIfMissing(db, 'production_runs', 'recipe_id', 'TEXT');
  addColumnIfMissing(db, 'production_runs', 'selected_direction_id', 'TEXT');

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_production_runs_variant_of_asset_id
    ON production_runs(variant_of_asset_id);
  `);

  addColumnIfMissing(db, 'production_assets', 'title', 'TEXT');
  addColumnIfMissing(db, 'production_assets', 'project_id', 'TEXT');
  addColumnIfMissing(db, 'production_assets', 'source_run_id', 'TEXT');
  addColumnIfMissing(db, 'production_assets', 'variant_of_asset_id', 'TEXT');
  addColumnIfMissing(db, 'production_assets', 'source_session_id', 'TEXT');
  addColumnIfMissing(db, 'production_assets', 'source_message_id', 'TEXT');
  addColumnIfMissing(db, 'production_assets', 'case_ids_json', "TEXT NOT NULL DEFAULT '[]'");
  addColumnIfMissing(db, 'production_assets', 'prompt_spec_json', 'TEXT');
  addColumnIfMissing(db, 'production_assets', 'parent_prompt_asset_id', 'TEXT');
  addColumnIfMissing(db, 'production_assets', 'prompt_version_id', 'TEXT');
  addColumnIfMissing(db, 'production_assets', 'recipe_id', 'TEXT');
  addColumnIfMissing(db, 'production_assets', 'selected_direction_id', 'TEXT');
  addColumnIfMissing(db, 'production_assets', 'adoption_status', `TEXT NOT NULL DEFAULT '${CreatorAssetAdoptionStatus.Unset}'`);
  addColumnIfMissing(db, 'production_assets', 'tags_json', "TEXT NOT NULL DEFAULT '[]'");
  addColumnIfMissing(db, 'production_assets', 'license_note', 'TEXT');
  addColumnIfMissing(db, 'production_assets', 'usage_note', 'TEXT');

  db.prepare(`
    INSERT OR IGNORE INTO creator_projects (id, name, description, created_at, updated_at)
    VALUES (?, ?, NULL, ?, ?)
  `).run(CreatorStudioDefaultProjectId, 'Default Project', now, now);

  db.prepare(`
    INSERT OR IGNORE INTO creator_workspace_state (key, value, updated_at)
    VALUES (?, ?, ?)
  `).run(CreatorWorkspaceStateKey.CurrentProjectId, CreatorStudioDefaultProjectId, now);

  db.prepare(`
    UPDATE production_assets
    SET project_id = ?
    WHERE project_id IS NULL OR project_id = ''
  `).run(CreatorStudioDefaultProjectId);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_production_assets_project_id
    ON production_assets(project_id);
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_production_assets_variant_of_asset_id
    ON production_assets(variant_of_asset_id);
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_production_assets_prompt_version_id
    ON production_assets(prompt_version_id);
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_production_assets_recipe_id
    ON production_assets(recipe_id);
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_production_assets_adoption_status
    ON production_assets(adoption_status);
  `);
};
