# Monk FTP Server Developer Guide

## Overview

Monk FTP Server is a standalone **FTP protocol server** built with **Node.js** and **TypeScript**, designed to provide traditional FTP client compatibility with the **Monk API PaaS layer**. The project acts as a protocol translation bridge, converting standard FTP commands into optimized HTTP requests to the monk-api `/ftp/*` middleware endpoints.

## Quick Start

### Prerequisites
- **Node.js 18+** and npm
- **Running monk-api instance** with `/ftp/*` endpoints available
- **PostgreSQL** (via monk-api dependency)
- **Valid JWT token** from monk-api for authentication

### Fresh Environment Setup
```bash
# 1. Clone and setup
git clone https://github.com/ianzepp/monk-ftp.git
cd monk-ftp

# 2. Install dependencies
npm install

# 3. Compile TypeScript
npm run compile

# 4. Start FTP server (development)
npm run start:dev

# 5. Test with FTP client
lftp -u "root,<jwt-token>" localhost:2121
```

### Configuration
Set environment variables or update configuration:
```bash
# FTP Server Configuration
FTP_PORT=2121
FTP_HOST=localhost

# Monk API Configuration  
MONK_API_URL=http://localhost:9001
MONK_JWT_TOKEN=<your-jwt-token>
```

## Project Architecture

### Core Components

#### **FTP Protocol Server** (`src/lib/`)
- **RFC 959 Compliance**: Standard FTP protocol implementation
- **JWT Authentication**: Seamless integration with monk-api auth system
- **Path Translation**: Maps FTP filesystem metaphor to monk-api data structures
- **Data Connection Management**: Proper passive/active mode support for file transfers
- **Command Processing**: Complete FTP command set (USER, PASS, LIST, STOR, RETR, etc.)

#### **API Integration Layer** (`src/lib/`)
- **HTTP Client**: Optimized requests to monk-api `/ftp/*` endpoints
- **Response Translation**: Converts JSON responses to FTP protocol format
- **Error Mapping**: Translates API errors to appropriate FTP status codes
- **Authentication Handler**: JWT token validation and system context management

#### **Path Management** (`src/lib/`)
- **Path Parsing**: FTP path to monk-api path structure conversion
- **Path Validation**: Security and format validation for FTP paths
- **Wildcard Support**: Pattern matching integration with monk-api Filter system

## Architecture Vision

### Service Separation (Bridge Architecture)
```
+-------------+    +--------------+    +-------------+
|  FTP Client |    |   monk-ftp   |    |  monk-api   |
|             |<-->|              |<-->|             |
| (lftp, etc) |    | FTP Protocol |    | PaaS Layer  |
+-------------+    +--------------+    +-------------+
                          |                    |
                   FTP Protocol        /ftp/* Middleware
                     Server             Endpoints
```

### Clear Responsibilities

