import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const RH_COOKIE_NAMES = [
  '__Host-Web-App-Secondary-Access-Token',
  '__Host-Web-App-Primary-Access-Token',
];

const RH_HEADERS = {
  Accept: 'application/json',
  'X-Robinhood-API-Version': '1.431.4',
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
};

const BROWSER_SOURCES = [
  {
    name: 'Chrome',
    baseDir: path.join(os.homedir(), 'Library/Application Support/Google/Chrome'),
    keychainService: 'Chrome Safe Storage',
    keychainAccount: 'Chrome',
  },
  {
    name: 'Brave',
    baseDir: path.join(os.homedir(), 'Library/Application Support/BraveSoftware/Brave-Browser'),
    keychainService: 'Brave Safe Storage',
    keychainAccount: 'Brave',
  },
];

function listBrowserProfiles(baseDir) {
  if (!fs.existsSync(baseDir)) return [];

  const profiles = [];
  const defaultCookies = path.join(baseDir, 'Default/Cookies');
  if (fs.existsSync(defaultCookies)) {
    profiles.push({ label: 'Default', cookiesPath: defaultCookies });
  }

  for (const entry of fs.readdirSync(baseDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith('Profile ')) continue;
    const cookiesPath = path.join(baseDir, entry.name, 'Cookies');
    if (fs.existsSync(cookiesPath)) {
      profiles.push({ label: entry.name, cookiesPath });
    }
  }

  return profiles;
}

function getChromeSafeStoragePassword(service, account) {
  try {
    return execFileSync(
      'security',
      ['find-generic-password', '-w', '-s', service, '-a', account],
      { encoding: 'utf8' }
    ).trim();
  } catch {
    return null;
  }
}

function deriveChromeKey(password) {
  return crypto.pbkdf2Sync(password, 'saltysalt', 1003, 16, 'sha1');
}

function decryptChromeCookie(encryptedValue, key) {
  if (!encryptedValue || encryptedValue.length === 0) return '';

  const prefix = encryptedValue.subarray(0, 3).toString('utf8');
  if (prefix === 'v10' || prefix === 'v11') {
    const iv = Buffer.alloc(16, ' ');
    const ciphertext = encryptedValue.subarray(3);
    const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  }

  return encryptedValue.toString('utf8');
}

function queryRobinhoodCookies(cookiesPath) {
  const tempDb = path.join(
    os.tmpdir(),
    `option-analysis-cookies-${process.pid}-${Date.now()}.db`
  );

  try {
    fs.copyFileSync(cookiesPath, tempDb);
  } catch (error) {
    throw new Error(`Unable to read browser cookies (${error.message})`);
  }

  const cookieNameList = RH_COOKIE_NAMES.map((name) => `'${name}'`).join(', ');
  const query = `
    SELECT name, value, hex(encrypted_value)
    FROM cookies
    WHERE host_key LIKE '%robinhood.com'
      AND name IN (${cookieNameList})
    ORDER BY CASE name
      WHEN '__Host-Web-App-Secondary-Access-Token' THEN 0
      ELSE 1
    END
    LIMIT 1;
  `;

  let output = '';
  try {
    output = execFileSync('sqlite3', ['-separator', '\t', '-noheader', tempDb, query], {
      encoding: 'utf8',
    }).trim();
  } finally {
    fs.rmSync(tempDb, { force: true });
  }

  if (!output) return null;

  const [name, plainValue, encryptedHex] = output.split('\t');
  if (plainValue) return { name, token: plainValue };

  if (!encryptedHex) return null;
  return { name, encryptedValue: Buffer.from(encryptedHex, 'hex') };
}

function readTokenFromProfile(source, profile) {
  const password = getChromeSafeStoragePassword(source.keychainService, source.keychainAccount);
  if (!password) return null;

  const cookie = queryRobinhoodCookies(profile.cookiesPath);
  if (!cookie) return null;

  if (cookie.token) {
    return {
      token: cookie.token.trim(),
      source: `${source.name} (${profile.label})`,
      cookieName: cookie.name,
    };
  }

  const key = deriveChromeKey(password);
  const token = decryptChromeCookie(cookie.encryptedValue, key).trim();
  if (!token) return null;

  return {
    token,
    source: `${source.name} (${profile.label})`,
    cookieName: cookie.name,
  };
}

export function readRobinhoodTokenFromBrowsers() {
  if (process.platform !== 'darwin') {
    return {
      token: null,
      error: 'Automatic browser token sync is only supported on macOS.',
    };
  }

  for (const source of BROWSER_SOURCES) {
    for (const profile of listBrowserProfiles(source.baseDir)) {
      try {
        const result = readTokenFromProfile(source, profile);
        if (result?.token) return result;
      } catch {
        // Try the next profile/browser.
      }
    }
  }

  return {
    token: null,
    error:
      'No Robinhood session found in Chrome/Brave. Log into https://robinhood.com in your browser, then restart the app.',
  };
}

export async function validateRobinhoodToken(token) {
  if (!token?.trim()) return false;

  try {
    const response = await fetch(
      'https://api.robinhood.com/accounts/?default_to_all_accounts=true&limit=1',
      {
        headers: {
          ...RH_HEADERS,
          Authorization: `Bearer ${token.trim()}`,
        },
      }
    );
    return response.ok;
  } catch {
    return false;
  }
}

export function maskToken(token) {
  if (!token) return '(empty)';
  if (token.length <= 12) return '***';
  return `${token.slice(0, 6)}...${token.slice(-4)}`;
}
