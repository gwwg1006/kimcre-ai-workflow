import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.resolve(__dirname, '../fixtures/stl');

test.describe('STL Product Guide Generator E2E Workflow', () => {
  test('Complete workflow: Upload -> Edit -> Live Preview -> Reset', async ({ page }) => {
    // 1. Visit app
    await page.goto('/');

    // Check empty state
    await expect(page.locator('text=끌어놓거나 선택하세요')).toBeVisible();

    // 2. Upload 2 STL files
    const fileInput = page.locator('#app-viewer input[type="file"]');
    await fileInput.setInputFiles([
      path.join(fixturesDir, 'ascii_cube.stl'),
      path.join(fixturesDir, 'binary_cube.stl'),
    ]);

    // 3. Wait for processing to complete in sidebar
    await expect(page.locator('#app-sidebar').getByText('ascii cube')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#app-sidebar').getByText('binary cube')).toBeVisible({ timeout: 10000 });

    // Verify 3D viewport rendered the selected item
    await expect(page.locator('canvas')).toBeVisible();
    await expect(page.locator('text=현재 보기 적용')).toBeVisible();

    // 4. Edit product display name & quantity via edit pencil button
    await page.locator('#app-sidebar button[title="상품명 수정"]').first().click();
    const nameInput = page.locator('input[placeholder="상품명 입력"]');
    await nameInput.fill('특수 아스키 큐브');
    await nameInput.press('Enter');

    const qtyInputs = page.locator('input[type="number"]');
    await qtyInputs.nth(0).fill('3');
    await qtyInputs.nth(0).blur();

    // 5. Verify A4 Preview displays updated info
    const printPreview = page.locator('#app-preview');
    await expect(printPreview.locator('text=특수 아스키 큐브')).toBeVisible();
    await expect(printPreview.locator('text=수량: 3개')).toBeVisible();

    // Verify print button is active
    const printButton = page.locator('#app-print-button-bar button');
    await expect(printButton).toBeEnabled();

    // 6. Test New Project Reset Modal
    await page.click('button:has-text("새 작업")');
    await expect(page.locator('text=현재 작업을 지우고 새로 시작할까요?')).toBeVisible();

    await page.click('button:has-text("초기화하기")');
    await expect(page.locator('text=끌어놓거나 선택하세요')).toBeVisible();
  });
});
