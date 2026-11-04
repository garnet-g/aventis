import sharp from 'sharp';
import { expect, test, type Page } from '@playwright/test';

type Layer = { kind: string; text?: string; font?: string; fill?: string; fontSize?: number; uploadPath?: string; rotation?: number; flipX?: boolean; flipY?: boolean; direction?: string; rect: { x: number; y: number; width: number; height: number } };

async function layers(page: Page): Promise<Layer[]> {
  return JSON.parse((await page.getByTestId('layers-json').textContent()) || '[]');
}

async function backLayers(page: Page): Promise<Layer[]> {
  return JSON.parse((await page.getByTestId('back-layers-json').textContent()) || '[]');
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

test('home and sign-in pages carry the VybeCrew brand and fit a phone without sideways scroll', async ({ page }) => {
  for (const url of ['/', '/login']) {
    await page.goto(url);
    await expect(page.getByRole('link', { name: 'VybeCrew' }).first()).toBeVisible();
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

async function addName(page: Page, name: string) {
  await expect(page.getByTestId('text-input')).toBeEnabled();
  await page.getByTestId('text-input').fill(name);
  await page.getByRole('button', { name: 'Add name' }).click();
}

async function setRange(page: Page, label: string, value: number) {
  await page.getByLabel(label).evaluate((el, v) => {
    const input = el as HTMLInputElement;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, String(v));
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
}

const texts = async (page: Page) => (await layers(page)).map((l) => l.text);

test('a name can be restyled: font, color and size are saved in the layer', async ({ page }) => {
  await page.goto('/dev/editor');
  await addName(page, 'Ali');
  await expect.poll(async () => (await layers(page)).length).toBe(1);
  const before = (await layers(page))[0];
  expect(before.font).toBe('sans');

  await page.getByLabel('Font').selectOption('jersey');
  await expect.poll(async () => (await layers(page))[0].font).toBe('jersey');

  await page.getByRole('button', { name: 'Text color Red' }).click();
  await expect.poll(async () => (await layers(page))[0].fill).toBe('#e5412a');

  await setRange(page, 'Text size', 60);
  await expect.poll(async () => (await layers(page))[0].fontSize!).toBeGreaterThan(before.fontSize! * 1.5);
});

test('the text of a name can be edited after it was added', async ({ page }) => {
  await page.goto('/dev/editor');
  await addName(page, 'Ali');
  await expect.poll(() => texts(page)).toEqual(['Ali']);
  await page.getByLabel('Selected text').fill('Ahmed Khan');
  await expect.poll(() => texts(page)).toEqual(['Ahmed Khan']);
});

test('Urdu text gets an Urdu font automatically and only Urdu fonts are offered', async ({ page }) => {
  await page.goto('/dev/editor');
  await addName(page, 'علی');
  await expect.poll(async () => (await layers(page))[0]?.font).toBe('nastaliq');
  await expect(page.getByLabel('Font').locator('option')).toHaveCount(2);
  await page.getByLabel('Font').selectOption('naskh');
  await expect.poll(async () => (await layers(page))[0].font).toBe('naskh');
  // typing Latin letters into the same text flips back to a Latin font
  await page.getByLabel('Selected text').fill('Ali');
  await expect.poll(async () => (await layers(page))[0].font).toBe('sans');
  await expect(page.getByLabel('Font').locator('option')).toHaveCount(4);
});

test('undo and redo step back and forward through the design, images included', async ({ page }) => {
  await page.goto('/dev/editor');
  await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled();
  await uploadPng(page);
  await addName(page, 'Ali');
  await expect.poll(async () => (await layers(page)).length).toBe(2);

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect.poll(async () => (await layers(page)).map((l) => l.kind)).toEqual(['image']);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect.poll(async () => (await layers(page)).length).toBe(0);
  await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled();

  await page.getByRole('button', { name: 'Redo' }).click();
  await expect.poll(async () => (await layers(page)).map((l) => l.kind)).toEqual(['image']);
  await page.getByRole('button', { name: 'Redo' }).click();
  await expect.poll(async () => (await layers(page)).map((l) => l.kind)).toEqual(['image', 'text']);
  await expect(page.getByRole('button', { name: 'Redo' })).toBeDisabled();
  const [image] = await layers(page);
  expect(image.uploadPath).toBeTruthy(); // the picture came back, not an empty placeholder
});

test('making a new change after undo discards the redo steps', async ({ page }) => {
  await page.goto('/dev/editor');
  await addName(page, 'A');
  await addName(page, 'B');
  await expect.poll(() => texts(page)).toEqual(['A', 'B']);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect.poll(() => texts(page)).toEqual(['A']);
  await addName(page, 'C');
  await expect.poll(() => texts(page)).toEqual(['A', 'C']);
  await expect(page.getByRole('button', { name: 'Redo' })).toBeDisabled();
});

test('send to back and bring to front change which layer is on top', async ({ page }) => {
  await page.goto('/dev/editor');
  await addName(page, 'A');
  await addName(page, 'B');
  await expect.poll(() => texts(page)).toEqual(['A', 'B']);
  await page.getByRole('button', { name: 'Send to back' }).click();
  await expect.poll(() => texts(page)).toEqual(['B', 'A']);
  await page.getByRole('button', { name: 'Bring to front' }).click();
  await expect.poll(() => texts(page)).toEqual(['A', 'B']);
});

test('duplicate makes an offset copy that stays inside the print area', async ({ page }) => {
  await page.goto('/dev/editor');
  await addName(page, 'Ali');
  await expect.poll(async () => (await layers(page)).length).toBe(1);
  await page.getByRole('button', { name: 'Duplicate' }).click();
  await expect.poll(async () => (await layers(page)).length).toBe(2);
  const [a, b] = await layers(page);
  expect(b.text).toBe('Ali');
  expect(b.rect.x).toBeGreaterThan(a.rect.x);
  expect(b.rect.x + b.rect.width).toBeLessThanOrEqual(1.001);
  expect(b.rect.y + b.rect.height).toBeLessThanOrEqual(1.001);
});

test('text in the default ink follows the garment color, but a chosen color is kept', async ({ page }) => {
  await page.goto('/dev/editor');
  await addName(page, 'Ali');
  await expect.poll(async () => (await layers(page))[0]?.fill).toBe('#16120f');
  await page.getByRole('button', { name: 'Black' }).click();
  await expect.poll(async () => (await layers(page))[0].fill).toBe('#ffffff');
  await page.getByRole('button', { name: 'Text color Red' }).click();
  await expect.poll(async () => (await layers(page))[0].fill).toBe('#e5412a');
  await page.getByRole('button', { name: 'White' }).click();
  await page.waitForTimeout(300);
  expect((await layers(page))[0].fill).toBe('#e5412a');
});

test('front and back keep separate layers and show separate garment photos', async ({ page }) => {
  await page.goto('/dev/editor');
  const wrap = page.getByTestId('editor-wrap');
  await expect(wrap).toHaveAttribute('data-side', 'front');
  await addName(page, 'Front one');
  await expect.poll(async () => (await layers(page)).length).toBe(1);

  await page.getByRole('tab', { name: /Back/ }).click();
  await expect(wrap).toHaveAttribute('data-side', 'back');
  expect(await backLayers(page)).toHaveLength(0);
  await addName(page, 'Back one');
  await expect.poll(async () => (await backLayers(page)).map((l) => l.text)).toEqual(['Back one']);
  expect((await layers(page)).map((l) => l.text)).toEqual(['Front one']); // the front was not touched

  await page.getByRole('tab', { name: /Front/ }).click();
  await expect(wrap).toHaveAttribute('data-side', 'front');
  await addName(page, 'Front two');
  await expect.poll(async () => (await layers(page)).map((l) => l.text)).toEqual(['Front one', 'Front two']);
  expect((await backLayers(page)).map((l) => l.text)).toEqual(['Back one']);
});

test('undo history is kept separately for each side', async ({ page }) => {
  await page.goto('/dev/editor');
  await addName(page, 'A');
  await expect.poll(async () => (await layers(page)).length).toBe(1);
  await page.getByRole('tab', { name: /Back/ }).click();
  await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled(); // nothing done on the back yet
  await addName(page, 'B');
  await expect.poll(async () => (await backLayers(page)).length).toBe(1);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect.poll(async () => (await backLayers(page)).length).toBe(0);
  await page.getByRole('tab', { name: /Front/ }).click();
  await expect(page.getByRole('button', { name: 'Undo' })).toBeEnabled();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect.poll(async () => (await layers(page)).length).toBe(0);
});

test('the tabs show how much is on each side, and the extra price for printing the back', async ({ page }) => {
  await page.goto('/dev/editor');
  await expect(page.getByRole('tab', { name: /Back/ })).not.toContainText('KES');
  await page.getByRole('tab', { name: /Back/ }).click();
  await addName(page, 'Back one');
  await expect(page.getByRole('tab', { name: /Back/ })).toContainText('(1)');
  await expect(page.getByRole('tab', { name: /Back/ })).toContainText('+KES 500');
  await expect(page.getByRole('tab', { name: /Front/ })).toContainText('(0)');
});

test('cropping keeps the chosen part where it was, at the same size on the shirt', async ({ page }) => {
  await page.goto('/dev/editor');
  await uploadPng(page);
  const before = (await layers(page))[0];
  await page.getByRole('button', { name: 'Crop' }).click();
  await expect(page.getByRole('dialog', { name: 'Crop picture' })).toBeVisible();
  await expect(page.getByTestId('crop-size')).toHaveText(/320 × 320 px/); // the default box is the middle 80% of 400 x 400
  await page.getByRole('dialog').getByRole('button', { name: 'Crop', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await expect.poll(async () => (await layers(page))[0].uploadPath).not.toBe(before.uploadPath);
  const after = (await layers(page))[0];
  expect(after.rect.width).toBeCloseTo(before.rect.width * 0.8, 2);
  expect(after.rect.height).toBeCloseTo(before.rect.height * 0.8, 2);
  // the middle part of the picture is still centred where the picture was
  expect(after.rect.x + after.rect.width / 2).toBeCloseTo(before.rect.x + before.rect.width / 2, 2);
  expect(after.rect.y + after.rect.height / 2).toBeCloseTo(before.rect.y + before.rect.height / 2, 2);
  expect((await layers(page)).length).toBe(1);

  await page.getByRole('button', { name: 'Undo' }).click(); // a crop is one undoable step
  await expect.poll(async () => (await layers(page))[0].uploadPath).toBe(before.uploadPath);
});

test('dragging a corner changes the crop, and a box too small to print cannot be applied', async ({ page }) => {
  await page.goto('/dev/editor');
  await uploadPng(page);
  await page.getByRole('button', { name: 'Crop' }).click();
  const frame = (await page.getByTestId('crop-frame').boundingBox())!;
  const se = (await page.getByTestId('crop-se').boundingBox())!;
  const from = { x: se.x + se.width / 2, y: se.y + se.height / 2 };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x - frame.width * 0.3, from.y - frame.height * 0.3, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByTestId('crop-size')).toHaveText(/200 × 200 px: too small/);
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Crop', exact: true })).toBeDisabled();

  await page.getByRole('button', { name: 'Square' }).click();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect((await layers(page)).length).toBe(1); // cancelling changes nothing
});

test('removing the background replaces the picture with an edited copy (needs internet the first time)', async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto('/dev/editor');
  await uploadPng(page);
  const before = (await layers(page))[0];
  await page.getByRole('button', { name: 'Remove background' }).click();
  await expect(page.getByTestId('edit-status')).toBeVisible();
  await expect.poll(async () => (await layers(page))[0].uploadPath, { timeout: 200_000 }).not.toBe(before.uploadPath);
  await expect(page.getByTestId('edit-status')).toHaveCount(0);
  const after = (await layers(page))[0];
  expect(after.rect.width).toBeCloseTo(before.rect.width, 2); // same size and place
  expect(after.rect.height).toBeCloseTo(before.rect.height, 2);
});
