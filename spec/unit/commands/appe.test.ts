import { describe, test, expect, vi } from 'vitest';
import { AppeCommand } from '@src/commands/appe.js';
import { createMockConnection, getLastResponse, createTestCommand } from '@spec/helpers/command-test-helper.js';

describe('APPE command', () => {
    test('should require filename argument', async () => {
        const { command } = createTestCommand(AppeCommand);
        const connection = createMockConnection();
        
        await command.execute(connection, '');
        
        const response = getLastResponse(connection);
        expect(response.code).toBe(501);
        expect(response.message).toBe('APPE command requires filename');
    });

    test('should require authentication', async () => {
        const command = new AppeCommand('http://fake-api', false);
        expect(command.needsAuth).toBe(true);
    });

    test('should require data connection', async () => {
        const command = new AppeCommand('http://fake-api', false);
        expect(command.needsDataConnection).toBe(true);
    });

    test('should handle relative path resolution', async () => {
        const { command, mockApi } = createTestCommand(AppeCommand, {
            append: {
                success: true,
                operation: 'append',
                result: { appended: true }
            }
        });
        
        // Mock data connection setup
        const mockDataSocket = {
            on: vi.fn((event, callback) => {
                if (event === 'end') {
                    // Simulate immediate end event for testing
                    setTimeout(() => callback(), 0);
                }
            }),
            end: vi.fn()
        };

        const connection = createMockConnection({
            currentPath: '/data/users/user-123',
            dataConnection: {
                socket: mockDataSocket,
                port: 12345,
                mode: 'passive'
            }
        });
        
        await command.execute(connection, 'notes.txt');
        
        const response = getLastResponse(connection);
        expect(response.code).toBe(150);
        expect(response.message).toBe('Opening data connection for notes.txt (append mode)');
    });

    test('should handle absolute paths', async () => {
        const { command, mockApi } = createTestCommand(AppeCommand, {
            append: {
                success: true,
                operation: 'append'
            }
        });

        const mockDataSocket = {
            on: vi.fn((event, callback) => {
                if (event === 'end') {
                    setTimeout(() => callback(), 0);
                }
            }),
            end: vi.fn()
        };

        const connection = createMockConnection({
            currentPath: '/data/users',
            dataConnection: {
                socket: mockDataSocket,
                port: 12345,
                mode: 'passive'
            }
        });
        
        await command.execute(connection, '/data/accounts/acc-123/description');
        
        const response = getLastResponse(connection);
        expect(response.code).toBe(150);
        expect(response.message).toBe('Opening data connection for /data/accounts/acc-123/description (append mode)');
    });

    test('should handle missing data connection', async () => {
        const { command } = createTestCommand(AppeCommand);
        
        const connection = createMockConnection({
            dataConnection: undefined
        });
        
        await command.execute(connection, 'test.txt');
        
        const response = getLastResponse(connection);
        expect(response.code).toBe(550);
        expect(response.message).toBe('File append failed');
    });

    test('should parse JSON content correctly', async () => {
        const command = new AppeCommand('http://fake-api', false);
        
        // Test private parseFileContent method indirectly by checking content parsing
        const result = await (command as any).parseFileContent('/test.json', '{"key": "value"}');
        expect(result).toEqual({ key: 'value' });
    });

    test('should parse field content correctly', async () => {
        const command = new AppeCommand('http://fake-api', false);
        
        const result = await (command as any).parseFileContent('/test/field', '  some text  ');
        expect(result).toBe('some text');
    });

    test('should handle invalid JSON content', async () => {
        const command = new AppeCommand('http://fake-api', false);
        
        await expect(
            (command as any).parseFileContent('/test.json', 'invalid json')
        ).rejects.toThrow('Invalid JSON content');
    });
});