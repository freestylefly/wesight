const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const { submitAndWait } = require('./mac-notarization.cjs');

require('dotenv').config();

function run(command, args, operation) {
  const result = spawnSync(command, args, { env: process.env, stdio: 'inherit' });
  if (result.error || result.status !== 0) {
    throw new Error(`[MacNotarize] ${operation} failed with code ${result.status}.`);
  }
}

exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context;

  if (electronPlatformName !== 'darwin') {
    return;
  }

  const appleId = process.env.APPLE_ID?.trim();
  const appleIdPassword = (
    process.env.APPLE_APP_SPECIFIC_PASSWORD || process.env.APPLE_APP_PWD
  )?.trim();
  const teamId = process.env.APPLE_TEAM_ID?.trim();

  if (!appleId || !appleIdPassword || !teamId) {
    const message = '[MacNotarize] Apple notarization credentials are incomplete.';
    if (process.env.WESIGHT_REQUIRE_APPLE_NOTARIZATION === 'true') {
      throw new Error(message);
    }
    console.warn(`${message} Skipping app notarization.`);
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(appOutDir, `${appName}.app`);
  run('codesign', ['--verify', '--deep', '--strict', '--verbose=2', appPath], 'App signature verification');

  const pendingDirectory = path.join(path.dirname(appOutDir), 'pending-notarization');
  fs.mkdirSync(pendingDirectory, { recursive: true });
  const archiveDirectory = fs.mkdtempSync(path.join(pendingDirectory, 'app-'));
  const archivePath = path.join(archiveDirectory, `${appName}.${path.basename(appOutDir)}.zip`);
  run('ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', appPath, archivePath], 'App archiving');

  console.log(`[MacNotarize] Submitting ${appName} for notarization.`);

  try {
    await submitAndWait(archivePath, [
      '--apple-id', appleId, '--team-id', teamId, '--password', appleIdPassword,
    ], appleIdPassword, 4);

    for (let attempt = 1; attempt <= 4; attempt += 1) {
      try {
        run('xcrun', ['stapler', 'staple', '-v', appPath], 'App ticket stapling');
        run('xcrun', ['stapler', 'validate', '-v', appPath], 'App ticket validation');
        break;
      } catch (error) {
        if (attempt === 4) throw error;
        console.warn(`[MacNotarize] Ticket stapling failed for ${appName}. Retrying attempt ${attempt + 1} of 4.`, error);
        await new Promise(resolve => setTimeout(resolve, 15000));
      }
    }

    fs.rmSync(archiveDirectory, { recursive: true, force: true });
    console.log(`[MacNotarize] Notarized and stapled ${appName}.`);
  } catch (error) {
    console.error(`[MacNotarize] Failed to notarize ${appName}:`, error);
    throw error;
  }
};
