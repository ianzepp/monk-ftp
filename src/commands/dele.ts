/**
 * DELE command handler - File deletion
 *
 * Thin wrapper around monk-api POST /api/file/delete endpoint
 */

import { BaseFtpCommand } from '../lib/base-command.js';
import type { FtpConnection } from '../lib/types.js';

export class DeleCommand extends BaseFtpCommand {
    readonly name = 'DELE';
    readonly needsAuth = true;
    readonly needsDataConnection = false; // No data connection needed

    async execute(connection: FtpConnection, args: string): Promise<void> {
        if (!args) {
            this.sendResponse(connection, 501, 'DELE command requires filename');
            return;
        }

        try {
            // Resolve file path
            const filePath = this.resolvePath(connection.currentPath, args);

            // Call monk-api /api/file/delete endpoint
            const response = await this.apiClient.delete(
                filePath,
                {
                    permanent: false,  // Soft delete by default
                    atomic: true,
                    force: false
                },
                connection.jwtToken!
            );

            if (response.success) {
                this.sendResponse(connection, 250, `File ${args} deleted`);
            } else {
                this.sendResponse(connection, 550, 'Delete operation failed');
            }
            
        } catch (error) {
            console.error(`❌ DELE error:`, error);
            
            if (error instanceof Error && error.message.includes('404')) {
                this.sendResponse(connection, 550, 'File not found');
            } else if (error instanceof Error && error.message.includes('403')) {
                this.sendResponse(connection, 550, 'Permission denied');
            } else {
                this.sendResponse(connection, 550, 'Delete operation failed');
            }
        }
    }
}