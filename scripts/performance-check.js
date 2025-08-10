#!/usr/bin/env node

/**
 * Performance monitoring script for MoMoney builds
 * Tracks build times, bundle sizes, and optimization metrics
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function formatBytes(bytes) {
  return (bytes / 1024).toFixed(2) + ' KB';
}

function analyzeBuildOutput() {
  const buildDir = path.join(process.cwd(), 'build', 'static', 'js');
  
  if (!fs.existsSync(buildDir)) {
    console.log('❌ Build directory not found. Run npm run build first.');
    return;
  }
  
  const files = fs.readdirSync(buildDir).filter(f => f.endsWith('.js') && !f.includes('.map'));
  
  let totalSize = 0;
  const chunks = [];
  
  files.forEach(file => {
    const filePath = path.join(buildDir, file);
    const stats = fs.statSync(filePath);
    totalSize += stats.size;
    
    chunks.push({
      name: file,
      size: stats.size,
      isMain: file.includes('main'),
      isChunk: !file.includes('main')
    });
  });
  
  chunks.sort((a, b) => b.size - a.size);
  
  console.log('\n🚀 Mo Money Build Performance Report');
  console.log('=====================================');
  
  console.log(`\n📦 Bundle Analysis:`);
  console.log(`Total JS size: ${formatBytes(totalSize)}`);
  console.log(`Number of chunks: ${chunks.filter(c => c.isChunk).length + 1}`);
  
  console.log(`\n📊 Chunk Breakdown:`);
  chunks.slice(0, 10).forEach((chunk, i) => {
    const type = chunk.isMain ? '(main)' : '(chunk)';
    console.log(`  ${i + 1}. ${chunk.name} ${type}: ${formatBytes(chunk.size)}`);
  });
  
  const mainBundle = chunks.find(c => c.isMain);
  if (mainBundle) {
    console.log(`\n✅ Code Splitting: Main bundle is ${formatBytes(mainBundle.size)} (good!)`);
  }
  
  if (totalSize < 600 * 1024) {
    console.log('✅ Total bundle size is under 600KB (good!)');
  } else if (totalSize < 800 * 1024) {
    console.log('⚠️  Total bundle size is moderate');
  } else {
    console.log('❌ Total bundle size is large - consider more optimizations');
  }
}

function measureBuildTime() {
  console.log('\n⏱️  Measuring build time...');
  const start = Date.now();
  
  try {
    execSync('npm run build', { stdio: 'inherit' });
    const buildTime = (Date.now() - start) / 1000;
    console.log(`\n✅ Build completed in ${buildTime.toFixed(1)}s`);
    
    if (buildTime < 30) {
      console.log('🚀 Excellent build time!');
    } else if (buildTime < 60) {
      console.log('✅ Good build time');
    } else {
      console.log('⚠️  Build time could be improved');
    }
    
    return buildTime;
  } catch (error) {
    console.log('❌ Build failed');
    return null;
  }
}

// Main execution
const args = process.argv.slice(2);

if (args.includes('--analyze-only')) {
  analyzeBuildOutput();
} else if (args.includes('--build-and-analyze')) {
  const buildTime = measureBuildTime();
  if (buildTime !== null) {
    analyzeBuildOutput();
  }
} else {
  console.log('\nMo Money Performance Check Tool');
  console.log('Usage:');
  console.log('  node scripts/performance-check.js --analyze-only     # Analyze existing build');
  console.log('  node scripts/performance-check.js --build-and-analyze  # Build and analyze');
}