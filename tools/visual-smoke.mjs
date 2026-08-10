/**
 * SlimCity visual smoke harness: boots the real game in headless Chromium,
 * drives tools via the keyboard hotkeys + mouse, and screenshots the canvas
 * after each action so a human (or model) can SEE what renders.
 *
 * Usage: node smoke.mjs <url> <outDir>
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const url = process.argv[2] ?? 'http://localhost:5173';
const outDir = process.argv[3] ?? 'shots';
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-angle=default'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

const logs = [];
page.on('console', (m) => logs.push(`[console.${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));

async function shot(name) {
  await page.screenshot({ path: join(outDir, name) });
  console.log(`shot: ${name}`);
}

await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#viewport canvas', { timeout: 20000 });
// Pause the sim (Space toggles play/pause) so game time doesn't advance during
// the settle wait — the boot shot must show the actual boot clock (~09:00),
// not boot time plus however long the harness spent letting assets stream in.
await page.keyboard.press('Space');
await page.waitForTimeout(4000); // boot + first snapshots (sim paused)
await shot('01-boot.png');
await page.keyboard.press('Space'); // resume 1x for the interactive steps

const cx = 640, cy = 400;

// --- wind turbine plop (Digit3 hotkey) ------------------------------------
await page.keyboard.press('Digit3');
await page.mouse.move(cx, cy, { steps: 5 });
await page.waitForTimeout(300);
await shot('02-turbine-ghost.png');
await page.mouse.down();
await page.mouse.up();
await page.waitForTimeout(1500);
await shot('03-turbine-placed.png');

// --- two-lane road drag (Digit1) -------------------------------------------
await page.keyboard.press('Digit1');
await page.mouse.move(cx - 220, cy + 60, { steps: 4 });
await page.mouse.down();
await page.mouse.move(cx + 220, cy + 60, { steps: 12 });
await page.waitForTimeout(200);
await shot('04-road-drag-ghost.png');
await page.mouse.up();
await page.waitForTimeout(1500);
await shot('05-road-placed.png');

// --- police station 2x2 (Digit4) -------------------------------------------
await page.keyboard.press('Digit4');
await page.mouse.move(cx - 120, cy - 90, { steps: 4 });
await page.waitForTimeout(300);
await shot('06-police-ghost.png');
await page.mouse.down();
await page.mouse.up();
await page.waitForTimeout(1500);

// --- pocket park (Digit5) ---------------------------------------------------
await page.keyboard.press('Digit5');
await page.mouse.move(cx + 140, cy - 70, { steps: 4 });
await page.mouse.down();
await page.mouse.up();
await page.waitForTimeout(1500);
await shot('07-police-park-placed.png');

// --- zoom in for a close look at whatever got placed ------------------------
await page.mouse.move(cx, cy);
for (let i = 0; i < 6; i++) {
  await page.mouse.wheel(0, -400);
  await page.waitForTimeout(120);
}
await page.waitForTimeout(800);
await shot('08-zoomed.png');

console.log('--- console/page messages ---');
for (const l of logs) console.log(l);
console.log(`--- total messages: ${logs.length} ---`);

await browser.close();
