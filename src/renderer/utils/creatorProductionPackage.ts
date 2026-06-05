import {
  CreatorAssetAdoptionStatus,
  CreatorBatchTaskStatus,
  CreatorProductionAssetKind,
  CreatorProductionAssetStatus,
} from '@shared/creatorStudio/constants';
import type {
  CreatorBatchRunRecord,
  CreatorProductionAssetRecord,
  CreatorProjectRecord,
  CreatorRecipeRecord,
} from '@shared/creatorStudio/types';

export const CreatorProductionPackageSchemaVersion = {
  V1: 'creator.productionPackage.v1',
} as const;

export type CreatorProductionPackageSchemaVersion =
  typeof CreatorProductionPackageSchemaVersion[keyof typeof CreatorProductionPackageSchemaVersion];

export const CreatorProductionPackageIssueSeverity = {
  Blocker: 'blocker',
  Warning: 'warning',
  Info: 'info',
} as const;

export type CreatorProductionPackageIssueSeverity =
  typeof CreatorProductionPackageIssueSeverity[keyof typeof CreatorProductionPackageIssueSeverity];

export interface CreatorProductionPackageIssue {
  severity: CreatorProductionPackageIssueSeverity;
  code: string;
  messageKey: string;
  count: number;
}

export interface CreatorProductionPackageStats {
  totalAssets: number;
  imageAssets: number;
  selectedAssets: number;
  favoriteAssets: number;
  adoptedAssets: number;
  shortlistedAssets: number;
  rejectedAssets: number;
  unreviewedAssets: number;
  missingLicenseAssets: number;
  missingUsageAssets: number;
  missingFileAssets: number;
  sourceUnavailableAssets: number;
  recipes: number;
  batchRuns: number;
  batchTasks: number;
  completedBatchTasks: number;
  failedBatchTasks: number;
  skippedBatchTasks: number;
  completionRate: number;
}

export interface CreatorProductionPackageSummary {
  stats: CreatorProductionPackageStats;
  issues: CreatorProductionPackageIssue[];
  blockerCount: number;
  warningCount: number;
}

export interface CreatorProductionPackageManifest {
  schemaVersion: CreatorProductionPackageSchemaVersion;
  exportedAt: string;
  project: {
    id: string;
    name: string;
  };
  summary: CreatorProductionPackageStats;
  governance: {
    issues: CreatorProductionPackageIssue[];
  };
  recipes: CreatorRecipeRecord[];
  batchRuns: CreatorBatchRunRecord[];
  assets: CreatorProductionAssetRecord[];
}

export interface CreatorProductionPackageInput {
  projectId: string;
  project: CreatorProjectRecord | null;
  assets: CreatorProductionAssetRecord[];
  recipes: CreatorRecipeRecord[];
  batchRuns: CreatorBatchRunRecord[];
  exportedAt?: string;
}

const SECRET_PATTERN = /(sk-[a-zA-Z0-9_-]{16,}|AIza[0-9A-Za-z_-]{20,}|AKIA[0-9A-Z]{16})/;
const LOCAL_PATH_PATTERN = /(\b[A-Za-z]:\\Users\\|\/Users\/|\/home\/)/;

const reviewedStatuses = new Set<string>([
  CreatorAssetAdoptionStatus.Favorite,
  CreatorAssetAdoptionStatus.Shortlisted,
  CreatorAssetAdoptionStatus.Adopted,
  CreatorAssetAdoptionStatus.Rejected,
]);

const createIssue = (
  severity: CreatorProductionPackageIssueSeverity,
  code: string,
  messageKey: string,
  count: number
): CreatorProductionPackageIssue => ({
  severity,
  code,
  messageKey,
  count,
});

const containsPattern = (value: unknown, pattern: RegExp): boolean => (
  pattern.test(JSON.stringify(value))
);

const isProductionCandidate = (asset: CreatorProductionAssetRecord): boolean => (
  asset.selected
  || asset.favorite
  || asset.adoptionStatus === CreatorAssetAdoptionStatus.Adopted
  || asset.adoptionStatus === CreatorAssetAdoptionStatus.Shortlisted
);

