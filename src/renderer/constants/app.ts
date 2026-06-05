export const APP_NAME = 'WeSight';
export const APP_ID = 'wesight';
export const EXPORT_FORMAT_TYPE = 'wesight.providers';
export const EXPORT_PASSWORD = 'wesight-APP';

export const MainView = {
  Cowork: 'cowork',
  Skills: 'skills',
  Runtime: 'runtime',
  Agents: 'agents',
  Creator: 'creator',
} as const;

export type MainView = typeof MainView[keyof typeof MainView];
