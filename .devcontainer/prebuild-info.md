# GitHub Codespaces Prebuild Configuration
# This file is referenced by the devcontainer.json to enable Prebuilds
# Prebuilds cache your devcontainer layers for significantly faster startup

# The devcontainer.json handles the actual prebuild configuration
# This file documents the prebuild strategy for Mo Money

## Prebuild Strategy:
# 1. Base image: Node.js 20.19.4 LTS
# 2. Dependencies: npm ci baked into Docker layer  
# 3. Corepack enabled for toolchain consistency
# 4. Development environment ready on container start

## Benefits:
# - ~3 minute npm install time eliminated from container startup
# - Consistent Node.js/npm versions across all environments
# - Dependencies cached in Docker layers (rebuild only when lockfile changes)
# - Development server can start immediately after container creation

## To Enable Prebuilds:
# 1. Go to repository Settings > Codespaces > Prebuilds
# 2. Enable prebuilds for the main branch (and any active development branches)
# 3. Prebuild will trigger on every push to configured branches
# 4. New Codespaces will use the prebuild for near-instant startup

## Additional optimizations included:
# - VS Code extensions pre-configured for React/TypeScript development
# - Port 3000 auto-forwarded for dev server
# - postStartCommand runs npm start automatically