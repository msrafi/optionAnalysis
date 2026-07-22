#!/usr/bin/env node

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { updateRobinhoodTokenForStartup } from './update-robinhood-token.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');

async function main() {
  try {
    await updateRobinhoodTokenForStartup();
  } catch (error) {
    console.warn('[robinhood-token] Sync failed, continuing startup:', error.message);
  }

  const child = spawn(
    'npx',
    [
      'concurrently',
      '--names',
      'APP,YAHOO',
      '--prefix-colors',
      'cyan,yellow',
      'vite',
      'npm run yahoo-server',
    ],
    {
      cwd: projectRoot,
      stdio: 'inherit',
      shell: process.platform === 'win32',
      env: process.env,
    }
  );

  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 0);
  });

  process.on('SIGINT', () => child.kill('SIGINT'));
  process.on('SIGTERM', () => child.kill('SIGTERM'));
}

main().catch((error) => {
  console.error('[start] Failed to launch app:', error.message);
  process.exit(1);
});
