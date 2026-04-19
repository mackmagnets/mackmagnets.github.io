const { test, expect } = require('@playwright/test');

const pages = [
  { name: 'Homepage', path: '/' },
  { name: 'Shop', path: '/shop/' },
  { name: 'Events', path: '/events/' },
  { name: 'About', path: '/about/' },
  { name: 'Contact', path: '/contact/' },
  { name: 'FAQ', path: '/faq/' },
  { name: 'Wholesale', path: '/wholesale/' },
  { name: 'Report', path: '/report.html' },
  { name: '404', path: '/404.html' },
  { name: 'Shipping Policy', path: '/policies/shipping/' },
  { name: 'Refund Policy', path: '/policies/refund/' },
  { name: 'Privacy Policy', path: '/policies/privacy/' },
  { name: 'Terms of Service', path: '/policies/terms/' },
  { name: 'PDP - 2x2 Custom Photo', path: '/shop/2x2-custom-photo-magnets-set-of-9/' },
  { name: 'PDP - 2x3 Custom Photo', path: '/shop/2x3-custom-photo-magnets-set-of-6/' },
  { name: 'PDP - Round Photo', path: '/shop/2-inch-round-custom-photo-magnets/' },
  { name: 'PDP - Bottle Openers', path: '/shop/custom-photo-bottle-openers/' },
  { name: 'PDP - Photo Puzzle', path: '/shop/photo-puzzle-magnets/' },
];

const viewports = [
  { name: 'Mobile', width: 375, height: 812 },
  { name: 'Tablet', width: 768, height: 1024 },
  { name: 'Desktop', width: 1440, height: 900 },
];

// Mobile-friendly tests
for (const page of pages) {
  for (const vp of viewports) {
    test(`${page.name} renders on ${vp.name} (${vp.width}x${vp.height})`, async ({ browser }) => {
      const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
      const p = await context.newPage();
      const response = await p.goto(`http://localhost:3000${page.path}`, { waitUntil: 'domcontentloaded' });
      expect(response.status()).toBe(200);

      // Verify no horizontal scroll overflow (check if scrollbar would be needed)
      const hasHorizontalOverflow = await p.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth;
      });
      expect(hasHorizontalOverflow).toBe(false);

      // Verify main content is visible
      const main = await p.$('main, #main');
      expect(main).not.toBeNull();

      await context.close();
    });
  }
}

// Accessibility basics test
for (const page of pages) {
  test(`${page.name} has basic accessibility elements`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const p = await context.newPage();
    await p.goto(`http://localhost:3000${page.path}`, { waitUntil: 'domcontentloaded' });

    // Has a proper lang attribute
    const lang = await p.getAttribute('html', 'lang');
    expect(lang).toBe('en');

    // Has a title
    const title = await p.title();
    expect(title.length).toBeGreaterThan(0);

    // Has a meta viewport
    const viewport = await p.$('meta[name="viewport"]');
    expect(viewport).not.toBeNull();

    // Has skip link
    const skipLink = await p.$('.skip-link, [href="#main"]');
    expect(skipLink).not.toBeNull();

    // Has main landmark
    const main = await p.$('main');
    expect(main).not.toBeNull();

    // AjayaDesign fingerprint
    const dataAttr = await p.getAttribute('body', 'data-ajaya-design');
    expect(dataAttr).toBe('demo-property-2026');

    await context.close();
  });
}

// Navigation test on mobile
test('Mobile hamburger menu works', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const p = await context.newPage();
  await p.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded' });

  // Hamburger toggle should be visible on mobile
  const toggle = await p.$('.navbar__toggle');
  expect(toggle).not.toBeNull();
  const isVisible = await toggle.isVisible();
  expect(isVisible).toBe(true);

  await context.close();
});

// SEO checks
for (const page of pages.filter(p => p.path !== '/report.html' && p.path !== '/404.html')) {
  test(`${page.name} has SEO meta tags`, async ({ browser }) => {
    const context = await browser.newContext();
    const p = await context.newPage();
    await p.goto(`http://localhost:3000${page.path}`, { waitUntil: 'domcontentloaded' });

    // Meta description
    const metaDesc = await p.$('meta[name="description"]');
    expect(metaDesc).not.toBeNull();
    const descContent = await metaDesc.getAttribute('content');
    expect(descContent.length).toBeGreaterThan(20);

    await context.close();
  });
}

// Twitter Card & Open Graph checks (all indexed pages)
for (const page of pages.filter(p => p.path !== '/report.html' && p.path !== '/404.html')) {
  test(`${page.name} has Twitter Card tags`, async ({ browser }) => {
    const context = await browser.newContext();
    const p = await context.newPage();
    await p.goto(`http://localhost:3000${page.path}`, { waitUntil: 'domcontentloaded' });

    const twitterCard = await p.$('meta[name="twitter:card"]');
    expect(twitterCard).not.toBeNull();
    const cardVal = await twitterCard.getAttribute('content');
    expect(cardVal).toBe('summary_large_image');

    const twitterTitle = await p.$('meta[name="twitter:title"]');
    expect(twitterTitle).not.toBeNull();
    const titleVal = await twitterTitle.getAttribute('content');
    expect(titleVal.length).toBeGreaterThan(5);

    const twitterDesc = await p.$('meta[name="twitter:description"]');
    expect(twitterDesc).not.toBeNull();

    const twitterImage = await p.$('meta[name="twitter:image"]');
    expect(twitterImage).not.toBeNull();
    const imgVal = await twitterImage.getAttribute('content');
    expect(imgVal).toMatch(/^https:\/\//);

    await context.close();
  });

  test(`${page.name} has complete Open Graph tags`, async ({ browser }) => {
    const context = await browser.newContext();
    const p = await context.newPage();
    await p.goto(`http://localhost:3000${page.path}`, { waitUntil: 'domcontentloaded' });

    const ogTitle = await p.$('meta[property="og:title"]');
    expect(ogTitle).not.toBeNull();

    const ogDesc = await p.$('meta[property="og:description"]');
    expect(ogDesc).not.toBeNull();

    const ogUrl = await p.$('meta[property="og:url"]');
    expect(ogUrl).not.toBeNull();

    const ogImage = await p.$('meta[property="og:image"]');
    expect(ogImage).not.toBeNull();

    const ogSiteName = await p.$('meta[property="og:site_name"]');
    expect(ogSiteName).not.toBeNull();
    const siteVal = await ogSiteName.getAttribute('content');
    expect(siteVal).toBe('Mack Magnets');

    const ogLocale = await p.$('meta[property="og:locale"]');
    expect(ogLocale).not.toBeNull();

    await context.close();
  });
}

// Favicon & theme-color on all pages
for (const page of pages) {
  test(`${page.name} has favicon and theme-color`, async ({ browser }) => {
    const context = await browser.newContext();
    const p = await context.newPage();
    await p.goto(`http://localhost:3000${page.path}`, { waitUntil: 'domcontentloaded' });

    const favicon = await p.$('link[rel="icon"]');
    expect(favicon).not.toBeNull();

    const themeColor = await p.$('meta[name="theme-color"]');
    expect(themeColor).not.toBeNull();

    await context.close();
  });
}
