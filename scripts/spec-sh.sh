#!/bin/bash
set -e

# Shell Spec Test Runner for monk-ftp
# Runs integration tests with smart pattern/path resolution
#
# Usage: scripts/spec-sh.sh [pattern|path] [--verbose]
# 
# Smart Resolution:
# - No args: Run all *.test.sh files in sort order
# - Exact file path: Run specific .test.sh file
# - Pattern: Run *.test.sh files matching pattern
#
# Examples:
#   scripts/spec-sh.sh                                # All shell tests
#   scripts/spec-sh.sh integration                    # All *.test.sh in integration/
#   scripts/spec-sh.sh spec/integration/ftp          # All *.test.sh in integration/ftp/
#   scripts/spec-sh.sh spec/integration/client.test.sh # Single specific test
#   scripts/spec-sh.sh client                        # All *.test.sh matching "client"

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

if [[ "$2" == "--verbose" ]] || [[ "$1" == "--verbose" && -z "$pattern_or_path" ]]; then
    export CLI_VERBOSE=true
    if [[ "$1" == "--verbose" ]]; then
        pattern_or_path=""
    fi
fi

# Smart resolution function
resolve_shell_tests() {
    local pattern_or_path="$1"
    
    if [[ -z "$pattern_or_path" ]]; then
        # No args: run everything in sort order
        find spec/ -name "*.test.sh" 2>/dev/null | sort || true
    elif [[ -f "$pattern_or_path" && "$pattern_or_path" == *.test.sh ]]; then
        # Exact file match: single test
        echo "$pattern_or_path"
    else
        # Pattern: find matching files
        find spec/ -name "*.test.sh" 2>/dev/null | grep "$pattern_or_path" | sort || true
    fi
}

# Get test files to run
test_files=$(resolve_shell_tests "$pattern_or_path")

if [[ -z "$test_files" ]]; then
    print_info "No shell test files found for pattern: $pattern_or_path"
    print_info "This is expected if no shell tests exist yet"
    exit 0
fi

# Count tests
test_count=$(echo "$test_files" | wc -l)

# Display what we're running
if [[ -z "$pattern_or_path" ]]; then
    print_info "Running all shell tests ($test_count files)"
elif [[ -f "$pattern_or_path" ]]; then
    print_info "Running single shell test: $pattern_or_path"
else
    print_info "Running shell tests matching '$pattern_or_path' ($test_count files)"
fi

# Track results
passed=0
failed=0
failed_tests=()

# Execute each test file directly (monk-ftp tests don't need tenant isolation like monk-api)
while IFS= read -r test_file; do
    test_name=$(basename "$test_file")
    
    if [[ $test_count -gt 1 ]]; then
        echo -e "${BLUE}🧪 Running: $test_name${NC}"
    else
        echo -e "${YELLOW}ℹ Running single shell test: $test_name${NC}"
    fi
    
    # Make test executable if not already
    chmod +x "$test_file"
    
    # Execute test directly
    if "$test_file"; then
        ((passed++))
        if [[ $test_count -gt 1 ]]; then
            print_success "$test_name"
        else
            print_success "$test_name (passed)"
        fi
    else
        ((failed++))
        failed_tests+=("$test_name")
        print_error "$test_name"
    fi
    
    if [[ $test_count -gt 1 ]]; then
        echo ""
    fi
done <<< "$test_files"

# Summary
echo -e "${BLUE}📊 Shell Test Results:${NC}"
echo -e "   Passed: ${GREEN}$passed${NC}"
echo -e "   Failed: ${RED}$failed${NC}"
echo -e "   Total:  $test_count"

if [[ $failed -gt 0 ]]; then
    echo ""
    print_error "Failed tests:"
    for failed_test in "${failed_tests[@]}"; do
        echo -e "   ${RED}✗${NC} $failed_test"
    done
    exit 1
else
    print_success "All shell tests passed"
    exit 0
fi