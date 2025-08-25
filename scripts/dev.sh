#!/bin/bash
set -e

# Development Script - Start both fake API and FTP server with watch mode
# Handles cleanup and restart automatically

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

# Cleanup function
cleanup() {
    print_header "Shutting down development servers..."
    
    # Kill background jobs
    if [[ -n "$API_PID" ]]; then
        print_info "Stopping fake API server (PID: $API_PID)"
        kill $API_PID 2>/dev/null || true
    fi
    
    if [[ -n "$FTP_PID" ]]; then
        print_info "Stopping FTP server (PID: $FTP_PID)"  
        kill $FTP_PID 2>/dev/null || true
    fi
    
    # Wait a moment for cleanup
    sleep 1
    
    # Force kill if needed
    pkill -f "tsx.*fake.*api" 2>/dev/null || true
    pkill -f "tsx.*src/index" 2>/dev/null || true
    
    print_success "Development servers stopped"
    exit 0
}

# Set up signal handlers
trap cleanup SIGINT SIGTERM EXIT

print_header "Starting monk-ftp development environment"

# Kill any existing processes first
print_info "Cleaning up any existing processes..."
pkill -f "tsx.*fake.*api" 2>/dev/null || true
pkill -f "tsx.*src/index" 2>/dev/null || true
sleep 2

# Start fake API server with watch
print_info "Starting filesystem-based fake API server..."
npm run start:api:fs &
API_PID=$!

# Wait for API to start
sleep 3

# Check if API started successfully
if curl -s http://localhost:9001/health > /dev/null; then
    print_success "Fake API server running on port 9001"
else
    print_error "Failed to start fake API server"
    exit 1
fi

# Start FTP server with watch
print_info "Starting FTP server with watch mode..."
npm run start:dev &
FTP_PID=$!

# Wait for FTP server to start
sleep 3

# Check if FTP started successfully
if nc -z localhost 2121 2>/dev/null; then
    print_success "FTP server running on port 2121"
else
    print_error "Failed to start FTP server"
    exit 1
fi

print_header "Development environment ready!"
echo -e "${GREEN}✅ Fake API:${NC} http://localhost:9001"
echo -e "${GREEN}✅ FTP Server:${NC} ftp://localhost:2121"
echo -e "${BLUE}📡 Test with:${NC} ncftp -u root,fake.jwt.token -P 2121 localhost"
echo -e "${YELLOW}ℹ Press Ctrl+C to stop both servers${NC}"
echo ""

# Keep script running and monitor both processes
while true; do
    # Check if API server is still running
    if ! kill -0 $API_PID 2>/dev/null; then
        print_error "Fake API server died, restarting..."
        npm run start:api:fs &
        API_PID=$!
        sleep 3
    fi
    
    # Check if FTP server is still running  
    if ! kill -0 $FTP_PID 2>/dev/null; then
        print_error "FTP server died, restarting..."
        npm run start:dev &
        FTP_PID=$!
        sleep 3
    fi
    
    sleep 5
done