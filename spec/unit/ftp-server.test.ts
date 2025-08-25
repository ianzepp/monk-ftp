import { describe, test, expect } from 'vitest';
import { FtpServer } from '@lib/ftp-server.js';

describe('FTP Server', () => {
    test('should create server with configuration', () => {
        const config = {
            port: 2121,
            host: 'localhost',
            apiUrl: 'http://localhost:9001',
            debug: false
        };

        const server = new FtpServer(config);
        expect(server).toBeDefined();
        
        const status = server.getStatus();
        expect(status.running).toBe(false);
        expect(status.connections).toBe(0);
        expect(status.commands).toBe(0); // Commands loaded on start()
    });

    test('should start and stop server', async () => {
        const config = {
            port: 0, // Use random port to avoid conflicts
            host: 'localhost',
            apiUrl: 'http://localhost:9001',
            debug: false
        };

        const server = new FtpServer(config);
        
        // Start server
        await server.start();
        
        const status = server.getStatus();
        expect(status.running).toBe(true);
        expect(status.commands).toBe(8); // USER, PASS, PWD, CWD, LIST, STOR, RETR, DELE
        
        // Stop server
        await server.stop();
        
        const finalStatus = server.getStatus();
        expect(finalStatus.running).toBe(false);
        expect(finalStatus.connections).toBe(0);
    });
});