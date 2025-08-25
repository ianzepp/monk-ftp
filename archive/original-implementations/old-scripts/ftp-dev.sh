#!/bin/bash
set -e

# ===================================================================
# Monk FTP Server Development Mode Script
# ===================================================================
#
# Starts the Monk FTP server in development mode with file watching.
# This script provides hot-reload functionality for development workflow.
#
# Usage:
#   ./scripts/ftp-dev.sh
#   npm run ftp:dev
#
# Features:
#   - File watching with automatic restarts
#   - TypeScript compilation on-the-fly
#   - Development-friendly error reporting
#   - Real-time FTP server updates
#
# Environment Variables:
#   FTP_PORT=2121            # FTP server port (default: 2121)
#   FTP_HOST=localhost       # FTP server host (default: localhost)
#   JWT_SECRET=secret        # JWT secret for token validation
#   DB_HOST=localhost        # Database host
#   DB_PORT=5432             # Database port
#   DB_USER=postgres         # Database user
#
# Authentication:
#   Username: api-user (or tenant-specific)
#   Password: <JWT-token-from-monk-auth>
#
# ===================================================================

echo "🔧 Starting Monk FTP Server (Development Mode)..."
echo "=================================================="

# Display configuration
FTP_PORT=${FTP_PORT:-2121}
FTP_HOST=${FTP_HOST:-localhost}

echo "📡 Configuration:"
echo "   Host: $FTP_HOST"
echo "   Port: $FTP_PORT"
echo "   Authentication: JWT tokens"
echo "   Environment: development"
echo "   File Watching: enabled"

if [ -n "$JWT_SECRET" ]; then
    echo "   JWT Secret: configured"
else
    echo "   JWT Secret: using default (change for production)"
fi

if [ -n "$DB_HOST" ]; then
    echo "   Database: $DB_HOST:${DB_PORT:-5432}"
else
    echo "   Database: localhost:5432 (default)"
fi

echo ""
echo "💡 Connection Instructions:"
echo "   FTP URL: ftp://$FTP_HOST:$FTP_PORT"
echo "   Username: api-user"
echo "   Password: <your-jwt-token>"
echo ""
echo "🔧 To get JWT token:"
echo "   1. monk auth login <tenant> <user>"
echo "   2. Use the JWT token as FTP password"
echo ""
echo "🔥 Hot-reload enabled - files will be watched for changes"
echo "   Press Ctrl+C to stop the server"
echo ""

# Start the FTP server in watch mode
echo "🔧 Starting FTP server with file watching..."
exec tsx watch src/ftp-server-cli.ts