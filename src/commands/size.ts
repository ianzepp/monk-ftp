/**
 * SIZE command handler - File size query
 * 
 * Uses dedicated /ftp/size endpoint for optimized file size queries
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
            
            // Call monk-api /ftp/size endpoint (dedicated lightweight endpoint)
            const response = await this.apiClient.size(filePath, connection.jwtToken!);

            if (response.success) {
                // Return the file size
                this.sendResponse(connection, 213, response.size.toString());
            } else {
                // Handle error responses based on error type
                if (response.error === 'not_a_file') {
                    this.sendResponse(connection, 550, 'Not a file');
                } else if (response.error === 'file_not_found') {
                    this.sendResponse(connection, 550, 'File not found');
                } else if (response.error === 'permission_denied') {
                    this.sendResponse(connection, 550, 'Permission denied');
                } else {
                    this.sendResponse(connection, 550, 'File size not available');
                }
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