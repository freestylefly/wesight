export const CreatorStudioIpcChannel = {
  AssetList: 'creatorStudio:asset:list',
  AssetGetSource: 'creatorStudio:asset:getSource',
  AssetSetFavorite: 'creatorStudio:asset:setFavorite',
  AssetUpdate: 'creatorStudio:asset:update',
  AssetCreatePrompt: 'creatorStudio:asset:createPrompt',
  AssetCreateCase: 'creatorStudio:asset:createCase',
  AssetRevealInFolder: 'creatorStudio:asset:revealInFolder',
  WorkspaceGet: 'creatorStudio:workspace:get',
  ProjectCreate: 'creatorStudio:project:create',
  ProjectSetCurrent: 'creatorStudio:project:setCurrent',
  CollectionCreate: 'creatorStudio:collection:create',
  CollectionAddAsset: 'creatorStudio:collection:addAsset',
} as const;

export type CreatorStudioIpcChannel =
  typeof CreatorStudioIpcChannel[keyof typeof CreatorStudioIpcChannel];

export const CreatorProductionAssetKind = {
  Image: 'image',
  Prompt: 'prompt',
  Case: 'case',
} as const;

export type CreatorProductionAssetKind =
  typeof CreatorProductionAssetKind[keyof typeof CreatorProductionAssetKind];

export const CreatorProductionAssetKindValues = [
  CreatorProductionAssetKind.Image,
  CreatorProductionAssetKind.Prompt,
  CreatorProductionAssetKind.Case,
] as const;

export const CreatorProductionAssetStatus = {
  Ready: 'ready',
  Missing: 'missing',
} as const;

export type CreatorProductionAssetStatus =
  typeof CreatorProductionAssetStatus[keyof typeof CreatorProductionAssetStatus];

export const CreatorProductionAssetStatusValues = [
  CreatorProductionAssetStatus.Ready,
  CreatorProductionAssetStatus.Missing,
] as const;

export const CreatorProductionAssetSource = {
  CoworkGeneratedImage: 'cowork_generated_image',
  CreatorPrompt: 'creator_prompt',
  CreatorCase: 'creator_case',
} as const;

export type CreatorProductionAssetSource =
  typeof CreatorProductionAssetSource[keyof typeof CreatorProductionAssetSource];

export const CreatorProductionAssetSourceValues = [
  CreatorProductionAssetSource.CoworkGeneratedImage,
  CreatorProductionAssetSource.CreatorPrompt,
  CreatorProductionAssetSource.CreatorCase,
] as const;

export const CreatorProductionRunStatus = {
  Pending: 'pending',
  Completed: 'completed',
  Failed: 'failed',
} as const;

export type CreatorProductionRunStatus =
  typeof CreatorProductionRunStatus[keyof typeof CreatorProductionRunStatus];

export const CreatorProductionRunStatusValues = [
  CreatorProductionRunStatus.Pending,
  CreatorProductionRunStatus.Completed,
  CreatorProductionRunStatus.Failed,
] as const;

export const CreatorProductionRunSource = {
  CreatorStudio: 'creator_studio',
} as const;

export type CreatorProductionRunSource =
  typeof CreatorProductionRunSource[keyof typeof CreatorProductionRunSource];

export const CreatorProductionRunSourceValues = [
  CreatorProductionRunSource.CreatorStudio,
] as const;

export const CreatorAssetAdoptionStatus = {
  Unset: 'unset',
  Favorite: 'favorite',
  Shortlisted: 'shortlisted',
  Adopted: 'adopted',
  Rejected: 'rejected',
} as const;

export type CreatorAssetAdoptionStatus =
  typeof CreatorAssetAdoptionStatus[keyof typeof CreatorAssetAdoptionStatus];

export const CreatorAssetAdoptionStatusValues = [
  CreatorAssetAdoptionStatus.Unset,
  CreatorAssetAdoptionStatus.Favorite,
  CreatorAssetAdoptionStatus.Shortlisted,
  CreatorAssetAdoptionStatus.Adopted,
  CreatorAssetAdoptionStatus.Rejected,
] as const;

export const CreatorAssetSelectionStatus = {
  Selected: 'selected',
  Unselected: 'unselected',
} as const;

export type CreatorAssetSelectionStatus =
  typeof CreatorAssetSelectionStatus[keyof typeof CreatorAssetSelectionStatus];

export const CreatorAssetSelectionStatusValues = [
  CreatorAssetSelectionStatus.Selected,
  CreatorAssetSelectionStatus.Unselected,
] as const;

export const CreatorStudioDefaultProjectId = 'creator-project-default';

export const CreatorStudioAssetListDefaultLimit = 60;
export const CreatorStudioAssetListMaxLimit = 200;

export const isCreatorProductionAssetKind = (value: unknown): value is CreatorProductionAssetKind => (
  typeof value === 'string'
  && CreatorProductionAssetKindValues.includes(value as CreatorProductionAssetKind)
);

export const isCreatorProductionAssetStatus = (value: unknown): value is CreatorProductionAssetStatus => (
  typeof value === 'string'
  && CreatorProductionAssetStatusValues.includes(value as CreatorProductionAssetStatus)
);

export const isCreatorProductionAssetSource = (value: unknown): value is CreatorProductionAssetSource => (
  typeof value === 'string'
  && CreatorProductionAssetSourceValues.includes(value as CreatorProductionAssetSource)
);

export const isCreatorProductionRunStatus = (value: unknown): value is CreatorProductionRunStatus => (
  typeof value === 'string'
  && CreatorProductionRunStatusValues.includes(value as CreatorProductionRunStatus)
);

export const isCreatorProductionRunSource = (value: unknown): value is CreatorProductionRunSource => (
  typeof value === 'string'
  && CreatorProductionRunSourceValues.includes(value as CreatorProductionRunSource)
);

export const isCreatorAssetAdoptionStatus = (value: unknown): value is CreatorAssetAdoptionStatus => (
  typeof value === 'string'
  && CreatorAssetAdoptionStatusValues.includes(value as CreatorAssetAdoptionStatus)
);

export const isCreatorAssetSelectionStatus = (value: unknown): value is CreatorAssetSelectionStatus => (
  typeof value === 'string'
  && CreatorAssetSelectionStatusValues.includes(value as CreatorAssetSelectionStatus)
);
