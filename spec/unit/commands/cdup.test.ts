import { describe, test, expect } from 'vitest';
import { CdupCommand } from '@src/commands/cdup.js';
import { createMockConnection, getLastResponse } from '@spec/helpers/command-test-helper.js';

describe('CDUP command', () => {
    test('should change to parent directory', async () => {
        const connection = createMockConnection({
            currentPath: '/data/users'
        });
        
        const command = new CdupCommand('http://fake-api', false);
        await command.execute(connection, '');
        
        expect(connection.currentPath).toBe('/data');
        
        const response = getLastResponse(connection);
        expect(response.code).toBe(250);
        expect(response.message).toBe('Directory changed to /data');
    });

    test('should handle multiple levels up', async () => {
        const connection = createMockConnection({
            currentPath: '/data/users/user-123/fields'
        });
        
        const command = new CdupCommand('http://fake-api', false);
        await command.execute(connection, '');
        
        expect(connection.currentPath).toBe('/data/users/user-123');
        
        const response = getLastResponse(connection);
        expect(response.code).toBe(250);
        expect(response.message).toBe('Directory changed to /data/users/user-123');
    });

    test('should handle root directory edge case', async () => {
        const connection = createMockConnection({
            currentPath: '/'
        });
        
        const command = new CdupCommand('http://fake-api', false);
        await command.execute(connection, '');
        
        expect(connection.currentPath).toBe('/'); // Should not change
        
        const response = getLastResponse(connection);
        expect(response.code).toBe(550);
        expect(response.message).toBe('Already at root directory');
    });

    test('should handle single level directory', async () => {
        const connection = createMockConnection({
            currentPath: '/data'
        });
        
        const command = new CdupCommand('http://fake-api', false);
        await command.execute(connection, '');
        
        expect(connection.currentPath).toBe('/');
        
        const response = getLastResponse(connection);
        expect(response.code).toBe(250);
        expect(response.message).toBe('Directory changed to /');
    });
});