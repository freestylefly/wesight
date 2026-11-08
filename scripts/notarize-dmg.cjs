'use strict';

const { spawnSync } = require('child_process');
const path = require('path');

const { NotarizationStatus, submitAndWait } = require('./mac-notarization.cjs');
exports.NotarizationStatus = NotarizationStatus;

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
