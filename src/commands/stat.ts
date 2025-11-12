/**
 * STAT command handler - File/directory status information
 *
 * Provides detailed metadata via monk-api POST /api/file/stat endpoint
 * Uses FTP multi-line response format (213-xxx ... 213 End)
 */

import { BaseFtpCommand } from '../lib/base-command.js';
import type { FtpConnection } from '../lib/types.js';

export class StatCommand extends BaseFtpCommand {
    readonly name = 'STAT';
    readonly needsAuth = true;
    readonly needsDataConnection = false;

    async execute(connection: FtpConnection, args: string): Promise<void> {
        try {
            // Use current path if no args provided
            const statPath = args ? this.resolvePath(connection.currentPath, args) : connection.currentPath;

            // Call monk-api /api/file/stat endpoint
            const response = await this.apiClient.stat(statPath, connection.jwtToken!);

            if (response.success) {
                // Send multi-line FTP status response
                this.sendMultiLineStatus(connection, response);
            } else {
                this.sendResponse(connection, 550, 'Status information not available');
            }
            
        } catch (error) {
            console.error(`❌ STAT error:`, error);
            
            if (error instanceof Error && error.message.includes('404')) {
                this.sendResponse(connection, 550, 'File or directory not found');
            } else if (error instanceof Error && error.message.includes('403')) {
                this.sendResponse(connection, 550, 'Permission denied');
            } else {
                this.sendResponse(connection, 550, 'Status query failed');
            }
        }
    }

    private sendMultiLineStatus(connection: FtpConnection, statResponse: any): void {
        // FTP multi-line response format: 213-xxx (intermediate), 213 xxx (final)
        const lines: string[] = [];
        
        // Basic file information
        lines.push(`213-File status: ${statResponse.path}`);
        lines.push(`213-Type: ${statResponse.type}`);
        lines.push(`213-Size: ${statResponse.size} bytes`);
        lines.push(`213-Permissions: ${statResponse.permissions}`);
        
        // Timestamps
        if (statResponse.modified_time) {
            const formattedTime = this.formatTimestamp(statResponse.modified_time);
            lines.push(`213-Modified: ${formattedTime}`);
        }
        
        if (statResponse.created_time) {
            const formattedTime = this.formatTimestamp(statResponse.created_time);
            lines.push(`213-Created: ${formattedTime}`);
        }
        
        // Record information (if available)
        if (statResponse.record_info) {
            const info = statResponse.record_info;
            lines.push(`213-Schema: ${info.schema}`);
            
            if (info.record_id) {
                lines.push(`213-Record ID: ${info.record_id}`);
            }
            
            if (info.field_name) {
                lines.push(`213-Field: ${info.field_name}`);
            }
            
            if (info.field_count !== undefined) {
                lines.push(`213-Field Count: ${info.field_count}`);
            }
            
            if (info.soft_deleted) {
                lines.push(`213-Status: Soft deleted (recoverable)`);
            }
            
            if (info.access_permissions && info.access_permissions.length > 0) {
                lines.push(`213-Access: ${info.access_permissions.join(', ')}`);
            }
        }
        
        // Directory information (if applicable)
        if (statResponse.children_count !== undefined) {
            lines.push(`213-Children: ${statResponse.children_count} entries`);
        }
        
        if (statResponse.total_size !== undefined) {
            lines.push(`213-Total Size: ${statResponse.total_size} bytes`);
        }
        
        // Send all intermediate lines
        for (const line of lines) {
            connection.socket.write(`${line}\r\n`);
        }
        
        // Send final response
        this.sendResponse(connection, 213, 'End of status information');
    }

    private formatTimestamp(ftpTimestamp: string): string {
        try {
            // Convert "20241201120000" to "Dec 01 2024 12:00:00"
            const year = ftpTimestamp.substr(0, 4);
            const month = ftpTimestamp.substr(4, 2);
            const day = ftpTimestamp.substr(6, 2);
            const hour = ftpTimestamp.substr(8, 2);
            const minute = ftpTimestamp.substr(10, 2);
            const second = ftpTimestamp.substr(12, 2);
            
            const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                          'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            
            return `${months[parseInt(month) - 1]} ${day} ${year} ${hour}:${minute}:${second}`;
        } catch {
            return 'Unknown';
        }
    }
}