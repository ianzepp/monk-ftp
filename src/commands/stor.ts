/**
 * STOR command handler - File upload
 * 
 * Handles file uploads to monk-api POST /ftp/store endpoint
 * Note: Requires data connection implementation for full functionality
 */

import { BaseFtpCommand } from '../lib/base-command.js';
import type { FtpConnection } from '../lib/types.js';

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
            
            // TODO: Implement data connection handling
            // For now, return not implemented since we need PASV/PORT first
            this.sendResponse(connection, 502, 'STOR requires data connection implementation');
            
            // Future implementation:
            // 1. Prepare to receive data over data connection
            // 2. Collect file content from client
            // 3. Call monk-api /ftp/store endpoint
            // 4. Send success/failure response
            
        } catch (error) {
            console.error(`❌ STOR error:`, error);
            this.sendResponse(connection, 550, 'File upload failed');
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