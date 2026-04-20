/**
 * Mack Magnets — Photo Uploader Config
 * ─────────────────────────────────────────────────────────────────
 * After deploying the Cloudflare Worker (see worker/README.md),
 * paste the Worker URL below. Until then, the uploader shows a
 * "contact us by email" fallback on PDPs for custom products.
 */
(function () {
  window.MACK_UPLOADER = {
    // Set after `wrangler deploy` — looks like:
    //   https://mackmagnets-uploader.<your-account>.workers.dev/upload
    endpoint: 'https://mackmagnets-uploader.ajayadesign.workers.dev/upload',

    // Limits enforced client-side before uploading
    maxFileBytes: 20 * 1024 * 1024,    // 20MB
    acceptedTypes: [
      'image/jpeg', 'image/png', 'image/webp',
      'image/heic', 'image/heif', 'image/gif'
    ]
  };
})();
