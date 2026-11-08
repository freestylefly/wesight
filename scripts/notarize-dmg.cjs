'use strict';

const { spawnSync } = require('child_process');
const path = require('path');

const NotarizationStatus = {
  Accepted: 'Accepted',
  Invalid: 'Invalid',
};
exports.NotarizationStatus = NotarizationStatus;

async function submitAndWait(dmgPath, authentication, password) {
  const submission = spawnSync('xcrun', [
    'notarytool', 'submit', dmgPath, ...authentication, '--output-format', 'json',
  ], {
    env: process.env,
    encoding: 'utf8',
    timeout: 15 * 60 * 1000,
  });
  if (submission.error || submission.status !== 0) {
    const details = (submission.stderr || submission.error?.message || '').split(password).join('[redacted]');
    throw new Error(`[MacDmgNotarize] Submission failed for ${path.basename(dmgPath)}. ${details}`);
  }

  const { id } = JSON.parse(submission.stdout);
  if (typeof id !== 'string' || !/^[a-f\d-]{36}$/i.test(id)) {
    throw new Error('[MacDmgNotarize] Apple returned an invalid submission ID.');
  }
  console.log(`[MacDmgNotarize] Submitted ${path.basename(dmgPath)} with request ${id}.`);

  const maxAttempts = 6;
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
        throw new Error(`[MacDmgNotarize] Request ${id} completed with status ${response.status}.`);
      }
      return;
    }

    const details = `${result.stderr || ''} ${result.error?.message || ''}`;
    const retryable = result.status === 124 || result.error?.code === 'ETIMEDOUT'
      || /NSURLErrorDomain|network|timed out|timeout|HTTP.*(?:429|5\d\d)/i.test(details);
    if (!retryable || attempt === maxAttempts) {
      throw new Error(`[MacDmgNotarize] Waiting for request ${id} failed with code ${result.status}. ${details.split(password).join('[redacted]')}`);
    }
    console.warn(`[MacDmgNotarize] Query failed or timed out for request ${id}. Resuming attempt ${attempt + 1} of ${maxAttempts}.`);
    await new Promise(resolve => setTimeout(resolve, 15000));
  }
}

function run(command, args, operation) {
  const result = spawnSync(command, args, {
    env: process.env,
    stdio: 'inherit',
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`[MacDmgNotarize] ${operation} exited with code ${result.status}.`);
  }
}

exports.default = async function notarizeDmg(context) {
  if (process.platform !== 'darwin') {
    return [];
  }

  const dmgPaths = context.artifactPaths.filter(
    (artifactPath) => path.extname(artifactPath).toLowerCase() === '.dmg',
  );
  if (dmgPaths.length === 0) {
    console.warn('[MacDmgNotarize] No DMG artifacts were produced.');
    return [];
  }

  const appleId = process.env.APPLE_ID?.trim();
  const appleIdPassword = (
    process.env.APPLE_APP_SPECIFIC_PASSWORD || process.env.APPLE_APP_PWD
  )?.trim();
  const teamId = process.env.APPLE_TEAM_ID?.trim();

  if (!appleId || !appleIdPassword || !teamId) {
    const message = '[MacDmgNotarize] Apple notarization credentials are incomplete.';
    if (process.env.WESIGHT_REQUIRE_APPLE_NOTARIZATION === 'true') {
      throw new Error(message);
    }
    console.warn(`${message} Skipping DMG notarization.`);
    return [];
  }

  for (const dmgPath of dmgPaths) {
    const dmgName = path.basename(dmgPath);
    console.log(`[MacDmgNotarize] Verifying the signature for ${dmgName}.`);
    run(
      'codesign',
      ['--verify', '--strict', '--verbose=2', dmgPath],
      `Signature verification for ${dmgName}`,
    );

    console.log(`[MacDmgNotarize] Submitting ${dmgName} for notarization.`);
    await submitAndWait(dmgPath, [
      '--apple-id', appleId, '--team-id', teamId, '--password', appleIdPassword,
    ], appleIdPassword);

    run(
      'xcrun',
      ['stapler', 'staple', '-v', dmgPath],
      `Ticket stapling for ${dmgName}`,
    );
    run(
      'xcrun',
      ['stapler', 'validate', '-v', dmgPath],
      `Stapled ticket validation for ${dmgName}`,
    );
    console.log(`[MacDmgNotarize] Notarized and stapled ${dmgName}.`);
  }

  return [];
};
