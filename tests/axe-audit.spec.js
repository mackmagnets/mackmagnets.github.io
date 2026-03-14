const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/cli');

// We'll use Playwright's built-in axe integration via evaluate
test.describe('Axe Accessibility Audit', () => {
  const pages = [
    { name: 'Homepage', path: '/' },
    { name: 'Shop', path: '/shop/' },
    { name: 'Events', path: '/events/' },
    { name: 'About', path: '/about/' },
    { name: 'Contact', path: '/contact/' },
    { name: 'FAQ', path: '/faq/' },
    { name: 'Wholesale', path: '/wholesale/' },
    { name: '404', path: '/404.html' },
  ];

  for (const pg of pages) {
    test(`${pg.name} passes axe accessibility audit`, async ({ page }) => {
      await page.goto(`http://localhost:3000${pg.path}`, { waitUntil: 'networkidle' });

      // Trigger all fade-in animations to complete so axe sees full-opacity elements
      await page.evaluate(() => {
        document.querySelectorAll('.fade-in').forEach(el => el.classList.add('visible'));
      });
      await page.waitForTimeout(700); // Wait for transitions to finish

      // Inject axe-core and run
      await page.addScriptTag({ url: 'https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.10.2/axe.min.js' });

      const results = await page.evaluate(async () => {
        return await axe.run(document, {
          runOnly: {
            type: 'tag',
            values: ['wcag2a', 'wcag2aa', 'best-practice']
          }
        });
      });

      // Log violations for debugging
      if (results.violations.length > 0) {
        console.log(`\n=== ${pg.name} Violations ===`);
        results.violations.forEach((v) => {
          console.log(`  [${v.impact}] ${v.id}: ${v.description}`);
          console.log(`    Help: ${v.helpUrl}`);
          v.nodes.forEach((n) => {
            console.log(`    Target: ${n.target.join(', ')}`);
          });
        });
      }

      // Allow minor (minor) issues but fail on serious/critical
      const serious = results.violations.filter(v => v.impact === 'critical' || v.impact === 'serious');
      expect(serious).toEqual([]);
    });
  }
});
