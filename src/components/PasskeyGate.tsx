import React, { useEffect, useState } from 'react';
import { ShieldCheck, Fingerprint, KeyRound, AlertTriangle, ShieldOff } from 'lucide-react';

const STORAGE_KEY  = 'optionAnalysis_passkey_credId';
const SESSION_KEY  = 'optionAnalysis_authed';
const ENABLED_KEY  = 'optionAnalysis_passkey_enabled';

function getRpId(): string {
  const host = window.location.hostname;
  // localhost or any IP → use as-is; otherwise strip to registrable domain
  return host;
}

function base64urlEncode(buffer: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function base64urlDecode(str: string): ArrayBuffer {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  return new Uint8Array([...raw].map(c => c.charCodeAt(0))).buffer as ArrayBuffer;
}

async function registerPasskey(): Promise<string> {
  const userId = crypto.getRandomValues(new Uint8Array(16)).buffer as ArrayBuffer;
  const challenge = crypto.getRandomValues(new Uint8Array(32)).buffer as ArrayBuffer;

  const credential = await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: {
        name: 'Option Analysis',
        id: getRpId(),
      },
      user: {
        id: userId,
        name: 'owner',
        displayName: 'App Owner',
      },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },  // ES256
        { type: 'public-key', alg: -257 }, // RS256
      ],
      authenticatorSelection: {
        // No authenticatorAttachment restriction → browser shows all options:
        // "This device", "iPhone / Android" (QR code), "Security key"
        userVerification: 'required',
        residentKey: 'preferred',
      },
      timeout: 120000,
    },
  }) as PublicKeyCredential;

  const credId = base64urlEncode(credential.rawId);
  localStorage.setItem(STORAGE_KEY, credId);
  return credId;
}

async function authenticatePasskey(credId: string): Promise<boolean> {
  const challenge = crypto.getRandomValues(new Uint8Array(32)).buffer as ArrayBuffer;

  await navigator.credentials.get({
    publicKey: {
      challenge,
      rpId: getRpId(),
      allowCredentials: [
        {
          type: 'public-key',
          id: base64urlDecode(credId),
          // Allow both on-device and cross-device (QR code → iPhone Face ID)
          transports: ['internal', 'hybrid', 'usb', 'ble', 'nfc'],
        },
      ],
      userVerification: 'required',
      timeout: 120000,
    },
  });

  // If no exception thrown, Face ID / passcode passed
  return true;
}

const PasskeyGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  type Status = 'checking' | 'locked' | 'authenticating' | 'registering' | 'unlocked' | 'unsupported';
  const [status, setStatus]     = useState<Status>('checking');
  const [errorMsg, setErrorMsg] = useState('');
  const [enabled, setEnabled]   = useState<boolean>(() =>
    localStorage.getItem(ENABLED_KEY) === 'true'
  );

  const isSupported =
    typeof window !== 'undefined' &&
    window.PublicKeyCredential !== undefined &&
    typeof navigator.credentials?.create === 'function';

  useEffect(() => {
    if (!enabled) { setStatus('unlocked'); return; }
    if (!isSupported) { setStatus('unsupported'); return; }
    if (sessionStorage.getItem(SESSION_KEY) === '1') { setStatus('unlocked'); return; }
    setStatus('locked');
  }, [enabled, isSupported]);

  const toggleEnabled = (next: boolean) => {
    localStorage.setItem(ENABLED_KEY, String(next));
    setEnabled(next);
    if (!next) {
      // Turning off — clear session lock so the gate opens immediately
      sessionStorage.setItem(SESSION_KEY, '1');
      setStatus('unlocked');
    } else {
      // Turning on — require auth on next visit (don't lock immediately this session)
      sessionStorage.setItem(SESSION_KEY, '1');
      setStatus('unlocked');
    }
  };

  const handleUnlock = async () => {
    setErrorMsg('');
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      setStatus('registering');
      try {
        await registerPasskey();
        sessionStorage.setItem(SESSION_KEY, '1');
        setStatus('unlocked');
      } catch (e: any) {
        const msg = e?.message || String(e);
        setErrorMsg(msg.includes('NotAllowed') ? 'Cancelled. Try again.' : `Registration failed: ${msg}`);
        setStatus('locked');
      }
    } else {
      setStatus('authenticating');
      try {
        await authenticatePasskey(stored);
        sessionStorage.setItem(SESSION_KEY, '1');
        setStatus('unlocked');
      } catch (e: any) {
        const msg = e?.message || String(e);
        setErrorMsg(msg.includes('NotAllowed') ? 'Cancelled. Try again.' : `Authentication failed: ${msg}`);
        setStatus('locked');
      }
    }
  };

  const handleReset = () => {
    localStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem(SESSION_KEY);
    setErrorMsg('');
    setStatus('locked');
  };

  // ── Unlocked: render app + floating security toggle ───────────────────────
  if (status === 'unlocked') {
    return (
      <>
        {children}
        <div className="passkey-fab" title={enabled ? 'Security: ON — click to disable' : 'Security: OFF — click to enable'}>
          <button
            className={`passkey-fab-btn ${enabled ? 'passkey-fab-btn--on' : 'passkey-fab-btn--off'}`}
            onClick={() => toggleEnabled(!enabled)}
          >
            {enabled
              ? <ShieldCheck size={16} />
              : <ShieldOff size={16} />}
            <span>{enabled ? 'Auth ON' : 'Auth OFF'}</span>
          </button>
        </div>
      </>
    );
  }

  // ── Lock screen ───────────────────────────────────────────────────────────
  const hasPasskey = !!localStorage.getItem(STORAGE_KEY);
  const isWorking  = status === 'registering' || status === 'authenticating';

  return (
    <div className="passkey-gate">
      <div className="passkey-card">
        <div className="passkey-icon-wrap">
          {status === 'unsupported'
            ? <AlertTriangle size={40} className="passkey-icon-warn" />
            : <ShieldCheck size={40} className="passkey-icon-shield" />}
        </div>

        <h1 className="passkey-title">Option Analysis</h1>
        <p className="passkey-sub">
          {status === 'unsupported'
            ? 'Passkeys are not supported in this browser.'
            : hasPasskey
            ? 'Scan the QR code with your iPhone to unlock using Face ID.'
            : 'Set up your iPhone as the key to protect this app.'}
        </p>

        {errorMsg && (
          <div className="passkey-error">
            <AlertTriangle size={14} />
            {errorMsg}
          </div>
        )}

        {status !== 'unsupported' && (
          <button className="passkey-btn" onClick={handleUnlock} disabled={isWorking}>
            {isWorking ? (
              <><span className="passkey-spinner" />{status === 'registering' ? 'Waiting for iPhone…' : 'Waiting for Face ID…'}</>
            ) : hasPasskey ? (
              <><Fingerprint size={18} />Unlock — Show QR for iPhone</>
            ) : (
              <><KeyRound size={18} />Set up iPhone as Key</>
            )}
          </button>
        )}

        {hasPasskey && !isWorking && (
          <button className="passkey-reset-btn" onClick={handleReset}>Reset passkey</button>
        )}

        {/* Toggle to disable auth from the lock screen itself */}
        <div className="passkey-toggle-row">
          <span className="passkey-toggle-label">Login required</span>
          <button
            className={`passkey-toggle ${enabled ? 'passkey-toggle--on' : ''}`}
            onClick={() => toggleEnabled(!enabled)}
            title="Toggle passkey authentication"
          >
            <span className="passkey-toggle-thumb" />
          </button>
        </div>

        <p className="passkey-note">
          {status === 'unsupported'
            ? 'Please use Chrome, Edge, or Safari on a desktop.'
            : 'Your iPhone camera will scan a QR code. Face ID verifies you. Nothing leaves your device.'}
        </p>
      </div>
    </div>
  );
};

export default PasskeyGate;
