/**
 * APPE command handler - Append to file
 *
 * Appends data to an existing file via monk-api POST /api/file/store endpoint (with append_mode)
 */

import { BaseFtpCommand } from '../lib/base-command.js';
import type { FtpConnection } from '../lib/types.js';
import * as net from 'net';

export class AppeCommand extends BaseFtpCommand {
    readonly name = 'APPE';
    readonly needsAuth = true;
    readonly needsDataConnection = true; // Requires PASV/PORT first

    async execute(connection: FtpConnection, args: string): Promise<void> {
        if (!args) {
            this.sendResponse(connection, 501, 'APPE command requires filename');
            return;
        }

        try {
            // Resolve file path
            const filePath = this.resolvePath(connection.currentPath, args);
            
            // Prepare to receive file data for append
            this.sendResponse(connection, 150, `Opening data connection for ${args} (append mode)`);
            
            // Wait for client to connect to data port
            const dataSocket = await this.waitForDataConnection(connection);
            
            // Collect file content from client
            let fileContent = '';
            
            dataSocket.on('data', (chunk: Buffer) => {
                fileContent += chunk.toString('utf8');
            });
            
            dataSocket.on('end', async () => {
                try {
                    // Parse content based on file type
                    const content = await this.parseFileContent(filePath, fileContent);
                    
                    // Append via monk-api (uses store with append_mode internally)
                    const response = await this.apiClient.append(
                        filePath,
                        content,
                        {
                            atomic: true,
                            validate_schema: true
                        },
                        connection.jwtToken!
                    );

                    if (response.success) {
                        this.sendResponse(connection, 226, 'Append complete');
                    } else {
                        this.sendResponse(connection, 550, 'Append operation failed');
                    }
                    
                } catch (error) {
                    console.error(`❌ APPE transfer error:`, error);
                    this.sendResponse(connection, 550, 'File append failed');
                }
            });
            
            dataSocket.on('error', (error) => {
                console.error(`❌ APPE data connection error:`, error);
                this.sendResponse(connection, 426, 'Data connection error');
            });
            
        } catch (error) {
            console.error(`❌ APPE error:`, error);
            this.sendResponse(connection, 550, 'File append failed');
        }
    }

    private async waitForDataConnection(connection: FtpConnection, timeout = 5000): Promise<net.Socket> {
        return new Promise((resolve, reject) => {
            if (connection.dataConnection?.socket) {
                // Data connection already established
                resolve(connection.dataConnection.socket);
                return;
            }
            
            if (!connection.dataConnection?.server) {
                reject(new Error('No data server available'));
                return;
            }
            
            const timer = setTimeout(() => {
                reject(new Error('Data connection timeout'));
            }, timeout);
            
            // Wait for client to connect
            connection.dataConnection.server.once('connection', (socket) => {
                clearTimeout(timer);
                connection.dataConnection!.socket = socket;
                resolve(socket);
            });
        });
    }

    private async parseFileContent(filePath: string, content: string): Promise<any> {
        if (filePath.endsWith('.json')) {
            try {
                return JSON.parse(content);
            } catch (error) {
                throw new Error('Invalid JSON content');
            }
        } else {
            // Individual field content
            return content.trim();
        }
    }
}