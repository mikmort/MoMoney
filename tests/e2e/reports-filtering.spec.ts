import { test, expect } from '@playwright/test';

test.describe('Reports Page Filtering', () => {
  test('should show new category and account filters with year options', async ({ page }) => {
    // Navigate to the application
    await page.goto('http://localhost:3000');
    
    // Wait for the page to load
    await page.waitForLoadState('networkidle');
    
    // Navigate to Reports page
    await page.click('a[href="/reports"], [data-testid="reports-link"]');
    await page.waitForTimeout(2000); // Give time for reports to load
    
    // Take a screenshot of the Reports page with new filters
    await page.screenshot({ 
      path: '/tmp/reports-with-new-filters.png', 
      fullPage: true 
    });
    
    // Verify the new filter elements exist
    await expect(page.locator('text=Date Range')).toBeVisible();
    await expect(page.locator('text=Transaction Types')).toBeVisible();
    await expect(page.locator('text=Categories')).toBeVisible();
    await expect(page.locator('text=Accounts')).toBeVisible();
    
    // Check that date range has new year options
    const dateSelect = page.locator('select').first();
    await dateSelect.click();
    await page.screenshot({ 
      path: '/tmp/date-range-options.png', 
      fullPage: true 
    });
    
    // Verify new year options are present
    await expect(page.locator('option:has-text("Current Year")')).toBeVisible();
    await expect(page.locator('option:has-text("Previous Year")')).toBeVisible();
    await expect(page.locator('option:has-text("Year Before That")')).toBeVisible();
  });

  test('should show sample data and test filtering', async ({ page }) => {
    // Navigate to the application
    await page.goto('http://localhost:3000');
    
    // Wait for the page to load
    await page.waitForLoadState('networkidle');
    
    // Go to Settings and load sample data
    await page.click('a[href="/settings"], [data-testid="settings-link"]');
    await page.waitForTimeout(1000);
    
    // Look for Load Sample Data button and click it
    const loadSampleButton = page.locator('text=Load Sample Data');
    if (await loadSampleButton.isVisible()) {
      await loadSampleButton.click();
      await page.waitForTimeout(1000);
      
      // Confirm dialog if it appears
      const confirmButton = page.locator('button:has-text("Yes"), button:has-text("Load"), button:has-text("OK")');
      if (await confirmButton.first().isVisible()) {
        await confirmButton.first().click();
        await page.waitForTimeout(3000); // Wait for data to load and page to reload
      }
    }
    
    // Navigate to Reports page
    await page.goto('http://localhost:3000/reports');
    await page.waitForTimeout(3000); // Give time for reports to load with sample data
    
    // Take a screenshot of the Reports page with sample data
    await page.screenshot({ 
      path: '/tmp/reports-with-sample-data.png', 
      fullPage: true 
    });
    
    // Test the category filter
    const categoryFilter = page.locator('text=Categories').locator('..').locator('button').first();
    if (await categoryFilter.isVisible()) {
      await categoryFilter.click();
      await page.waitForTimeout(500);
      
      // Take screenshot of category dropdown
      await page.screenshot({ 
        path: '/tmp/category-filter-dropdown.png', 
        fullPage: true 
      });
    }
  });
});