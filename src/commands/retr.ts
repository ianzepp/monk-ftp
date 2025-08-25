/**
 * RETR command handler - File download
 * 
 * Downloads files from monk-api POST /ftp/retrieve endpoint
 * Note: Requires data connection implementation for full functionality
 */

import { BaseFtpCommand } from '../lib/base-command.js';
import type { FtpConnection } from '../lib/types.js';

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
            
            // TODO: Implement data connection handling
            // For now, return not implemented since we need PASV/PORT first
            this.sendResponse(connection, 502, 'RETR requires data connection implementation');
            
            // Future implementation:
            // 1. Call monk-api /ftp/retrieve endpoint
            // 2. Send file content over data connection
            // 3. Send completion response
            
        } catch (error) {
            console.error(`❌ RETR error:`, error);
            this.sendResponse(connection, 550, 'File download failed');
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