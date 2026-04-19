#!/usr/bin/env node
/**
 * One-time helper: fetch a Shopify offline admin access token via OAuth.
 *
 * Why: The new Shopify Dev Dashboard apps don't expose the admin token in the UI.
 * This script does the OAuth dance on localhost and prints the token for you to
 * store as a Cloudflare Worker secret.
 *
 * Prereq in Shopify Dev Dashboard (https://dev.shopify.com):
 *   1. Open your `mackmagnets` app
 *   2. Versions → create a new version with these settings:
 *        - Use legacy install flow: TRUE  (toggle on)
 *        - App URL: http://localhost:3737
 *        - Allowed redirect URLs: http://localhost:3737/callback
 *        - Admin API access scopes: write_files, read_files
 *   3. Release the new version
 *   4. Reinstall the app on the store (Apps → mackmagnets → uninstall, then re-install)
 *
 * Then run:
 *   cd worker
 *   CLIENT_ID=xxxx CLIENT_SECRET=xxxx STORE=1pp0pw-1f.myshopify.com node get-token.mjs
 *
 * Browser opens, you click "Install", token is printed in this terminal.
 * Copy the token, then run:
 *   wrangler secret put SHOPIFY_ADMIN_TOKEN   (paste token when prompted)
 */
import http from 'node:http';
import crypto from 'node:crypto';
import { URL } from 'node:url';
import { exec } from 'node:child_process';

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const STORE = process.env.STORE; // e.g. 1pp0pw-1f.myshopify.com
const SCOPES = 'write_files,read_files';
const PORT = 3737;
const REDIRECT = `http://localhost:${PORT}/callback`;

if (!CLIENT_ID || !CLIENT_SECRET || !STORE) {
  console.error('Set CLIENT_ID, CLIENT_SECRET, STORE env vars before running.');
  process.exit(1);
}

const state = crypto.randomBytes(16).toString('hex');
const installUrl = `https://${STORE}/admin/oauth/authorize?` +
  `client_id=${CLIENT_ID}&scope=${encodeURIComponent(SCOPES)}` +
  `&redirect_uri=${encodeURIComponent(REDIRECT)}&state=${state}`;

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://localhost:${PORT}`);
  if (u.pathname !== '/callback') {
    res.writeHead(302, { Location: installUrl });
    res.end();
    return;
  }
  const code = u.searchParams.get('code');
  const gotState = u.searchParams.get('state');
  if (!code || gotState !== state) {
    res.writeHead(400); res.end('Bad state or missing code');
    return;
  }
  try {
    const tokenRes = await fetch(`https://${STORE}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code: code
      })
    });
    const data = await tokenRes.json();
    if (!data.access_token) {
      res.writeHead(500); res.end('No access_token: ' + JSON.stringify(data));
      return;
    }
    console.log('\n══════════════════════════════════════════════════════════');
    console.log('✅ ACCESS TOKEN (copy this — shown only once):\n');
    console.log('   ' + data.access_token);
    console.log('\n   scope: ' + data.scope);
    console.log('══════════════════════════════════════════════════════════\n');
    console.log('Next: cd worker && wrangler secret put SHOPIFY_ADMIN_TOKEN');
    console.log('      paste the token when prompted.\n');
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<h2>✅ Token captured. Check your terminal.</h2><p>You can close this tab.</p>');
    setTimeout(() => process.exit(0), 500);
  } catch (e) {
    res.writeHead(500); res.end('Token exchange failed: ' + e.message);
  }
});

server.listen(PORT, () => {
  console.log(`\nOpening browser to install URL on port ${PORT}...`);
  console.log('If it does not open, visit this URL manually:\n  ' + installUrl + '\n');
  const cmd = process.platform === 'darwin' ? 'open' :
              process.platform === 'win32' ? 'start' : 'xdg-open';
  exec(`${cmd} "${installUrl}"`);
});
