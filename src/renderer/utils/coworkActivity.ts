import type { DiffData } from '../components/cowork/DiffView';
import { extractDiffFromToolInput } from '../components/cowork/DiffView';
import type { CoworkMessage, CoworkSession } from '../types/cowork';
import type { Skill } from '../types/skill';

export const ActivityTodoStatus = {
  Completed: 'completed',
  InProgress: 'in_progress',
  Pending: 'pending',
  Unknown: 'unknown',
} as const;
export type ActivityTodoStatus = typeof ActivityTodoStatus[keyof typeof ActivityTodoStatus];

export const ActivityItemStatus = {
  Running: 'running',
  Completed: 'completed',
  Error: 'error',
} as const;
export type ActivityItemStatus = typeof ActivityItemStatus[keyof typeof ActivityItemStatus];

export const ActivityFileChangeKind = {
  Added: 'added',
  Modified: 'modified',
  Unknown: 'unknown',
} as const;
export type ActivityFileChangeKind = typeof ActivityFileChangeKind[keyof typeof ActivityFileChangeKind];

export const ActivityArtifactType = {
  Image: 'image',
  File: 'file',
} as const;
export type ActivityArtifactType = typeof ActivityArtifactType[keyof typeof ActivityArtifactType];

export interface CoworkActivityTodo {
  id: string;
  text: string;
  secondaryText: string | null;
  status: ActivityTodoStatus;
}

export interface CoworkActivitySkill {
  id: string;
  name: string;
  description: string;
}

export interface CoworkActivityFileChange {
  id: string;
  filePath: string;
  toolName: string;
  kind: ActivityFileChangeKind;
  status: ActivityItemStatus;
  addedLines: number | null;
  removedLines: number | null;
  timestamp: number;
  diffs: DiffData[];
}

export interface CoworkActivityArtifact {
  id: string;
  path: string;
  name: string;
  type: ActivityArtifactType;
  source: string | null;
  timestamp: number;
}

export interface CoworkActivityToolItem {
  id: string;
  toolName: string;
  summary: string | null;
  status: ActivityItemStatus;
  timestamp: number;
  filePath: string | null;
  skillName: string | null;
}

export interface CoworkActivitySnapshot {
  todos: CoworkActivityTodo[];
  skills: CoworkActivitySkill[];
  fileChanges: CoworkActivityFileChange[];
  artifacts: CoworkActivityArtifact[];
  activeTool: CoworkActivityToolItem | null;
  toolTimeline: CoworkActivityToolItem[];
}

interface ToolEntry {
  toolUse: CoworkMessage;
  toolResult: CoworkMessage | null;
}

const TODO_TOOL_NAME = 'todowrite';
const FILE_CHANGE_TOOL_NAME = 'filechange';

const buildDiffFileChangeId = (toolUseId: string, index: number): string => `${toolUseId}:diff:${index}`;
const buildWriteFileChangeId = (toolUseId: string): string => `${toolUseId}:write`;
const buildFileChangeToolId = (toolUseId: string): string => `${toolUseId}:filechange`;

const normalizeToolName = (value: string | undefined): string => (
  (value ?? '').toLowerCase().replace(/[\s_]+/g, '')
);

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);

const toTrimmedString = (value: unknown): string | null => (
  typeof value === 'string' && value.trim() ? value.trim() : null
);

const getToolName = (message: CoworkMessage): string => (
  typeof message.metadata?.toolName === 'string' && message.metadata.toolName.trim()
    ? message.metadata.toolName.trim()
    : 'Tool'
);

const getToolInput = (message: CoworkMessage): Record<string, unknown> | undefined => (
  isRecord(message.metadata?.toolInput) ? message.metadata.toolInput : undefined
);

