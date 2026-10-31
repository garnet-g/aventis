import sharp from 'sharp';
import { expect, test, type Page } from '@playwright/test';

type Layer = { kind: string; direction?: string; rect: { x: number; y: number; width: number; height: number } };

async function layers(page: Page): Promise<Layer[]> {
  return JSON.parse((await page.getByTestId('layers-json').textContent()) || '[]');
}

async function uploadPng(page: Page) {
  const buffer = await sharp({ create: { width: 400, height: 400, channels: 3, background: '#d33' } }).png().toBuffer();
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
