#!/bin/bash
set -e

# TypeScript Spec Test Runner for monk-ftp
# Runs vitest with smart pattern/path resolution
#
# Usage: scripts/spec-ts.sh [pattern|path] [--verbose]
# 
# Smart Resolution:
# - No args: Run all *.test.ts files in sort order
# - Exact file path: Run specific .test.ts file
# - Pattern: Run *.test.ts files matching pattern
#
# Examples:
#   scripts/spec-ts.sh                                # All TypeScript tests
#   scripts/spec-ts.sh unit                           # All *.test.ts in unit/
#   scripts/spec-ts.sh spec/unit/protocol             # All *.test.ts in unit/protocol/
#   scripts/spec-ts.sh spec/unit/protocol.test.ts     # Single specific test
#   scripts/spec-ts.sh ftp                           # All *.test.ts matching "ftp"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_error() { echo -e "${RED}✗ $1${NC}" >&2; }
print_success() { echo -e "${GREEN}✓ $1${NC}"; }
print_info() { echo -e "${YELLOW}ℹ $1${NC}"; }

# Parse arguments
pattern_or_path="$1"
verbose_flag=""

if [[ "$2" == "--verbose" ]] || [[ "$1" == "--verbose" && -z "$pattern_or_path" ]]; then
    verbose_flag="--reporter=verbose"
    if [[ "$1" == "--verbose" ]]; then
        pattern_or_path=""
    fi
fi

# Smart resolution function
resolve_typescript_tests() {
    local pattern_or_path="$1"
    
    if [[ -z "$pattern_or_path" ]]; then
        # No args: run everything in sort order
        find spec/ -name "*.test.ts" 2>/dev/null | sort || true
    elif [[ -f "$pattern_or_path" && "$pattern_or_path" == *.test.ts ]]; then
        # Exact file match: single test
        echo "$pattern_or_path"
    else
        # Pattern: find matching files
        find spec/ -name "*.test.ts" 2>/dev/null | grep "$pattern_or_path" | sort || true
    fi
}

# Get test files to run
test_files=$(resolve_typescript_tests "$pattern_or_path")

if [[ -z "$test_files" ]]; then
    print_info "No TypeScript test files found for pattern: $pattern_or_path"
    print_info "This is expected if no TypeScript tests exist yet"
    exit 0
fi

# Count tests
test_count=$(echo "$test_files" | wc -l)

# Display what we're running
if [[ -z "$pattern_or_path" ]]; then
    print_info "Running all TypeScript tests ($test_count files)"
elif [[ -f "$pattern_or_path" ]]; then
    print_info "Running single TypeScript test: $pattern_or_path"
else
    print_info "Running TypeScript tests matching '$pattern_or_path' ($test_count files)"
fi

# Run vitest with the resolved files
if [[ $test_count -eq 1 ]]; then
    # Single test - show which one
    echo -e "${YELLOW}ℹ Running single spec test: $(basename "$test_files")${NC}"
fi

# Execute vitest
npx vitest run $test_files $verbose_flag

exit_code=$?

if [[ $exit_code -eq 0 ]]; then
    print_success "TypeScript tests completed successfully"
else
    print_error "TypeScript tests failed"
fi

exit $exit_code