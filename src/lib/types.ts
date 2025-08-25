/**
 * Shared types for monk-ftp server
 */

import type * as net from 'net';

export interface FtpConnection {
    socket: net.Socket;
    id: string;
    username?: string;
    authenticated: boolean;
    currentPath: string;
    jwtToken?: string;
    dataConnection?: {
        server?: net.Server;
        socket?: net.Socket;
        port?: number;
        mode: 'passive' | 'active';
    };
}

export interface FtpCommandHandler {
    readonly name: string;
    readonly needsAuth: boolean;
    readonly needsDataConnection: boolean;
    
    execute(connection: FtpConnection, args: string): Promise<void>;
}

export interface ServerConfig {
    port: number;
    host: string;
    apiUrl: string;
    debug: boolean;
}

export interface FtpResponse {
    code: number;
    message: string;
}

export const FTP_CODES = {
    // 2xx - Success
    200: 'Command okay.',
    220: 'Service ready for new user.',
    221: 'Service closing control connection.',
    226: 'Closing data connection.',
    230: 'User logged in, proceed.',
    250: 'Requested file action okay, completed.',
    257: 'Directory created.',
    
    // 3xx - Intermediate
    331: 'User name okay, need password.',
    350: 'Requested file action pending further information.',
    
    // 4xx - Temporary failure
    425: 'Can not open data connection.',
    426: 'Connection closed; transfer aborted.',
    450: 'Requested file action not taken.',
    
    // 5xx - Permanent failure
    500: 'Syntax error, command unrecognized.',
    501: 'Syntax error in parameters or arguments.',
    502: 'Command not implemented.',
    503: 'Bad sequence of commands.',
    530: 'Not logged in.',
    550: 'Requested action not taken.',
    553: 'Requested action not taken. File name not allowed.'
} as const;