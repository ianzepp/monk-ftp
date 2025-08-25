#!/bin/bash
set -e

# Unified Spec Test Runner for monk-ftp
# Runs both TypeScript and Shell tests in sequence for complete coverage
#
# Usage: scripts/spec.sh [pattern|path] [--verbose]
# 
# Smart Resolution:
# - No args: Run all tests (ts then sh)
# - Exact file path: Run specific test
# - Pattern: Run matching tests
#
# Examples:
#   scripts/spec.sh                           # All tests (complete coverage)
#   scripts/spec.sh ftp                       # All FTP-related tests (ts + sh)  
#   scripts/spec.sh spec/unit/protocol.test.ts # Single TypeScript test
#   scripts/spec.sh spec/integration/client.test.sh # Single shell test
#   scripts/spec.sh protocol                  # All tests matching "protocol"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

print_error() { echo -e "${RED}✗ $1${NC}" >&2; }
print_success() { echo -e "${GREEN}✓ $1${NC}"; }
print_info() { echo -e "${YELLOW}ℹ $1${NC}"; }
print_header() { echo -e "${CYAN}📋 $1${NC}"; }

# Parse arguments
pattern_or_path="$1"
verbose_flag=""

if [[ "$2" == "--verbose" ]] || [[ "$1" == "--verbose" && -z "$pattern_or_path" ]]; then
    verbose_flag="--verbose"
    if [[ "$1" == "--verbose" ]]; then
        pattern_or_path=""
    fi
fi

# Display what we're running
if [[ -z "$pattern_or_path" ]]; then
    print_header "Running complete monk-ftp test suite (TypeScript → Shell)"
else
    print_header "Running monk-ftp tests for: $pattern_or_path (TypeScript → Shell)"
fi

# Track overall results
overall_exit_code=0

# Phase 1: TypeScript Tests
print_header "Phase 1: TypeScript Tests (vitest)"
if npm run spec:ts "$pattern_or_path" $verbose_flag; then
    print_success "TypeScript tests completed"
else
    print_error "TypeScript tests failed"
    overall_exit_code=1
fi

echo ""

# Phase 2: Shell Tests  
print_header "Phase 2: Shell Tests (integration) - DISABLED"
print_info "Shell tests disabled until FTP implementation is ready"
# if npm run spec:sh "$pattern_or_path" $verbose_flag; then
#     print_success "Shell tests completed"
# else
#     print_error "Shell tests failed"
#     overall_exit_code=1
# fi

echo ""

# Summary
if [[ $overall_exit_code -eq 0 ]]; then
    print_success "monk-ftp TypeScript test suite passed"
    echo -e "${GREEN}✅ TypeScript tests successful (shell tests disabled)${NC}"
else
    print_error "monk-ftp test suite failed"
    echo -e "${RED}❌ TypeScript tests failed - check output above${NC}"
fi

exit $overall_exit_code