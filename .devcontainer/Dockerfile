# Use Node.js 20 LTS as base image
FROM node:20.19.4-bullseye-slim

# Set working directory
WORKDIR /workspace

# Enable Corepack for consistent package manager tooling
RUN corepack enable

# Install system dependencies needed for PDF parsing and build tools
RUN apt-get update && apt-get install -y \
    git \
    curl \
    build-essential \
    python3 \
    && rm -rf /var/lib/apt/lists/*

# Copy package files for dependency installation
COPY package.json package-lock.json ./

# Install npm dependencies and cache them in the image layer
# This is the key optimization - dependencies are baked into the image
RUN npm ci --prefer-offline --no-audit && npm cache clean --force

# Copy environment example for development
COPY .env.example .env

# The rest of the source code will be mounted via bind mount
# This ensures fast startup since deps are already installed

# Expose the development server port
EXPOSE 3000

# Default command (can be overridden)
CMD ["npm", "start"]