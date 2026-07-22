#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import {
  getEnvLocalPath,
  getRobinhoodTokenFromEnvLocal,
  writeRobinhoodTokenToEnvLocal,
} from './lib/robinhoodEnv.js';
import {
  maskToken,
  readRobinhoodTokenFromBrowsers,
  validateRobinhoodToken,
} from './lib/robinhoodTokenReader.js';
import { syncRobinhoodToken } from './sync-robinhood-token.js';

function printUsage() {
  console.log(`
Update ROBINHOOD_BROKERAGE_TOKEN in .env.local

Usage:
  npm run update-robinhood-token              Auto-read from Chrome/Brave (macOS)
  npm run update-robinhood-token -- --token=… Paste a token from DevTools
  npm run update-robinhood-token -- --clipboard Read token from macOS clipboard
  npm run update-robinhood-token -- --interactive  Prompt to paste a token
  npm run update-robinhood-token -- --help

Tips:
  1. Log into https://robinhood.com in Chrome or Brave.
  2. Run the auto sync command above, or copy Bearer token from DevTools → Network.
  3. Restart the API server after updating: npm run start
     (Token auto-sync also runs every time you use npm run start or npm run dev)
`);
}

function parseArgs(argv) {
  const args = { help: false, interactive: false, clipboard: false, token: '' };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else if (arg === '--interactive' || arg === '-i') {
      args.interactive = true;
    } else if (arg === '--clipboard' || arg === '-c') {
      args.clipboard = true;
    } else if (arg.startsWith('--token=')) {
      args.token = arg.slice('--token='.length).trim();
    } else if (arg === '--token') {
      args.token = (argv[i + 1] || '').trim();
      i += 1;
    } else if (!arg.startsWith('-') && !args.token) {
      args.token = arg.trim();
    }
  }

  return args;
}

function readClipboardToken() {
  if (process.platform !== 'darwin') {
    throw new Error('Clipboard read is only supported on macOS.');
  }

  const raw = execFileSync('pbpaste', [], { encoding: 'utf8' }).trim();
  if (!raw) {
    throw new Error('Clipboard is empty.');
  }

  if (raw.startsWith('Bearer ')) {
    return raw.slice('Bearer '.length).trim();
  }

  return raw;
}

async function promptForToken() {
  const rl = readline.createInterface({ input, output });
  try {
    console.log('Paste your Robinhood Bearer token, then press Enter:');
    const answer = (await rl.question('> ')).trim();
    if (answer.startsWith('Bearer ')) {
      return answer.slice('Bearer '.length).trim();
    }
    return answer;
  } finally {
    rl.close();
  }
}

async function saveValidatedToken(token, sourceLabel) {
  const trimmed = token.trim();
  if (!trimmed) {
    throw new Error('Token is empty.');
  }

  console.log(`[robinhood-token] Validating token from ${sourceLabel} (${maskToken(trimmed)})...`);
  const valid = await validateRobinhoodToken(trimmed);
  if (!valid) {
    throw new Error(
      'Token is invalid or expired. Log into robinhood.com, copy a fresh Bearer token, and try again.'
    );
  }

  const previous = getRobinhoodTokenFromEnvLocal();
  writeRobinhoodTokenToEnvLocal(trimmed);

  if (previous === trimmed) {
    console.log(`[robinhood-token] Token unchanged in ${getEnvLocalPath()}`);
  } else {
    console.log(`[robinhood-token] Updated ${getEnvLocalPath()} (${maskToken(trimmed)})`);
  }

  console.log('[robinhood-token] Restart the API server to apply: npm run start');
  return trimmed;
}

/** Auto-sync from browser for app startup. Never prompts; does not exit on failure. */
export async function updateRobinhoodTokenForStartup({ quiet = false } = {}) {
  const log = (...args) => {
    if (!quiet) console.log('[robinhood-token]', ...args);
  };
  const warn = (...args) => {
    if (!quiet) console.warn('[robinhood-token]', ...args);
  };

  log('Checking Robinhood session...');
  const result = await syncRobinhoodToken({ quiet: true });

  if (result.updated) {
    log(`Updated .env.local from ${result.source} (${maskToken(result.token)})`);
  } else if (result.token) {
    log(`Using valid token from ${result.source} (${maskToken(result.token)})`);
  } else {
    warn('No valid Robinhood token found. Yahoo fallback will be used.');
    warn('Log into robinhood.com in Chrome/Brave, then restart, or run: npm run update-robinhood-token -- --interactive');
  }

  return result;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printUsage();
    return;
  }

  if (args.token) {
    await saveValidatedToken(args.token, 'CLI argument');
    return;
  }

  if (args.clipboard) {
    const clipboardToken = readClipboardToken();
    await saveValidatedToken(clipboardToken, 'clipboard');
    return;
  }

  if (args.interactive) {
    const pasted = await promptForToken();
    await saveValidatedToken(pasted, 'interactive input');
    return;
  }

  const result = await syncRobinhoodToken();
  if (result.token) {
    console.log('[robinhood-token] Restart the API server to apply: npm run start');
    return;
  }

  console.warn('[robinhood-token] Auto sync failed.');
  console.warn('[robinhood-token] Try one of these:');
  console.warn('  npm run update-robinhood-token -- --interactive');
  console.warn('  npm run update-robinhood-token -- --clipboard');
  console.warn('  npm run robinhood-token-help');
  process.exit(1);
}

const __filename = fileURLToPath(import.meta.url);

const isMainModule =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);

if (isMainModule) {
  main().catch((error) => {
    console.error('[robinhood-token] Update failed:', error.message);
    process.exit(1);
  });
}
