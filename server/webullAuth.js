import crypto from 'crypto';

export function utcTimestamp() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export function generateNonce() {
  return crypto.randomUUID().replace(/-/g, '');
}

export function generateSignature(path, queryParams, bodyString, appKey, appSecret, host, timestamp, nonce) {
  const signingHeaders = {
    host,
    'x-app-key': appKey,
    'x-signature-algorithm': 'HMAC-SHA1',
    'x-signature-nonce': nonce,
    'x-signature-version': '1.0',
    'x-timestamp': timestamp,
  };

  const allParams = { ...(queryParams || {}), ...signingHeaders };
  const str1 = Object.keys(allParams)
    .sort()
    .map((key) => `${key}=${allParams[key]}`)
    .join('&');

  let str3;
  if (bodyString) {
    const str2 = crypto.createHash('md5').update(bodyString, 'utf8').digest('hex').toUpperCase();
    str3 = `${path}&${str1}&${str2}`;
  } else {
    str3 = `${path}&${str1}`;
  }

  const encodedString = encodeURIComponent(str3);
  const signingKey = `${appSecret}&`;
  return crypto.createHmac('sha1', signingKey).update(encodedString, 'utf8').digest('base64');
}

export function buildSignedHeaders({ appKey, appSecret, host, accessToken, path, queryParams, body }) {
  const timestamp = utcTimestamp();
  const nonce = generateNonce();
  const bodyString = body ? JSON.stringify(body) : null;
  const signature = generateSignature(path, queryParams, bodyString, appKey, appSecret, host, timestamp, nonce);

  const headers = {
    'x-app-key': appKey,
    'x-timestamp': timestamp,
    'x-signature': signature,
    'x-signature-algorithm': 'HMAC-SHA1',
    'x-signature-version': '1.0',
    'x-signature-nonce': nonce,
    'x-version': 'v2',
    Accept: 'application/json',
  };

  if (accessToken) {
    headers['x-access-token'] = accessToken;
  }
  if (bodyString) {
    headers['Content-Type'] = 'application/json';
  }

  return { headers, bodyString };
}

export async function webullRequest(config, { method, path, queryParams, body, accessToken }) {
  const { baseUrl } = config;
  const { headers, bodyString } = buildSignedHeaders({
    appKey: config.appKey,
    appSecret: config.appSecret,
    host: config.host,
    accessToken,
    path,
    queryParams,
    body,
  });

  const url = new URL(`${baseUrl}${path}`);
  if (queryParams) {
    for (const [key, value] of Object.entries(queryParams)) {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    }
  }

  const response = await fetch(url.toString(), {
    method: method.toUpperCase(),
    headers,
    body: bodyString || undefined,
  });

  const text = await response.text();
  let json = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = { raw: text };
    }
  }

  return { ok: response.ok, status: response.status, json };
}