const extractString = (input: Record<string, unknown> | undefined, keys: string[]): string | null => {
  if (!input) return null;
  for (const key of keys) {
    const value = input[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return null;
};

const extractPath = (input: Record<string, unknown> | undefined): string | null => {
  const direct = extractString(input, [
    'file_path',
    'path',
    'filePath',
    'target_file',
    'targetFile',
    'filename',
    'file',
  ]);
  if (direct) return direct;

  if (!input) return null;
  for (const value of Object.values(input)) {
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (
      trimmed.startsWith('/')
      || trimmed.startsWith('./')
      || /^[\w.-]+\/[\w./-]+$/.test(trimmed)
    ) {
      return trimmed;
    }
  }
  return null;
};

const getToolSummary = (toolName: string, input: Record<string, unknown> | undefined): string | null => {
  const normalized = normalizeToolName(toolName);
  if (normalized === 'bash' || normalized === 'exec' || normalized === 'shell') {
    return extractString(input, ['command', 'cmd', 'script']);
  }
  return extractPath(input)
    ?? extractString(input, ['action', 'operation', 'description', 'summary', 'text']);
};

const countLines = (value: string): number => {
  if (!value) return 0;
  return value.split('\n').length;
};

const summarizeDiffs = (diffs: DiffData[]): { addedLines: number; removedLines: number } => {
  return diffs.reduce(
    (acc, diff) => ({
      addedLines: acc.addedLines + countLines(diff.newStr),
      removedLines: acc.removedLines + countLines(diff.oldStr),
    }),
    { addedLines: 0, removedLines: 0 },
  );
};

const normalizeTodoStatus = (value: unknown): ActivityTodoStatus => {
  const normalized = typeof value === 'string'
    ? value.trim().toLowerCase().replace(/-/g, '_')
    : '';
  if (normalized === ActivityTodoStatus.Completed) return ActivityTodoStatus.Completed;
  if (normalized === ActivityTodoStatus.InProgress || normalized === 'running') return ActivityTodoStatus.InProgress;
  if (normalized === ActivityTodoStatus.Pending || normalized === 'todo') return ActivityTodoStatus.Pending;
  return ActivityTodoStatus.Unknown;
};

const parseTodoWriteItems = (input: Record<string, unknown> | undefined): CoworkActivityTodo[] => {
  if (!input || !Array.isArray(input.todos)) return [];
  return input.todos
    .filter(isRecord)
    .map((todo, index) => {
      const activeForm = toTrimmedString(todo.activeForm);
      const content = toTrimmedString(todo.content);
      return {
        id: toTrimmedString(todo.id) ?? `todo-${index}`,
        text: activeForm ?? content ?? '',
        secondaryText: activeForm && content && activeForm !== content ? content : null,
        status: normalizeTodoStatus(todo.status),
      };
    })
    .filter((todo) => todo.text.trim());
};

const collectToolEntries = (messages: CoworkMessage[]): ToolEntry[] => {
  const entries: ToolEntry[] = [];
  const byToolUseId = new Map<string, ToolEntry>();

  for (const message of messages) {
    const toolUseId = typeof message.metadata?.toolUseId === 'string'
      ? message.metadata.toolUseId
      : null;
    if (message.type === 'tool_use') {
      const entry = { toolUse: message, toolResult: null };
      entries.push(entry);
      if (toolUseId) {
        byToolUseId.set(toolUseId, entry);
      }
      continue;
    }

    if (message.type !== 'tool_result') continue;
    if (toolUseId && byToolUseId.has(toolUseId)) {
      byToolUseId.get(toolUseId)!.toolResult = message;
      continue;
    }

    const pending = [...entries].reverse().find((entry) => !entry.toolResult);
    if (pending) {
      pending.toolResult = message;
    }
  }

  return entries;
};

const resolveToolStatus = (entry: ToolEntry): ActivityItemStatus => {
  const toolName = normalizeToolName(getToolName(entry.toolUse));
  if (toolName === FILE_CHANGE_TOOL_NAME) return ActivityItemStatus.Completed;
  if (!entry.toolResult) return ActivityItemStatus.Running;
  return entry.toolResult.metadata?.isError || entry.toolResult.metadata?.error
    ? ActivityItemStatus.Error
    : ActivityItemStatus.Completed;
};

const buildFileChangeFromTool = (entry: ToolEntry): CoworkActivityFileChange[] => {
  const toolName = getToolName(entry.toolUse);
  const normalized = normalizeToolName(toolName);
  const input = getToolInput(entry.toolUse);
  const status = resolveToolStatus(entry);
  const diffs = extractDiffFromToolInput(toolName, input) ?? [];
  const basePath = extractPath(input);

  if (diffs.length > 0) {
    const grouped = new Map<string, DiffData[]>();
    for (const diff of diffs) {
      const filePath = diff.filePath ?? basePath ?? '';
      if (!filePath) continue;
      grouped.set(filePath, [...(grouped.get(filePath) ?? []), diff]);
    }
    return Array.from(grouped.entries()).map(([filePath, fileDiffs], index) => {
      const stats = summarizeDiffs(fileDiffs);
      return {
        id: buildDiffFileChangeId(entry.toolUse.id, index),
        filePath,
        toolName,
        kind: ActivityFileChangeKind.Modified,
        status,
        addedLines: stats.addedLines,
        removedLines: stats.removedLines,
        timestamp: entry.toolUse.timestamp,
        diffs: fileDiffs,
      };
    });
  }

  if (normalized === 'write' || normalized === 'writefile') {
    const filePath = basePath;
    if (!filePath) return [];
    const content = extractString(input, ['content', 'text', 'data', 'value']);
    return [{
      id: buildWriteFileChangeId(entry.toolUse.id),
      filePath,
      toolName,
      kind: ActivityFileChangeKind.Added,
      status,
      addedLines: content ? countLines(content) : null,
      removedLines: 0,
      timestamp: entry.toolUse.timestamp,
      diffs: content !== null ? [{ filePath, oldStr: '', newStr: content }] : [],
    }];
  }

  if (normalized === FILE_CHANGE_TOOL_NAME) {
    const filePath = basePath;
    if (!filePath) return [];
    const added = typeof input?.added === 'number' ? input.added : null;
    const removed = typeof input?.removed === 'number' ? input.removed : null;
    return [{
      id: buildFileChangeToolId(entry.toolUse.id),
      filePath,
      toolName,
      kind: ActivityFileChangeKind.Modified,
      status: ActivityItemStatus.Completed,
      addedLines: added,
      removedLines: removed,
      timestamp: entry.toolUse.timestamp,
      diffs: [],
    }];
  }

  return [];
};

export const getFileChangeIdsForToolUse = (toolUse: CoworkMessage): string[] => {
  if (toolUse.type !== 'tool_use') return [];
  return buildFileChangeFromTool({ toolUse, toolResult: null }).map((change) => change.id);
};

export const getPreferredActivityFileChangeId = (snapshot: CoworkActivitySnapshot): string | null => {
  const runningChange = snapshot.fileChanges.find((change) => change.status === ActivityItemStatus.Running);
  return runningChange?.id ?? snapshot.fileChanges[0]?.id ?? null;
};

const getFileName = (filePath: string): string => {
  const clean = filePath.replace(/[?#].*$/, '').replace(/\/+$/, '');
  return decodeURIComponent(clean.split('/').pop() || clean || 'file');
};

const inferArtifactType = (filePath: string, mimeType?: string): ActivityArtifactType => {
  if (mimeType?.startsWith('image/')) return ActivityArtifactType.Image;
  return /\.(png|jpe?g|webp|gif|svg)$/i.test(filePath)
    ? ActivityArtifactType.Image
    : ActivityArtifactType.File;
};

const parseLocalFileLinks = (content: string): Array<{ path: string; name: string }> => {
  const results: Array<{ path: string; name: string }> = [];
  const seen = new Set<string>();
  const linkPattern = /\[([^\]]+)\]\((file:\/\/[^)\s]+|\/[^)\s]+)\)/g;
  let match: RegExpExecArray | null;
  while ((match = linkPattern.exec(content)) !== null) {
    const label = match[1]?.trim();
    const rawPath = match[2]?.trim();
    if (!rawPath) continue;
    const path = rawPath.replace(/^file:\/\//i, '');
    if (!path || seen.has(path)) continue;
    seen.add(path);
    results.push({ path, name: label || getFileName(path) });
  }
  return results;
};

export function buildCoworkActivitySnapshot(
  session: CoworkSession,
  skills: Skill[],
): CoworkActivitySnapshot {
  const skillById = new Map(skills.map((skill) => [skill.id, skill]));
  const activeSkillIds = new Set<string>();
  const artifacts = new Map<string, CoworkActivityArtifact>();
  let todos: CoworkActivityTodo[] = [];

  for (const message of session.messages) {
    const skillIds = Array.isArray(message.metadata?.skillIds)
      ? message.metadata.skillIds.filter((id): id is string => typeof id === 'string')
      : [];
    skillIds.forEach((id) => activeSkillIds.add(id));

    const generatedImages = Array.isArray(message.metadata?.generatedImages)
      ? message.metadata.generatedImages
      : [];
    for (const image of generatedImages) {
      if (!image || typeof image !== 'object') continue;
      const record = image as Record<string, unknown>;
      const imagePath = toTrimmedString(record.path);
      if (!imagePath) continue;
      artifacts.set(imagePath, {
        id: `generated:${imagePath}`,
        path: imagePath,
        name: toTrimmedString(record.name) ?? getFileName(imagePath),
        type: inferArtifactType(imagePath, toTrimmedString(record.mimeType) ?? undefined),
        source: toTrimmedString(record.source),
        timestamp: message.timestamp,
      });
    }

    if (message.type === 'assistant' && message.content) {
      for (const link of parseLocalFileLinks(message.content)) {
        artifacts.set(link.path, {
          id: `file:${link.path}`,
          path: link.path,
          name: link.name,
          type: inferArtifactType(link.path),
          source: null,
          timestamp: message.timestamp,
        });
      }
    }
  }

  const toolEntries = collectToolEntries(session.messages);
  const fileChanges: CoworkActivityFileChange[] = [];
  const toolTimeline: CoworkActivityToolItem[] = [];

  for (const entry of toolEntries) {
    const toolName = getToolName(entry.toolUse);
    const normalized = normalizeToolName(toolName);
    const input = getToolInput(entry.toolUse);
    const status = resolveToolStatus(entry);
    if (normalized === TODO_TOOL_NAME) {
      const parsedTodos = parseTodoWriteItems(input);
      if (parsedTodos.length > 0) {
        todos = parsedTodos;
      }
    }

    const filePath = extractPath(input);
    const isSkillTool = normalized === 'skill';
    const skillInputId = isSkillTool ? extractString(input, ['skill', 'skillId', 'skill_id', 'name']) : null;
    const skillName = skillInputId
      ? (skillById.get(skillInputId)?.name ?? skillInputId)
      : null;
    toolTimeline.push({
      id: entry.toolUse.id,
      toolName,
      summary: getToolSummary(toolName, input),
      status,
      timestamp: entry.toolUse.timestamp,
      filePath,
      skillName,
    });
    fileChanges.push(...buildFileChangeFromTool(entry));
  }

  const sessionDone = session.status === 'completed' || session.status === 'error';
  const finalizeTimeline = (items: CoworkActivityToolItem[]): CoworkActivityToolItem[] =>
    sessionDone
      ? items.map((item) => item.status === ActivityItemStatus.Running
        ? { ...item, status: ActivityItemStatus.Completed }
        : item)
      : items;
  const activeTool = sessionDone
    ? null
    : ([...toolTimeline].reverse().find((item) => item.status === ActivityItemStatus.Running) ?? null);
  const activitySkills = Array.from(activeSkillIds)
    .map((id) => {
      const skill = skillById.get(id);
      return {
        id,
        name: skill?.name ?? id,
        description: skill?.description ?? '',
      };
    });

  return {
    todos,
    skills: activitySkills,
    fileChanges: fileChanges.sort((left, right) => right.timestamp - left.timestamp),
    artifacts: Array.from(artifacts.values()).sort((left, right) => right.timestamp - left.timestamp),
    activeTool,
    toolTimeline: finalizeTimeline(toolTimeline.slice(-12).reverse()),
  };
}
