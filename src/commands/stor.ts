/**
 * STOR command handler - File upload
 * 
 * Handles file uploads to monk-api POST /ftp/store endpoint
 * Note: Requires data connection implementation for full functionality
 */

import { BaseFtpCommand } from '../lib/base-command.js';
import type { FtpConnection } from '../lib/types.js';
import * as net from 'net';

export class StorCommand extends BaseFtpCommand {
    readonly name = 'STOR';
    readonly needsAuth = true;
    readonly needsDataConnection = true; // Requires PASV/PORT first

    async execute(connection: FtpConnection, args: string): Promise<void> {
        if (!args) {
            this.sendResponse(connection, 501, 'STOR command requires filename');
            return;
        }

        try {
            // Resolve file path
            const filePath = this.resolvePath(connection.currentPath, args);
            
            // Prepare to receive file data
            this.sendResponse(connection, 150, `Opening data connection for ${args}`);
            
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
                    
                    // Store via monk-api
                    const response = await this.apiClient.store(
                        filePath,
                        content,
                        {
                            atomic: true,
                            overwrite: true,
                            validate_schema: true
                        },
                        connection.jwtToken!
                    );

                    if (response.success) {
                        this.sendResponse(connection, 226, 'Transfer complete');
                    } else {
                        this.sendResponse(connection, 550, 'Store operation failed');
                    }
                    
                } catch (error) {
                    console.error(`❌ STOR transfer error:`, error);
                    this.sendResponse(connection, 550, 'File upload failed');
                }
            });
            
            dataSocket.on('error', (error) => {
                console.error(`❌ STOR data connection error:`, error);
                this.sendResponse(connection, 426, 'Data connection error');
            });
            
        } catch (error) {
            console.error(`❌ STOR error:`, error);
            this.sendResponse(connection, 550, 'File upload failed');
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

    private async handleFileUpload(connection: FtpConnection, filePath: string, content: string): Promise<void> {
        // Parse content based on file type
        let parsedContent: any;
        
        if (filePath.endsWith('.json')) {
            try {
                parsedContent = JSON.parse(content);
            } catch {
                throw new Error('Invalid JSON content');
            }
        } else {
            // Individual field content
            parsedContent = content.trim();
        }

        // Call monk-api store endpoint
        const response = await this.apiClient.store(
            filePath,
            parsedContent,
            {
                atomic: true,
                overwrite: true,
                validate_schema: true
            },
            connection.jwtToken!
        );

        if (response.success) {
            this.sendResponse(connection, 226, 'Transfer complete');
        } else {
            this.sendResponse(connection, 550, 'Store operation failed');
        }
    }
}