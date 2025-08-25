#!/bin/bash
set -e

# Unmount monk-ftp FUSE filesystem
# Usage: ./unmount-ftp.sh [mountpoint]

MOUNTPOINT="${1:-/tmp/monk-ftp-mount}"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

print_info() { echo -e "${YELLOW}ℹ $1${NC}"; }
print_success() { echo -e "${GREEN}✓ $1${NC}"; }
print_error() { echo -e "${RED}✗ $1${NC}" >&2; }

# Check if mounted
if ! mountpoint -q "$MOUNTPOINT" 2>/dev/null; then
    print_info "Mountpoint $MOUNTPOINT not mounted"
    exit 0
fi

print_info "Unmounting $MOUNTPOINT"

# Unmount
if fusermount -u "$MOUNTPOINT"; then
    print_success "Successfully unmounted $MOUNTPOINT"
else
    print_error "Failed to unmount $MOUNTPOINT"
    print_info "Try: sudo umount $MOUNTPOINT"
    exit 1
fi