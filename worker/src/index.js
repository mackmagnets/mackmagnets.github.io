/**
 * Mack Magnets — Photo Upload Worker
 * ─────────────────────────────────────────────────────────────────
 * Browser  ──POST file──>  Worker  ──Admin API──>  Shopify Files
 *
 * Endpoints:
 *   POST /upload   — multipart/form-data with 'file' field; returns { url, id }
 *   GET  /         — health check
 *
 * Secrets (set via wrangler secret put):
 *   SHOPIFY_ADMIN_TOKEN   shpat_... (offline access token)
 *
 * Vars (in wrangler.toml):
 *   SHOPIFY_STORE_DOMAIN  e.g. 1pp0pw-1f.myshopify.com
 *   SHOPIFY_API_VERSION   e.g. 2025-01
 *   ALLOWED_ORIGINS       comma-separated list of origins permitted to call /upload
 */

const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20MB
const ALLOWED_MIME = /^image\/(jpeg|png|webp|heic|heif|gif)$/;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') return cors(new Response(null, { status: 204 }), env, request);
    if (url.pathname === '/' && request.method === 'GET') return text('Mack Magnets uploader OK');
    if (url.pathname === '/upload' && request.method === 'POST') {
      return cors(await handleUpload(request, env), env, request);
    }
    return cors(new Response('Not found', { status: 404 }), env, request);
  }
};

// ── CORS ─────────────────────────────────────────────────────────
function cors(res, env, req) {
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  const origin = req?.headers?.get('Origin') || '';
  const allow = allowed.includes(origin) ? origin : (allowed[0] || '*');
  const h = new Headers(res.headers);
  h.set('Access-Control-Allow-Origin', allow);
  h.set('Vary', 'Origin');
  h.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  h.set('Access-Control-Allow-Headers', 'Content-Type');
  h.set('Access-Control-Max-Age', '86400');
  return new Response(res.body, { status: res.status, headers: h });
}

function text(s, status = 200) {
  return new Response(s, { status, headers: { 'Content-Type': 'text/plain' } });
}
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
}

// ── Main upload handler ──────────────────────────────────────────
async function handleUpload(request, env) {
  if (!env.SHOPIFY_ADMIN_TOKEN) {
    return json({ error: 'Worker missing SHOPIFY_ADMIN_TOKEN secret' }, 500);
  }

  let form;
  try { form = await request.formData(); }
  catch (e) { return json({ error: 'Bad form data' }, 400); }

  const file = form.get('file');
  if (!(file instanceof File)) return json({ error: 'Missing file field' }, 400);
  if (file.size === 0)         return json({ error: 'Empty file' }, 400);
  if (file.size > MAX_FILE_BYTES) return json({ error: 'File too large' }, 413);

  const mime = file.type || 'application/octet-stream';
  if (!ALLOWED_MIME.test(mime)) return json({ error: 'Unsupported file type: ' + mime }, 415);

  // Sanitize filename: keep extension, prefix with timestamp + random
  const safeName = sanitizeFilename(file.name || 'photo.jpg');
  const stamped = `${Date.now()}-${randomHex(4)}-${safeName}`;

  try {
    // 1) stagedUploadsCreate — get a one-time S3-style upload target
    const staged = await stagedUploadsCreate(env, {
      filename: stamped,
      mimeType: mime,
      fileSize: String(file.size),
      resource: mime.startsWith('image/') ? 'IMAGE' : 'FILE'
    });
    if (!staged) return json({ error: 'stagedUploadsCreate failed' }, 502);

    // 2) POST file to the staged URL
    const ok = await uploadToStaged(staged, file);
    if (!ok) return json({ error: 'Upload to staged URL failed' }, 502);

    // 3) fileCreate — promote the staged file into Shopify Files
    const created = await fileCreate(env, staged.resourceUrl, mime);
    if (!created) return json({ error: 'fileCreate failed' }, 502);

    // 4) Poll briefly for the permanent CDN URL (Shopify processes async)
    const finalUrl = await pollForUrl(env, created.id, mime, 6_000) || staged.resourceUrl;

    return json({
      url: finalUrl,
      id: created.id,
      filename: stamped,
      bytes: file.size
    });
  } catch (err) {
    return json({ error: 'Upload failed', detail: String(err && err.message || err) }, 500);
  }
}

// ── Shopify GraphQL helpers ──────────────────────────────────────
async function shopifyGraphQL(env, query, variables) {
  const url = `https://${env.SHOPIFY_STORE_DOMAIN}/admin/api/${env.SHOPIFY_API_VERSION}/graphql.json`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': env.SHOPIFY_ADMIN_TOKEN
    },
    body: JSON.stringify({ query, variables })
  });
  const data = await res.json();
  if (data.errors) throw new Error('GraphQL: ' + JSON.stringify(data.errors));
  return data.data;
}

async function stagedUploadsCreate(env, input) {
  const q = `
    mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
      stagedUploadsCreate(input: $input) {
        stagedTargets {
          url
          resourceUrl
          parameters { name value }
        }
        userErrors { field message }
      }
    }`;
  const data = await shopifyGraphQL(env, q, {
    input: [{
      filename: input.filename,
      mimeType: input.mimeType,
      fileSize: input.fileSize,
      resource: input.resource,
      httpMethod: 'POST'
    }]
  });
  const r = data.stagedUploadsCreate;
  if (r.userErrors && r.userErrors.length) throw new Error(r.userErrors[0].message);
  return r.stagedTargets && r.stagedTargets[0];
}

async function uploadToStaged(staged, file) {
  const fd = new FormData();
  for (const p of staged.parameters) fd.append(p.name, p.value);
  fd.append('file', file, file.name);
  const res = await fetch(staged.url, { method: 'POST', body: fd });
  return res.ok;
}

async function fileCreate(env, originalSource, mime) {
  const q = `
    mutation fileCreate($files: [FileCreateInput!]!) {
      fileCreate(files: $files) {
        files { id fileStatus alt createdAt }
        userErrors { field message }
      }
    }`;
  const contentType = mime.startsWith('image/') ? 'IMAGE' : 'FILE';
  const data = await shopifyGraphQL(env, q, {
    files: [{
      contentType,
      originalSource,
      alt: 'Customer-uploaded photo'
    }]
  });
  const r = data.fileCreate;
  if (r.userErrors && r.userErrors.length) throw new Error(r.userErrors[0].message);
  return r.files && r.files[0];
}

async function pollForUrl(env, fileId, mime, timeoutMs) {
  const isImage = mime.startsWith('image/');
  const q = `
    query GetFile($id: ID!) {
      node(id: $id) {
        ... on MediaImage { id image { url } fileStatus }
        ... on GenericFile { id url fileStatus }
      }
    }`;
  const start = Date.now();
  let delay = 250;
  while (Date.now() - start < timeoutMs) {
    try {
      const data = await shopifyGraphQL(env, q, { id: fileId });
      const n = data.node;
      const url = isImage ? (n && n.image && n.image.url) : (n && n.url);
      if (url) return url;
    } catch (_) { /* keep polling */ }
    await sleep(delay);
    delay = Math.min(delay * 1.6, 1500);
  }
  return null;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function sanitizeFilename(name) {
  return String(name)
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 80) || 'photo.jpg';
}

function randomHex(bytes) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}
