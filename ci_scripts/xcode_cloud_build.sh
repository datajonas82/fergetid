#!/bin/bash

# Xcode Cloud Build Script for Capacitor App
# This script runs before the Xcode build to prepare the web assets

set -e

echo "🚀 Starting Xcode Cloud build for Capacitor app..."

# Install Node.js dependencies
echo "📦 Installing Node.js dependencies..."
npm ci

# Build the web assets
echo "🔨 Building web assets..."
npm run build

# Sync with Capacitor
echo "🔄 Syncing with Capacitor..."
npx cap sync ios

echo "✅ Build preparation complete!" 