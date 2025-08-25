# Archive - Original Implementation Attempts

This directory contains the original implementation attempts and exploration work done before the current clean implementation.

## Directory Structure

### `original-implementations/old-ftp-servers/`
Contains the original FTP server implementations:

- **ftp-server.ts**: MinimalFtpServer - Basic working FTP implementation with hardcoded responses
- **ftp-protocol-server.ts**: FtpProtocolServer - More sophisticated implementation with proper authentication and database integration
- **ftp-proxy-server.ts**: MonkFtpProxyServer - HTTP API proxy approach that translates FTP to `/ftp/*` endpoints
- **ftp-server-cli.ts**: CLI wrapper for server implementations
- **api-context.ts**: API integration utilities
- **directory-handler.ts**: Directory listing logic
- **file-handler.ts**: File operation handlers
- **ftp-auth-handler.ts**: JWT authentication handling
- **path-parser.ts**: FTP path parsing utilities
- **path-validator.ts**: Path validation logic
- **simple-ftp-server.ts**: Simplified FTP server variant
- **minimal-ftp-test.ts**: Basic testing utilities
- **ftp-cli.ts**: Command-line interface

### `original-implementations/old-tests/`
Contains the original test files:

- **ftp-custom-protocol-test.sh**: Custom protocol compliance testing
- **ftp-file-operations-test.sh**: File operation testing
- **ftp-jwt-auth-test.sh**: JWT authentication testing
- **ftp-path-integration-test.sh**: Path integration testing
- **ftp-path-parsing-test.sh**: Path parsing validation
- **ftp-ping-test.sh**: Basic connectivity testing

### `original-implementations/old-scripts/`
Contains the original development scripts:

- **ftp-dev.sh**: Development server startup script
- **ftp-start.sh**: Production server startup script

### `test-ftp-commands.md`
Documentation of FTP commands and testing procedures from the original implementation.

## Implementation Notes

The original implementations explored three different approaches:

1. **MinimalFtpServer**: Proof-of-concept with hardcoded responses - good for understanding FTP protocol basics
2. **FtpProtocolServer**: Production-oriented implementation with proper JWT auth and monk-api integration - most complete
3. **MonkFtpProxyServer**: HTTP proxy approach - interesting but incomplete data connection handling

## Useful Code References

When implementing the new clean version, these files contain useful patterns:

- **Authentication flow**: `ftp-auth-handler.ts`
- **Path parsing logic**: `path-parser.ts` and `path-validator.ts`
- **FTP protocol responses**: `ftp-protocol-server.ts`
- **API integration patterns**: `api-context.ts`
- **Command processing**: All server implementations have good command parsing examples

## Migration Notes

The new implementation should:
- Take the best authentication patterns from `ftp-auth-handler.ts`
- Improve upon the command processing in `ftp-protocol-server.ts`
- Implement proper data connections (the main gap in all original implementations)
- Use the path parsing concepts but with cleaner architecture
- Add comprehensive testing beyond the basic tests here

This archive preserves the exploration work and can be referenced during the clean implementation.