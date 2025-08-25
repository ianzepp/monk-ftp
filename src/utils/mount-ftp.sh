#!/bin/bash
set -e

# Mount monk-ftp server as FUSE filesystem
# Usage: ./mount-ftp.sh [mountpoint]

MOUNTPOINT="${1:-/tmp/monk-ftp-mount}"
SCRIPT_DIR="$(dirname "$0")"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

print_info() { echo -e "${YELLOW}ℹ $1${NC}"; }
print_success() { echo -e "${GREEN}✓ $1${NC}"; }
print_error() { echo -e "${RED}✗ $1${NC}" >&2; }

# Check requirements
if ! python3 -c "import fuse" 2>/dev/null; then
    print_error "Python FUSE bindings not available"
    print_info "Install with: pip install fusepy"
    exit 1
fi

# Create mountpoint
mkdir -p "$MOUNTPOINT"

# Check if already mounted
if mountpoint -q "$MOUNTPOINT" 2>/dev/null; then
    print_error "Mountpoint $MOUNTPOINT already in use"
    print_info "Unmount with: fusermount -u $MOUNTPOINT"
    exit 1
fi

# Check if FTP server is running
if ! nc -z localhost 2121 2>/dev/null; then
    print_error "FTP server not running on localhost:2121"
    print_info "Start with: npm run dev"
    exit 1
fi

print_info "Mounting monk-ftp server at $MOUNTPOINT"
print_info "Press Ctrl+C to unmount"

# Mount filesystem (runs in foreground)
cd "$SCRIPT_DIR/../.."
python3 src/utils/ftp-fuse-mount.py "$MOUNTPOINT"