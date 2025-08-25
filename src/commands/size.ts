/**
 * SIZE command handler - File size query
 * 
 * Thin wrapper around STAT command to extract just the file size
 */

import { BaseFtpCommand } from '../lib/base-command.js';
import type { FtpConnection } from '../lib/types.js';

export class SizeCommand extends BaseFtpCommand {
    readonly name = 'SIZE';
    readonly needsAuth = true;
    readonly needsDataConnection = false;

    async execute(connection: FtpConnection, args: string): Promise<void> {
        if (!args) {
            this.sendResponse(connection, 501, 'SIZE command requires filename');
            return;
        }

        try {
            // Resolve file path
            const filePath = this.resolvePath(connection.currentPath, args);
            
            // Call monk-api /ftp/stat endpoint (reuse STAT logic)
            const response = await this.apiClient.stat(filePath, connection.jwtToken!);

            if (response.success) {
                // Return just the size
                this.sendResponse(connection, 213, response.size.toString());
            } else {
                this.sendResponse(connection, 550, 'File size not available');
            }
            
        } catch (error) {
            console.error(`❌ SIZE error:`, error);
            
            if (error instanceof Error && error.message.includes('404')) {
                this.sendResponse(connection, 550, 'File not found');
            } else if (error instanceof Error && error.message.includes('403')) {
                this.sendResponse(connection, 550, 'Permission denied');
            } else {
                this.sendResponse(connection, 550, 'Size query failed');
            }
        }
    }
}