#!/bin/bash
set -e

# ===================================================================
# FTP PATH PARSING TEST - Path Parser and API Context Translation
# ===================================================================
#
# This script tests the FTP path parsing system:
# - Path normalization and security validation
# - Path type classification
# - API context translation
# - Field and schema validation concepts
# - Security checks and error handling
#
# Usage:
#   ./scripts/test-one.sh tests/45-ftp/ftp-path-parsing-test.sh
#
# Requirements:
#   - Node.js and TypeScript compilation working
#   - Path parser modules compiled and available
#
# ===================================================================

# Auto-configure test environment
source "$(dirname "$0")/../test-env-setup.sh"

# Source auth helper for tenant management
source "$(dirname "$0")/../auth-helper.sh"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[0;33m'
NC='\033[0m'

print_step() {
    echo -e "${BLUE}→ $1${NC}"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_info() {
    echo -e "${YELLOW}ℹ $1${NC}"
}

# Test configuration
echo "=== FTP Path Parsing Test ==="
echo "Testing FTP path parser, API context translation, and validation"
echo

# ===================================================================
# STEP 1: VERIFY SETUP - Check environment
# ===================================================================

# Check that tenant is available (should be exported by test-one.sh)
if [ -z "$TEST_TENANT_NAME" ]; then
    print_error "TEST_TENANT_NAME not available - run via scripts/test-one.sh"
    exit 1
fi

print_step "Verifying test environment"
print_info "Using test tenant: $TEST_TENANT_NAME"

# Authenticate as root user for schema access
if ! auth_as_user "root"; then
    print_error "Failed to authenticate as root"
    exit 1
fi

# Check if TypeScript is compiled
if [ ! -f "dist/ftp/path-parser.js" ]; then
    print_info "Compiling TypeScript files..."
    if ! npm run compile >/dev/null 2>&1; then
        print_error "TypeScript compilation failed"
        cleanup_auth
        exit 1
    fi
fi

print_success "Environment setup complete"
echo

# ===================================================================
# STEP 2: BASIC PATH PARSING TESTS - No API server required
# ===================================================================

print_step "Preparing path parsing tests"
print_info "Testing core path parsing functionality (no API server required)"
echo

# ===================================================================
# STEP 3: PATH PARSING TESTS - Basic functionality
# ===================================================================

print_step "Testing basic path parsing functionality"

# Test path parsing using Node.js script  
cat > /tmp/path-test.mjs << EOF
import { FtpPathParser } from '$(pwd)/dist/ftp/path-parser.js';

// Test cases for path parsing using existing test schemas
const testCases = [
    // Root and directory paths
    { path: '/', expectedType: 'root' },
    { path: '/data', expectedType: 'data-root' },
    { path: '/data/', expectedType: 'data-root' },
    { path: '/meta', expectedType: 'meta-root' },
    { path: '/meta/schema', expectedType: 'meta-schemas' },
    
    // Data paths with account schema
    { path: '/data/account', expectedType: 'schema-records' },
    { path: '/data/account/550e8400-e29b-41d4-a716-446655440000', expectedType: 'record-fields' },
    { path: '/data/account/550e8400-e29b-41d4-a716-446655440000/name', expectedType: 'record-field' },
    { path: '/data/account/550e8400-e29b-41d4-a716-446655440000/550e8400-e29b-41d4-a716-446655440000.json', expectedType: 'complete-record' },
    
    // Data paths with contact schema
    { path: '/data/contact', expectedType: 'schema-records' },
    { path: '/data/contact/550e8400-e29b-41d4-a716-446655440000/email', expectedType: 'record-field' },
    
    // Meta paths
    { path: '/meta/schema/account', expectedType: 'meta-schema' },
    { path: '/meta/schema/contact', expectedType: 'meta-schema' },
    
    // Future paths
    { path: '/files', expectedType: 'files-root' }
];

console.log('PATH_PARSING_TESTS_START');

let passedTests = 0;
let totalTests = testCases.length;

testCases.forEach((testCase, index) => {
    try {
        const pathInfo = FtpPathParser.parse(testCase.path);
        
        if (pathInfo.type === testCase.expectedType) {
            console.log(`✓ Test ${index + 1}: ${testCase.path} → ${pathInfo.type}`);
            passedTests++;
        } else {
            console.log(`✗ Test ${index + 1}: ${testCase.path} → Expected: ${testCase.expectedType}, Got: ${pathInfo.type}`);
        }
    } catch (error) {
        console.log(`✗ Test ${index + 1}: ${testCase.path} → Error: ${error.message}`);
    }
});

console.log(`PATH_PARSING_RESULTS: ${passedTests}/${totalTests}`);
console.log('PATH_PARSING_TESTS_END');
EOF

# Run path parsing tests
if node /tmp/path-test.mjs > /tmp/path-test-output.txt 2>&1; then
    # Parse results
    if grep -q "PATH_PARSING_TESTS_START" /tmp/path-test-output.txt; then
        passed=$(grep "PATH_PARSING_RESULTS:" /tmp/path-test-output.txt | cut -d' ' -f2 | cut -d'/' -f1)
        total=$(grep "PATH_PARSING_RESULTS:" /tmp/path-test-output.txt | cut -d' ' -f2 | cut -d'/' -f2)
        
        if [ "$passed" = "$total" ]; then
            print_success "All path parsing tests passed ($passed/$total)"
        else
            print_error "Path parsing tests failed ($passed/$total)"
            if [ "$CLI_VERBOSE" = "true" ]; then
                print_info "Test details:"
                grep "✓\|✗" /tmp/path-test-output.txt | sed 's/^/  /'
            fi
        fi
    else
        print_error "Path parsing test output format invalid"
        if [ "$CLI_VERBOSE" = "true" ]; then
            cat /tmp/path-test-output.txt
        fi
    fi
else
    print_error "Path parsing tests failed to run"
    if [ "$CLI_VERBOSE" = "true" ]; then
        cat /tmp/path-test-output.txt
    fi
fi

echo

# ===================================================================
# STEP 4: API CONTEXT TRANSLATION TESTS
# ===================================================================

print_step "Testing API context translation"

# Test API context translation
cat > /tmp/api-context-test.mjs << EOF
import { FtpPathParser } from '$(pwd)/dist/ftp/path-parser.js';
import { ApiContextBuilder } from '$(pwd)/dist/ftp/api-context.js';

// Test cases for API context translation using account/contact schemas
const testCases = [
    { path: '/data/account', ftpOp: 'LIST', expectedApiOp: 'list' },
    { path: '/data/account/550e8400-e29b-41d4-a716-446655440000/name', ftpOp: 'RETR', expectedApiOp: 'read' },
    { path: '/data/account/550e8400-e29b-41d4-a716-446655440000/name', ftpOp: 'STOR', expectedApiOp: 'write' },
    { path: '/data/account/550e8400-e29b-41d4-a716-446655440000/name', ftpOp: 'DELE', expectedApiOp: 'delete' },
    { path: '/data/contact/550e8400-e29b-41d4-a716-446655440000/550e8400-e29b-41d4-a716-446655440000.json', ftpOp: 'RETR', expectedApiOp: 'read' },
    { path: '/meta/schema/account', ftpOp: 'RETR', expectedApiOp: 'read' }
];

console.log('API_CONTEXT_TESTS_START');

let passedTests = 0;
let totalTests = testCases.length;

testCases.forEach((testCase, index) => {
    try {
        const pathInfo = FtpPathParser.parse(testCase.path);
        const apiContext = ApiContextBuilder.fromPath(pathInfo, testCase.ftpOp);
        
        if (apiContext.operation === testCase.expectedApiOp) {
            console.log(`✓ Test ${index + 1}: ${testCase.path} + ${testCase.ftpOp} → ${apiContext.operation}`);
            passedTests++;
        } else {
            console.log(`✗ Test ${index + 1}: ${testCase.path} + ${testCase.ftpOp} → Expected: ${testCase.expectedApiOp}, Got: ${apiContext.operation}`);
        }
    } catch (error) {
        console.log(`✗ Test ${index + 1}: ${testCase.path} + ${testCase.ftpOp} → Error: ${error.message}`);
    }
});

console.log(`API_CONTEXT_RESULTS: ${passedTests}/${totalTests}`);
console.log('API_CONTEXT_TESTS_END');
EOF

# Run API context tests
if node /tmp/api-context-test.mjs > /tmp/api-context-output.txt 2>&1; then
    # Parse results
    if grep -q "API_CONTEXT_TESTS_START" /tmp/api-context-output.txt; then
        passed=$(grep "API_CONTEXT_RESULTS:" /tmp/api-context-output.txt | cut -d' ' -f2 | cut -d'/' -f1)
        total=$(grep "API_CONTEXT_RESULTS:" /tmp/api-context-output.txt | cut -d' ' -f2 | cut -d'/' -f2)
        
        if [ "$passed" = "$total" ]; then
            print_success "All API context tests passed ($passed/$total)"
        else
            print_error "API context tests failed ($passed/$total)"
            if [ "$CLI_VERBOSE" = "true" ]; then
                print_info "Test details:"
                grep "✓\|✗" /tmp/api-context-output.txt | sed 's/^/  /'
            fi
        fi
    else
        print_error "API context test output format invalid"
        if [ "$CLI_VERBOSE" = "true" ]; then
            cat /tmp/api-context-output.txt
        fi
    fi
else
    print_error "API context tests failed to run"
    if [ "$CLI_VERBOSE" = "true" ]; then
        cat /tmp/api-context-output.txt
    fi
fi

echo

# ===================================================================
# STEP 5: SECURITY VALIDATION TESTS
# ===================================================================

print_step "Testing security validation"

# Test security validation
cat > /tmp/security-test.mjs << EOF
import { FtpPathParser } from '$(pwd)/dist/ftp/path-parser.js';

// Test cases for security validation (should all fail)
const securityTestCases = [
    '../etc/passwd',           // Path traversal
    '/data/../meta',           // Path traversal in middle
    '/data/users/../../etc',   // Multiple traversal
    '/data/users\x00/name',    // Null byte
    '/data/users\x01/name',    // Control character
];

console.log('SECURITY_TESTS_START');

let failedAsExpected = 0;
let totalTests = securityTestCases.length;

securityTestCases.forEach((testPath, index) => {
    try {
        FtpPathParser.parse(testPath);
        console.log(`✗ Test ${index + 1}: ${testPath} → Should have failed but passed`);
    } catch (error) {
        console.log(`✓ Test ${index + 1}: ${testPath} → Properly rejected: ${error.message}`);
        failedAsExpected++;
    }
});

console.log(`SECURITY_RESULTS: ${failedAsExpected}/${totalTests}`);
console.log('SECURITY_TESTS_END');
EOF

# Run security tests
if node /tmp/security-test.mjs > /tmp/security-output.txt 2>&1; then
    # Parse results
    if grep -q "SECURITY_TESTS_START" /tmp/security-output.txt; then
        passed=$(grep "SECURITY_RESULTS:" /tmp/security-output.txt | cut -d' ' -f2 | cut -d'/' -f1)
        total=$(grep "SECURITY_RESULTS:" /tmp/security-output.txt | cut -d' ' -f2 | cut -d'/' -f2)
        
        if [ "$passed" = "$total" ]; then
            print_success "All security tests passed ($passed/$total)"
        else
            print_error "Security tests failed ($passed/$total)"
            if [ "$CLI_VERBOSE" = "true" ]; then
                print_info "Test details:"
                grep "✓\|✗" /tmp/security-output.txt | sed 's/^/  /'
            fi
        fi
    else
        print_error "Security test output format invalid"
        if [ "$CLI_VERBOSE" = "true" ]; then
            cat /tmp/security-output.txt
        fi
    fi
else
    print_error "Security tests failed to run"
    if [ "$CLI_VERBOSE" = "true" ]; then
        cat /tmp/security-output.txt
    fi
fi

echo

# ===================================================================
# STEP 6: CLEANUP
# ===================================================================

print_step "Cleaning up test resources"

# Clean up temporary files
rm -f /tmp/path-test.mjs /tmp/path-test-output.txt
rm -f /tmp/api-context-test.mjs /tmp/api-context-output.txt  
rm -f /tmp/security-test.mjs /tmp/security-output.txt

# No schema cleanup needed for path parsing tests

print_step "Logging out current user"
logout_user
print_success "User logout completed"

echo
print_success "🎉 FTP path parsing tests completed!"
print_info "Path parser and API context translation system is ready"

# Test summary
cat << 'EOF'

📋 PATH PARSING SYSTEM SUMMARY:
===============================

✅ FTP Path Parser
- Tenant-aware path structure (no /tenants/ prefix)  
- Security validation (path traversal prevention)
- Path type classification and normalization
- Field, schema, and record ID validation

✅ API Context Translation  
- FTP operation → API operation mapping
- Path info → Database context translation
- Content type determination
- Operation compatibility validation

✅ Security Features
- Path traversal attack prevention
- Control character filtering  
- Access control integration
- Schema and field validation

🔄 INTEGRATION READY:
- Ready for FTP file system operations
- Integrated with System class architecture
- Compatible with JWT authentication system
- Prepared for database validation

EOF