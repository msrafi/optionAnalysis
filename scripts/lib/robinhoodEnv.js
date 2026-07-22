import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..', '..');
const envLocalPath = path.join(projectRoot, '.env.local');
const envExamplePath = path.join(projectRoot, '.env.example');

export const ROBINHOOD_TOKEN_KEY = 'ROBINHOOD_BROKERAGE_TOKEN';

function readEnvLines(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, 'utf8').split('\n');
}

export function getRobinhoodTokenFromEnvLocal() {
  for (const line of readEnvLines(envLocalPath)) {
    if (!line.startsWith(`${ROBINHOOD_TOKEN_KEY}=`)) continue;
    return line.slice(ROBINHOOD_TOKEN_KEY.length + 1).trim();
  }
  return '';
}

export function writeRobinhoodTokenToEnvLocal(token) {
  const sourceLines = fs.existsSync(envLocalPath)
    ? readEnvLines(envLocalPath)
    : readEnvLines(envExamplePath);

  let found = false;
  const updatedLines = sourceLines.map((line) => {
    if (!line.startsWith(`${ROBINHOOD_TOKEN_KEY}=`)) return line;
    found = true;
    return `${ROBINHOOD_TOKEN_KEY}=${token}`;
  });

  if (!found) {
    if (updatedLines.length > 0 && updatedLines[updatedLines.length - 1] !== '') {
      updatedLines.push('');
    }
    updatedLines.push(`${ROBINHOOD_TOKEN_KEY}=${token}`);
  }

  const content = updatedLines.join('\n');
  fs.writeFileSync(envLocalPath, content.endsWith('\n') ? content : `${content}\n`, 'utf8');
}

export function getEnvLocalPath() {
  return envLocalPath;
}
