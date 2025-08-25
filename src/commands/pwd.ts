/**
 * PWD command handler - Print working directory
 */

import { BaseFtpCommand } from '../lib/base-command.js';
import type { FtpConnection } from '../lib/types.js';

export class PwdCommand extends BaseFtpCommand {
    readonly name = 'PWD';
    readonly needsAuth = true;
    readonly needsDataConnection = false;

    async execute(connection: FtpConnection, args: string): Promise<void> {
        this.sendResponse(connection, 257, `"${connection.currentPath}" is current directory`);
    }
}