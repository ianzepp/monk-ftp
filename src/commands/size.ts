/**
 * SIZE command handler - File size query
 *
 * Uses dedicated /api/file/size endpoint for optimized file size queries
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

            // Call monk-api /api/file/size endpoint (dedicated lightweight endpoint)
            const response = await this.apiClient.size(filePath, connection.jwtToken!);

            if (response.success) {
                // Return the file size
                this.sendResponse(connection, 213, response.size.toString());
            } else {
                // Handle error responses based on error type
                if (response.error === 'NOT_A_FILE' || response.error_code === 'NOT_A_FILE') {
                    this.sendResponse(connection, 550, 'Not a file');
                } else if (response.error === 'RECORD_NOT_FOUND' || response.error_code === 'RECORD_NOT_FOUND') {
                    this.sendResponse(connection, 550, 'File not found');
                } else if (response.error === 'PERMISSION_DENIED' || response.error_code === 'PERMISSION_DENIED') {
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