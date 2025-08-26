/**
 * MDTM command handler - File modification time query
 * 
 * Uses dedicated /ftp/modify-time endpoint for optimized timestamp queries
 */

import { BaseFtpCommand } from '../lib/base-command.js';
import type { FtpConnection } from '../lib/types.js';

export class MdtmCommand extends BaseFtpCommand {
    readonly name = 'MDTM';
    readonly needsAuth = true;
    readonly needsDataConnection = false;

    async execute(connection: FtpConnection, args: string): Promise<void> {
        if (!args) {
            this.sendResponse(connection, 501, 'MDTM command requires filename');
            return;
        }

        try {
            // Resolve file path
            const filePath = this.resolvePath(connection.currentPath, args);
            
            // Call monk-api /ftp/modify-time endpoint (dedicated lightweight endpoint)
            const response = await this.apiClient.modifyTime(filePath, connection.jwtToken!);

            if (response.success) {
                // Return the modification time in FTP format
                this.sendResponse(connection, 213, response.modified_time);
            } else {
                // Handle error responses based on error type
                if (response.error === 'file_not_found') {
                    this.sendResponse(connection, 550, 'File not found');
                } else if (response.error === 'permission_denied') {
                    this.sendResponse(connection, 550, 'Permission denied');
                } else {
                    this.sendResponse(connection, 550, 'File modification time not available');
                }
            }
            
        } catch (error) {
            console.error(`❌ MDTM error:`, error);
            
            if (error instanceof Error && error.message.includes('404')) {
                this.sendResponse(connection, 550, 'File not found');
            } else if (error instanceof Error && error.message.includes('403')) {
                this.sendResponse(connection, 550, 'Permission denied');
            } else {
                this.sendResponse(connection, 550, 'Modification time query failed');
            }
        }
    }
}