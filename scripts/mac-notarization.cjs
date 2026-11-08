'use strict';

const { spawnSync } = require('child_process');
const path = require('path');

const NotarizationStatus = {
  Accepted: 'Accepted',
  Invalid: 'Invalid',
};
exports.NotarizationStatus = NotarizationStatus;

async function submitAndWait(artifactPath, authentication, password, maxAttempts = 6) {
  const submission = spawnSync('xcrun', [
    'notarytool', 'submit', artifactPath, ...authentication, '--output-format', 'json',
  ], {
    env: process.env,
    encoding: 'utf8',
    timeout: 15 * 60 * 1000,
  });
  if (submission.error || submission.status !== 0) {
    const details = `${submission.stdout || ''} ${submission.stderr || ''} ${submission.error?.message || ''}`.split(password).join('[redacted]');
    throw new Error(`[MacNotarize] Submission failed for ${path.basename(artifactPath)}. ${details}`);
  }

  const { id } = JSON.parse(submission.stdout);
  if (typeof id !== 'string' || !/^[a-f\d-]{36}$/i.test(id)) {
    throw new Error('[MacNotarize] Apple returned an invalid submission ID.');
  }
  console.log(`[MacNotarize] Submitted ${artifactPath} with request ${id}.`);

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const result = spawnSync('xcrun', [
      'notarytool', 'wait', id, ...authentication,
      '--output-format', 'json', '--timeout', '30m',
    ], {
      env: process.env,
      encoding: 'utf8',
      timeout: 31 * 60 * 1000,
    });
    if (!result.error && result.status === 0) {
      const response = JSON.parse(result.stdout);
      if (response.status !== NotarizationStatus.Accepted) {
        throw new Error(`[MacNotarize] Request ${id} completed with status ${response.status}.`);
      }
      return;
    }

    const details = `${result.stdout || ''} ${result.stderr || ''} ${result.error?.message || ''}`;
    const retryable = result.status === 124 || result.error?.code === 'ETIMEDOUT'
      || /NSURLErrorDomain|network|timed out|timeout|HTTP.*(?:429|5\d\d)/i.test(details);
    if (!retryable || attempt === maxAttempts) {
      throw new Error(`[MacNotarize] Waiting for request ${id} failed with code ${result.status}. ${details.split(password).join('[redacted]')}`);
    }
    console.warn(`[MacNotarize] Query failed or timed out for request ${id}. Resuming attempt ${attempt + 1} of ${maxAttempts}.`);
    await new Promise(resolve => setTimeout(resolve, 15000));
  }
}

exports.submitAndWait = submitAndWait;
