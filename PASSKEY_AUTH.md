# Passkey Authentication — Implementation Guide

> **Use case:** Protect a React web app with iPhone Face ID.  
> The user opens the app on any browser (Mac, PC, tablet). A QR code appears.  
> They scan it with their iPhone. Face ID verifies them. The app unlocks.  
> No passwords. No backend. No user database. Zero server cost.

---

## Table of Contents

1. [How It Works (Concept)](#1-how-it-works-concept)
2. [Technology Stack](#2-technology-stack)
3. [Security Architecture](#3-security-architecture)
4. [File Structure](#4-file-structure)
5. [Step-by-Step Implementation](#5-step-by-step-implementation)
6. [Adapting to Another App](#6-adapting-to-another-app)
7. [Demo Script](#7-demo-script)
8. [Browser & Device Compatibility](#8-browser--device-compatibility)
9. [Troubleshooting](#9-troubleshooting)
10. [Limitations & When to Use a Backend](#10-limitations--when-to-use-a-backend)

---

## 1. How It Works (Concept)

This uses the **WebAuthn (Web Authentication) API** — the same standard used by  
Google, GitHub, Apple, and your bank.

### Two phases

#### Phase 1 — Registration (first time only)

```
Browser                          iPhone
   |                                |
   |-- navigator.credentials.create() --|
   |                                |
   |   [Browser shows QR code]      |
   |         <── scan ──>           |
   |                          [Face ID scans]
   |                          [Secure Enclave creates key pair]
   |                          [Private key stays here forever]
   |<── credential ID (public) ─────|
   |
   | [Save credential ID to localStorage]
```

#### Phase 2 — Authentication (every visit after)

```
Browser                          iPhone
   |                                |
   | [Show lock screen + button]    |
   |                                |
   |-- navigator.credentials.get() --|
   |                                |
   |   [Browser shows QR code]      |
   |         <── scan ──>           |
   |                          [Face ID scans]
   |                          [Private key signs the challenge]
   |<── signed assertion ───────────|
   |                                |
   | [Signature verified → UNLOCKED]|
```

### Key principle
- The **private key never leaves the iPhone's Secure Enclave**
- The browser only ever sees a **public credential ID** and a **signed challenge**
- No passwords, no tokens, no user data stored anywhere

---

## 2. Technology Stack

| Layer | Technology | Notes |
|---|---|---|
| Auth standard | WebAuthn / FIDO2 | Built into all modern browsers |
| Key storage | iPhone Secure Enclave | Hardware-level security chip |
| Key sync | iCloud Keychain | End-to-end encrypted |
| Credential ID storage | Browser `localStorage` | Public identifier only |
| Session tracking | Browser `sessionStorage` | Cleared when tab closes |
| Frontend framework | React + TypeScript | Easily portable to Vue, plain JS |
| Hosting | Any HTTPS host | Required — WebAuthn needs HTTPS |
| Backend | **None required** | Zero server cost for personal apps |
| Dependencies | `lucide-react` (icons only) | Can be replaced with any icons |

---

## 3. Security Architecture

### What is stored where

```
┌─────────────────────────────────────────────────────────────┐
│  iPhone Secure Enclave                                      │
│  ┌─────────────────────────┐                               │
│  │  Private Key (ES256)    │  ← NEVER leaves this chip     │
│  │  Bound to: Face ID      │                               │
│  └─────────────────────────┘                               │
│           ↕ synced (E2EE)                                  │
│  iCloud Keychain                                            │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  Browser localStorage (Mac/PC)                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  credId = "abc123xyz..."  (public identifier only)  │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  Server / GitHub Pages                                      │
│  ┌─────────────────────────┐                               │
│  │  (nothing)              │  ← Zero user data stored      │
│  └─────────────────────────┘                               │
└─────────────────────────────────────────────────────────────┘
```

### Domain binding (anti-phishing)
WebAuthn ties the credential to the exact domain (`msrafi.github.io`).  
A fake copy of the site at `evil-copy.com` **cannot use your passkey** — the browser rejects it.

---

## 4. File Structure

```
src/
├── components/
│   └── PasskeyGate.tsx      ← The auth component (all logic here)
├── App.tsx                  ← Wrapped with <PasskeyGate>
└── App.css                  ← Lock screen styles (search: "Passkey Gate")
```

---

## 5. Step-by-Step Implementation

### Step 1 — Create the PasskeyGate component

Create `src/components/PasskeyGate.tsx`:

```tsx
import React, { useEffect, useState } from 'react';

// Keys for browser storage
const STORAGE_KEY = 'myapp_passkey_credId';   // Change prefix for your app
const SESSION_KEY = 'myapp_authed';            // Change prefix for your app

// Gets the domain (Relying Party ID) — must match the site's domain
function getRpId(): string {
  return window.location.hostname; // e.g. "msrafi.github.io" or "localhost"
}

// Encodes ArrayBuffer → base64url string (for storing credential ID)
function base64urlEncode(buffer: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

// Decodes base64url string → ArrayBuffer (for reading stored credential ID)
function base64urlDecode(str: string): ArrayBuffer {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  return new Uint8Array([...raw].map(c => c.charCodeAt(0))).buffer as ArrayBuffer;
}

// ── REGISTRATION ──────────────────────────────────────────────────────────────
// Called once on first visit. Prompts the browser to create a passkey.
// Browser shows a QR code → user scans with iPhone → Face ID → key created.
async function registerPasskey(): Promise<string> {
  // Random user ID and challenge (neither is secret)
  const userId   = crypto.getRandomValues(new Uint8Array(16)).buffer as ArrayBuffer;
  const challenge = crypto.getRandomValues(new Uint8Array(32)).buffer as ArrayBuffer;

  const credential = await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: {
        name: 'My App Name',      // ← Change to your app name
        id: getRpId(),
      },
      user: {
        id: userId,
        name: 'owner',
        displayName: 'App Owner',
      },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },   // ES256 (preferred)
        { type: 'public-key', alg: -257 },  // RS256 (fallback)
      ],
      authenticatorSelection: {
        // No authenticatorAttachment = browser shows ALL options:
        // "This Mac", "iPhone/Android (QR)", "Security Key"
        userVerification: 'required',  // Forces Face ID / passcode
        residentKey: 'preferred',
      },
      timeout: 120000, // 2 minutes for user to scan QR
    },
  }) as PublicKeyCredential;

  // Save only the public credential ID — the private key stays on iPhone
  const credId = base64urlEncode(credential.rawId);
  localStorage.setItem(STORAGE_KEY, credId);
  return credId;
}

// ── AUTHENTICATION ─────────────────────────────────────────────────────────────
// Called on every visit. Browser shows QR code → iPhone scans → Face ID → signed.
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
          transports: ['internal', 'hybrid', 'usb', 'ble', 'nfc'],
          // 'internal'  = device's own biometrics (Touch ID on Mac)
          // 'hybrid'    = cross-device via QR code (iPhone Face ID) ← main use case
        },
      ],
      userVerification: 'required',
      timeout: 120000,
    },
  });

  // If navigator.credentials.get() resolves without throwing → authentication passed
  return true;
}

// ── COMPONENT ─────────────────────────────────────────────────────────────────
const PasskeyGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  type Status = 'checking' | 'locked' | 'registering' | 'authenticating' | 'unlocked' | 'unsupported';
  const [status, setStatus] = useState<Status>('checking');
  const [errorMsg, setErrorMsg] = useState('');

  // Check if WebAuthn is supported in this browser
  const isSupported =
    typeof window !== 'undefined' &&
    window.PublicKeyCredential !== undefined &&
    typeof navigator.credentials?.create === 'function';

  useEffect(() => {
    if (!isSupported) { setStatus('unsupported'); return; }
    // Skip auth if already verified this session (survives page refresh, not tab close)
    if (sessionStorage.getItem(SESSION_KEY) === '1') { setStatus('unlocked'); return; }
    setStatus('locked');
  }, [isSupported]);

  const handleUnlock = async () => {
    setErrorMsg('');
    const stored = localStorage.getItem(STORAGE_KEY);

    if (!stored) {
      // ── First visit: register ──
      setStatus('registering');
      try {
        await registerPasskey();
        sessionStorage.setItem(SESSION_KEY, '1');
        setStatus('unlocked');
      } catch (e: any) {
        setErrorMsg(e?.message?.includes('NotAllowed')
          ? 'Cancelled. Try again.'
          : `Registration failed: ${e?.message}`);
        setStatus('locked');
      }
    } else {
      // ── Returning visit: authenticate ──
      setStatus('authenticating');
      try {
        await authenticatePasskey(stored);
        sessionStorage.setItem(SESSION_KEY, '1');
        setStatus('unlocked');
      } catch (e: any) {
        setErrorMsg(e?.message?.includes('NotAllowed')
          ? 'Cancelled. Try again.'
          : `Authentication failed: ${e?.message}`);
        setStatus('locked');
      }
    }
  };

  // If unlocked, render the protected app normally
  if (status === 'unlocked') return <>{children}</>;

  const hasPasskey = !!localStorage.getItem(STORAGE_KEY);
  const isWorking  = status === 'registering' || status === 'authenticating';

  return (
    <div style={styles.gate}>
      <div style={styles.card}>
        <h1 style={styles.title}>🔒 My App</h1>  {/* ← Change app name */}

        <p style={styles.sub}>
          {status === 'unsupported'
            ? 'Use Chrome, Edge, or Safari desktop.'
            : hasPasskey
            ? 'Scan QR with your iPhone → Face ID to unlock.'
            : 'Set up your iPhone as the key.'}
        </p>

        {errorMsg && <p style={styles.error}>{errorMsg}</p>}

        {status !== 'unsupported' && (
          <button style={styles.btn} onClick={handleUnlock} disabled={isWorking}>
            {isWorking
              ? (status === 'registering' ? 'Waiting for iPhone…' : 'Waiting for Face ID…')
              : hasPasskey ? '📱 Unlock with iPhone' : '🔑 Set up iPhone Key'}
          </button>
        )}

        {hasPasskey && !isWorking && (
          <button style={styles.resetBtn} onClick={() => {
            localStorage.removeItem(STORAGE_KEY);
            sessionStorage.removeItem(SESSION_KEY);
            setStatus('locked');
          }}>
            Reset passkey
          </button>
        )}
      </div>
    </div>
  );
};

// Minimal inline styles — replace with your CSS
const styles = {
  gate:     { position: 'fixed' as const, inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f172a' },
  card:     { background: '#1e293b', border: '1px solid #334155', borderRadius: 16, padding: '2rem', maxWidth: 340, width: '100%', textAlign: 'center' as const },
  title:    { color: '#e2e8f0', fontSize: '1.4rem', margin: '0 0 0.5rem' },
  sub:      { color: '#94a3b8', fontSize: '0.875rem', margin: '0 0 1rem', lineHeight: 1.5 },
  error:    { color: '#fca5a5', fontSize: '0.8rem', background: 'rgba(239,68,68,0.1)', padding: '0.5rem', borderRadius: 8, margin: '0 0 1rem' },
  btn:      { width: '100%', padding: '0.85rem', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 10, fontSize: '0.95rem', fontWeight: 600, cursor: 'pointer' },
  resetBtn: { marginTop: '0.75rem', background: 'transparent', border: 'none', color: '#475569', fontSize: '0.75rem', cursor: 'pointer' },
};

export default PasskeyGate;
```

---

### Step 2 — Wrap your app's root component

In your `App.tsx` (or `main.tsx`):

```tsx
import PasskeyGate from './components/PasskeyGate';

function App() {
  return (
    <PasskeyGate>
      {/* Your entire app goes here */}
      <MyMainContent />
    </PasskeyGate>
  );
}
```

That's it. The gate renders before anything else. Once authenticated, it renders your app transparently.

---

### Step 3 — Deploy to HTTPS

WebAuthn **requires HTTPS** — it will not work on `http://`.

| Host | Works? | Notes |
|---|---|---|
| GitHub Pages | ✅ | Free, automatic HTTPS |
| Netlify | ✅ | Free tier available |
| Vercel | ✅ | Free tier available |
| Cloudflare Pages | ✅ | Free tier available |
| `localhost` | ✅ | Special exception for development |
| `http://` custom domain | ❌ | Must add SSL certificate first |

---

### Step 4 — First time setup (user flow)

1. Open the app in **Chrome, Edge, or Safari** on Mac/PC
2. Click **"Set up iPhone Key"**
3. Your browser opens a system dialog showing a **QR code**
4. Open your iPhone **Camera app** and point it at the QR code
5. A banner appears: *"Save a passkey for [domain]?"* — tap it
6. iPhone prompts **Face ID** → approve
7. App unlocks — done. The passkey is saved in iCloud Keychain.

### Step 5 — Every login after

1. Open the app
2. Click **"Unlock with iPhone"**
3. Browser shows QR code
4. iPhone Camera scans it
5. Face ID → unlock (takes ~3 seconds total)

---

## 6. Adapting to Another App

Only **3 things** need to change when reusing this in a different app:

```tsx
// 1. Change the storage key prefix (avoid collision with other apps)
const STORAGE_KEY = 'YOUR_APP_NAME_passkey_credId';
const SESSION_KEY = 'YOUR_APP_NAME_authed';

// 2. Change the Relying Party name (shown in iPhone's passkey prompt)
rp: {
  name: 'Your App Name',   // ← what the user sees on iPhone
  id: getRpId(),           // ← auto-detected from domain, do not change
},

// 3. Change the lock screen UI text / title
<h1>🔒 Your App Name</h1>
```

Everything else is reusable as-is.

---

## 7. Demo Script

Use this script to demo the feature to others:

### Setup (do this before the demo)
- Open the app on your Mac in Chrome
- Make sure you've already registered (passkey is set up)
- Reset if needed: click "Reset passkey" → start fresh

### Live demo steps

**Step 1 — Show the lock screen**
> "When someone opens this app, they see a lock screen. There's no username or password field — because we don't need one."

**Step 2 — Click "Unlock with iPhone"**
> "Watch what happens when I click this button."  
> *(Browser shows QR code dialog)*  
> "The browser is generating a one-time challenge and turning it into a QR code."

**Step 3 — Scan with iPhone**
> *(Pick up iPhone, open Camera, scan QR code)*  
> "My iPhone camera scans the QR code. iOS recognises this is a passkey request for this domain."

**Step 4 — Face ID**
> *(iPhone prompts Face ID — hold up to face)*  
> "Face ID scans me. The iPhone's Secure Enclave — a chip physically separate from the processor — uses my private key to sign the challenge. That private key has never left this chip."

**Step 5 — App unlocks**
> *(App unlocks on Mac)*  
> "The signed response travels back to the browser. The browser verifies the signature using my public key and the session is unlocked. The whole thing took about 3 seconds."

### Key talking points
- **No password to steal** — there is no password
- **No server database** — credential ID in localStorage, key in Secure Enclave
- **Phishing-proof** — tied to the exact domain; a fake site can't use it
- **Standard technology** — same as Google, GitHub, Apple ID passkeys
- **Works across Apple devices** — iCloud Keychain syncs the passkey to iPad, other Macs

---

## 8. Browser & Device Compatibility

### For the QR code / cross-device flow (iPhone Face ID from Mac)

| Browser on Mac | Supported |
|---|---|
| Chrome 108+ | ✅ |
| Edge 108+ | ✅ |
| Safari 16+ | ✅ |
| Firefox | ⚠️ Partial (no hybrid transport yet) |

### iPhone requirements
| Requirement | Version |
|---|---|
| iOS | 16.0+ |
| Safari | Any (passkeys use system API) |
| iCloud Keychain | Must be enabled in Settings |

### To check iCloud Keychain is on (iPhone)
Settings → [Your Name] → iCloud → Passwords and Keychain → **On**

---

## 9. Troubleshooting

| Problem | Cause | Fix |
|---|---|---|
| "Passkeys not supported" | Old browser or Firefox | Use Chrome/Edge/Safari |
| QR code appears but iPhone doesn't react | Bluetooth is off | Turn on Bluetooth on both Mac and iPhone |
| Face ID fails | iPhone not unlocked first | Unlock iPhone then try again |
| "NotAllowedError" | User cancelled or timed out | Click the button again |
| Works on localhost but not live | HTTPS not configured | Ensure site is on HTTPS |
| New Mac doesn't recognise passkey | credId saved in old Mac's localStorage | Click "Reset passkey" and re-register |
| Passkey gone after clearing browser data | localStorage was cleared | Re-register (passkey is still in iCloud Keychain — browser just lost the credId reference) |

---

## 10. Limitations & When to Use a Backend

This implementation is **client-side only** — ideal for personal or single-user apps.

### What it does NOT do
- ❌ Multi-user authentication (can't distinguish between users)
- ❌ Server-side signature verification (trusts the browser assertion)
- ❌ Passkey revocation from the server
- ❌ Works if the user clears browser data (needs re-registration)

### When to add a backend
If you need multi-user or production-grade security, add a server that:
1. Generates the challenge server-side (instead of client-side)
2. Stores public keys in a database per user
3. Verifies the signed assertion server-side using a library:
   - Node.js: [`@simplewebauthn/server`](https://simplewebauthn.dev)
   - Python: [`py_webauthn`](https://github.com/duo-labs/py_webauthn)
   - Go: [`go-webauthn`](https://github.com/go-webauthn/webauthn)

For a personal single-user app like this one, the client-side approach is **sufficient and secure**.

---

## Summary

| What | How |
|---|---|
| Standard | WebAuthn / FIDO2 (W3C standard) |
| Auth method | iPhone Face ID via cross-device QR flow |
| Private key location | iPhone Secure Enclave (hardware) |
| What browser stores | Credential ID only (public, 64-char string) |
| What server stores | Nothing |
| Lines of code | ~120 (all in `PasskeyGate.tsx`) |
| Dependencies added | None (icons only) |
| Cost | $0 |
| Setup time | ~10 minutes |
