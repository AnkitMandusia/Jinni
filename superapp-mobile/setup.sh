#!/bin/bash

echo "SuperApp Mobile - Setup Script"
echo "================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "${RED}ERROR: Node.js is not installed. Please install Node.js first.${NC}"
    echo "Download from: https://nodejs.org/"
    exit 1
fi

echo "[1/5] Node.js detected: $(node --version)"

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "${RED}ERROR: npm is not installed.${NC}"
    exit 1
fi

echo "[2/5] npm detected: $(npm --version)"

# Install dependencies
echo ""
echo "[3/5] Installing dependencies..."
if ! npm install; then
    echo "${RED}ERROR: Failed to install dependencies${NC}"
    exit 1
fi

# Setup Expo CLI globally
echo ""
echo "[4/5] Setting up Expo CLI..."
npm install -g @expo/cli || echo "${YELLOW}WARNING: Could not install Expo CLI globally. You can still use 'npx expo start'${NC}"

# Make scripts executable
echo ""
echo "[5/5] Making scripts executable..."
chmod +x setup.sh 2>/dev/null || true

echo ""
echo "${GREEN}=================================${NC}"
echo "${GREEN}Setup complete!${NC}"
echo ""
echo "To start the development server:"
echo "  npm start"
echo "  or"
echo "  npx expo start"
echo ""
echo "To run on specific platforms:"
echo "  npm run android"
echo "  npm run ios     (requires macOS)"
echo "  npm run web"
echo ""
echo "${GREEN}=================================${NC}"
