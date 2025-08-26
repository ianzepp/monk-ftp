import { describe, test, expect } from 'vitest';
import { ClntCommand } from '@src/commands/clnt.js';
import { createMockConnection, getLastResponse } from '@spec/helpers/command-test-helper.js';

describe('CLNT command', () => {
    test('should accept client identification and respond with success', async () => {
        const connection = createMockConnection();
        
        const command = new ClntCommand('http://fake-api', false);
        await command.execute(connection, 'NcFTP 3.2.6 linux-x86_64-glibc2.35');
        
        const response = getLastResponse(connection);
        expect(response.code).toBe(200);
        expect(response.message).toBe('OK');
        expect(connection.clientInfo).toBe('NcFTP 3.2.6 linux-x86_64-glibc2.35');
    });

    test('should handle empty client information', async () => {
        const connection = createMockConnection();
        
        const command = new ClntCommand('http://fake-api', false);
        await command.execute(connection, '');
        
        const response = getLastResponse(connection);
        expect(response.code).toBe(200);
        expect(response.message).toBe('OK');
        expect(connection.clientInfo).toBeUndefined();
    });

    test('should trim whitespace from client info', async () => {
        const connection = createMockConnection();
        
        const command = new ClntCommand('http://fake-api', false);
        await command.execute(connection, '  FileZilla 3.60.2  ');
        
        const response = getLastResponse(connection);
        expect(response.code).toBe(200);
        expect(response.message).toBe('OK');
        expect(connection.clientInfo).toBe('FileZilla 3.60.2');
    });

    test('should work without authentication', async () => {
        const connection = createMockConnection({
            authenticated: false
        });
        
        const command = new ClntCommand('http://fake-api', false);
        await command.execute(connection, 'Test Client 1.0');
        
        const response = getLastResponse(connection);
        expect(response.code).toBe(200);
        expect(response.message).toBe('OK');
        expect(connection.clientInfo).toBe('Test Client 1.0');
    });

    test('should handle various client identification formats', async () => {
        const testCases = [
            'lftp/4.8.4',
            'WinSCP/5.19.6',
            'curl/7.68.0',
            'Python ftplib',
            'Custom-FTP-Client/1.0.0'
        ];

        for (const clientInfo of testCases) {
            const connection = createMockConnection();
            const command = new ClntCommand('http://fake-api', false);
            
            await command.execute(connection, clientInfo);
            
            const response = getLastResponse(connection);
            expect(response.code).toBe(200);
            expect(response.message).toBe('OK');
            expect(connection.clientInfo).toBe(clientInfo);
        }
    });
});