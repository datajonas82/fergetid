#!/usr/bin/env node
// Generate the Apple "Sign in with Apple" client secret (a JWT) for the
// Supabase Apple provider. Apple client secrets expire at most every 6 months,
// so re-run this and paste the new value into Supabase → Auth → Providers →
// Apple → "Secret Key (for OAuth)" whenever it is about to expire.
//
// Usage:
//   node scripts/gen-apple-client-secret.mjs ~/Downloads/AuthKey_QLRNYZAC4M.p8
//
// The .p8 private key never leaves your machine. The printed JWT is a secret —
// paste it straight into Supabase; do not commit it or share it.
//
// Identifiers below are NOT secret (Team ID, Key ID, Services ID). Override via
// env if they ever change: TEAM_ID, KEY_ID, CLIENT_ID.

import crypto from 'node:crypto';
import fs from 'node:fs';

const TEAM_ID = process.env.TEAM_ID || '4KXD6TXQZQ';        // Apple Developer Team ID
const KEY_ID = process.env.KEY_ID || 'QLRNYZAC4M';          // Sign in with Apple key id
const CLIENT_ID = process.env.CLIENT_ID || 'app.fergetid';  // Services ID (web OAuth client_id)

const p8Path = process.argv[2];
if (!p8Path) {
  console.error('Usage: node scripts/gen-apple-client-secret.mjs <path-to-AuthKey_XXXX.p8>');
  process.exit(1);
}

const privateKey = fs.readFileSync(p8Path, 'utf8');

const now = Math.floor(Date.now() / 1000);
const header = { alg: 'ES256', kid: KEY_ID };
const payload = {
  iss: TEAM_ID,
  iat: now,
  exp: now + 15552000, // 180 days (Apple max is ~6 months)
  aud: 'https://appleid.apple.com',
  sub: CLIENT_ID,
};

const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
const signingInput = `${b64(header)}.${b64(payload)}`;

// ES256 in JOSE uses the raw r||s signature (ieee-p1363), not DER.
const signature = crypto
  .sign('SHA256', Buffer.from(signingInput), { key: privateKey, dsaEncoding: 'ieee-p1363' })
  .toString('base64url');

const jwt = `${signingInput}.${signature}`;

const expiry = new Date((now + 15552000) * 1000).toISOString().slice(0, 10);
console.error(`\nApple client secret (Services ID ${CLIENT_ID}, expires ${expiry}):\n`);
console.log(jwt);
console.error('\nPaste the line above into Supabase → Auth → Providers → Apple → "Secret Key (for OAuth)".');
