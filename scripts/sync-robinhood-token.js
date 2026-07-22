#!/usr/bin/env node

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getRobinhoodTokenFromEnvLocal,
  writeRobinhoodTokenToEnvLocal,
} from './lib/robinhoodEnv.js';
import {
  maskToken,
  readRobinhoodTokenFromBrowsers,
  validateRobinhoodToken,
} from './lib/robinhoodTokenReader.js';

const TOKEN_KEY = 'ROBINHOOD_BROKERAGE_TOKEN';

function getTokenFromEnvFile() {
  return getRobinhoodTokenFromEnvLocal();
}

function writeTokenToEnvLocal(token) {
  writeRobinhoodTokenToEnvLocal(token);
}

export async function syncRobinhoodToken({ quiet = false } = {}) {
  const log = (...args) => {
    if (!quiet) console.log('[robinhood-token]', ...args);
  };

  const warn = (...args) => {
    if (!quiet) console.warn('[robinhood-token]', ...args);
  };

  const existingToken = getTokenFromEnvFile();
  const browserResult = readRobinhoodTokenFromBrowsers();
  const browserToken = browserResult.token?.trim() || '';

  let tokenToUse = '';
  let source = '';

  if (browserToken) {
    const browserValid = await validateRobinhoodToken(browserToken);
    if (browserValid) {
      tokenToUse = browserToken;
      source = browserResult.source;
    } else {
      warn(`Browser token from ${browserResult.source} is invalid or expired.`);
    }
  } else if (browserResult.error) {
    warn(browserResult.error);
  }

  if (!tokenToUse && existingToken) {
    const existingValid = await validateRobinhoodToken(existingToken);
    if (existingValid) {
      tokenToUse = existingToken;
      source = '.env.local';
    } else {
      warn(`Existing ${TOKEN_KEY} in .env.local is invalid or expired.`);
    }
  }

  if (!tokenToUse) {
    warn('Robinhood token sync skipped. App will start without Robinhood data/trading.');
    return { updated: false, token: '', source: '' };
  }

  const changed = tokenToUse !== existingToken;
  if (changed) {
    writeTokenToEnvLocal(tokenToUse);
    log(`Updated .env.local from ${source} (${maskToken(tokenToUse)})`);
  } else {
    log(`Using valid token from ${source} (${maskToken(tokenToUse)})`);
  }

  return { updated: changed, token: tokenToUse, source };
}

const __filename = fileURLToPath(import.meta.url);

const isMainModule =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);

if (isMainModule) {
  syncRobinhoodToken().catch((error) => {
    console.error('[robinhood-token] Sync failed:', error.message);
    process.exit(1);
  });
}
