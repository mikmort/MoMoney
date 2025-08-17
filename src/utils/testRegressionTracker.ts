import fs from 'fs';
import path from 'path';

export interface TestRegression {
  id: string;
  timestamp: string;
  testName: string;
  testFile: string;
  errorMessage: string;
  fixType: 'test' | 'product';
  description: string;
  severity: 'low' | 'medium' | 'high';
  filesChanged: string[];
  commitSha?: string;
  prNumber?: string;
}

export interface TestTrackingData {
  version: string;
  description: string;
  stats: {
    totalRegressions: number;
    testBugFixes: number;
    productBugFixes: number;
    testBugPercentage: number;
    productBugPercentage: number;
  };
  regressions: TestRegression[];
  legend: {
    fixType: Record<string, string>;
    severity: Record<string, string>;
  };
}

class TestRegressionTracker {
  private trackingFilePath: string;

  constructor(trackingFilePath?: string) {
    this.trackingFilePath = trackingFilePath || path.join(process.cwd(), 'test-regression-tracking.json');
  }

  /**
   * Load the current tracking data
   */
  private loadTrackingData(): TestTrackingData {
    try {
      const data = fs.readFileSync(this.trackingFilePath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.warn('Could not load test tracking data, using defaults:', error);
      return this.getDefaultTrackingData();
    }
  }

  /**
   * Get default tracking data structure
   */
  private getDefaultTrackingData(): TestTrackingData {
    return {
      version: '1.0.0',
      description: 'Tracking system for automated test regressions',
      stats: {
        totalRegressions: 0,
        testBugFixes: 0,
        productBugFixes: 0,
        testBugPercentage: 0,
        productBugPercentage: 0
      },
      regressions: [],
      legend: {
        fixType: {
          test: 'Test had a bug/needed updating (false positive)',
          product: 'Product had a bug that test caught correctly (true positive)'
        },
        severity: {
          low: 'Minor issue, easily fixed',
          medium: 'Moderate issue, required some investigation',
          high: 'Major issue, significant investigation or refactoring required'
        }
      }
    };
  }

  /**
   * Save tracking data to file
   */
  private saveTrackingData(data: TestTrackingData): void {
    try {
      fs.writeFileSync(this.trackingFilePath, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('Failed to save test tracking data:', error);
    }
  }

  /**
   * Update statistics based on current regressions
   */
  private updateStats(data: TestTrackingData): void {
    const total = data.regressions.length;
    const testBugFixes = data.regressions.filter(r => r.fixType === 'test').length;
    const productBugFixes = data.regressions.filter(r => r.fixType === 'product').length;

    data.stats = {
      totalRegressions: total,
      testBugFixes,
      productBugFixes,
      testBugPercentage: total > 0 ? Math.round((testBugFixes / total) * 100) : 0,
      productBugPercentage: total > 0 ? Math.round((productBugFixes / total) * 100) : 0
    };
  }

  /**
   * Add a new test regression
   */
  public addRegression(regression: Omit<TestRegression, 'id' | 'timestamp'>): void {
    const data = this.loadTrackingData();
    
    const newRegression: TestRegression = {
      ...regression,
      id: `reg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString()
    };

    data.regressions.unshift(newRegression); // Add to beginning for chronological order
    this.updateStats(data);
    this.saveTrackingData(data);

    console.log(`✅ Test regression tracked: ${newRegression.testName} (${newRegression.fixType} bug)`);
  }

  /**
   * Get current statistics
   */
  public getStats(): TestTrackingData['stats'] {
    const data = this.loadTrackingData();
    return data.stats;
  }

  /**
   * Get all regressions
   */
  public getRegressions(): TestRegression[] {
    const data = this.loadTrackingData();
    return data.regressions;
  }

  /**
   * Get regressions by type
   */
  public getRegressionsByType(fixType: 'test' | 'product'): TestRegression[] {
    const data = this.loadTrackingData();
    return data.regressions.filter(r => r.fixType === fixType);
  }

  /**
   * Generate a summary report
   */
  public generateReport(): string {
    const data = this.loadTrackingData();
    const stats = data.stats;

    let report = `
# Test Regression Tracking Report

## Summary Statistics
- **Total Regressions**: ${stats.totalRegressions}
- **Test Bug Fixes**: ${stats.testBugFixes} (${stats.testBugPercentage}%)
- **Product Bug Fixes**: ${stats.productBugFixes} (${stats.productBugPercentage}%)

## Effectiveness Analysis
`;

    if (stats.totalRegressions === 0) {
      report += '- No regressions recorded yet\n';
    } else if (stats.productBugPercentage >= 70) {
      report += '- ✅ **EXCELLENT**: Tests are highly effective at catching real bugs\n';
    } else if (stats.productBugPercentage >= 50) {
      report += '- ✅ **GOOD**: Tests are catching more real bugs than false positives\n';
    } else if (stats.productBugPercentage >= 30) {
      report += '- ⚠️ **MODERATE**: Mixed results - consider improving test quality\n';
    } else {
      report += '- ❌ **POOR**: Tests are generating many false positives - review test design\n';
    }

    if (data.regressions.length > 0) {
      report += `\n## Recent Regressions (Last 10)\n`;
      const recentRegressions = data.regressions.slice(0, 10);
      
      recentRegressions.forEach((reg, index) => {
        const fixTypeIcon = reg.fixType === 'product' ? '🐛' : '🔧';
        const severityIcon = reg.severity === 'high' ? '🔴' : reg.severity === 'medium' ? '🟡' : '🟢';
        
        report += `\n${index + 1}. ${fixTypeIcon} **${reg.testName}** ${severityIcon}\n`;
        report += `   - Type: ${reg.fixType === 'product' ? 'Product Bug' : 'Test Bug'}\n`;
        report += `   - Severity: ${reg.severity}\n`;
        report += `   - Date: ${new Date(reg.timestamp).toLocaleDateString()}\n`;
        report += `   - Description: ${reg.description}\n`;
      });
    }

    return report;
  }
}

// Export singleton instance
export const testRegressionTracker = new TestRegressionTracker();

// Export class for testing
export { TestRegressionTracker };