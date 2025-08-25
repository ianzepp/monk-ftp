/**
 * CWD command handler - Change working directory
 * 
 * Validates directory exists via monk-api before changing path
 */

import { BaseFtpCommand } from '../lib/base-command.js';
import type { FtpConnection } from '../lib/types.js';

export class CwdCommand extends BaseFtpCommand {
    readonly name = 'CWD';
    readonly needsAuth = true;
    readonly needsDataConnection = false;

    async execute(connection: FtpConnection, args: string): Promise<void> {
        if (!args) {
            this.sendResponse(connection, 501, 'CWD command requires path');
            return;
        }

        try {
            // Resolve new path
            const newPath = this.resolvePath(connection.currentPath, args);
            
            // Validate directory exists by calling monk-api list
            const response = await this.apiClient.list(
                newPath,
                {
                    show_hidden: false,
                    long_format: false,
                    recursive: false
                },
                connection.jwtToken!
            );

            if (response.success) {
                connection.currentPath = newPath;
                this.sendResponse(connection, 250, `Directory changed to ${newPath}`);
            } else {
                this.sendResponse(connection, 550, 'Directory not found');
            }
            
        } catch (error) {
            console.error(`❌ CWD error:`, error);
            this.sendResponse(connection, 550, 'Directory not accessible');
        }
    }
}