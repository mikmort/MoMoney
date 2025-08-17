import fs from 'fs';
import path from 'path';
import { TestRegressionTracker, TestRegression } from '../utils/testRegressionTracker';

// Create a temporary directory for test files
const testDir = '/tmp/test-regression-tracker';
const testTrackingFile = path.join(testDir, 'test-tracking.json');

describe('Test Regression Tracker', () => {
  let tracker: TestRegressionTracker;

  beforeEach(() => {
    // Ensure test directory exists
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }

    // Clean up any existing test file
    if (fs.existsSync(testTrackingFile)) {
      fs.unlinkSync(testTrackingFile);
    }

    tracker = new TestRegressionTracker(testTrackingFile);
  });

  afterEach(() => {
    // Clean up test file
    if (fs.existsSync(testTrackingFile)) {
      fs.unlinkSync(testTrackingFile);
    }
  });

  it('should initialize with empty statistics', () => {
    const stats = tracker.getStats();
    
    expect(stats.totalRegressions).toBe(0);
    expect(stats.testBugFixes).toBe(0);
    expect(stats.productBugFixes).toBe(0);
    expect(stats.testBugPercentage).toBe(0);
    expect(stats.productBugPercentage).toBe(0);
  });

  it('should add a product bug regression and update statistics', () => {
    const regression = {
      testName: 'Authentication Test',
      testFile: 'src/__tests__/auth.test.ts',
      errorMessage: 'Expected login to succeed but got error',
      fixType: 'product' as const,
      description: 'Fixed authentication service bug',
      severity: 'high' as const,
      filesChanged: ['src/services/authService.ts']
    };

    tracker.addRegression(regression);

    const stats = tracker.getStats();
    expect(stats.totalRegressions).toBe(1);
    expect(stats.productBugFixes).toBe(1);
    expect(stats.testBugFixes).toBe(0);
    expect(stats.productBugPercentage).toBe(100);
    expect(stats.testBugPercentage).toBe(0);

    const regressions = tracker.getRegressions();
    expect(regressions).toHaveLength(1);
    expect(regressions[0].testName).toBe(regression.testName);
    expect(regressions[0].fixType).toBe('product');
  });

  it('should add a test bug regression and update statistics', () => {
    const regression = {
      testName: 'CSV Import Test',
      testFile: 'src/__tests__/csvImport.test.ts',
      errorMessage: 'Expected 5 transactions but got 6',
      fixType: 'test' as const,
      description: 'Updated test expectations for new CSV format',
      severity: 'low' as const,
      filesChanged: ['src/__tests__/csvImport.test.ts']
    };

    tracker.addRegression(regression);

    const stats = tracker.getStats();
    expect(stats.totalRegressions).toBe(1);
    expect(stats.productBugFixes).toBe(0);
    expect(stats.testBugFixes).toBe(1);
    expect(stats.productBugPercentage).toBe(0);
    expect(stats.testBugPercentage).toBe(100);
  });

  it('should handle mixed regression types and calculate percentages correctly', () => {
    // Add 3 product bugs
    for (let i = 0; i < 3; i++) {
      tracker.addRegression({
        testName: `Product Bug Test ${i + 1}`,
        testFile: 'src/__tests__/product.test.ts',
        errorMessage: 'Product error',
        fixType: 'product',
        description: `Fixed product bug ${i + 1}`,
        severity: 'medium',
        filesChanged: ['src/services/productService.ts']
      });
    }

    // Add 1 test bug
    tracker.addRegression({
      testName: 'Test Bug Test',
      testFile: 'src/__tests__/testbug.test.ts',
      errorMessage: 'Test error',
      fixType: 'test',
      description: 'Fixed test bug',
      severity: 'low',
      filesChanged: ['src/__tests__/testbug.test.ts']
    });

    const stats = tracker.getStats();
    expect(stats.totalRegressions).toBe(4);
    expect(stats.productBugFixes).toBe(3);
    expect(stats.testBugFixes).toBe(1);
    expect(stats.productBugPercentage).toBe(75); // 3/4 = 75%
    expect(stats.testBugPercentage).toBe(25); // 1/4 = 25%
  });

  it('should filter regressions by type', () => {
    // Add mixed regression types
    tracker.addRegression({
      testName: 'Product Bug',
      testFile: 'test1.ts',
      errorMessage: 'Error',
      fixType: 'product',
      description: 'Product fix',
      severity: 'high',
      filesChanged: []
    });

    tracker.addRegression({
      testName: 'Test Bug',
      testFile: 'test2.ts',
      errorMessage: 'Error',
      fixType: 'test',
      description: 'Test fix',
      severity: 'low',
      filesChanged: []
    });

    const productBugs = tracker.getRegressionsByType('product');
    const testBugs = tracker.getRegressionsByType('test');

    expect(productBugs).toHaveLength(1);
    expect(testBugs).toHaveLength(1);
    expect(productBugs[0].testName).toBe('Product Bug');
    expect(testBugs[0].testName).toBe('Test Bug');
  });

  it('should generate a meaningful report', () => {
    // Add some test data
    tracker.addRegression({
      testName: 'High Priority Bug',
      testFile: 'src/__tests__/critical.test.ts',
      errorMessage: 'System crash',
      fixType: 'product',
      description: 'Fixed critical system bug',
      severity: 'high',
      filesChanged: ['src/core/system.ts']
    });

    tracker.addRegression({
      testName: 'Test Update',
      testFile: 'src/__tests__/minor.test.ts',
      errorMessage: 'Outdated expectation',
      fixType: 'test',
      description: 'Updated test for new feature',
      severity: 'low',
      filesChanged: ['src/__tests__/minor.test.ts']
    });

    const report = tracker.generateReport();

    expect(report).toContain('Test Regression Tracking Report');
    expect(report).toContain('**Total Regressions**: 2');
    expect(report).toContain('**Product Bug Fixes**: 1 (50%)');
    expect(report).toContain('**Test Bug Fixes**: 1 (50%)');
    expect(report).toContain('High Priority Bug');
    expect(report).toContain('Test Update');
    expect(report).toContain('🐛'); // Product bug icon
    expect(report).toContain('🔧'); // Test bug icon
  });

  it('should persist data across instances', () => {
    // Add data with first instance
    tracker.addRegression({
      testName: 'Persistence Test',
      testFile: 'persistence.test.ts',
      errorMessage: 'Test error',
      fixType: 'product',
      description: 'Testing persistence',
      severity: 'medium',
      filesChanged: []
    });

    // Create new instance pointing to same file
    const tracker2 = new TestRegressionTracker(testTrackingFile);
    const stats = tracker2.getStats();

    expect(stats.totalRegressions).toBe(1);
    expect(stats.productBugFixes).toBe(1);

    const regressions = tracker2.getRegressions();
    expect(regressions[0].testName).toBe('Persistence Test');
  });

  it('should handle file system errors gracefully', () => {
    // Try to create tracker with invalid path (permission denied)
    const invalidTracker = new TestRegressionTracker('/root/invalid/path/tracking.json');
    
    // Should not throw, but might log warnings
    expect(() => {
      invalidTracker.addRegression({
        testName: 'Error Test',
        testFile: 'error.test.ts',
        errorMessage: 'Error',
        fixType: 'test',
        description: 'Test error handling',
        severity: 'low',
        filesChanged: []
      });
    }).not.toThrow();
  });

  it('should generate appropriate effectiveness assessments', () => {
    // Test excellent effectiveness (>= 70% product bugs)
    for (let i = 0; i < 7; i++) {
      tracker.addRegression({
        testName: `Product Bug ${i}`,
        testFile: 'test.ts',
        errorMessage: 'Error',
        fixType: 'product',
        description: 'Product fix',
        severity: 'low',
        filesChanged: []
      });
    }
    
    for (let i = 0; i < 3; i++) {
      tracker.addRegression({
        testName: `Test Bug ${i}`,
        testFile: 'test.ts',
        errorMessage: 'Error',
        fixType: 'test',
        description: 'Test fix',
        severity: 'low',
        filesChanged: []
      });
    }

    const report = tracker.generateReport();
    expect(report).toContain('EXCELLENT');
    expect(report).toContain('highly effective');
  });
});