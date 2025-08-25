/**
 * PASS command handler - JWT token authentication
 */

import { BaseFtpCommand } from '../lib/base-command.js';
import type { FtpConnection } from '../lib/types.js';

export class PassCommand extends BaseFtpCommand {
    readonly name = 'PASS';
    readonly needsAuth = false;
    readonly needsDataConnection = false;

    async execute(connection: FtpConnection, args: string): Promise<void> {
        if (!connection.username) {
            this.sendResponse(connection, 503, 'Login with USER first');
            return;
        }

        if (!args) {
            this.sendResponse(connection, 501, 'PASS command requires password');
            return;
        }

        // Simple JWT validation - check if it looks like a JWT
        const parts = args.split('.');
        if (parts.length === 3) {
            connection.authenticated = true;
            connection.jwtToken = args;
            this.sendResponse(connection, 230, `User ${connection.username} logged in`);
        } else {
            this.sendResponse(connection, 530, 'Authentication failed - invalid JWT token');
        }
    }
}