/**
 * Base class for FTP command handlers
 */

import type { FtpConnection, FtpCommandHandler } from './types.js';
import { MonkApiClient } from './api-client.js';

export abstract class BaseFtpCommand implements FtpCommandHandler {
    protected apiClient: MonkApiClient;

    constructor(apiUrl: string, debug: boolean = false) {
        this.apiClient = new MonkApiClient(apiUrl, debug);
    }

    abstract readonly name: string;
    abstract readonly needsAuth: boolean;
    abstract readonly needsDataConnection: boolean;

    abstract execute(connection: FtpConnection, args: string): Promise<void>;

    protected sendResponse(connection: FtpConnection, code: number, message: string): void {
        const response = `${code} ${message}\r\n`;
        connection.socket.write(response);
    }

    protected resolvePath(currentPath: string, relativePath: string): string {
        if (!relativePath || relativePath === '.') {
            return currentPath;
        }
        
        if (relativePath.startsWith('/')) {
            return relativePath; // Absolute path
        }
        
        // Handle relative paths
        const parts = currentPath.split('/').filter(p => p.length > 0);
        const relativeParts = relativePath.split('/').filter(p => p.length > 0);
        
        for (const part of relativeParts) {
            if (part === '..') {
                parts.pop();
            } else if (part !== '.') {
                parts.push(part);
            }
        }
        
        return '/' + parts.join('/');
    }
}