const { chromium } = require('playwright');
const path = require('path');

const SCREENSHOT_DIR = path.join(__dirname, '..', 'assets', 'images', 'screenshots');
const NEW_BASE = 'http://localhost:3000';
const OLD_BASE = 'https://mackmagnets.com';

// New site pages (our rebuild)
const newPages = [
  { name: 'new-home', path: '/' },
  { name: 'new-shop', path: '/shop/' },
  { name: 'new-events', path: '/events/' },
  { name: 'new-about', path: '/about/' },
  { name: 'new-contact', path: '/contact/' },
  { name: 'new-faq', path: '/faq/' },
  { name: 'new-wholesale', path: '/wholesale/' },
];

// Old Shopify site pages (live at mackmagnets.com)
const oldPages = [
  { name: 'old-home', url: OLD_BASE + '/' },
  { name: 'old-shop', url: OLD_BASE + '/collections/all' },
  { name: 'old-events', url: null },     // doesn't exist on old site
  { name: 'old-about', url: OLD_BASE + '/pages/about-us' },
  { name: 'old-contact', url: OLD_BASE + '/pages/contact' },
  { name: 'old-faq', url: null },        // doesn't exist on old site
  { name: 'old-wholesale', url: null },   // doesn't exist on old site
];

async function captureScreenshot(page, url, name, viewport) {
  await page.setViewportSize(viewport);
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
  } catch {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  }
  // Extra wait for animations/images
  await page.waitForTimeout(1500);
  const filePath = path.join(SCREENSHOT_DIR, name + '.jpg');
  await page.screenshot({ path: filePath, fullPage: false, type: 'jpeg', quality: 85 });
  console.log(`  ✓ ${name}.jpg`);
}

async function createPlaceholder(page, name, pageName) {
  // For pages that don't exist on the old site, create a "Page Not Found" placeholder
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.setContent(`
    <!DOCTYPE html>
    <html>
    <head><style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body {
        width: 1280px; height: 800px;
        background: #f4f4f4;
        display: flex; align-items: center; justify-content: center;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        color: #666;
      }
      .card {
        text-align: center;
        background: #fff;
        padding: 3rem 4rem;
        border-radius: 16px;
        box-shadow: 0 2px 20px rgba(0,0,0,0.08);
      }
      .icon { font-size: 4rem; margin-bottom: 1rem; }
      h2 { font-size: 1.5rem; color: #333; margin-bottom: 0.5rem; }
      p { font-size: 1rem; color: #999; }
      .tag { display: inline-block; background: #fce4e4; color: #c33; padding: 0.3rem 0.8rem; border-radius: 20px; font-size: 0.8rem; font-weight: 600; margin-top: 1rem; }
    </style></head>
    <body>
      <div class="card">
        <div class="icon">🚫</div>
        <h2>${pageName} Page</h2>
        <p>This page did not exist on the old Shopify site</p>
        <span class="tag">Page Missing</span>
      </div>
    </body>
    </html>
  `);
  const filePath = path.join(SCREENSHOT_DIR, name + '.jpg');
  await page.screenshot({ path: filePath, type: 'jpeg', quality: 85 });
  console.log(`  ✓ ${name}.jpg (placeholder)`);
}

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  const viewport = { width: 1280, height: 800 };

  console.log('\n📸 Taking NEW site screenshots...');
  for (const p of newPages) {
    await captureScreenshot(page, NEW_BASE + p.path, p.name, viewport);
  }

  console.log('\n📸 Taking OLD site screenshots...');
  for (const p of oldPages) {
    if (p.url) {
      await captureScreenshot(page, p.url, p.name, viewport);
    } else {
      const pageName = p.name.replace('old-', '').replace(/^\w/, c => c.toUpperCase());
      await createPlaceholder(page, p.name, pageName);
    }
  }

  await browser.close();
  console.log('\n✅ All screenshots saved to assets/images/screenshots/');
})();
