import {
  type CoworkFileActivity,
  CoworkFileActivitySource,
  CoworkFileActivityStatus,
} from '@shared/cowork/fileActivity';
import { expect, test } from 'vitest';

import reducer, { clearDraftMessageMetadata, setDraftMessageMetadata, upsertLiveFileActivity } from './coworkSlice';

const makeActivity = (status: CoworkFileActivityStatus): CoworkFileActivity => ({
  sessionId: 'session_1',
  filePath: '/tmp/project/src/app.ts',
  relativePath: 'src/app.ts',
  content: status === CoworkFileActivityStatus.Deleted ? null : 'const value = 1;\n',
  timestamp: Date.now(),
  status,
  source: CoworkFileActivitySource.Watcher,
  language: 'typescript',
  truncated: false,
});

test('deleted live file activity removes the file without inserting a visible row', () => {
  const withFile = reducer(undefined, upsertLiveFileActivity({
    sessionId: 'session_1',
    activity: makeActivity(CoworkFileActivityStatus.Added),
  }));

  expect(withFile.liveFileActivitiesBySession.session_1).toHaveLength(1);

  const afterDelete = reducer(withFile, upsertLiveFileActivity({
    sessionId: 'session_1',
    activity: makeActivity(CoworkFileActivityStatus.Deleted),
  }));

  expect(afterDelete.liveFileActivitiesBySession.session_1).toBeUndefined();
});

test('draft message metadata can be set and cleared', () => {
  const withMetadata = reducer(undefined, setDraftMessageMetadata({
    draftKey: '__home__',
    metadata: {
      domain: 'creator_studio',
      requestedAction: 'prompt_draft',
    },
  }));

  expect(withMetadata.draftMessageMetadata.__home__).toEqual({
    domain: 'creator_studio',
    requestedAction: 'prompt_draft',
  });

  const afterClear = reducer(withMetadata, clearDraftMessageMetadata('__home__'));

  expect(afterClear.draftMessageMetadata.__home__).toBeUndefined();
});
