/**
 * CLNT command handler - Client identification
 * 
 * Handles client identification messages sent by FTP clients
 * This is typically used for logging/debugging purposes
 */

import { BaseFtpCommand } from '../lib/base-command.js';
import type { FtpConnection } from '../lib/types.js';

export class ClntCommand extends BaseFtpCommand {
    readonly name = 'CLNT';
    readonly needsAuth = false; // CLNT can be used before authentication
    readonly needsDataConnection = false;

    async execute(connection: FtpConnection, args: string): Promise<void> {
        // Store client identification if provided
        if (args && args.trim()) {
            connection.clientInfo = args.trim();
            
            if (this.debug) {
                console.log(`🔍 [${connection.id}] Client identified as: ${args.trim()}`);
            }
        }

        // Send success response
        this.sendResponse(connection, 200, 'OK');
    }
}