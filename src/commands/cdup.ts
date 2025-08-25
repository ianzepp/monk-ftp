/**
 * CDUP command handler - Change Directory Up (to parent)
 * 
 * Pure local operation - no API call needed
 */

import { BaseFtpCommand } from '../lib/base-command.js';
import type { FtpConnection } from '../lib/types.js';

export class CdupCommand extends BaseFtpCommand {
    readonly name = 'CDUP';
    readonly needsAuth = true;
    readonly needsDataConnection = false;

    async execute(connection: FtpConnection, args: string): Promise<void> {
        const currentPath = connection.currentPath;
        
        // Can't go up from root
        if (currentPath === '/') {
            this.sendResponse(connection, 550, 'Already at root directory');
            return;
        }
        
        // Remove last path segment to go up one level
        const parts = currentPath.split('/').filter(p => p.length > 0);
        parts.pop(); // Remove last segment
        
        const parentPath = '/' + parts.join('/');
        connection.currentPath = parentPath;
        
        this.sendResponse(connection, 250, `Directory changed to ${parentPath}`);
    }
}