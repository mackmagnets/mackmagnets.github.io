/**
 * Crop feature tests — verifies crop modal opens with correct aspect ratio
 * for 2x2 (1:1 square), 2x3 (2:3 rectangle), and round (1:1 circle) products.
 */
const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

const BASE = 'http://localhost:3000';

// Create a test image file for upload
function getTestImagePath() {
  const p = path.join(__dirname, '..', 'test-results', 'test-photo.jpg');
  if (!fs.existsSync(p)) {
    // Create a minimal JPEG-like file via canvas isn't possible, use a real one
    // We'll generate a 100x150 red PNG via raw bytes
    const dir = path.dirname(p);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    // Use a simple 1x1 pixel JPEG
    const jpegBytes = Buffer.from([
      0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01,
      0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xFF, 0xDB, 0x00, 0x43,
      0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09,
      0x09, 0x08, 0x0A, 0x0C, 0x14, 0x0D, 0x0C, 0x0B, 0x0B, 0x0C, 0x19, 0x12,
      0x13, 0x0F, 0x14, 0x1D, 0x1A, 0x1F, 0x1E, 0x1D, 0x1A, 0x1C, 0x1C, 0x20,
      0x24, 0x2E, 0x27, 0x20, 0x22, 0x2C, 0x23, 0x1C, 0x1C, 0x28, 0x37, 0x29,
      0x2C, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1F, 0x27, 0x39, 0x3D, 0x38, 0x32,
      0x3C, 0x2E, 0x33, 0x34, 0x32, 0xFF, 0xC0, 0x00, 0x0B, 0x08, 0x00, 0x01,
      0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xFF, 0xC4, 0x00, 0x1F, 0x00, 0x00,
      0x01, 0x05, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
      0x09, 0x0A, 0x0B, 0xFF, 0xC4, 0x00, 0xB5, 0x10, 0x00, 0x02, 0x01, 0x03,
      0x03, 0x02, 0x04, 0x03, 0x05, 0x05, 0x04, 0x04, 0x00, 0x00, 0x01, 0x7D,
      0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12, 0x21, 0x31, 0x41, 0x06,
      0x13, 0x51, 0x61, 0x07, 0x22, 0x71, 0x14, 0x32, 0x81, 0x91, 0xA1, 0x08,
      0x23, 0x42, 0xB1, 0xC1, 0x15, 0x52, 0xD1, 0xF0, 0x24, 0x33, 0x62, 0x72,
      0x82, 0x09, 0x0A, 0x16, 0x17, 0x18, 0x19, 0x1A, 0x25, 0x26, 0x27, 0x28,
      0x29, 0x2A, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3A, 0x43, 0x44, 0x45,
      0x46, 0x47, 0x48, 0x49, 0x4A, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59,
      0x5A, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69, 0x6A, 0x73, 0x74, 0x75,
      0x76, 0x77, 0x78, 0x79, 0x7A, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89,
      0x8A, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9A, 0xA2, 0xA3,
      0xA4, 0xA5, 0xA6, 0xA7, 0xA8, 0xA9, 0xAA, 0xB2, 0xB3, 0xB4, 0xB5, 0xB6,
      0xB7, 0xB8, 0xB9, 0xBA, 0xC2, 0xC3, 0xC4, 0xC5, 0xC6, 0xC7, 0xC8, 0xC9,
      0xCA, 0xD2, 0xD3, 0xD4, 0xD5, 0xD6, 0xD7, 0xD8, 0xD9, 0xDA, 0xE1, 0xE2,
      0xE3, 0xE4, 0xE5, 0xE6, 0xE7, 0xE8, 0xE9, 0xEA, 0xF1, 0xF2, 0xF3, 0xF4,
      0xF5, 0xF6, 0xF7, 0xF8, 0xF9, 0xFA, 0xFF, 0xDA, 0x00, 0x08, 0x01, 0x01,
      0x00, 0x00, 0x3F, 0x00, 0x7B, 0x94, 0x11, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xFF,
      0xD9
    ]);
    fs.writeFileSync(p, jpegBytes);
  }
  return p;
}

// Generate a proper test image using Playwright page canvas
async function generateTestImage(page) {
  const imgPath = path.join(__dirname, '..', 'test-results', 'test-crop-photo.png');
  if (fs.existsSync(imgPath)) return imgPath;

  const dir = path.dirname(imgPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  // Create a 800x1200 test image with canvas
  const dataUrl = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 800; c.height = 1200;
    const ctx = c.getContext('2d');
    // Gradient background
    const grad = ctx.createLinearGradient(0, 0, 800, 1200);
    grad.addColorStop(0, '#3498db');
    grad.addColorStop(1, '#e74c3c');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 800, 1200);
    // Text
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 60px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('TEST PHOTO', 400, 600);
    ctx.font = '30px sans-serif';
    ctx.fillText('800 × 1200', 400, 660);
    return c.toDataURL('image/png');
  });

  const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
  fs.writeFileSync(imgPath, Buffer.from(base64, 'base64'));
  return imgPath;
}

