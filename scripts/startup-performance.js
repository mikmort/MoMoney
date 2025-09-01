#!/usr/bin/env node

/**
 * Startup Performance Monitoring Script for GitHub Agent Optimization
 * Tracks key metrics that affect GitHub agent startup time
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function measureStartupMetrics() {
  console.log('\n🚀 Mo Money GitHub Agent Startup Performance Report');
  console.log('====================================================');
  
  const metrics = {};
  
  // 1. Bundle size analysis (affects initial load)
  try {
    const buildDir = path.join(process.cwd(), 'build', 'static', 'js');
    if (fs.existsSync(buildDir)) {
      const files = fs.readdirSync(buildDir).filter(f => f.endsWith('.js') && !f.includes('.map'));
      
      let totalSize = 0;
      let mainBundleSize = 0;
      
      files.forEach(file => {
        const filePath = path.join(buildDir, file);
        const stats = fs.statSync(filePath);
        totalSize += stats.size;
        
        if (file.includes('main')) {
          mainBundleSize = stats.size;
        }
      });
      
      metrics.totalBundleSize = (totalSize / 1024).toFixed(2) + ' KB';
      metrics.mainBundleSize = (mainBundleSize / 1024).toFixed(2) + ' KB';
      metrics.chunkCount = files.length;
      
      console.log(`\n📦 Bundle Performance:`);
      console.log(`  Main Bundle: ${metrics.mainBundleSize}`);
      console.log(`  Total Bundle: ${metrics.totalBundleSize}`);
      console.log(`  Chunks: ${metrics.chunkCount}`);
      
      // Performance assessment
      if (mainBundleSize < 500 * 1024) { // 500KB
        console.log('  ✅ Main bundle size is excellent');
      } else if (mainBundleSize < 1000 * 1024) { // 1MB
        console.log('  ⚠️  Main bundle size is moderate');
      } else {
        console.log('  ❌ Main bundle size is large - consider more code splitting');
      }
    } else {
      console.log('  ⚠️  No build found - run npm run build first');
    }
  } catch (error) {
    console.log('  ❌ Error analyzing bundle size:', error.message);
  }
  
  // 2. Dependency analysis (affects install time)
  try {
    const packageJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'));
    const depCount = Object.keys(packageJson.dependencies || {}).length;
    const devDepCount = Object.keys(packageJson.devDependencies || {}).length;
    
    console.log(`\n📚 Dependencies:`);
    console.log(`  Production: ${depCount}`);
    console.log(`  Development: ${devDepCount}`);
    console.log(`  Total: ${depCount + devDepCount}`);
    
    if (depCount + devDepCount < 50) {
      console.log('  ✅ Dependency count is optimal');
    } else if (depCount + devDepCount < 100) {
      console.log('  ⚠️  Dependency count is moderate');
    } else {
      console.log('  ❌ High dependency count - consider reducing');
    }
  } catch (error) {
    console.log('  ❌ Error analyzing dependencies:', error.message);
  }
  
  // 3. Cache status (affects agent startup)
  console.log(`\n⚡ Cache Optimizations:`);
  
  // Check if node_modules exists (indicates cached install)
  if (fs.existsSync(path.join(process.cwd(), 'node_modules'))) {
    console.log('  ✅ Dependencies cached (node_modules present)');
  } else {
    console.log('  ❌ Dependencies not cached');
  }
  
  // Check if build exists (indicates cached build)
  if (fs.existsSync(path.join(process.cwd(), 'build'))) {
    console.log('  ✅ Build assets cached');
  } else {
    console.log('  ⚠️  Build assets not cached - run npm run build');
  }
  
  // Check TypeScript incremental compilation
  const tsConfigPath = path.join(process.cwd(), 'tsconfig.json');
  try {
    const tsConfig = JSON.parse(fs.readFileSync(tsConfigPath, 'utf8'));
    if (tsConfig.compilerOptions?.incremental) {
      console.log('  ✅ TypeScript incremental compilation enabled');
    } else {
      console.log('  ⚠️  TypeScript incremental compilation could be enabled');
    }
  } catch (error) {
    console.log('  ⚠️  Could not check TypeScript configuration');
  }
  
  // 4. GitHub workflow optimizations
  console.log(`\n🔄 GitHub Workflow Optimizations:`);
  
  const workflowPath = path.join(process.cwd(), '.github', 'workflows', 'copilot-setup-steps.yml');
  if (fs.existsSync(workflowPath)) {
    console.log('  ✅ Cache warming workflow present');
    
    try {
      const workflowContent = fs.readFileSync(workflowPath, 'utf8');
      const hasNodeCache = workflowContent.includes('actions/cache@v4');
      const hasWarmBuild = workflowContent.includes('npm run build');
      const hasWarmTest = workflowContent.includes('npm test');
      
      if (hasNodeCache) console.log('  ✅ npm cache warming enabled');
      if (hasWarmBuild) console.log('  ✅ Build cache warming enabled');
      if (hasWarmTest) console.log('  ✅ Test cache warming enabled');
      
    } catch (error) {
      console.log('  ⚠️  Could not analyze workflow details');
    }
  } else {
    console.log('  ❌ Cache warming workflow not found');
  }
  
  // 5. Development environment optimizations
  console.log(`\n🛠️  Development Environment:`);
  
  if (fs.existsSync(path.join(process.cwd(), '.devcontainer'))) {
    console.log('  ✅ Devcontainer configuration present');
  } else {
    console.log('  ⚠️  Devcontainer configuration could speed up Codespaces');
  }
  
  if (fs.existsSync(path.join(process.cwd(), '.nvmrc'))) {
    console.log('  ✅ Node.js version pinned (.nvmrc)');
  } else {
    console.log('  ⚠️  Node.js version pinning could improve consistency');
  }
  
  // Performance score calculation
  console.log(`\n🎯 Performance Score:`);
  let score = 0;
  let maxScore = 0;
  
  // Bundle size scoring (20 points)
  maxScore += 20;
  if (fs.existsSync(path.join(process.cwd(), 'build'))) {
    const buildDir = path.join(process.cwd(), 'build', 'static', 'js');
    if (fs.existsSync(buildDir)) {
      const files = fs.readdirSync(buildDir).filter(f => f.endsWith('.js') && !f.includes('.map'));
      const mainFile = files.find(f => f.includes('main'));
      if (mainFile) {
        const mainSize = fs.statSync(path.join(buildDir, mainFile)).size;
        if (mainSize < 500 * 1024) score += 20;
        else if (mainSize < 1000 * 1024) score += 15;
        else if (mainSize < 1500 * 1024) score += 10;
        else score += 5;
      }
    }
  }
  
  // Cache optimizations scoring (30 points)
  maxScore += 30;
  if (fs.existsSync(path.join(process.cwd(), 'node_modules'))) score += 10;
  if (fs.existsSync(path.join(process.cwd(), 'build'))) score += 10;
  if (fs.existsSync(workflowPath)) score += 10;
  
  // Development environment scoring (20 points)
  maxScore += 20;
  if (fs.existsSync(path.join(process.cwd(), '.devcontainer'))) score += 10;
  if (fs.existsSync(path.join(process.cwd(), '.nvmrc'))) score += 10;
  
  // Code splitting scoring (30 points)
  maxScore += 30;
  if (fs.existsSync(path.join(process.cwd(), 'build'))) {
    const buildDir = path.join(process.cwd(), 'build', 'static', 'js');
    if (fs.existsSync(buildDir)) {
      const files = fs.readdirSync(buildDir).filter(f => f.endsWith('.js') && !f.includes('.map'));
      if (files.length > 5) score += 30; // Good code splitting
      else if (files.length > 3) score += 20;
      else if (files.length > 1) score += 10;
    }
  }
  
  const percentage = Math.round((score / maxScore) * 100);
  console.log(`  Score: ${score}/${maxScore} (${percentage}%)`);
  
  if (percentage >= 90) {
    console.log('  🚀 Excellent - GitHub agents will start very quickly!');
  } else if (percentage >= 80) {
    console.log('  ✅ Good - GitHub agents will start quickly');
  } else if (percentage >= 70) {
    console.log('  ⚠️  Moderate - Some optimizations could help');
  } else {
    console.log('  ❌ Poor - Consider implementing more optimizations');
  }
  
  console.log(`\n💡 Recommendations:`);
  if (percentage < 90) {
    console.log('  • Enable GitHub Codespaces Prebuilds for maximum speed');
    console.log('  • Run cache warming workflow weekly');
    console.log('  • Consider lazy loading heavy dependencies');
    console.log('  • Optimize bundle size through code splitting');
  } else {
    console.log('  • Your setup is well optimized for GitHub agent performance!');
    console.log('  • Monitor performance regularly with this script');
  }
  
  return { score, maxScore, percentage };
}

// Run if called directly
if (require.main === module) {
  measureStartupMetrics();
}

module.exports = { measureStartupMetrics };