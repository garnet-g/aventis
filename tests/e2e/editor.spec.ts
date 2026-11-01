import sharp from 'sharp';
import { expect, test, type Page } from '@playwright/test';

type Layer = { kind: string; rotation?: number; flipX?: boolean; flipY?: boolean; direction?: string; rect: { x: number; y: number; width: number; height: number } };

async function layers(page: Page): Promise<Layer[]> {
  return JSON.parse((await page.getByTestId('layers-json').textContent()) || '[]');
}

async function uploadPng(page: Page) {
  const buffer = await sharp({ create: { width: 400, height: 400, channels: 3, background: '#d33' } }).png().toBuffer();
  await expect(page.getByTestId('upload-input')).toBeEnabled(); // disabled until the page is interactive
  await page.getByTestId('upload-input').setInputFiles({ name: 'art.png', mimeType: 'image/png', buffer });
  await expect.poll(async () => (await layers(page)).length).toBe(1);
}

test('dragging an uploaded image beyond the dashed box leaves it inside the box', async ({ page }) => {
  await page.goto('/dev/editor');
  await uploadPng(page);
  const wrap = page.getByTestId('editor-wrap');
  const box = (await wrap.boundingBox())!;
  const start = { x: box.x + box.width / 2, y: box.y + box.height * 0.38 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 300, start.y + 400, { steps: 12 });
  await page.mouse.up();
  const [l] = await layers(page);
  const eps = 0.001;
  expect(l.rect.x).toBeGreaterThanOrEqual(-eps);
  expect(l.rect.y).toBeGreaterThanOrEqual(-eps);
  expect(l.rect.x + l.rect.width).toBeLessThanOrEqual(1 + eps);
  expect(l.rect.y + l.rect.height).toBeLessThanOrEqual(1 + eps);
  // it actually moved to the far corner rather than staying put
  expect(l.rect.x + l.rect.width).toBeGreaterThan(0.95);
});

test('entering an Urdu name creates a right-to-left text layer', async ({ page }) => {
  await page.goto('/dev/editor');
  await page.getByTestId('text-input').fill('علی احمد');
  await page.getByRole('button', { name: 'Add name' }).click();
  await expect.poll(async () => (await layers(page)).length).toBe(1);
  const [l] = await layers(page);
  expect(l.kind).toBe('text');
  expect(l.direction).toBe('rtl');
});

test('editor is usable at 375px width without horizontal scroll', async ({ page }) => {
  await page.goto('/dev/editor');
  await expect(page.getByTestId('editor-wrap')).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test('the garment photo fills the canvas: a black shirt is dark where the body is and light outside it', async ({ page }) => {
  await page.goto('/dev/editor');
  await page.getByRole('button', { name: 'Black' }).click();
  // canvas logical size is 400x500; the tee body is centred (x 90..310) and the photo corner is plain background
  const sample = async (x: number, y: number) =>
    page.evaluate(
      ([lx, ly]) => {
        const c = document.querySelector('canvas.lower-canvas') as HTMLCanvasElement;
        const scale = c.width / 400;
        const d = c.getContext('2d')!.getImageData(Math.round(lx * scale), Math.round(ly * scale), 1, 1).data;
        return d[3] < 255 ? -1 : (d[0] + d[1] + d[2]) / 3; // -1 = nothing painted here
      },
      [x, y],
    );
  // the white photo may be painted first; wait until the black one has replaced it
  await expect
    .poll(async () => {
      const v = await sample(200, 350);
      return v >= 0 && v < 80; // -1 means nothing is painted yet
    }, { message: 'shirt body should be painted and dark' })
    .toBe(true);
  expect(await sample(15, 485)).toBeGreaterThan(200); // bottom-left corner: light grey background
  expect(await sample(385, 15)).toBeGreaterThan(200); // top-right corner: light grey background
});

test('home and sign-in pages carry the Printly brand and fit a phone without sideways scroll', async ({ page }) => {
  for (const url of ['/', '/login']) {
    await page.goto(url);
    await expect(page.getByRole('link', { name: 'Printly' }).first()).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, url).toBeLessThanOrEqual(0);
  }
  await page.goto('/');
  await expect(page.getByRole('link', { name: /Start designing/ })).toBeVisible();
  await page.waitForTimeout(1200); // let the staggered fade-in finish
  await page.screenshot({ path: 'test-results/phone-home.png', fullPage: true });
});

test('flip and rotate buttons change the selected image and are saved in the layer', async ({ page }) => {
  await page.goto('/dev/editor');
  await uploadPng(page);
  await page.getByRole('button', { name: 'Flip left-right' }).click();
  await expect.poll(async () => (await layers(page))[0].flipX).toBe(true);
  await page.getByRole('button', { name: 'Flip top-bottom' }).click();
  await expect.poll(async () => (await layers(page))[0].flipY).toBe(true);
  await page.getByRole('button', { name: 'Rotate 90°' }).click();
  await expect.poll(async () => (await layers(page))[0].rotation).toBe(90);
  await page.getByRole('button', { name: 'Flip left-right' }).click();
  await expect.poll(async () => (await layers(page))[0].flipX).toBe(false);
});

test('print quality is shown for the selected image and gets worse as it is enlarged', async ({ page }) => {
  await page.goto('/dev/editor');
  const upload = page.getByTestId('upload-input');
  await expect(upload).toBeEnabled();
  const big = await sharp({ create: { width: 2400, height: 2400, channels: 3, background: '#38c' } }).png().toBuffer();
  await upload.setInputFiles({ name: 'big.png', mimeType: 'image/png', buffer: big });
  await expect(page.getByTestId('print-quality')).toContainText('Great');
  await page.getByRole('button', { name: 'Remove selected' }).click();
  await expect(page.getByTestId('print-quality')).toHaveCount(0);
  await uploadPng(page); // 400 px wide printed about 17 cm wide is far too soft
  await expect(page.getByTestId('print-quality')).toContainText('Low');
  await expect(page.getByTestId('print-quality')).toContainText(/blurry/i);
});
