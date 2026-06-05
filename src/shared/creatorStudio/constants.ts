export const CreatorStudioIpcChannel = {
  AssetList: 'creatorStudio:asset:list',
  AssetGetSource: 'creatorStudio:asset:getSource',
  AssetSetFavorite: 'creatorStudio:asset:setFavorite',
  AssetRevealInFolder: 'creatorStudio:asset:revealInFolder',
} as const;

export type CreatorStudioIpcChannel =
  typeof CreatorStudioIpcChannel[keyof typeof CreatorStudioIpcChannel];

export const CreatorProductionAssetKind = {
  Image: 'image',
} as const;

export type CreatorProductionAssetKind =
  typeof CreatorProductionAssetKind[keyof typeof CreatorProductionAssetKind];

export const CreatorProductionAssetKindValues = [
  CreatorProductionAssetKind.Image,
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
} as const;

export type CreatorProductionAssetSource =
  typeof CreatorProductionAssetSource[keyof typeof CreatorProductionAssetSource];

export const CreatorProductionAssetSourceValues = [
  CreatorProductionAssetSource.CoworkGeneratedImage,
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
