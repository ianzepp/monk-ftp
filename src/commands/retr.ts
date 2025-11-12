/**
 * RETR command handler - File download
 *
 * Downloads files from monk-api POST /api/file/retrieve endpoint
 * Note: Requires data connection implementation for full functionality
 */

import { BaseFtpCommand } from '../lib/base-command.js';
import type { FtpConnection } from '../lib/types.js';
import * as net from 'net';

export class RetrCommand extends BaseFtpCommand {
    readonly name = 'RETR';
    readonly needsAuth = true;
    readonly needsDataConnection = true; // Requires PASV/PORT first

    async execute(connection: FtpConnection, args: string): Promise<void> {
        if (!args) {
            this.sendResponse(connection, 501, 'RETR command requires filename');
            return;
        }

        try {
            // Resolve file path
            const filePath = this.resolvePath(connection.currentPath, args);
            
            // Get file content from monk-api
            const response = await this.apiClient.retrieve(
                filePath,
                {
                    binary_mode: false,
                    start_offset: 0
                },
                connection.jwtToken!
            );

            if (!response.success) {
                this.sendResponse(connection, 550, 'File not found');
                return;
            }

            // Prepare to send file data
            this.sendResponse(connection, 150, `Opening data connection for ${args}`);
            
            // Wait for client to connect to data port
            const dataSocket = await this.waitForDataConnection(connection);
            
            // Format content for transfer
            const content = this.formatFileContent(response.content);
            
            // Send file content over data connection
            dataSocket.write(content);
            dataSocket.end();
            
            // Send completion status
            this.sendResponse(connection, 226, 'Transfer complete');
            
        } catch (error) {
            console.error(`❌ RETR error:`, error);
            
            if (error instanceof Error && error.message.includes('404')) {
                this.sendResponse(connection, 550, 'File not found');
            } else if (error instanceof Error && error.message.includes('timeout')) {
                this.sendResponse(connection, 425, 'Data connection timeout');
            } else {
                this.sendResponse(connection, 550, 'File download failed');
            }
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

    private formatFileContent(content: any): string {
        if (typeof content === 'object') {
            return JSON.stringify(content, null, 2);
        } else {
            return String(content);
        }
    }

    private async handleFileDownload(connection: FtpConnection, filePath: string): Promise<void> {
        // Call monk-api retrieve endpoint
        const response = await this.apiClient.retrieve(
            filePath,
            {
                binary_mode: false,
                start_offset: 0
            },
            connection.jwtToken!
        );

        if (response.success) {
            // Format content for transfer
            let content: string;
            
            if (typeof response.content === 'object') {
                content = JSON.stringify(response.content, null, 2);
            } else {
                content = String(response.content);
            }

            this.sendResponse(connection, 150, `Opening data connection for ${filePath}`);
            
            // TODO: Send content over data connection
            // connection.dataConnection.socket.write(content);
            // connection.dataConnection.socket.end();
            
            this.sendResponse(connection, 226, 'Transfer complete');
            
        } else {
            this.sendResponse(connection, 550, 'File not found');
        }
    }
}