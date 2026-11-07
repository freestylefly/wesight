import { NavigationError } from './navigationError/constants';

export function isAbortedNavigation(error: unknown): boolean {
  if (typeof error === 'number') {
    return error === NavigationError.AbortedNumber;
  }
  if (!error || typeof error !== 'object') {
    return false;
  }
  const { code, errno } = error as { code?: unknown; errno?: unknown };
  return code === NavigationError.AbortedCode || errno === NavigationError.AbortedNumber;
}
