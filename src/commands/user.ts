/**
 * USER command handler - Username specification
 */

import { BaseFtpCommand } from '../lib/base-command.js';
import type { FtpConnection } from '../lib/types.js';

export class UserCommand extends BaseFtpCommand {
    readonly name = 'USER';
    readonly needsAuth = false;
    readonly needsDataConnection = false;

    async execute(connection: FtpConnection, args: string): Promise<void> {
        if (!args) {
            this.sendResponse(connection, 501, 'USER command requires username');
            return;
        }

        connection.username = args;
        this.sendResponse(connection, 331, `User ${args} okay, need password`);
    }
}