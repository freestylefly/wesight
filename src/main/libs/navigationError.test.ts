import { expect, test } from 'vitest';

import { isAbortedNavigation } from './navigationError';
import { NavigationError } from './navigationError/constants';

test('recognizes cancelled Electron navigations from promises and load events', () => {
  expect(isAbortedNavigation(Object.assign(new Error('navigation cancelled'), { errno: NavigationError.AbortedNumber }))).toBe(true);
  expect(isAbortedNavigation({ code: NavigationError.AbortedCode })).toBe(true);
  expect(isAbortedNavigation(NavigationError.AbortedNumber)).toBe(true);
});

test('keeps genuine network failures eligible for recovery', () => {
  expect(isAbortedNavigation({ code: 'ERR_CONNECTION_REFUSED', errno: -102 })).toBe(false);
  expect(isAbortedNavigation(-102)).toBe(false);
  expect(isAbortedNavigation(new Error('network unavailable'))).toBe(false);
  expect(isAbortedNavigation(null)).toBe(false);
});
