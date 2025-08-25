/**
 * HELP command handler - List available commands
 * 
 * Provides list of supported FTP commands for client compatibility
 */

import { BaseFtpCommand } from '../lib/base-command.js';
import type { FtpConnection } from '../lib/types.js';

export class HelpCommand extends BaseFtpCommand {
    readonly name = 'HELP';
    readonly needsAuth = false; // HELP can be used before authentication
    readonly needsDataConnection = false;

    async execute(connection: FtpConnection, args: string): Promise<void> {
        // Send multi-line help response
        const helpLines = [
            '214-The following commands are supported:',
            '214-USER PASS QUIT PWD CWD CDUP',
            '214-LIST STAT SIZE MDTM PASV',
            '214-STOR RETR DELE',
            '214-SYST TYPE FEAT NOOP',
            '214 Help OK'
        ];

        // Send all help lines
        for (const line of helpLines) {
            connection.socket.write(`${line}\r\n`);
        }
    }
}