#!/bin/bash
set -e

# ===================================================================
# FTP PING TEST - Basic FTP Server Connectivity
# ===================================================================
#
# This script tests basic FTP server functionality:
# - FTP server starts and listens on configured port
# - FTP server accepts connections
# - Basic FTP protocol response (without authentication)
#
# Usage:
#   ./scripts/test-one.sh tests/45-ftp/ftp-ping-test.sh
#
# Requirements:
#   - Monk API server running (npm start)
#   - monk CLI available in PATH
#   - FTP server functionality enabled
#   - netcat (nc) or telnet for basic connectivity testing
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
echo "=== FTP Ping Test ==="
echo "Testing custom FTP protocol server connectivity and response"
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

# Authenticate as root user (needed for server operations)
if ! auth_as_user "root"; then
    print_error "Failed to authenticate as root"
    exit 1
fi

echo

# ===================================================================
# STEP 2: FTP SERVER CONFIGURATION AND STARTUP
# ===================================================================

# Check if FTP server is configured
FTP_PORT=${FTP_PORT:-2121}
FTP_HOST=${FTP_HOST:-localhost}

print_step "Checking FTP server configuration"
print_info "FTP Server: $FTP_HOST:$FTP_PORT"

# Test if FTP server endpoint exists (via API ping check first)
if ! monk ping >/dev/null 2>&1; then
    print_error "API server not responding - cannot test FTP server"
    cleanup_auth
    exit 1
fi

print_success "API server is responding"

# ===================================================================
# STEP 3: FTP CONNECTION TEST - Basic Connectivity
# ===================================================================

print_step "Testing FTP server basic connectivity"

# Use netcat to test if FTP port is listening
if command -v nc >/dev/null 2>&1; then
    print_info "Using netcat for connectivity test"
    
    # Test connection with timeout (macOS compatible)
    if nc -z -w 5 "$FTP_HOST" "$FTP_PORT" 2>/dev/null; then
        print_success "FTP server is listening on $FTP_HOST:$FTP_PORT"
    else
        print_error "FTP server not listening on $FTP_HOST:$FTP_PORT"
        print_info "Make sure FTP server is started (check npm start or monk hono start)"
        cleanup_auth
        exit 1
    fi
    
elif command -v telnet >/dev/null 2>&1; then
    print_info "Using telnet for connectivity test"
    
    # Test with telnet (more verbose but less reliable for automation)
    if echo quit | telnet "$FTP_HOST" "$FTP_PORT" >/dev/null 2>&1; then
        print_success "FTP server is listening on $FTP_HOST:$FTP_PORT"
    else
        print_error "FTP server not listening on $FTP_HOST:$FTP_PORT"
        print_info "Make sure FTP server is started (check npm start or monk hono start)"
        cleanup_auth
        exit 1
    fi
    
else
    print_info "Neither nc nor telnet available - using basic socket test"
    
    # Fallback: try to connect with a simple bash approach
    if bash -c "exec 3<>/dev/tcp/$FTP_HOST/$FTP_PORT && echo 'QUIT' >&3 && read -t 2 <&3 && exec 3<&-" >/dev/null 2>&1; then
        print_success "FTP server is listening on $FTP_HOST:$FTP_PORT"
    else
        print_error "FTP server not responding on $FTP_HOST:$FTP_PORT"
        print_info "Make sure FTP server is started (check npm start or monk hono start)"
        cleanup_auth
        exit 1
    fi
fi

# ===================================================================
# STEP 4: FTP PROTOCOL RESPONSE TEST
# ===================================================================

print_step "Testing FTP protocol response"

# Test FTP welcome message (should get 220 response)
if command -v nc >/dev/null 2>&1; then
    # Use netcat to get FTP welcome banner (macOS compatible)
    ftp_response=$(nc "$FTP_HOST" "$FTP_PORT" </dev/null 2>/dev/null | head -1)
    
    if [ -n "$ftp_response" ]; then
        # Check for FTP response code 220 (Service ready)
        if echo "$ftp_response" | grep -q "^220"; then
            print_success "FTP server returned proper welcome message"
            if [ "$CLI_VERBOSE" = "true" ]; then
                print_info "FTP Response: $ftp_response"
            fi
        else
            print_error "FTP server response invalid: $ftp_response"
            cleanup_auth
            exit 1
        fi
    else
        print_error "No response from FTP server"
        cleanup_auth
        exit 1
    fi
else
    print_info "Skipping FTP protocol response test (nc not available)"
fi

# ===================================================================
# STEP 5: FTP SERVER STATUS CHECK (if available)
# ===================================================================

print_step "Testing FTP server status"

# Try to get server status if available (this might not be implemented yet)
if monk hono status >/dev/null 2>&1; then
    print_success "Server status command available"
    if [ "$CLI_VERBOSE" = "true" ]; then
        print_info "Server status:"
        monk hono status 2>/dev/null | sed 's/^/  /'
    fi
else
    print_info "Server status command not available (expected for current implementation)"
fi

echo

# ===================================================================
# STEP 6: CLEANUP
# ===================================================================

print_step "Logging out current user"
logout_user
print_success "User logout completed"

echo
print_success "🎉 FTP ping tests passed!"
print_info "FTP server is running and responding to connections on $FTP_HOST:$FTP_PORT"
print_info "Next: Test FTP authentication with JWT tokens"