export const buildCreatorProductionPackage = ({
  projectId,
  project,
  assets,
  recipes,
  batchRuns,
  exportedAt = new Date().toISOString(),
}: CreatorProductionPackageInput): CreatorProductionPackageManifest => {
  const imageAssets = assets.filter((asset) => asset.kind === CreatorProductionAssetKind.Image);
  const productionAssets = assets.filter(isProductionCandidate);
  const tasks = batchRuns.flatMap((run) => run.tasks);
  const completedBatchTasks = tasks.filter((task) => task.status === CreatorBatchTaskStatus.Completed).length;
  const failedBatchTasks = tasks.filter((task) => task.status === CreatorBatchTaskStatus.Failed).length;
  const skippedBatchTasks = tasks.filter((task) => task.status === CreatorBatchTaskStatus.Skipped).length;
  const missingFileAssets = productionAssets.filter((asset) => asset.status === CreatorProductionAssetStatus.Missing).length;
  const missingLicenseAssets = productionAssets.filter((asset) => !asset.licenseNote?.trim()).length;
  const missingUsageAssets = productionAssets.filter((asset) => !asset.usageNote?.trim()).length;
  const sourceUnavailableAssets = productionAssets.filter((asset) => !asset.sourceSessionAvailable).length;
  const unreviewedAssets = assets.filter((asset) => (
    !asset.selected
    && !asset.favorite
    && !reviewedStatuses.has(asset.adoptionStatus)
  )).length;
  const promptRecords = [
    ...assets.map((asset) => ({
      promptText: asset.promptText,
      promptSpec: asset.promptSpec,
    })),
    ...recipes.map((recipe) => recipe.promptSpec),
    ...batchRuns.map((run) => ({
      promptText: run.promptText,
      promptSpec: run.promptSpec,
      tasks: run.tasks.map((task) => ({
        promptText: task.promptText,
        promptSpec: task.promptSpec,
      })),
    })),
  ];
  const sensitivePromptRecords = promptRecords.filter((record) => containsPattern(record, SECRET_PATTERN)).length;
  const localPathPromptRecords = promptRecords.filter((record) => containsPattern(record, LOCAL_PATH_PATTERN)).length;

  const stats: CreatorProductionPackageStats = {
    totalAssets: assets.length,
    imageAssets: imageAssets.length,
    selectedAssets: assets.filter((asset) => asset.selected).length,
    favoriteAssets: assets.filter((asset) => asset.favorite || asset.adoptionStatus === CreatorAssetAdoptionStatus.Favorite).length,
    adoptedAssets: assets.filter((asset) => asset.adoptionStatus === CreatorAssetAdoptionStatus.Adopted).length,
    shortlistedAssets: assets.filter((asset) => asset.adoptionStatus === CreatorAssetAdoptionStatus.Shortlisted).length,
    rejectedAssets: assets.filter((asset) => asset.adoptionStatus === CreatorAssetAdoptionStatus.Rejected).length,
    unreviewedAssets,
    missingLicenseAssets,
    missingUsageAssets,
    missingFileAssets,
    sourceUnavailableAssets,
    recipes: recipes.length,
    batchRuns: batchRuns.length,
    batchTasks: tasks.length,
    completedBatchTasks,
    failedBatchTasks,
    skippedBatchTasks,
    completionRate: tasks.length > 0 ? Math.round((completedBatchTasks / tasks.length) * 100) : 0,
  };

  const issues = [
    sensitivePromptRecords > 0
      ? createIssue(CreatorProductionPackageIssueSeverity.Blocker, 'sensitive_prompt_values', 'creatorProductionIssueSecrets', sensitivePromptRecords)
      : null,
    missingFileAssets > 0
      ? createIssue(CreatorProductionPackageIssueSeverity.Blocker, 'missing_production_files', 'creatorProductionIssueMissingFiles', missingFileAssets)
      : null,
    missingLicenseAssets > 0
      ? createIssue(CreatorProductionPackageIssueSeverity.Warning, 'missing_license_notes', 'creatorProductionIssueMissingLicense', missingLicenseAssets)
      : null,
    missingUsageAssets > 0
      ? createIssue(CreatorProductionPackageIssueSeverity.Warning, 'missing_usage_notes', 'creatorProductionIssueMissingUsage', missingUsageAssets)
      : null,
    unreviewedAssets > 0
      ? createIssue(CreatorProductionPackageIssueSeverity.Warning, 'unreviewed_assets', 'creatorProductionIssueUnreviewedAssets', unreviewedAssets)
      : null,
    sourceUnavailableAssets > 0
      ? createIssue(CreatorProductionPackageIssueSeverity.Warning, 'source_unavailable', 'creatorProductionIssueSourceUnavailable', sourceUnavailableAssets)
      : null,
    localPathPromptRecords > 0
      ? createIssue(CreatorProductionPackageIssueSeverity.Warning, 'local_paths_in_prompts', 'creatorProductionIssueLocalPaths', localPathPromptRecords)
      : null,
    recipes.length === 0
      ? createIssue(CreatorProductionPackageIssueSeverity.Info, 'no_recipes', 'creatorProductionIssueNoRecipes', 1)
      : null,
    failedBatchTasks > 0
      ? createIssue(CreatorProductionPackageIssueSeverity.Info, 'failed_batch_tasks', 'creatorProductionIssueFailedTasks', failedBatchTasks)
      : null,
  ].filter((issue): issue is CreatorProductionPackageIssue => Boolean(issue));

  return {
    schemaVersion: CreatorProductionPackageSchemaVersion.V1,
    exportedAt,
    project: {
      id: projectId,
      name: project?.name ?? projectId,
    },
    summary: stats,
    governance: {
      issues,
    },
    recipes,
    batchRuns,
    assets,
  };
};

export const summarizeCreatorProductionPackage = (
  input: CreatorProductionPackageInput
): CreatorProductionPackageSummary => {
  const manifest = buildCreatorProductionPackage(input);
  return {
    stats: manifest.summary,
    issues: manifest.governance.issues,
    blockerCount: manifest.governance.issues.filter((issue) => (
      issue.severity === CreatorProductionPackageIssueSeverity.Blocker
    )).length,
    warningCount: manifest.governance.issues.filter((issue) => (
      issue.severity === CreatorProductionPackageIssueSeverity.Warning
    )).length,
  };
};
