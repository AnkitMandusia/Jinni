@echo off
ECHO SuperApp Mobile - Setup Script
ECHO =================================
ECHO.

REM Check if Node.js is installed
node --version >nul 2>&1
if %errorlevel% neq 0 (
    ECHO ERROR: Node.js is not installed. Please install Node.js first.
    ECHO Download from: https://nodejs.org/
    exit /b 1
)

ECHO [1/5] Node.js detected: 
node --version

REM Check if npm is installed  
npm --version >nul 2>&1
if %errorlevel% neq 0 (
    ECHO ERROR: npm is not installed. Please install npm.
    exit /b 1
)

ECHO [2/5] npm detected: 
npm --version

ECHO.
ECHO [3/5] Installing project dependencies...
npm install
if %errorlevel% neq 0 (
    ECHO ERROR: Failed to install dependencies
    exit /b 1
)

ECHO.
ECHO [4/5] Setting up Expo CLI globally...
npm install -g expo-cli
if %errorlevel% neq 0 (
    ECHO WARNING: Could not install Expo CLI globally. You may need to run:
    ECHO   npx expo start
)

ECHO.
ECHO [5/5] Setup complete!
ECHO.
ECHO =================================
ECHO To start the development server:
ECHO.
ECHO   npx expo start
ECHO.
ECHO =================================

PAUSE
EXIT /B 0