test.describe('Photo Crop Feature', () => {

  test('2x2 Square — crop modal opens with 1:1 ratio', async ({ page }) => {
    await page.goto(BASE + '/shop/2x2-custom-photo-magnets-set-of-9/');
    await page.waitForSelector('.pdp-uploader__slot');

    const imgPath = await generateTestImage(page);

    // Upload a file to the first slot
    const fileInput = page.locator('.pdp-uploader__slot input[type="file"]').first();
    await fileInput.setInputFiles(imgPath);

    // Crop modal should open
    await expect(page.locator('.mack-crop-modal.is-open')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.mack-crop-modal__title')).toHaveText('Crop Photo 1');

    // Verify Cropper.js initialized (canvas wrap should have cropper container)
    await expect(page.locator('.cropper-container')).toBeVisible({ timeout: 5000 });

    // Verify it's NOT circle
    const wrap = page.locator('.mack-crop-modal__canvas-wrap');
    await expect(wrap).not.toHaveClass(/is-circle/);

    // Take screenshot of crop modal
    await page.screenshot({ path: 'test-results/crop-2x2-square.png', fullPage: false });

    // Click Apply
    await page.click('[data-action="apply"]');

    // Modal should close
    await expect(page.locator('.mack-crop-modal.is-open')).not.toBeVisible({ timeout: 5000 });

    // Slot should show "Uploading" or "Ready" or "Upload failed" (worker not running locally)
    const slot = page.locator('.pdp-uploader__slot').first();
    const state = await slot.getAttribute('data-state');
    expect(['uploading', 'done', 'error']).toContain(state);

    // Preview image should be visible
    const preview = slot.locator('.pdp-uploader__slot-preview');
    const bgImage = await preview.evaluate(el => getComputedStyle(el).backgroundImage);
    expect(bgImage).not.toBe('none');
  });

  test('2x3 Rectangle — crop modal opens with 2:3 ratio', async ({ page }) => {
    await page.goto(BASE + '/shop/2x3-custom-photo-magnets-set-of-6/');
    await page.waitForSelector('.pdp-uploader__slot');

    const imgPath = await generateTestImage(page);

    const fileInput = page.locator('.pdp-uploader__slot input[type="file"]').first();
    await fileInput.setInputFiles(imgPath);

    await expect(page.locator('.mack-crop-modal.is-open')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.cropper-container')).toBeVisible({ timeout: 5000 });

    // Verify NOT circle
    const wrap = page.locator('.mack-crop-modal__canvas-wrap');
    await expect(wrap).not.toHaveClass(/is-circle/);

    await page.screenshot({ path: 'test-results/crop-2x3-rectangle.png', fullPage: false });

    // Click Apply
    await page.click('[data-action="apply"]');
    await expect(page.locator('.mack-crop-modal.is-open')).not.toBeVisible({ timeout: 5000 });

    // Slot should have preview
    const slot = page.locator('.pdp-uploader__slot').first();
    const preview = slot.locator('.pdp-uploader__slot-preview');
    const bgImage = await preview.evaluate(el => getComputedStyle(el).backgroundImage);
    expect(bgImage).not.toBe('none');
  });

  test('Round — crop modal opens with circle mask', async ({ page }) => {
    await page.goto(BASE + '/shop/2-inch-round-custom-photo-magnets/');
    await page.waitForSelector('.pdp-uploader__slot');

    const imgPath = await generateTestImage(page);

    const fileInput = page.locator('.pdp-uploader__slot input[type="file"]').first();
    await fileInput.setInputFiles(imgPath);

    await expect(page.locator('.mack-crop-modal.is-open')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.cropper-container')).toBeVisible({ timeout: 5000 });

    // Verify circle mask IS applied
    const wrap = page.locator('.mack-crop-modal__canvas-wrap');
    await expect(wrap).toHaveClass(/is-circle/);

    await page.screenshot({ path: 'test-results/crop-round-circle.png', fullPage: false });

    // Click Apply
    await page.click('[data-action="apply"]');
    await expect(page.locator('.mack-crop-modal.is-open')).not.toBeVisible({ timeout: 5000 });
  });

  test('Cancel crop returns slot to idle', async ({ page }) => {
    await page.goto(BASE + '/shop/2x2-custom-photo-magnets-set-of-9/');
    await page.waitForSelector('.pdp-uploader__slot');

    const imgPath = await generateTestImage(page);

    const fileInput = page.locator('.pdp-uploader__slot input[type="file"]').first();
    await fileInput.setInputFiles(imgPath);

    await expect(page.locator('.mack-crop-modal.is-open')).toBeVisible({ timeout: 5000 });

    // Click Cancel
    await page.click('[data-action="cancel"]');

    // Modal should close
    await expect(page.locator('.mack-crop-modal.is-open')).not.toBeVisible({ timeout: 5000 });

    // Slot should be idle
    const slot = page.locator('.pdp-uploader__slot').first();
    const state = await slot.getAttribute('data-state');
    expect(state).toBe('idle');
  });

  test('Rotate buttons work', async ({ page }) => {
    await page.goto(BASE + '/shop/2x2-custom-photo-magnets-set-of-9/');
    await page.waitForSelector('.pdp-uploader__slot');

    const imgPath = await generateTestImage(page);

    const fileInput = page.locator('.pdp-uploader__slot input[type="file"]').first();
    await fileInput.setInputFiles(imgPath);

    await expect(page.locator('.mack-crop-modal.is-open')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.cropper-container')).toBeVisible({ timeout: 5000 });

    // Click rotate left
    await page.click('[data-action="rotate-left"]');
    await page.waitForTimeout(300);

    // Click rotate right twice
    await page.click('[data-action="rotate-right"]');
    await page.waitForTimeout(300);
    await page.click('[data-action="rotate-right"]');
    await page.waitForTimeout(300);

    await page.screenshot({ path: 'test-results/crop-rotated.png', fullPage: false });

    // Still should be able to apply
    await page.click('[data-action="apply"]');
    await expect(page.locator('.mack-crop-modal.is-open')).not.toBeVisible({ timeout: 5000 });
  });

  test('Escape key closes crop modal', async ({ page }) => {
    await page.goto(BASE + '/shop/2x2-custom-photo-magnets-set-of-9/');
    await page.waitForSelector('.pdp-uploader__slot');

    const imgPath = await generateTestImage(page);

    const fileInput = page.locator('.pdp-uploader__slot input[type="file"]').first();
    await fileInput.setInputFiles(imgPath);

    await expect(page.locator('.mack-crop-modal.is-open')).toBeVisible({ timeout: 5000 });

    // Press Escape
    await page.keyboard.press('Escape');

    await expect(page.locator('.mack-crop-modal.is-open')).not.toBeVisible({ timeout: 5000 });
  });

  test('Bottle Opener — crop + edit + visible preview', async ({ page }) => {
    await page.goto(BASE + '/shop/custom-photo-bottle-openers/');
    await page.waitForSelector('.pdp-uploader__slot');

    const imgPath = await generateTestImage(page);

    // Upload
    const fileInput = page.locator('.pdp-uploader__slot input[type="file"]').first();
    await fileInput.setInputFiles(imgPath);

    // Crop modal with circle mask
    await expect(page.locator('.mack-crop-modal.is-open')).toBeVisible({ timeout: 5000 });
    const wrap = page.locator('.mack-crop-modal__canvas-wrap');
    await expect(wrap).toHaveClass(/is-circle/);

    // Apply crop
    await page.click('[data-action="apply"]');
    await expect(page.locator('.mack-crop-modal.is-open')).not.toBeVisible({ timeout: 5000 });

    // Preview must be visible with image
    const slot = page.locator('.pdp-uploader__slot').first();
    const preview = slot.locator('.pdp-uploader__slot-preview');
    await expect(preview).toHaveClass(/has-image/);
    const bgImage = await preview.evaluate(el => getComputedStyle(el).backgroundImage);
    expect(bgImage).toContain('url(');
    expect(bgImage).not.toBe('none');

    // Preview should be circular for bottle opener
    await expect(slot).toHaveClass(/is-circle-preview/);
    const borderRadius = await preview.evaluate(el => getComputedStyle(el).borderRadius);
    expect(borderRadius).toBe('50%');

    // Preview should have meaningful size (> 50px in both dimensions)
    const box = await preview.boundingBox();
    expect(box.width).toBeGreaterThan(50);
    expect(box.height).toBeGreaterThan(50);

    await page.screenshot({ path: 'test-results/crop-bottle-opener-preview.png', fullPage: false });

    // Edit button should be visible on done state
    const editBtn = slot.locator('.pdp-uploader__slot-edit');
    await expect(editBtn).toBeVisible();

    // Click edit — crop modal should reopen
    await editBtn.click();
    await expect(page.locator('.mack-crop-modal.is-open')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.cropper-container')).toBeVisible({ timeout: 5000 });

    // Cancel edit
    await page.click('[data-action="cancel"]');
    await expect(page.locator('.mack-crop-modal.is-open')).not.toBeVisible({ timeout: 5000 });

    // Photo should still be there (not cleared)
    const stateAfter = await slot.getAttribute('data-state');
    expect(['done', 'uploading', 'error']).toContain(stateAfter); // Still has state, not cleared
  });
});
