import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { PasvCommand } from '@src/commands/pasv.js';
import { createMockConnection, getLastResponse } from '@spec/helpers/command-test-helper.js';
import * as net from 'net';

describe('PASV command', () => {
    let testServers: net.Server[] = [];

    afterEach(async () => {
        // Clean up any test servers
        await Promise.all(testServers.map(server => 
            new Promise<void>(resolve => server.close(() => resolve()))
        ));
        testServers = [];
    });

    test('should create passive data connection', async () => {
        const connection = createMockConnection();
        
        const command = new PasvCommand('http://fake-api', false);
        await command.execute(connection, '');
        
        // Should create data connection
        expect(connection.dataConnection).toBeDefined();
        expect(connection.dataConnection?.mode).toBe('passive');
        expect(connection.dataConnection?.server).toBeDefined();
        expect(connection.dataConnection?.port).toBeGreaterThan(0);
        
        // Should send PASV response with port info
        const response = getLastResponse(connection);
        expect(response.code).toBe(227);
        expect(response.message).toMatch(/Entering passive mode \(127,0,0,1,\d+,\d+\)/);
        
        // Clean up the data server
        if (connection.dataConnection?.server) {
            testServers.push(connection.dataConnection.server);
        }
    });

    test('should close existing data connection before creating new one', async () => {
        const connection = createMockConnection();
        
        // Mock existing data connection
        const mockExistingServer = { close: vi.fn() } as any;
        connection.dataConnection = {
            server: mockExistingServer,
            port: 1234,
            mode: 'passive' as const
        };
        
        const command = new PasvCommand('http://fake-api', false);
        await command.execute(connection, '');
        
        // Should close existing connection
        expect(mockExistingServer.close).toHaveBeenCalled();
        
        // Should create new connection
        expect(connection.dataConnection?.port).not.toBe(1234);
        
        // Clean up
        if (connection.dataConnection?.server) {
            testServers.push(connection.dataConnection.server);
        }
    });

    test('should calculate correct port bytes for PASV response', async () => {
        const connection = createMockConnection();
        
        const command = new PasvCommand('http://fake-api', false);
        await command.execute(connection, '');
        
        const response = getLastResponse(connection);
        expect(response.code).toBe(227);
        
        // Extract port bytes from response: (127,0,0,1,p1,p2)
        const match = response.message.match(/\(127,0,0,1,(\d+),(\d+)\)/);
        expect(match).toBeTruthy();
        
        const p1 = parseInt(match![1]);
        const p2 = parseInt(match![2]);
        const calculatedPort = p1 * 256 + p2;
        
        expect(calculatedPort).toBe(connection.dataConnection?.port);
        
        // Clean up
        if (connection.dataConnection?.server) {
            testServers.push(connection.dataConnection.server);
        }
    });

    test('should handle connection cleanup on error', async () => {
        const connection = createMockConnection();
        
        // Set up existing connection to test cleanup
        const mockExistingServer = { close: vi.fn() } as any;
        connection.dataConnection = {
            server: mockExistingServer,
            port: 9999,
            mode: 'passive' as const
        };
        
        const command = new PasvCommand('http://fake-api', false);
        await command.execute(connection, '');
        
        // Should have cleaned up existing connection
        expect(mockExistingServer.close).toHaveBeenCalled();
        
        // Should have created new connection
        expect(connection.dataConnection?.port).not.toBe(9999);
        expect(connection.dataConnection?.mode).toBe('passive');
        
        // Clean up
        if (connection.dataConnection?.server) {
            testServers.push(connection.dataConnection.server);
        }
    });

    test('should assign random available port', async () => {
        const connection1 = createMockConnection();
        const connection2 = createMockConnection();
        
        const command = new PasvCommand('http://fake-api', false);
        
        await command.execute(connection1, '');
        await command.execute(connection2, '');
        
        // Both should succeed but with different ports
        expect(connection1.dataConnection?.port).toBeGreaterThan(0);
        expect(connection2.dataConnection?.port).toBeGreaterThan(0);
        expect(connection1.dataConnection?.port).not.toBe(connection2.dataConnection?.port);
        
        // Clean up
        if (connection1.dataConnection?.server) testServers.push(connection1.dataConnection.server);
        if (connection2.dataConnection?.server) testServers.push(connection2.dataConnection.server);
    });
});