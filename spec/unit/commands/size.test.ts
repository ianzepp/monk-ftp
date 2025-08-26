import { describe, test, expect } from 'vitest';
import { SizeCommand } from '@src/commands/size.js';
import { createMockConnection, getLastResponse, createTestCommand } from '@spec/helpers/command-test-helper.js';

describe('SIZE command', () => {
    test('should return file size from dedicated size endpoint', async () => {
        const { command } = createTestCommand(SizeCommand, {
            size: {
                success: true,
                size: 290
            }
        });
        
        const connection = createMockConnection({
            currentPath: '/data/users'
        });
        
        await command.execute(connection, 'user-123.json');
        
        const response = getLastResponse(connection);
        expect(response.code).toBe(213);
        expect(response.message).toBe('290');
    });

    test('should handle relative path resolution', async () => {
        const { command, mockApi } = createTestCommand(SizeCommand, {
            size: {
                success: true,
                size: 17
            }
        });
        
        const connection = createMockConnection({
            currentPath: '/data/users/user-123'
        });
        
        await command.execute(connection, 'email');
        
        // Verify correct path was sent to API
        expect(mockApi.callLog).toHaveLength(1);
        expect(mockApi.callLog[0].payload.path).toBe('/data/users/user-123/email');
        
        const response = getLastResponse(connection);
        expect(response.code).toBe(213);
        expect(response.message).toBe('17');
    });

    test('should handle absolute paths', async () => {
        const { command, mockApi } = createTestCommand(SizeCommand, {
            size: {
                success: true,
                size: 1024
            }
        });
        
        const connection = createMockConnection({
            currentPath: '/data/users'
        });
        
        await command.execute(connection, '/data/accounts/acc-123.json');
        
        expect(mockApi.callLog[0].payload.path).toBe('/data/accounts/acc-123.json');
        
        const response = getLastResponse(connection);
        expect(response.code).toBe(213);
        expect(response.message).toBe('1024');
    });

    test('should require filename argument', async () => {
        const { command } = createTestCommand(SizeCommand);
        const connection = createMockConnection();
        
        await command.execute(connection, '');
        
        const response = getLastResponse(connection);
        expect(response.code).toBe(501);
        expect(response.message).toBe('SIZE command requires filename');
    });

    test('should handle file not found error', async () => {
        const { command } = createTestCommand(SizeCommand);
        
        // Mock API client to throw 404 error
        (command as any).apiClient = {
            size: async () => {
                throw new Error('404 Not found');
            }
        };
        
        const connection = createMockConnection();
        await command.execute(connection, 'nonexistent.json');
        
        const response = getLastResponse(connection);
        expect(response.code).toBe(550);
        expect(response.message).toBe('File not found');
    });

    test('should handle API failure', async () => {
        const { command } = createTestCommand(SizeCommand, {
            size: {
                success: false
            }
        });
        
        const connection = createMockConnection();
        await command.execute(connection, 'test.json');
        
        const response = getLastResponse(connection);
        expect(response.code).toBe(550);
        expect(response.message).toBe('File size not available');
    });
});