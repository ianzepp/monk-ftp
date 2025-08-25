/**
 * LIST command handler - Directory listing
 * 
 * Thin wrapper around monk-api POST /ftp/list endpoint
 */

import { BaseFtpCommand } from '../lib/base-command.js';
import type { FtpConnection } from '../lib/types.js';

export class ListCommand extends BaseFtpCommand {
    readonly name = 'LIST';
    readonly needsAuth = true;
    readonly needsDataConnection = false; // Will create data connection if needed

    async execute(connection: FtpConnection, args: string): Promise<void> {
        try {
            // Determine path to list
            const listPath = args ? this.resolvePath(connection.currentPath, args) : connection.currentPath;
            
            // Call monk-api /ftp/list endpoint
            const response = await this.apiClient.list(
                listPath,
                {
                    show_hidden: false,
                    long_format: true,
                    recursive: false
                },
                connection.jwtToken!
            );

            if (response.success && response.entries) {
                // Format entries as FTP directory listing
                const listing = this.formatFtpListing(response.entries);
                
                // Send listing directly over control connection (simplified for now)
                this.sendResponse(connection, 150, 'Opening data connection');
                connection.socket.write(listing + '\r\n');
                this.sendResponse(connection, 226, `Directory listing completed (${response.entries.length} entries)`);
                
            } else {
                this.sendResponse(connection, 550, 'Directory listing failed');
            }
            
        } catch (error) {
            console.error(`❌ LIST error:`, error);
            this.sendResponse(connection, 550, 'Directory listing failed');
        }
    }

    private formatFtpListing(entries: any[]): string {
        return entries.map(entry => {
            // Convert to standard FTP listing format
            const type = entry.ftp_type === 'd' ? 'd' : '-';
            const permissions = entry.ftp_permissions || 'rwx';
            const size = entry.ftp_size.toString().padStart(8);
            const date = this.formatFtpDate(entry.ftp_modified);
            const name = entry.name;
            
            return `${type}${permissions} 1 monk monk ${size} ${date} ${name}`;
        }).join('\r\n');
    }

    private formatFtpDate(timestamp: string): string {
        try {
            // Convert "20241201120000" to "Dec 01 12:00"
            const year = timestamp.substr(0, 4);
            const month = timestamp.substr(4, 2);
            const day = timestamp.substr(6, 2);
            const hour = timestamp.substr(8, 2);
            const minute = timestamp.substr(10, 2);
            
            const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                          'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            
            return `${months[parseInt(month) - 1]} ${day} ${hour}:${minute}`;
        } catch {
            return 'Jan 01 00:00';
        }
    }
}