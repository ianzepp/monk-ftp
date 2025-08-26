import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { FtpServer } from '@src/lib/ftp-server.js';
import { createMockConnection } from '@spec/helpers/command-test-helper.js';
import * as net from 'net';

function createMockSocket(remoteAddress = '127.0.0.1'): net.Socket {
    const mockSocket = {
        remoteAddress,
        write: vi.fn(),
        destroy: vi.fn(),
        setEncoding: vi.fn(),
        on: vi.fn(),
        end: vi.fn()
    };
    
    return mockSocket as any;
}

describe('Rate Limiting Security', () => {
    let server: FtpServer;
    const mockConfig = {
        port: 2121,
        host: 'localhost',
        apiUrl: 'http://test-api',
        debug: false
    };

    beforeEach(() => {
        server = new FtpServer(mockConfig);
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
        server?.stop();
    });

    describe('Connection Rate Limiting', () => {
        test('should allow connections under rate limit', () => {
            const clientIp = '192.168.1.1';
            
            // Should allow first 10 connections
            for (let i = 0; i < 10; i++) {
                const result = (server as any).checkConnectionRateLimit(clientIp);
                expect(result).toBe(true);
            }
        });

        test('should block connections over rate limit', () => {
            const clientIp = '192.168.1.1';
            
            // Use up the rate limit (10 connections per minute)
            for (let i = 0; i < 10; i++) {
                const result = (server as any).checkConnectionRateLimit(clientIp);
                expect(result).toBe(true);
            }
            
            // 11th connection should be blocked
            const result = (server as any).checkConnectionRateLimit(clientIp);
            expect(result).toBe(false);
        });

        test('should reset rate limit after time window', () => {
            const clientIp = '192.168.1.1';
            
            // Use up rate limit
            for (let i = 0; i < 10; i++) {
                (server as any).checkConnectionRateLimit(clientIp);
            }
            
            // Should be blocked
            expect((server as any).checkConnectionRateLimit(clientIp)).toBe(false);
            
            // Advance time by 61 seconds (past 1-minute window)
            vi.advanceTimersByTime(61000);
            
            // Should allow connections again
            expect((server as any).checkConnectionRateLimit(clientIp)).toBe(true);
        });

        test('should track different IPs separately', () => {
            // IP 1 uses up its limit
            for (let i = 0; i < 10; i++) {
                (server as any).checkConnectionRateLimit('192.168.1.1');
            }
            expect((server as any).checkConnectionRateLimit('192.168.1.1')).toBe(false);
            
            // IP 2 should still be allowed
            expect((server as any).checkConnectionRateLimit('192.168.1.2')).toBe(true);
        });

        test('should send 421 response for rate limited connections', () => {
            const mockSocket = createMockSocket('192.168.1.1');
            
            // Mock checkRateLimit to return false
            vi.spyOn(server as any, 'checkConnectionRateLimit').mockReturnValue(false);
            
            (server as any).handleConnection(mockSocket);
            
            expect(mockSocket.write).toHaveBeenCalledWith('421 Service not available, too many connections from your IP\r\n');
            expect(mockSocket.destroy).toHaveBeenCalled();
        });

        test('should allow connections when rate limit not exceeded', () => {
            const mockSocket = createMockSocket('192.168.1.1');
            vi.spyOn(server as any, 'checkConnectionRateLimit').mockReturnValue(true);
            vi.spyOn(server as any, 'connections', 'get').mockReturnValue(new Map());
            
            // Mock connection setup
            mockSocket.on = vi.fn();
            
            (server as any).handleConnection(mockSocket);
            
            expect(mockSocket.write).not.toHaveBeenCalledWith(expect.stringContaining('421'));
            expect(mockSocket.destroy).not.toHaveBeenCalled();
        });
    });

    describe('Authentication Rate Limiting', () => {
        test('should allow auth attempts under limit', () => {
            const connection = createMockConnection({ 
                socket: createMockSocket('192.168.1.1') 
            });
            
            // Should allow first 3 auth attempts
            for (let i = 0; i < 3; i++) {
                const result = (server as any).checkAuthRateLimit(connection);
                expect(result).toBe(true);
                (server as any).recordAuthFailure(connection);
            }
        });

        test('should block auth attempts over limit', () => {
            const connection = createMockConnection({ 
                socket: createMockSocket('192.168.1.1') 
            });
            
            vi.spyOn(server as any, 'closeConnection').mockImplementation(() => {});
            vi.spyOn(server, 'sendResponse').mockImplementation(() => {});
            
            // Record 3 auth failures
            for (let i = 0; i < 3; i++) {
                (server as any).recordAuthFailure(connection);
            }
            
            // 4th attempt should be blocked
            const result = (server as any).checkAuthRateLimit(connection);
            expect(result).toBe(false);
            expect(server.sendResponse).toHaveBeenCalledWith(
                connection, 
                421, 
                'Too many authentication failures, try again later'
            );
        });

        test('should reset auth failures after time window', () => {
            const connection = createMockConnection({ 
                socket: createMockSocket('192.168.1.1') 
            });
            
            // Record max failures
            for (let i = 0; i < 3; i++) {
                (server as any).recordAuthFailure(connection);
            }
            
            vi.spyOn(server as any, 'closeConnection').mockImplementation(() => {});
            
            // Should be blocked
            expect((server as any).checkAuthRateLimit(connection)).toBe(false);
            
            // Advance time by 6 minutes (past 5-minute window)
            vi.advanceTimersByTime(360000);
            
            // Should allow auth attempts again
            expect((server as any).checkAuthRateLimit(connection)).toBe(true);
        });

        test('should track auth failures per IP separately', () => {
            const connection1 = createMockConnection({ 
                socket: createMockSocket('192.168.1.1') 
            });
            const connection2 = createMockConnection({ 
                socket: createMockSocket('192.168.1.2') 
            });
            
            // IP 1 has failures
            for (let i = 0; i < 3; i++) {
                (server as any).recordAuthFailure(connection1);
            }
            
            vi.spyOn(server as any, 'closeConnection').mockImplementation(() => {});
            
            // IP 1 should be blocked
            expect((server as any).checkAuthRateLimit(connection1)).toBe(false);
            
            // IP 2 should still be allowed
            expect((server as any).checkAuthRateLimit(connection2)).toBe(true);
        });
    });

    describe('Path Validation', () => {
        test('should allow valid monk-api paths', () => {
            const validPaths = [
                '/data/users',
                '/data/users/user-123.json',
                '/data/accounts/acc-456/email',
                '/meta/schema/users.yaml',
                '/meta',
                '/data',
                '/'
            ];

            validPaths.forEach(path => {
                const result = (server as any).validatePath(path);
                expect(result).toBe(true, `Path should be valid: ${path}`);
            });
        });

        test('should block directory traversal attempts', () => {
            const maliciousPaths = [
                '../../../etc/passwd',
                '/data/users/../../../etc/passwd', 
                '/data/../meta/../../../etc/passwd',
                '/../root/.ssh/authorized_keys',
                '/data/users/../..',
                'data/../../etc'
            ];

            maliciousPaths.forEach(path => {
                const result = (server as any).validatePath(path);
                expect(result).toBe(false, `Path should be invalid: ${path}`);
            });
        });

        test('should block paths outside allowed directories', () => {
            const blockedPaths = [
                '/etc/passwd',
                '/home/user/file.txt',
                '/root/.ssh/authorized_keys',
                '/var/log/system.log',
                '/config/secrets.json'
            ];

            blockedPaths.forEach(path => {
                const result = (server as any).validatePath(path);
                expect(result).toBe(false, `Path should be blocked: ${path}`);
            });
        });

        test('should normalize multiple slashes', () => {
            const paths = [
                { input: '/data//users///user-123.json', expected: true },
                { input: '//data/users', expected: true },
                { input: '/data/users//', expected: true }
            ];

            paths.forEach(({ input, expected }) => {
                const result = (server as any).validatePath(input);
                expect(result).toBe(expected, `Path normalization failed for: ${input}`);
            });
        });

        test('should send 553 response for invalid paths', async () => {
            const connection = createMockConnection({ authenticated: true });
            
            // Mock command handler
            const mockHandler = {
                name: 'LIST',
                needsAuth: true,
                needsDataConnection: false,
                execute: vi.fn()
            };
            
            (server as any).commandHandlers.set('LIST', mockHandler);
            vi.spyOn(server, 'sendResponse').mockImplementation(() => {});
            
            await (server as any).processCommand(connection, 'LIST ../../../etc');
            
            expect(server.sendResponse).toHaveBeenCalledWith(connection, 553, 'Invalid path');
            expect(mockHandler.execute).not.toHaveBeenCalled();
        });
    });

    describe('Memory Management and Cleanup', () => {
        test('should cleanup old connection attempt entries', () => {
            // Add some entries with different timestamps
            const now = Date.now();
            const currentBucket = Math.floor(now / 60000);
            const oldBucket = currentBucket - 2; // 2 minutes ago
            
            (server as any).connectionAttempts.set(`192.168.1.1:${oldBucket}`, 5);
            (server as any).connectionAttempts.set(`192.168.1.2:${currentBucket}`, 3);
            
            // Trigger cleanup
            (server as any).cleanupRateLimitMaps();
            
            // Old entries should be removed, current should remain
            expect((server as any).connectionAttempts.has(`192.168.1.1:${oldBucket}`)).toBe(false);
            expect((server as any).connectionAttempts.has(`192.168.1.2:${currentBucket}`)).toBe(true);
        });

        test('should cleanup old auth failure entries', () => {
            const now = Date.now();
            const currentBucket = Math.floor(now / 300000);
            const oldBucket = currentBucket - 2; // 10 minutes ago
            
            (server as any).authFailures.set(`192.168.1.1:auth:${oldBucket}`, 3);
            (server as any).authFailures.set(`192.168.1.2:auth:${currentBucket}`, 1);
            
            // Trigger cleanup  
            (server as any).cleanupRateLimitMaps();
            
            // Old entry should be removed, current should remain
            expect((server as any).authFailures.has(`192.168.1.1:auth:${oldBucket}`)).toBe(false);
            expect((server as any).authFailures.has(`192.168.1.2:auth:${currentBucket}`)).toBe(true);
        });

        test('should handle cleanup with empty maps', () => {
            // Should not throw error when maps are empty
            expect(() => (server as any).cleanupRateLimitMaps()).not.toThrow();
        });
    });

    describe('Integration with Command Processing', () => {
        test('should record auth failures correctly', () => {
            const connection = createMockConnection({ 
                socket: createMockSocket('192.168.1.1')
            });
            
            // Test the recordAuthFailure method directly
            (server as any).recordAuthFailure(connection);
            
            const now = Date.now();
            const key = `192.168.1.1:auth:${Math.floor(now / 300000)}`;
            const failures = (server as any).authFailures.get(key);
            
            expect(failures).toBe(1);
        });

        test('should not record auth failures for successful PASS command', async () => {
            const connection = createMockConnection({ 
                socket: createMockSocket('192.168.1.1'),
                username: 'root',
                authenticated: false 
            });
            
            // Mock successful PASS command handler
            const mockHandler = {
                name: 'PASS',
                needsAuth: false,
                needsDataConnection: false,
                execute: vi.fn().mockImplementation(() => {
                    connection.authenticated = true; // Simulate successful auth
                })
            };
            
            (server as any).commandHandlers.set('PASS', mockHandler);
            vi.spyOn(server as any, 'recordAuthFailure');
            
            await (server as any).processCommand(connection, 'PASS valid.jwt.token');
            
            expect((server as any).recordAuthFailure).not.toHaveBeenCalled();
        });

        test('should validate paths before executing commands', async () => {
            const connection = createMockConnection({ authenticated: true });
            
            // Mock command handler
            const mockHandler = {
                name: 'LIST',
                needsAuth: true,
                needsDataConnection: false,
                execute: vi.fn()
            };
            
            (server as any).commandHandlers.set('LIST', mockHandler);
            vi.spyOn(server, 'sendResponse').mockImplementation(() => {});
            
            // Test invalid path
            await (server as any).processCommand(connection, 'LIST ../../../etc');
            
            expect(server.sendResponse).toHaveBeenCalledWith(connection, 553, 'Invalid path');
            expect(mockHandler.execute).not.toHaveBeenCalled();
        });

        test('should allow commands with valid paths', async () => {
            const connection = createMockConnection({ authenticated: true });
            
            // Mock command handler
            const mockHandler = {
                name: 'LIST',
                needsAuth: true,
                needsDataConnection: false,
                execute: vi.fn()
            };
            
            (server as any).commandHandlers.set('LIST', mockHandler);
            
            await (server as any).processCommand(connection, 'LIST /data/users');
            
            expect(mockHandler.execute).toHaveBeenCalledWith(connection, '/data/users');
        });

        test('should skip path validation for commands without args', async () => {
            const connection = createMockConnection({ authenticated: true });
            
            // Mock command handler  
            const mockHandler = {
                name: 'PWD',
                needsAuth: true,
                needsDataConnection: false,
                execute: vi.fn()
            };
            
            (server as any).commandHandlers.set('PWD', mockHandler);
            
            // Commands without args should not trigger path validation
            await (server as any).processCommand(connection, 'PWD');
            
            expect(mockHandler.execute).toHaveBeenCalledWith(connection, '');
        });
    });

    describe('Rate Limiting Edge Cases', () => {
        test('should handle unknown IP addresses gracefully', () => {
            const result = (server as any).checkConnectionRateLimit('unknown');
            expect(result).toBe(true);
        });

        test('should handle concurrent access to rate limit maps', () => {
            const clientIp = '192.168.1.1';
            
            // Simulate concurrent access
            const promises = [];
            for (let i = 0; i < 15; i++) {
                promises.push(Promise.resolve((server as any).checkConnectionRateLimit(clientIp)));
            }
            
            // Should not throw errors
            expect(() => Promise.all(promises)).not.toThrow();
        });

        test('should maintain connection tracking state correctly', () => {
            const clientIp = '192.168.1.1';
            
            // Track connections
            for (let i = 0; i < 5; i++) {
                (server as any).checkConnectionRateLimit(clientIp);
            }
            
            const now = Date.now();
            const key = `${clientIp}:${Math.floor(now / 60000)}`;
            const count = (server as any).connectionAttempts.get(key);
            
            expect(count).toBe(5);
        });
    });

    describe('Path Validation Edge Cases', () => {
        test('should handle empty and null paths', () => {
            expect((server as any).validatePath('')).toBe(false);
            expect((server as any).validatePath(null as any)).toBe(false);
            expect((server as any).validatePath(undefined as any)).toBe(false);
        });

        test('should handle malformed paths', () => {
            const malformedPaths = [
                '\\data\\users',      // Windows-style paths
                '/data/users\x00',    // Null byte injection
                '/data/users\n',      // Newline injection
                'data/users',         // Missing leading slash
            ];

            malformedPaths.forEach(path => {
                const result = (server as any).validatePath(path);
                expect(result).toBe(false, `Malformed path should be blocked: ${JSON.stringify(path)}`);
            });
        });

        test('should allow root path variations', () => {
            const rootPaths = ['/', '/data', '/meta', '/data/', '/meta/'];
            
            rootPaths.forEach(path => {
                const result = (server as any).validatePath(path);
                expect(result).toBe(true, `Root path should be allowed: ${path}`);
            });
        });
    });
});