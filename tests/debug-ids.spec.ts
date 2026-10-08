import { test } from '@playwright/test';

const BASE_URL = process.env.TEST_URL || 'http://localhost:3099';

test('check for duplicate event IDs in the DOM', async ({ page }) => {
  test.setTimeout(60_000);

  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  const table = page.locator('table');
  await table.waitFor({ state: 'visible', timeout: 30_000 });

  // Check ETH Denver first
  console.log('=== ETH Denver 2026 ===');
  let keys = await page.evaluate(() => {
    const rows = document.querySelectorAll('table tbody tr');
    const reactKeys: string[] = [];
    rows.forEach((row) => {
      // Try to get the React key from the fiber
      const fiberKey = Object.keys(row).find(k => k.startsWith('__reactFiber'));
      if (fiberKey) {
        const fiber = (row as unknown as Record<string, { key?: string } | undefined>)[fiberKey];
        reactKeys.push(fiber?.key || 'no-key');
      } else {
        reactKeys.push('no-fiber');
      }
    });
    return reactKeys;
  });

  const ethDenverDupes = findDuplicates(keys);
  console.log(`Total rows: ${keys.length}`);
  console.log(`Duplicate keys: ${ethDenverDupes.length}`);
  ethDenverDupes.forEach(d => console.log(`  Duplicate: "${d}"`));

  // Switch to Consensus HK
  console.log('\n=== Consensus Hong Kong 2026 ===');
  await page.locator('button', { hasText: 'Consensus Hong Kong 2026' }).click();
  await page.waitForTimeout(2000);

  keys = await page.evaluate(() => {
    const rows = document.querySelectorAll('table tbody tr');
    const reactKeys: string[] = [];
    rows.forEach((row) => {
      const fiberKey = Object.keys(row).find(k => k.startsWith('__reactFiber'));
      if (fiberKey) {
        const fiber = (row as unknown as Record<string, { key?: string } | undefined>)[fiberKey];
        reactKeys.push(fiber?.key || 'no-key');
      } else {
        reactKeys.push('no-fiber');
      }
    });
    return reactKeys;
  });

  const consensusDupes = findDuplicates(keys);
  console.log(`Total rows: ${keys.length}`);
  console.log(`Duplicate keys: ${consensusDupes.length}`);
  consensusDupes.forEach(d => console.log(`  Duplicate: "${d}"`));

  // List all Igloo event keys
  const iglooData = await page.evaluate(() => {
    const rows = document.querySelectorAll('table tbody tr');
    const results: { index: number; key: string; text: string }[] = [];
    rows.forEach((row, i) => {
      if (row.textContent?.includes('Igloo')) {
        const fiberKey = Object.keys(row).find(k => k.startsWith('__reactFiber'));
        let key = 'no-fiber';
        if (fiberKey) {
          const fiber = (row as unknown as Record<string, { key?: string } | undefined>)[fiberKey];
          key = fiber?.key || 'no-key';
        }
        results.push({ index: i, key, text: row.textContent?.substring(0, 100) || '' });
      }
    });
    return results;
  });

  console.log('\nIgloo rows with keys:');
  iglooData.forEach(d => console.log(`  Row ${d.index}: key="${d.key}" text="${d.text}"`));
});

function findDuplicates(arr: string[]): string[] {
  const seen = new Set<string>();
  const dupes: string[] = [];
  for (const item of arr) {
    if (seen.has(item)) {
      dupes.push(item);
    }
    seen.add(item);
  }
  return dupes;
}
