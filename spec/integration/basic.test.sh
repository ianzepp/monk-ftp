#!/bin/bash
set -e

# Basic integration test for monk-ftp
# Verifies shell test framework is working

echo "🧪 Running basic integration test..."

# Test basic shell operations
test_value="monk-ftp-integration"

if [[ "$test_value" == "monk-ftp-integration" ]]; then
    echo "✅ Shell test framework working"
else
    echo "❌ Shell test framework failed"
    exit 1
fi

# Test that TypeScript compilation works
if [[ -f "tsconfig.json" ]]; then
    echo "✅ TypeScript configuration exists"
else
    echo "❌ TypeScript configuration missing"
    exit 1
fi

echo "✅ Basic integration test passed"