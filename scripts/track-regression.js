#!/usr/bin/env node

/**
 * Test Regression Tracking CLI Tool
 * 
 * Usage:
 *   node scripts/track-regression.js add --test "MyTest" --file "src/__tests__/mytest.test.ts" --type "product" --severity "medium" --description "Fixed authentication bug"
 *   node scripts/track-regression.js report
 *   node scripts/track-regression.js stats
 */

const fs = require('fs');
const path = require('path');

// Since this is a Node.js script, we need to implement the tracker logic here
// or compile TypeScript. For simplicity, implementing directly in JS.

class TestRegressionTracker {
  constructor(trackingFilePath) {
    this.trackingFilePath = trackingFilePath || path.join(process.cwd(), 'test-regression-tracking.json');
  }

  loadTrackingData() {
    try {
      const data = fs.readFileSync(this.trackingFilePath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.warn('Could not load test tracking data, using defaults');
      return this.getDefaultTrackingData();
    }
  }

  getDefaultTrackingData() {
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

  saveTrackingData(data) {
    try {
      fs.writeFileSync(this.trackingFilePath, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('Failed to save test tracking data:', error);
    }
  }

  updateStats(data) {
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

  addRegression(regression) {
    const data = this.loadTrackingData();
    
    const newRegression = {
      ...regression,
      id: `reg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString()
    };

    data.regressions.unshift(newRegression);
    this.updateStats(data);
    this.saveTrackingData(data);

    console.log(`✅ Test regression tracked: ${newRegression.testName} (${newRegression.fixType} bug)`);
  }

  getStats() {
    const data = this.loadTrackingData();
    return data.stats;
  }

  generateReport() {
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
      report += '- No regressions recorded yet\\n';
    } else if (stats.productBugPercentage >= 70) {
      report += '- ✅ **EXCELLENT**: Tests are highly effective at catching real bugs\\n';
    } else if (stats.productBugPercentage >= 50) {
      report += '- ✅ **GOOD**: Tests are catching more real bugs than false positives\\n';
    } else if (stats.productBugPercentage >= 30) {
      report += '- ⚠️ **MODERATE**: Mixed results - consider improving test quality\\n';
    } else {
      report += '- ❌ **POOR**: Tests are generating many false positives - review test design\\n';
    }

    if (data.regressions.length > 0) {
      report += `\\n## Recent Regressions (Last 10)\\n`;
      const recentRegressions = data.regressions.slice(0, 10);
      
      recentRegressions.forEach((reg, index) => {
        const fixTypeIcon = reg.fixType === 'product' ? '🐛' : '🔧';
        const severityIcon = reg.severity === 'high' ? '🔴' : reg.severity === 'medium' ? '🟡' : '🟢';
        
        report += `\\n${index + 1}. ${fixTypeIcon} **${reg.testName}** ${severityIcon}\\n`;
        report += `   - Type: ${reg.fixType === 'product' ? 'Product Bug' : 'Test Bug'}\\n`;
        report += `   - Severity: ${reg.severity}\\n`;
        report += `   - Date: ${new Date(reg.timestamp).toLocaleDateString()}\\n`;
        report += `   - Description: ${reg.description}\\n`;
      });
    }

    return report;
  }
}

// CLI Implementation
function parseArgs() {
  const args = process.argv.slice(2);
  const command = args[0];
  
  const parsed = { command, options: {} };
  
  for (let i = 1; i < args.length; i += 2) {
    if (args[i].startsWith('--')) {
      const key = args[i].substring(2);
      const value = args[i + 1];
      parsed.options[key] = value;
    }
  }
  
  return parsed;
}

function showUsage() {
  console.log(`
Test Regression Tracking CLI Tool

Usage:
  node scripts/track-regression.js add --test "TestName" --file "test/file.test.ts" --type "product|test" --severity "low|medium|high" --description "Description of the fix" [--error "Error message"] [--files "file1.ts,file2.ts"]
  node scripts/track-regression.js report
  node scripts/track-regression.js stats

Commands:
  add     Add a new test regression entry
  report  Generate and display a full report
  stats   Show summary statistics only

Options for 'add':
  --test        Test name (required)
  --file        Test file path (required)
  --type        Fix type: 'product' or 'test' (required)
  --severity    Severity: 'low', 'medium', or 'high' (required)
  --description Description of what was fixed (required)
  --error       Error message (optional)
  --files       Comma-separated list of files changed (optional)

Examples:
  node scripts/track-regression.js add --test "Authentication Test" --file "src/__tests__/auth.test.ts" --type "product" --severity "high" --description "Fixed login redirect bug"
  node scripts/track-regression.js add --test "CSV Import Test" --file "src/__tests__/import.test.ts" --type "test" --severity "low" --description "Updated test expectations for new CSV format"
`);
}

function main() {
  const { command, options } = parseArgs();
  const tracker = new TestRegressionTracker();

  switch (command) {
    case 'add':
      if (!options.test || !options.file || !options.type || !options.severity || !options.description) {
        console.error('❌ Missing required options for add command');
        showUsage();
        process.exit(1);
      }

      if (!['product', 'test'].includes(options.type)) {
        console.error('❌ Invalid type. Must be "product" or "test"');
        process.exit(1);
      }

      if (!['low', 'medium', 'high'].includes(options.severity)) {
        console.error('❌ Invalid severity. Must be "low", "medium", or "high"');
        process.exit(1);
      }

      const filesChanged = options.files ? options.files.split(',').map(f => f.trim()) : [];
      
      tracker.addRegression({
        testName: options.test,
        testFile: options.file,
        fixType: options.type,
        severity: options.severity,
        description: options.description,
        errorMessage: options.error || 'No error message provided',
        filesChanged
      });
      break;

    case 'report':
      console.log(tracker.generateReport());
      break;

    case 'stats':
      const stats = tracker.getStats();
      console.log('📊 Test Regression Statistics:');
      console.log(`   Total Regressions: ${stats.totalRegressions}`);
      console.log(`   Test Bug Fixes: ${stats.testBugFixes} (${stats.testBugPercentage}%)`);
      console.log(`   Product Bug Fixes: ${stats.productBugFixes} (${stats.productBugPercentage}%)`);
      break;

    default:
      console.error('❌ Unknown command:', command);
      showUsage();
      process.exit(1);
  }
}

if (require.main === module) {
  main();
}