#### monk-ftp Project (This Project)
- **FTP protocol implementation**: Handles actual FTP commands, data connections
- **Client connection management**: Manages FTP sessions, authentication
- **Protocol translation**: Converts FTP commands to HTTP API calls to /ftp/* endpoints
- **Response formatting**: Converts API responses to FTP protocol responses

#### monk-api /ftp/* Middleware (Dependency)
- **Optimized data access**: Single calls for complex FTP operations
- **FTP-aware filtering**: Understands FTP path semantics and wildcards
- **Efficient serialization**: Returns data optimized for FTP presentation
- **ACL integration**: User context filtering for FTP directory browsing

## FTP Protocol Implementation

### Command Support Matrix

#### **Authentication Commands** ✅
- ✅ **USER**: Username specification (working with FTP clients)
- ✅ **PASS**: JWT token authentication (validates token format)
- ✅ **QUIT**: Clean connection termination

#### **Navigation Commands** ✅  
- ✅ **PWD**: Print working directory (returns current path)
- ✅ **CWD**: Change working directory (validates via monk-api)
- ⏳ **CDUP**: Change to parent directory (planned)

#### **Information Commands** ✅
- ✅ **LIST**: Directory listing (complete monk-api integration)
- ✅ **STAT**: File/directory status (multi-line FTP format)
- ✅ **CLNT**: Client identification (logging/debugging)

#### **File Operations** ✅
- ✅ **RETR**: File download (complete data connection implementation)
- ✅ **STOR**: File upload (complete data connection implementation)  
- ✅ **APPE**: File append (complete data connection implementation)
- ✅ **DELE**: File deletion (complete monk-api integration)
- ✅ **SIZE**: File size query (complete with directory rejection)
- ✅ **MDTM**: File modification time (complete monk-api integration)

#### **Data Connection Commands** ✅
- ✅ **PASV**: Passive mode data connection (complete implementation)
- ⏳ **EPSV**: Extended passive mode (future enhancement)
- ⏳ **PORT**: Active mode (future enhancement)  
- ⏳ **EPRT**: Extended active mode (future enhancement)

#### **System Commands** ✅
- ✅ **SYST**: System type identification
- ✅ **TYPE**: Transfer type setting
- ✅ **FEAT**: Feature negotiation
- ✅ **NOOP**: No operation

### FTP Response Codes
Standard RFC 959 response codes are implemented:
- **2xx**: Success responses (220 Ready, 230 Logged in, 250 Command OK)
- **3xx**: Intermediate responses (331 Need password)
- **4xx**: Temporary failures (425 Can't open data connection)
- **5xx**: Permanent failures (530 Not logged in, 550 File not found)

## API Integration

### monk-api Endpoint Mapping

#### **Directory Operations**
```typescript
// FTP: LIST /data/users/
// ->
POST /ftp/list
{
  "path": "/data/users/",
  "ftp_options": {
    "show_hidden": false,
    "long_format": true,
    "recursive": false
  }
}
```

#### **File Operations**
```typescript
// FTP: RETR /data/users/user-123.json
// ->
POST /ftp/retrieve
{
  "path": "/data/users/user-123.json",
  "ftp_options": {
    "binary_mode": false,
    "start_offset": 0
  }
}
```

#### **Authentication**
```typescript
// FTP: PASS <jwt-token>
// ->
HTTP Authorization: Bearer <jwt-token>
// Validated through monk-api auth system
```

### Path Structure Translation

FTP paths map directly to monk-api data structures:
```
FTP Path                    ->  Monk-API Path
/                          ->  /data/
/data/                     ->  /data/
/data/users/               ->  /data/users/
/data/users/user-123/      ->  /data/users/user-123/
/data/users/user-123.json  ->  /data/users/user-123.json
```

## Development Workflows

### FTP Server Development

#### **Starting Development Server**
```bash
# Unified development environment (RECOMMENDED)
npm run dev                # Starts both fake API + FTP server with auto-reload

# Individual servers (for debugging)
npm run start:api:fs       # Filesystem-based fake monk-api server
npm run start:dev          # FTP server with auto-reload

# Production build and start  
npm run compile && npm run start

# Debug mode with verbose logging
DEBUG=monk-ftp npm run start:dev
```

#### **Testing with FTP Clients**
```bash
# netcat: Raw protocol testing (RELIABLE)
echo "USER root\r\nPASS fake.jwt.token\r\nLIST\r\nSTAT /data/\r\nQUIT" | nc localhost 2121

# ncftp: Interactive testing (WORKING)
ncftp -u root -p fake.jwt.token -P 2121 localhost
# Interactive commands: ls, pwd, cd, help

# lftp: Protocol debugging (ADVANCED - use with caution)
lftp -d -c "set ftp:ssl-allow no; open -u root,fake.jwt.token -p 2121 localhost; pwd; quit"

# GUI clients (Ready for testing)
# - FileZilla: Host=localhost, Port=2121, User=root, Pass=fake.jwt.token
# - WinSCP: Similar configuration

# Automated testing
npm run spec              # All tests (30+ tests passing)
npm run spec:ts           # TypeScript tests only
```

### API Integration Testing

#### **Endpoint Validation**
```bash
# Test monk-api /ftp/* endpoints directly
curl -X POST http://localhost:9001/ftp/list \
  -H "Authorization: Bearer <jwt-token>" \
  -d '{"path": "/data/", "ftp_options": {"long_format": true}}'

# Validate authentication
curl -X POST http://localhost:9001/ftp/list \
  -H "Authorization: Bearer invalid-token" \
  -d '{"path": "/data/"}'
```

#### **Integration Flow Testing**
```bash
# Recommended: Unified development environment
npm run dev               # Starts fake API + FTP server with auto-reload

# Alternative: Individual components
npm run start:api:fs      # Filesystem-based fake monk-api
npm run start:dev         # FTP server

# Production testing with real monk-api
cd ../monk-api && npm run start:dev    # Start real monk-api
cd ../monk-ftp && npm run start:dev    # Start FTP server (change apiUrl)
```

## Working Implementation

### **FTP Protocol Success** 🎉
The monk-ftp server is now **fully functional** for core operations:

```bash
# Complete working flow
npm run dev                          # Start both servers

# Test with real FTP client
ncftp -u root,fake.jwt.token -P 2121 localhost
# or  
echo "USER root\r\nPASS fake.jwt.token\r\nLIST\r\nSTAT /data/\r\nQUIT" | nc localhost 2121
```

#### **Validated FTP Commands:**
- ✅ **USER root** → 331 User root okay, need password
- ✅ **PASS fake.jwt.token** → 230 User root logged in  
- ✅ **PWD** → 257 "/" is current directory
- ✅ **CWD /data/users** → 250 Directory changed to /data/users
- ✅ **CDUP** → 250 Directory changed to /data (parent directory)
- ✅ **LIST** → Proper FTP directory listing with real file sizes
- ✅ **STAT /path** → Multi-line status with detailed metadata
- ✅ **SIZE file.json** → 213 290 (exact file size)
- ✅ **MDTM file** → 213 20250825151723 (real timestamp)
- ✅ **PASV** → 227 Entering passive mode (127,0,0,1,p1,p2)
- ✅ **HELP** → Multi-line command list for client compatibility
- ✅ **CLNT NcFTP 3.2.6** → 200 OK (client identification)
- ✅ **APPE /file.txt** → 425 Use PASV first (file append)

#### **Real Data Integration:**
- **Schema level**: `/data/` shows `accounts`, `contacts`, `users`
- **Record level**: `/data/users/` shows UUID records + JSON files  
- **Field level**: `/data/users/user-123.../` shows `name`, `email`, `role`
- **Metadata**: Real file sizes (290 bytes JSON, 17 bytes email field)

### **Testing Infrastructure** 
- **68+ tests**: Unit tests for all commands with comprehensive coverage including security
- **23 test files**: Realistic monk-api data patterns with UUIDs and field-per-file structure
- **Filesystem-based API**: Real file operations reading from `spec/test-data/`
- **Integration testing**: Complete FTP protocol validation with real clients
- **Security testing**: Rate limiting and path validation with 29 dedicated tests
- **Command testing**: 1:1 mapping (src/commands/X.ts → spec/unit/commands/X.test.ts)

#### **Test Data Structure** (`spec/test-data/`)
```
data/
├── accounts/                        # Business accounts
│   ├── acc-550e8400....json         # Complete record (290 bytes)
│   ├── acc-550e8400..../            # Field-per-file directory
│   │   ├── name, email, type        # Individual field files
├── users/                           # User records  
│   ├── user-123e4567....json        # Complete record (290 bytes)
│   ├── user-123e4567..../           # Field-per-file directory
│   │   ├── name, email, role        # Individual field files (5-17 bytes)
└── contacts/                        # Contact records
    └── contact-111e2222....json     # Complete record

meta/schema/                         # Schema definitions
├── accounts.yaml, users.yaml, contacts.yaml
```

#### **Realistic Testing Scenarios:**
- **Directory traversal**: `/data/` → `/data/users/` → `/data/users/user-123.../`
- **File operations**: Both complete records (JSON) and individual fields
- **Metadata queries**: Real file sizes, timestamps, permissions from filesystem
- **Authentication**: JWT token validation through all operations

## Testing Architecture

### **TypeScript Testing (vitest)**
```bash
# All TypeScript tests (68+ tests)
npm run spec:ts

# Unit tests only  
npm run spec:ts unit

# Security tests (29 tests)
npm run spec:ts rate-limiting

# Integration tests  
npm run spec:ts integration

# Specific command tests
npm run spec:ts commands/clnt
npm run spec:ts commands/appe
```

### **Shell Testing (Future)**
```bash
# Shell tests (disabled until implementation ready)
npm run spec:sh

# FTP client integration tests
npm run test:clients

# Performance testing
npm run test:performance
```

### **Manual Testing Commands**
```bash
# Test basic connectivity
telnet localhost 2121

# Test authentication
lftp -c "open -u root,<jwt-token> localhost:2121; ls; quit"

# Test file operations  
lftp -c "open -u root,<jwt-token> localhost:2121; cd /data/users; ls; quit"
```

## Configuration Management

### **FTP Server Configuration**
```typescript
// Configuration interface (future implementation)
interface FtpConfig {
    port: number;           // FTP server port (default: 2121)
    host: string;          // Bind address (default: 'localhost')  
    apiUrl: string;        // monk-api base URL
    passivePortRange: {    // Passive mode port range
        min: number;
        max: number;
    };
    maxConnections: number; // Maximum concurrent connections
    timeout: number;       // Connection timeout (ms)
}
```

### **Environment Variables**
```bash
# Server Configuration
FTP_PORT=2121
FTP_HOST=0.0.0.0
FTP_MAX_CONNECTIONS=100

# API Integration
MONK_API_URL=http://localhost:9001
MONK_JWT_SECRET=<secret-for-validation>

# Development
NODE_ENV=development
DEBUG=monk-ftp:*
```

## Implementation Status

### **Completed Features** ✅
- **TypeScript Infrastructure**: Package structure, build system, testing framework
- **Command-per-File Architecture**: 9 FTP command handlers with clean dispatch
- **Working FTP Server**: Full RFC 959 compliance with authentication and navigation
- **monk-api Integration**: HTTP client with complete `/ftp/*` endpoint support
- **Realistic Testing**: Filesystem-based fake API with authentic monk-api data patterns
- **Development Environment**: Unified `npm run dev` with auto-reload and cleanup

### **Working FTP Commands** ✅
- **Authentication**: USER, PASS, QUIT (JWT token validation)
- **Navigation**: PWD, CWD, CDUP (directory operations with API validation)
- **Information**: LIST, STAT, SIZE, MDTM, HELP, CLNT (complete metadata support)
- **Data Transfer**: PASV, STOR, RETR, APPE (complete file transfer implementation)
- **System**: SYST, TYPE, FEAT, NOOP (protocol compliance)

### **Complete Implementation** ✅
- **16 FTP Commands**: Full command set covering authentication, navigation, file operations
- **Data Connections**: PASV mode with proper port allocation and client handling
- **File Transfers**: Complete STOR/RETR/APPE implementation with monk-api integration
- **Protocol Compliance**: RFC 959 compliance with proper response codes and formats
- **Client Compatibility**: Full ncftp support with CLNT command identification
- **FUSE Filesystem**: Working directory/file detection with Unix tool compatibility
- **Simplified Architecture**: String-based command registration with auto-discovery

### **Security Features** ✅
- **Connection Rate Limiting**: 10 connections per minute per IP with automatic cleanup
- **Authentication Rate Limiting**: 3 auth failures per 5 minutes per IP
- **Path Validation**: Directory traversal protection and malformed path blocking
- **Memory Management**: Automatic cleanup of rate limiting state every 5 minutes
- **Standard Responses**: Proper FTP 421/553 error codes for security violations

### **Future Features** 📋
- **Extended Data Connections**: PORT/EPSV/EPRT modes for broader client support
- **Advanced Protocol Features**: Resume support, binary/ASCII modes
- **Multi-Tenant Support**: servers.json integration for /tenant/* paths
- **Performance Optimizations**: HTTP connection pooling, streaming transfers
- **Production Deployment**: Docker, systemd, monitoring, structured logging

## Contributing Guidelines

### **Development Setup**
```bash
# 1. Fork and clone repository
git clone https://github.com/your-username/monk-ftp.git
cd monk-ftp

# 2. Install dependencies
npm install

# 3. Setup monk-api dependency
cd ../monk-api
npm run autoinstall
npm run start:dev

# 4. Start monk-ftp development
cd ../monk-ftp  
npm run start:dev

# 5. Test integration
npm run test
```

### **Code Style**
- **TypeScript**: Strict typing, async/await patterns
- **Error Handling**: Comprehensive error handling with proper FTP response codes
- **Logging**: Structured logging with appropriate log levels
- **Documentation**: Comprehensive JSDoc comments for all public methods

### **Testing Requirements**
- **Unit tests**: All new functionality must include unit tests
- **Integration tests**: FTP protocol compliance testing
- **Manual testing**: Verification with multiple FTP clients
- **Performance testing**: Load testing for concurrent connections

---

## Quick Reference

### **Essential Commands**
```bash
# Development (RECOMMENDED)
npm run dev               # Start both servers with auto-reload and cleanup

# Testing
npm run spec              # Complete test suite (68+ tests)
npm run spec:ts           # TypeScript tests only
npm run spec:ts commands  # Command-specific tests  
npm run spec:ts unit      # Unit tests only
npm run spec:ts rate-limiting  # Security tests (29 tests)

# FTP Testing (WORKING)
# netcat: Most reliable for protocol testing
echo "USER root\r\nPASS fake.jwt.token\r\nLIST\r\nSTAT /data/\r\nQUIT" | nc localhost 2121

# ncftp: Interactive testing
ncftp -u root -p fake.jwt.token -P 2121 localhost

# lftp: Advanced protocol debugging (use with timeouts)
timeout 15 lftp -c "set ftp:ssl-allow no; open -u root,fake.jwt.token -p 2121 localhost; pwd; quit"

# API Testing (Filesystem-based)
curl -X POST http://localhost:9001/ftp/list \
  -H "Authorization: Bearer fake.jwt.token" \
  -d '{"path": "/data/"}'

# Debug
DEBUG=monk-ftp:* npm run start:dev

# Security Testing
echo -e "USER root\r\nPASS invalid\r\nPASS invalid\r\nPASS invalid\r\nPASS invalid\r\n" | nc localhost 2121  # Test auth rate limiting
echo -e "LIST ../../../etc/passwd\r\nQUIT\r\n" | nc localhost 2121  # Test path validation
```

### **Key Configuration Files**
- **package.json**: Project dependencies and scripts
- **tsconfig.json**: TypeScript compilation settings  
- **vitest.config.ts**: Testing framework configuration
- **src/index.ts**: Main server entry point
- **src/commands/**: Individual FTP command handlers (14 commands)
- **spec/test-data/**: Realistic test data (23 files)
- **spec/helpers/**: Testing utilities and fake API servers
- **bin/monk-ftp**: CLI executable

### **FTP Client Compatibility**

#### **netcat** ⭐⭐⭐ (EXCELLENT for testing)
- **Reliability**: Perfect for protocol validation
- **Usage**: `echo "commands" | nc localhost 2121`
- **Benefits**: Shows exact FTP responses, no client quirks

#### **ncftp** ⭐⭐⭐ (EXCELLENT for interactive use)
- **Reliability**: Connects and authenticates reliably
- **Usage**: `ncftp -u root -p fake.jwt.token -P 2121 localhost`
- **Benefits**: Interactive mode, familiar interface, HELP command support

#### **lftp** ⭐⭐ (GOOD with proper settings)
- **Reliability**: Works but can hang without proper configuration
- **Usage**: `timeout 15 lftp -c "set ftp:ssl-allow no; open -u root,fake.jwt.token -p 2121 localhost; commands"`
- **Benefits**: Shows detailed protocol flow, good for debugging
- **Caution**: Always use timeouts, requires SSL disabled

### **FUSE Filesystem Integration**

Mount the FTP server as a local filesystem for Unix tool compatibility:

#### **Setup Requirements**
```bash
# Install Python FUSE bindings
pip install fusepy

# Verify FUSE is available
which fusermount fusermount3
```

#### **Mount Operations**
```bash
# Start monk-ftp servers
npm run dev

# Mount as filesystem
./src/utils/mount-ftp.sh /tmp/monk-ftp-mount

# Use standard Unix tools
ls -la /tmp/monk-ftp-mount/data/users/
cat /tmp/monk-ftp-mount/data/users/user-123.../email
echo "new@email.com" > /tmp/monk-ftp-mount/data/users/user-123.../email
grep "john" /tmp/monk-ftp-mount/data/users/*.json

# Unmount when done
./src/utils/unmount-ftp.sh /tmp/monk-ftp-mount
```

#### **FUSE Benefits**
- **Standard Unix tools**: `ls`, `cat`, `grep`, `find`, `awk` all work
- **Shell operations**: Pipes, redirects, globbing work naturally
- **Scripting**: Bash scripts can operate on monk-api data as files
- **Integration**: Works with any tool that reads/writes files

#### **FUSE Implementation Status** ✅
- **Directory Detection**: Fixed SIZE command to properly reject directories (`550 Not a file`)
- **File/Directory Distinction**: Proper `S_IFDIR` vs `S_IFREG` detection in `getattr()`
- **Tree Navigation**: Complete directory traversal with `find .` command support
- **Desktop Integration**: Suppressed common desktop environment probe errors
- **Real Data Access**: Full compatibility with spec/test-data/ structure

## Claude Code Development Guide

### **Process Management**

When working with Claude Code, proper background process management is critical to prevent orphaned processes and port conflicts.

#### **❌ Incorrect Background Process Usage**
```bash
# WRONG: This creates nested backgrounding and orphaned processes
Bash("npm run dev &", { run_in_background: true })

# Problems:
# - The & backgrounds the process within the bash shell
# - run_in_background: true backgrounds the bash shell itself
# - Killing the bash shell leaves npm/node processes running
# - Ports remain occupied, preventing restart
```

#### **✅ Correct Background Process Usage**
```bash
# Option 1: Use run_in_background without &
Bash("npm run dev", { run_in_background: true })

# Option 2: Use process group management
Bash("setsid npm run dev < /dev/null > /dev/null 2>&1 &", { run_in_background: true })

# Option 3: Check and cleanup before starting
Bash("pkill -f 'tsx.*monk-ftp' || true && npm run dev", { run_in_background: true })
```

#### **Process Cleanup Best Practices**
```bash
# Always check for orphaned processes after development
ss -tlnp | grep :2121                    # Check if FTP port is occupied
ps aux | grep -E "(tsx|node.*monk)"      # Check for running processes

# Clean up orphaned processes
pkill -f "tsx.*spec/helpers/filesystem-fake-api.ts"  # Kill fake API
pkill -f "tsx.*src/index.ts"                         # Kill FTP server
```

### **FTP Command Implementation Pattern**

When implementing new FTP commands (like CLNT), follow this established pattern:

#### **1. Create Command Handler**
```typescript
// src/commands/newcommand.ts
import { BaseFtpCommand } from '../lib/base-command.js';
import type { FtpConnection } from '../lib/types.js';

export class NewcommandCommand extends BaseFtpCommand {
    readonly name = 'NEWCOMMAND';
    readonly needsAuth = false; // or true if requires authentication
    readonly needsDataConnection = false; // or true if needs data connection

    async execute(connection: FtpConnection, args: string): Promise<void> {
        // Command logic here
        this.sendResponse(connection, 200, 'OK');
    }
}
```

#### **2. Update Type Definitions (if needed)**
```typescript
// src/lib/types.ts - Add new fields to FtpConnection if needed
export interface FtpConnection {
    // ... existing fields
    newField?: string; // Add optional fields as needed
}
```

#### **3. Register Command**
```typescript
// src/lib/ftp-server.ts
// In loadCommandHandlers():
await this.registerCommand('newcommand');
```

#### **4. Update Help Command**
```typescript
// src/commands/help.ts
const helpLines = [
    '214-The following commands are supported:',
    '214-USER PASS QUIT PWD CWD CDUP',
    '214-LIST STAT SIZE MDTM PASV',
    '214-STOR RETR DELE CLNT NEWCOMMAND', // Add to appropriate line
    '214-SYST TYPE FEAT NOOP',
    '214 Help OK'
];
```

#### **5. Test Implementation**
```bash
# Compile to check for errors
npm run compile

# Test with netcat
echo -e "NEWCOMMAND arg\r\nQUIT\r\n" | nc localhost 2121

# Test with FTP clients
ncftp -u root -p fake.jwt.token -P 2121 localhost
```

### **Recent Implementation: CLNT Command**

The CLNT command was implemented following this pattern to resolve ncftp client compatibility:

**Problem**: ncftp sends `CLNT NcFTP 3.2.6 linux-x86_64-glibc2.35` for client identification, receiving `502 Command not implemented`

**Solution**: 
- Created `src/commands/clnt.ts` with proper client identification handling
- Added `clientInfo?: string` field to `FtpConnection` interface
- Command stores client info and responds with `200 OK`
- Added debug logging when client identification is received

**Testing**:
```bash
# Before: 502 Command not implemented
# After: 200 OK
echo -e "CLNT NcFTP 3.2.6\r\nQUIT\r\n" | nc localhost 2121
```

### **Version 1.0.0 Release Implementation**

The monk-ftp server reached 1.0.0 milestone with complete FTP protocol compliance, client compatibility, and FUSE filesystem integration.

#### **Major Features Completed:**

1. **Complete FTP Protocol**: 16 commands with full RFC 959 compliance
2. **Security Hardening**: Rate limiting and path validation protection
3. **Client Compatibility**: CLNT command support for ncftp and other FTP clients
4. **File Operations**: STOR/RETR/APPE/DELE with complete data connection support
5. **FUSE Filesystem**: Directory detection and Unix tool compatibility
6. **Comprehensive Testing**: 68+ unit tests including 29 security tests
7. **Production Readiness**: Enhanced security for production deployment

#### **FUSE Directory Detection Fix:**
**Problem**: `ls -la fuse/` showed:
```bash
-rw-r--r-- data  # File (incorrect)
-rw-r--r-- meta  # File (incorrect)  
```

**Solution**: 
1. **Fixed SIZE command**: Return `550 Not a file` for directories (RFC compliance)
2. **Fixed FUSE detection**: Try CWD test when SIZE fails  
3. **Added desktop probe suppression**: Reduced log noise from system file probes

**Result**: `ls -la fuse/` now correctly shows:
```bash  
drwxr-xr-x data/  # Directory (correct)
drwxr-xr-x meta/  # Directory (correct)
find . # Complete tree traversal works
```

#### **Architecture Improvements:**
- **Command Registration**: Simplified from 32 lines to 16 lines with auto-discovery
- **Test Coverage**: Added comprehensive tests for new commands
- **Documentation**: Complete Claude Code development guidelines

### **Development Workflow with Claude Code**

#### **Starting Development**
```bash
# Always check for clean environment first
ss -tlnp | grep :2121 || echo "Port available"

# Start development environment (RECOMMENDED)
npm run dev  # This handles both API and FTP server properly

# Alternative: Individual servers for debugging
npm run start:api:fs  # Filesystem-based fake API
npm run start:dev     # FTP server with auto-reload
```

#### **Testing and Verification**
```bash
# Compile before testing
npm run compile

# Unit tests
npm run spec:ts

# Integration testing with real clients
echo "USER root\r\nPASS fake.jwt.token\r\nLIST\r\nQUIT" | nc localhost 2121
ncftp -u root -p fake.jwt.token -P 2121 localhost
```

#### **Cleanup After Development**
```bash
# Check for running processes
ps aux | grep -E "(tsx|node.*monk)" | grep -v grep

# Kill if needed
pkill -f "tsx.*monk"

# Verify ports are released
ss -tlnp | grep :2121 || echo "Port 2121 available"
ss -tlnp | grep :9001 || echo "Port 9001 available"
```

This guide provides everything needed to develop, test, and deploy the Monk FTP Server, from initial setup through production deployment.