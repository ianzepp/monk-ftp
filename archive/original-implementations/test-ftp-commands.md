# FTP Command Implementation Status

## Critical Commands (must work for basic FTP functionality)

### Authentication
- [ ] USER - Set username  
- [ ] PASS - Authenticate with password
- [ ] QUIT - Close connection

### Navigation  
- [ ] PWD - Print working directory
- [ ] CWD - Change working directory
- [ ] CDUP - Change to parent directory

### Data Connections
- [ ] PASV - Passive mode (server creates data port)
- [ ] EPSV - Extended passive mode  
- [ ] PORT - Active mode (client creates data port)
- [ ] EPRT - Extended active mode

### Directory Operations
- [ ] LIST - Directory listing (detailed)
- [ ] NLST - Name listing (simple)

### File Operations  
- [ ] RETR - Download file
- [ ] STOR - Upload file
- [ ] DELE - Delete file
- [ ] SIZE - Get file size
- [ ] MDTM - Get modification time

### System Commands
- [ ] SYST - System type
- [ ] TYPE - Transfer type (ASCII/Binary)
- [ ] FEAT - Feature list
- [ ] NOOP - No operation
- [ ] STAT - Status information

## Test Results

### Server: minimal-ftp-test.ts (port TBD)
- [ ] USER: 
- [ ] PASS:
- [ ] PWD:
- [ ] CWD:
- [ ] PASV:
- [ ] LIST:

## Testing Method

1. Start clean server on new port
2. Test each command with netcat (raw protocol)
3. Test each command with lftp
4. Document exact results and any failures
5. Fix failures before moving to next command

## Current Focus

Starting with authentication commands first.