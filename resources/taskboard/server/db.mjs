import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = process.env.TASKBOARD_DATA_DIR || path.join(APP_ROOT, '.data');
mkdirSync(DATA_DIR, { recursive: true });

export const db = new DatabaseSync(path.join(DATA_DIR, 'taskboard.sqlite'));

db.exec(`
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  workspace_path TEXT DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS issues (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT NOT NULL REFERENCES projects(id),
  number INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'todo',
  priority TEXT NOT NULL DEFAULT 'medium',
  labels TEXT DEFAULT '',
  branch TEXT DEFAULT '',
  worktree TEXT DEFAULT '',
  session TEXT DEFAULT '',
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (project_id, number)
);

CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  issue_id INTEGER NOT NULL REFERENCES issues(id),
  author TEXT DEFAULT 'user',
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS activities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  issue_id INTEGER NOT NULL REFERENCES issues(id),
  project_id TEXT NOT NULL,
  action TEXT NOT NULL,
  detail TEXT DEFAULT '',
  actor TEXT DEFAULT 'user',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_issues_project ON issues(project_id);
CREATE INDEX IF NOT EXISTS idx_comments_issue ON comments(issue_id);
CREATE INDEX IF NOT EXISTS idx_activities_issue ON activities(issue_id);
`);

// 存量库迁移：v0.2 -> v0.3 增加 agent 执行者字段
try {
  db.exec("ALTER TABLE issues ADD COLUMN agent TEXT DEFAULT ''");
} catch (err) {
  if (!err.message.includes('duplicate column')) throw err;
}

db.exec(`
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT NOT NULL,
  issue_id INTEGER,
  body TEXT NOT NULL,
  reply TEXT DEFAULT '',
  status TEXT DEFAULT 'pending',
  created_at TEXT NOT NULL,
  replied_at TEXT
);
`);

// v0.3 -> v0.4：评论增加 handled 状态（用户评论待 agent 处理）
try {
  db.exec('ALTER TABLE comments ADD COLUMN handled INTEGER DEFAULT 0');
  db.exec("UPDATE comments SET handled = 1 WHERE author != 'user'");
} catch (err) {
  if (!err.message.includes('duplicate column')) throw err;
}

export const STATUSES = ['todo', 'in_progress', 'in_review', 'done'];
export const PRIORITIES = ['low', 'medium', 'high', 'urgent'];

export function now() {
  return new Date().toISOString();
}

export function logActivity(issueId, projectId, action, detail, actor) {
  db.prepare(
    'INSERT INTO activities (issue_id, project_id, action, detail, actor, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(issueId, projectId, action, detail, actor || 'user', now());
}

export function findIssue(projectId, number) {
  return db
    .prepare('SELECT * FROM issues WHERE project_id = ? AND number = ?')
    .get(projectId, number);
}

export function findIssueById(id) {
  return db.prepare('SELECT * FROM issues WHERE id = ?').get(id);
}

export function issueRef(issue) {
  return `${issue.project_id}-${issue.number}`;
}

export function parseLabels(raw) {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string' && raw.trim()) {
    return raw.split(/[,，]/).map((s) => s.trim()).filter(Boolean);
  }
  return [];
}
