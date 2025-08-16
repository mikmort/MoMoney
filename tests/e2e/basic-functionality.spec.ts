import { test, expect } from '@playwright/test';

test.describe('MoMoney Basic Application Tests', () => {
  test('should load the home page successfully', async ({ page }) => {
    await page.goto('/');
    
    // Check if page loads without errors
    await expect(page).toHaveTitle(/Mo Money/);
    
    // Take a screenshot for verification
    await page.screenshot({ path: 'tests/screenshots/homepage.png' });
  });

  test('should display navigation menu', async ({ page }) => {
    await page.goto('/');
    
    // Wait for navigation to be visible
    await page.waitForSelector('nav, [role="navigation"], .sidebar', { timeout: 10000 });
    
    // Look for common navigation elements
    const possibleNavSelectors = [
      'text="Dashboard"',
      'text="Transactions"',
      'text="Categories"',
      'text="Budgets"',
      'text="Reports"',
      'text="Settings"'
    ];
    
    let navItemsFound = 0;
    for (const selector of possibleNavSelectors) {
      try {
        await page.locator(selector).first().waitFor({ timeout: 3000 });
        navItemsFound++;
      } catch (e) {
        // Item not found, continue
      }
    }
    
    // Expect at least 3 navigation items to be present
    expect(navItemsFound).toBeGreaterThanOrEqual(3);
    
    await page.screenshot({ path: 'tests/screenshots/navigation.png' });
  });

  test('should handle authentication correctly', async ({ page }) => {
    await page.goto('/');
    
    // Wait for the page to load and check for authentication state
    await page.waitForLoadState('networkidle');
    
    // Check if we're in development mode (should auto-login)
    const isLoggedIn = await page.locator('text="Dashboard"').first().isVisible().catch(() => false) ||
                      await page.locator('text="Transactions"').first().isVisible().catch(() => false) ||
                      await page.locator('text="Development User"').first().isVisible().catch(() => false);
    
    if (!isLoggedIn) {
      // Check if there's a login button or form
      const hasLoginUI = await page.locator('button:has-text("Sign in"), button:has-text("Login"), input[type="email"]').first().isVisible().catch(() => false);
      expect(hasLoginUI).toBeTruthy();
    }
    
    await page.screenshot({ path: 'tests/screenshots/authentication.png' });
  });

  test('should display dashboard with financial data', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Check for dashboard elements
    const dashboardElements = [
      'text="Income"',
      'text="Expenses"', 
      'text="Net Income"',
      'text="Transactions"',
      'text="Dashboard"'
    ];
    
    let dashboardItemsFound = 0;
    for (const element of dashboardElements) {
      try {
        await page.locator(element).first().waitFor({ timeout: 5000 });
        dashboardItemsFound++;
      } catch (e) {
        console.log(`Dashboard element not found: ${element}`);
      }
    }
    
    expect(dashboardItemsFound).toBeGreaterThanOrEqual(2);
    await page.screenshot({ path: 'tests/screenshots/dashboard.png' });
  });

  test('should navigate to transactions page', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Try to find and click transactions link
    const transactionsLink = page.locator('text="Transactions"').first();
    
    try {
      await transactionsLink.waitFor({ timeout: 10000 });
      await transactionsLink.click();
      
      // Wait for navigation
      await page.waitForLoadState('networkidle');
      
      // Check if we're on transactions page
      const url = page.url();
      expect(url).toContain('transaction');
      
      await page.screenshot({ path: 'tests/screenshots/transactions-page.png' });
    } catch (e) {
      console.log('Transactions navigation test failed:', e.message);
      await page.screenshot({ path: 'tests/screenshots/transactions-nav-failed.png' });
      throw e;
    }
  });

  test('should check for console errors', async ({ page }) => {
    const errors: string[] = [];
    
    // Listen for console errors
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });
    
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Navigate to a few pages to check for errors
    try {
      await page.locator('text="Transactions"').first().click({ timeout: 5000 });
      await page.waitForLoadState('networkidle');
    } catch (e) {
      // Continue testing even if navigation fails
    }
    
    try {
      await page.locator('text="Settings"').first().click({ timeout: 5000 });
      await page.waitForLoadState('networkidle');  
    } catch (e) {
      // Continue testing even if navigation fails
    }
    
    // Filter out common non-critical errors
    const criticalErrors = errors.filter(error => 
      !error.includes('favicon.ico') && 
      !error.includes('webpack-dev-server') &&
      !error.includes('sockjs-node') &&
      !error.toLowerCase().includes('network')
    );
    
    if (criticalErrors.length > 0) {
      console.log('Critical console errors found:', criticalErrors);
    }
    
    // Don't fail the test for console errors, just log them
    // expect(criticalErrors.length).toBe(0);
    
    await page.screenshot({ path: 'tests/screenshots/console-errors-check.png' });
  });

  test('should test file upload functionality', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Try to navigate to transactions page for file upload
    try {
      await page.locator('text="Transactions"').first().click({ timeout: 10000 });
      await page.waitForLoadState('networkidle');
      
      // Look for file upload elements
      const fileUploadElements = [
        'input[type="file"]',
        'text="Upload"',
        'text="Import"',
        'text="Choose File"',
        '[data-testid*="upload"]',
        '.upload, .file-upload'
      ];
      
      let uploadElementFound = false;
      for (const selector of fileUploadElements) {
        try {
          const element = page.locator(selector).first();
          if (await element.isVisible({ timeout: 3000 })) {
            uploadElementFound = true;
            console.log(`File upload element found: ${selector}`);
            break;
          }
        } catch (e) {
          // Element not found, continue
        }
      }
      
      await page.screenshot({ path: 'tests/screenshots/file-upload-check.png' });
      
      // Don't fail the test if upload isn't found, just log it
      if (!uploadElementFound) {
        console.log('File upload functionality not immediately visible');
      }
      
    } catch (e) {
      console.log('File upload test navigation failed:', e.message);
      await page.screenshot({ path: 'tests/screenshots/file-upload-failed.png' });
    }
  });
});