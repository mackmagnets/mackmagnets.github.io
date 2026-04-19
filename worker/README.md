# Mack Magnets Photo Upload Worker

Cloudflare Worker that proxies customer photo uploads from the website into **Shopify Files**.

```
Browser  ──multipart POST file──>  Worker  ──Admin API──>  Shopify Files
                                       └── stores SHOPIFY_ADMIN_TOKEN as secret
```

---

## One-Time Setup

### Step 1 — Configure the Shopify app for legacy OAuth

Open https://dev.shopify.com → your `mackmagnets` app → **Versions** → click **New version** with these settings:

| Setting | Value |
|---|---|
| **Use legacy install flow** | `true` (toggle ON) |
| **App URL** | `http://localhost:3737` |
| **Allowed redirect URLs** | `http://localhost:3737/callback` |
| **Admin API access scopes** | `write_files`, `read_files` |

Click **Release**, then on the store side go to **Apps → mackmagnets → Uninstall**, then **install the new version** (the dev dashboard will show an Install link).

### Step 2 — Get the offline admin access token

```bash
cd worker
npm install
CLIENT_ID=<from dev dashboard> \
CLIENT_SECRET=<from dev dashboard> \
STORE=1pp0pw-1f.myshopify.com \
node get-token.mjs
```

Browser opens, you click **Install**, the terminal prints `✅ ACCESS TOKEN: shpat_...`.

### Step 3 — Deploy the Worker

```bash
npx wrangler login           # opens browser, click Authorize
npx wrangler secret put SHOPIFY_ADMIN_TOKEN
# paste the shpat_... token when prompted

npx wrangler deploy
```

Output ends with a URL like:
```
https://mackmagnets-uploader.<your-account>.workers.dev
```

### Step 4 — Wire the website to the Worker

Edit `assets/js/uploader-config.js`:

```js
window.MACK_UPLOADER = {
  endpoint: 'https://mackmagnets-uploader.<your-account>.workers.dev/upload'
};
```

Commit & push. Done.

---

## Costs

| | |
|---|---|
| Cloudflare Worker | **$0** (free tier: 100k requests/day) |
| Shopify Files storage | **$0** (included in any paid plan) |

Replace UploadKit ($9.95/mo) → save **$120/year**.

---

## Health check

```bash
curl https://mackmagnets-uploader.<your-account>.workers.dev/
# → "Mack Magnets uploader OK"
```

## Tail logs

```bash
cd worker
npx wrangler tail
```

## Re-issue the token (if leaked)

1. In Shopify Dev Dashboard → app → **Rotate** the Client Secret
2. Re-run `node get-token.mjs` with the new secret
3. `npx wrangler secret put SHOPIFY_ADMIN_TOKEN` with the new token
4. `npx wrangler deploy`

The old token becomes invalid the moment the secret is rotated.
