import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { FakeMonkApi } from '@spec/helpers/fake-monk-api.js';
import { FtpServer } from '@lib/ftp-server.js';
import * as net from 'net';

describe('FTP Server Integration with Fake API', () => {
    let fakeApi: FakeMonkApi;
    let ftpServer: FtpServer;
    let ftpPort: number;

    beforeAll(async () => {
        // Start fake monk-api server
        fakeApi = new FakeMonkApi({
            port: 9003,
            host: 'localhost', 
            debug: false
        });
        await fakeApi.start();

        // Start FTP server pointing to fake API
        ftpServer = new FtpServer({
            port: 0, // Random port
            host: 'localhost',
            apiUrl: 'http://localhost:9003',
            debug: false
        });
        await ftpServer.start();
        
        // Get the actual port assigned
        ftpPort = (ftpServer as any).server.address().port;
    });

    afterAll(async () => {
        if (ftpServer) {
            await ftpServer.stop();
        }
        if (fakeApi) {
            await fakeApi.stop();
        }
    });

    test('should handle basic FTP connection and authentication', async () => {
        return new Promise<void>((resolve, reject) => {
            const client = new net.Socket();
            const responses: string[] = [];
            
            client.connect(ftpPort, 'localhost', () => {
                // Send FTP commands
                client.write('USER root\r\n');
                client.write('PASS fake.jwt.token\r\n');
                client.write('PWD\r\n');
                client.write('QUIT\r\n');
            });
            
            client.on('data', (data) => {
                const response = data.toString();
                responses.push(response);
                
                // Check if we got all expected responses
                if (response.includes('221 Goodbye')) {
                    client.end();
                }
            });
            
            client.on('close', () => {
                try {
                    const fullResponse = responses.join('');
                    
                    // Verify FTP response sequence
                    expect(fullResponse).toContain('220'); // Welcome
                    expect(fullResponse).toContain('331'); // Need password  
                    expect(fullResponse).toContain('230'); // Logged in
                    expect(fullResponse).toContain('257'); // PWD response
                    expect(fullResponse).toContain('221'); // Goodbye
                    
                    resolve();
                } catch (error) {
                    reject(error);
                }
            });
            
            client.on('error', reject);
            
            // Timeout safety
            setTimeout(() => {
                client.destroy();
                reject(new Error('Test timeout'));
            }, 5000);
        });
    }, 10000);

    test('should handle LIST command with fake API integration', async () => {
        return new Promise<void>((resolve, reject) => {
            const client = new net.Socket();
            const responses: string[] = [];
            
            client.connect(ftpPort, 'localhost', () => {
                // Authentication first
                client.write('USER root\r\n');
                client.write('PASS fake.jwt.token\r\n');
                // Then list directory
                client.write('LIST /data/users/\r\n');
                client.write('QUIT\r\n');
            });
            
            client.on('data', (data) => {
                const response = data.toString();
                responses.push(response);
                
                if (response.includes('221 Goodbye')) {
                    client.end();
                }
            });
            
            client.on('close', () => {
                try {
                    const fullResponse = responses.join('');
                    
                    // Verify authentication worked
                    expect(fullResponse).toContain('230'); // Logged in
                    
                    // Verify LIST command worked
                    expect(fullResponse).toContain('150'); // Opening data connection
                    expect(fullResponse).toContain('226'); // Directory listing completed
                    
                    // Should contain directory entries from fake API
                    expect(fullResponse).toContain('user-123');
                    expect(fullResponse).toContain('user-456');
                    
                    resolve();
                } catch (error) {
                    reject(error);
                }
            });
            
            client.on('error', reject);
            
            // Timeout safety
            setTimeout(() => {
                client.destroy();
                reject(new Error('Test timeout'));
            }, 5000);
        });
    }, 10000);
});