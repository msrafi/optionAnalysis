#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  maskToken,
  readRobinhoodTokenFromBrowsers,
  validateRobinhoodToken,
} from './lib/robinhoodTokenReader.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');
const envLocalPath = path.join(projectRoot, '.env.local');
const envExamplePath = path.join(projectRoot, '.env.example');
const TOKEN_KEY = 'ROBINHOOD_BROKERAGE_TOKEN';

function readEnvLines(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, 'utf8').split('\n');
}

function getTokenFromEnvFile(filePath) {
  for (const line of readEnvLines(filePath)) {
    if (!line.startsWith(`${TOKEN_KEY}=`)) continue;
    return line.slice(TOKEN_KEY.length + 1).trim();
  }
  return '';
}

function writeTokenToEnvLocal(token) {
  const sourceLines = fs.existsSync(envLocalPath)
    ? readEnvLines(envLocalPath)
    : readEnvLines(envExamplePath);

  let found = false;
  const updatedLines = sourceLines.map((line) => {
    if (!line.startsWith(`${TOKEN_KEY}=`)) return line;
    found = true;
    return `${TOKEN_KEY}=${token}`;
  });

  if (!found) {
    if (updatedLines.length > 0 && updatedLines[updatedLines.length - 1] !== '') {
      updatedLines.push('');
    }
    updatedLines.push(`${TOKEN_KEY}=${token}`);
  }

  const content = updatedLines.join('\n');
  fs.writeFileSync(envLocalPath, content.endsWith('\n') ? content : `${content}\n`, 'utf8');
}

export async function syncRobinhoodToken({ quiet = false } = {}) {
  const log = (...args) => {
    if (!quiet) console.log('[robinhood-token]', ...args);
  };

  const warn = (...args) => {
    if (!quiet) console.warn('[robinhood-token]', ...args);
  };

  const existingToken = getTokenFromEnvFile(envLocalPath);
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

const isMainModule =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);

if (isMainModule) {
  syncRobinhoodToken().catch((error) => {
    console.error('[robinhood-token] Sync failed:', error.message);
    process.exit(1);
  });
}
