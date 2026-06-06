export const PetVariant = {
  WeSightAgent: 'wesight_agent',
  BlueBot: 'blue_bot',
  AquaDrop: 'aqua_drop',
  FlameBuddy: 'flame_buddy',
  WoodBox: 'wood_box',
  SproutBox: 'sprout_box',
  StackBot: 'stack_bot',
  AstroBot: 'astro_bot',
  ShadowBot: 'shadow_bot',
} as const;

export type PetVariant = typeof PetVariant[keyof typeof PetVariant];

export const PetMotion = {
  Calm: 'calm',
  Playful: 'playful',
} as const;

export type PetMotion = typeof PetMotion[keyof typeof PetMotion];

export const DesktopPetIpcChannel = {
  GetConfig: 'desktopPet:getConfig',
  ApplyPreview: 'desktopPet:applyPreview',
  GetBounds: 'desktopPet:getBounds',
  SetPosition: 'desktopPet:setPosition',
  SetMouseInteractive: 'desktopPet:setMouseInteractive',
  OpenMainWindow: 'desktopPet:openMainWindow',
  GetTaskSnapshot: 'desktopPet:getTaskSnapshot',
  OpenTask: 'desktopPet:openTask',
  ConfigChanged: 'desktopPet:configChanged',
  TaskChanged: 'desktopPet:taskChanged',
  OpenTaskRequested: 'desktopPet:openTaskRequested',
} as const;

export type DesktopPetIpcChannel = typeof DesktopPetIpcChannel[keyof typeof DesktopPetIpcChannel];

export const DesktopPetTaskStatus = {
  Waiting: 'waiting',
  Thinking: 'thinking',
  Replying: 'replying',
  Coding: 'coding',
  Permission: 'permission',
  Completed: 'completed',
  Error: 'error',
  Stopped: 'stopped',
} as const;

export type DesktopPetTaskStatus = typeof DesktopPetTaskStatus[keyof typeof DesktopPetTaskStatus];

export const DesktopPetTaskSource = {
  Chat: 'chat',
  Im: 'im',
  Scheduled: 'scheduled',
} as const;

export type DesktopPetTaskSource = typeof DesktopPetTaskSource[keyof typeof DesktopPetTaskSource];

export interface DesktopPetTaskSnapshot {
  sessionId: string;
  title: string;
  projectName: string;
  source: DesktopPetTaskSource;
  status: DesktopPetTaskStatus;
  engineLabel: string;
  modelLabel: string;
  activityText: string;
  updatedAt: number;
}

export interface PetPosition {
  x: number;
  y: number;
}

export interface PetConfig {
  enabled: boolean;
  variant: PetVariant;
  motion: PetMotion;
  position?: PetPosition | null;
}

export const DEFAULT_PET_CONFIG: PetConfig = {
  enabled: false,
  variant: PetVariant.WeSightAgent,
  motion: PetMotion.Calm,
  position: null,
};

export const isPetVariant = (value: unknown): value is PetVariant => {
  return typeof value === 'string' && Object.values(PetVariant).includes(value as PetVariant);
};

export const isPetMotion = (value: unknown): value is PetMotion => {
  return typeof value === 'string' && Object.values(PetMotion).includes(value as PetMotion);
};

const normalizePetPosition = (value: unknown): PetPosition | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const candidate = value as Partial<PetPosition>;
  if (!Number.isFinite(candidate.x) || !Number.isFinite(candidate.y)) {
    return null;
  }
  return {
    x: Math.round(candidate.x!),
    y: Math.round(candidate.y!),
  };
};

export const normalizePetConfig = (config?: Partial<PetConfig> | null): PetConfig => ({
  enabled: typeof config?.enabled === 'boolean' ? config.enabled : DEFAULT_PET_CONFIG.enabled,
  variant: isPetVariant(config?.variant) ? config.variant : DEFAULT_PET_CONFIG.variant,
  motion: isPetMotion(config?.motion) ? config.motion : DEFAULT_PET_CONFIG.motion,
  position: normalizePetPosition(config?.position),
});
