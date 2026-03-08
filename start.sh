#!/bin/bash
# Shipcat — OpenClaw Gateway Starter
# Usage: ./start.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Load environment variables from .env
if [ -f "$SCRIPT_DIR/.env" ]; then
    set -a
    source "$SCRIPT_DIR/.env"
    set +a
    echo "✅ Environment loaded from .env"
else
    echo "❌ No .env file found. Copy .env.example to .env and fill in your keys."
    exit 1
fi

# Verify required keys
if [ -z "$ANTHROPIC_API_KEY" ]; then
    echo "❌ ANTHROPIC_API_KEY is not set in .env"
    exit 1
fi

if [ -z "$REVENUECAT_API_KEY" ]; then
    echo "❌ REVENUECAT_API_KEY is not set in .env"
    exit 1
fi

echo "🐱 Starting Shipcat gateway..."
echo "   Model: anthropic/claude-sonnet-4-5"
echo "   Workspace: $SCRIPT_DIR"
echo ""

# Start the OpenClaw gateway
openclaw gateway --verbose
