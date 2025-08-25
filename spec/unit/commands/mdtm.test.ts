import { describe, test, expect } from 'vitest';
import { MdtmCommand } from '@src/commands/mdtm.js';
import { createMockConnection, getLastResponse, createTestCommand } from '@spec/helpers/command-test-helper.js';

describe('MDTM command', () => {
    test('should return modification time from STAT response', async () => {
        const { command } = createTestCommand(MdtmCommand, {
            stat: {
                success: true,
                modified_time: '20250825151723',
                type: 'file'
            }
        });
        
        const connection = createMockConnection({
            currentPath: '/data/users'
        });
        
        await command.execute(connection, 'user-123.json');
        
        const response = getLastResponse(connection);
        expect(response.code).toBe(213);
        expect(response.message).toBe('20250825151723');
    });

    test('should handle field-level file timestamps', async () => {
        const { command, mockApi } = createTestCommand(MdtmCommand, {
            stat: {
                success: true,
                modified_time: '20250825120000',
                type: 'file'
            }
        });
        
        const connection = createMockConnection({
            currentPath: '/data/users/user-123'
        });
        
        await command.execute(connection, 'email');
        
        // Verify correct path resolution
        expect(mockApi.callLog[0].payload.path).toBe('/data/users/user-123/email');
        
        const response = getLastResponse(connection);
        expect(response.code).toBe(213);
        expect(response.message).toBe('20250825120000');
    });

    test('should handle absolute paths', async () => {
        const { command, mockApi } = createTestCommand(MdtmCommand, {
            stat: {
                success: true,
                modified_time: '20250101000000'
            }
        });
        
        const connection = createMockConnection();
        
        await command.execute(connection, '/data/accounts/acc-456.json');
        
        expect(mockApi.callLog[0].payload.path).toBe('/data/accounts/acc-456.json');
        
        const response = getLastResponse(connection);
        expect(response.code).toBe(213);
        expect(response.message).toBe('20250101000000');
    });

    test('should require filename argument', async () => {
        const { command } = createTestCommand(MdtmCommand);
        const connection = createMockConnection();
        
        await command.execute(connection, '');
        
        const response = getLastResponse(connection);
        expect(response.code).toBe(501);
        expect(response.message).toBe('MDTM command requires filename');
    });

    test('should handle file not found error', async () => {
        const { command } = createTestCommand(MdtmCommand);
        
        // Mock API client to throw 404 error
        (command as any).apiClient = {
            stat: async () => {
                throw new Error('404 File not found');
            }
        };
        
        const connection = createMockConnection();
        await command.execute(connection, 'missing.json');
        
        const response = getLastResponse(connection);
        expect(response.code).toBe(550);
        expect(response.message).toBe('File not found');
    });

    test('should handle permission denied error', async () => {
        const { command } = createTestCommand(MdtmCommand);
        
        (command as any).apiClient = {
            stat: async () => {
                throw new Error('403 Permission denied');
            }
        };
        
        const connection = createMockConnection();
        await command.execute(connection, 'restricted.json');
        
        const response = getLastResponse(connection);
        expect(response.code).toBe(550);
        expect(response.message).toBe('Permission denied');
    });
});