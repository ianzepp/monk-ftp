import { describe, test, expect } from 'vitest';
import { PwdCommand } from '@src/commands/pwd.js';
import { createMockConnection, getLastResponse } from '@spec/helpers/command-test-helper.js';

describe('PWD command', () => {
    test('should return current working directory', async () => {
        const connection = createMockConnection({
            currentPath: '/data/users'
        });
        
        const command = new PwdCommand('http://fake-api', false);
        await command.execute(connection, '');
        
        const response = getLastResponse(connection);
        expect(response.code).toBe(257);
        expect(response.message).toBe('"/data/users" is current directory');
    });

    test('should handle root directory', async () => {
        const connection = createMockConnection({
            currentPath: '/'
        });
        
        const command = new PwdCommand('http://fake-api', false);
        await command.execute(connection, '');
        
        const response = getLastResponse(connection);
        expect(response.code).toBe(257);
        expect(response.message).toBe('"/" is current directory');
    });

    test('should handle deep paths', async () => {
        const connection = createMockConnection({
            currentPath: '/data/users/user-123/fields'
        });
        
        const command = new PwdCommand('http://fake-api', false);
        await command.execute(connection, '');
        
        const response = getLastResponse(connection);
        expect(response.code).toBe(257);
        expect(response.message).toBe('"/data/users/user-123/fields" is current directory');
    });

    test('should ignore any arguments', async () => {
        const connection = createMockConnection({
            currentPath: '/test/path'
        });
        
        const command = new PwdCommand('http://fake-api', false);
        await command.execute(connection, 'ignored arguments');
        
        const response = getLastResponse(connection);
        expect(response.code).toBe(257);
        expect(response.message).toBe('"/test/path" is current directory');
    });
});