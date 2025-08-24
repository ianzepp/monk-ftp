/**
 * Custom FTP Protocol Server
 * 
 * Implements core FTP protocol (RFC 959) for direct database operations.
 * Much simpler than using ftp-srv library - FTP is just text commands over TCP.
 * 
 * FTP Protocol Basics:
 * - Control connection (port 2121) - Commands and responses
 * - Data connection (passive mode) - File transfers and listings
 * - Commands: USER, PASS, PWD, CWD, LIST, RETR, STOR, QUIT, etc.
 * - Responses: 3-digit codes (220=ready, 230=logged in, 550=error, etc.)
 * 
 * Our Implementation:
 * - JWT authentication via PASS command
 * - Path parsing for database navigation  
 * - Direct database operations for file/directory access
 * - No actual filesystem - pure database metaphor
 */

import * as net from 'net';
import * as os from 'os';
import type { System } from '../lib/system.js';
import { FtpAuthHandler } from './ftp-auth-handler.js';
import { FtpPathParser, type PathInfo } from './path-parser.js';
import { ApiContextBuilder } from './api-context.js';
import { FtpDirectoryHandler } from './directory-handler.js';
import { FtpFileHandler, type FileContent } from './file-handler.js';

/**
 * FTP connection state for each client
 */
interface FtpConnection {
    /** Control connection socket */
    socket: net.Socket;
    
    /** Client IP address */
    clientIp: string;
    
    /** Authenticated system context */
    system?: System;
    
    /** Current working directory path */
    currentPath: string;
    
    /** Authentication username */
    username?: string;
    
    /** Connection ID for logging */
    id: string;
    
    /** Data connection info for passive/active mode */
    dataConnection?: {
        server: net.Server | null;
        port: number;
        socket?: net.Socket;
        activeMode?: {
            address: string;
            port: number;
        };
    };
}

/**
 * FTP Response codes (standard RFC 959)
 */
export const FTP_CODES = {
    // 1xx - Positive Preliminary
    150: 'File status okay; about to open data connection.',
    
    // 2xx - Positive Completion  
    200: 'Command okay.',
    220: 'Service ready for new user.',
    221: 'Service closing control connection.',
    226: 'Closing data connection.',
    230: 'User logged in, proceed.',
    250: 'Requested file action okay, completed.',
    257: 'Directory created.',
    
    // 3xx - Positive Intermediate
    331: 'User name okay, need password.',
    350: 'Requested file action pending further information.',
    
    // 4xx - Transient Negative Completion
    425: 'Can not open data connection.',
    426: 'Connection closed; transfer aborted.',
    450: 'Requested file action not taken.',
    
    // 5xx - Permanent Negative Completion
    500: 'Syntax error, command unrecognized.',
    501: 'Syntax error in parameters or arguments.',
    502: 'Command not implemented.',
    503: 'Bad sequence of commands.',
    530: 'Not logged in.',
    550: 'Requested action not taken.',
    553: 'Requested action not taken. File name not allowed.'
} as const;

/**
 * Custom FTP Protocol Server
 */
export class FtpProtocolServer {
    private server: net.Server;
    private connections = new Map<string, FtpConnection>();
    private authHandler: FtpAuthHandler;
    private isRunning = false;
    
    constructor(
        private port: number = 2121,
        private host: string = 'localhost'
    ) {
        this.authHandler = new FtpAuthHandler();
        this.server = net.createServer(this.handleConnection.bind(this));
        
        // Server event handlers
        this.server.on('error', this.handleServerError.bind(this));
        this.server.on('close', () => {
            console.log('FTP server closed');
            this.isRunning = false;
        });
    }
    
    /**
     * Start the FTP server
     */
    async start(): Promise<void> {
        if (this.isRunning) {
            console.log(`FTP server already running on port ${this.port}`);
            return;
        }
        
        return new Promise((resolve, reject) => {
            this.server.listen(this.port, this.host, () => {
                this.isRunning = true;
                console.log(`🚀 Custom FTP server listening on ${this.host}:${this.port}`);
                console.log(`📡 Connect with: ftp ${this.host} ${this.port}`);
                console.log(`🔐 Username: api-user, Password: <JWT-token>`);
                resolve();
            });
            
            this.server.on('error', (error) => {
                console.error('Failed to start FTP server:', error);
                reject(error);
            });
        });
    }
    
    /**
     * Stop the FTP server
     */
    async stop(): Promise<void> {
        if (!this.isRunning) {
            return;
        }
        
        return new Promise((resolve) => {
            // Close all client connections
            for (const conn of this.connections.values()) {
                this.closeConnection(conn);
            }
            
            // Close server
            this.server.close(() => {
                console.log('✅ FTP server stopped gracefully');
                resolve();
            });
        });
    }
    
    /**
     * Handle new client connection
     */
    private handleConnection(socket: net.Socket): void {
        const clientIp = socket.remoteAddress || 'unknown';
        const connectionId = `ftp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
        console.log(`📞 FTP connection from ${clientIp} (${connectionId})`);
        
        const connection: FtpConnection = {
            socket,
            clientIp,
            currentPath: '/',
            id: connectionId
        };
        
        this.connections.set(connectionId, connection);
        
        // Set up socket event handlers
        socket.setEncoding('utf8');
        socket.on('data', (data: Buffer) => this.handleCommand(connection, data.toString('utf8')));
        socket.on('close', () => this.closeConnection(connection));
        socket.on('error', (error) => this.handleConnectionError(connection, error));
        
        // Send welcome message
        this.sendResponse(connection, 220, 'Welcome to Monk API FTP Interface');
    }
    
    /**
     * Handle FTP command from client
     */
    private async handleCommand(connection: FtpConnection, data: string): Promise<void> {
        const lines = data.toString().trim().split('\r\n').filter(line => line.length > 0);
        
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            
            console.log(`📨 [${connection.id}] Command: ${trimmed}`);
            
            try {
                await this.processCommand(connection, trimmed);
            } catch (error) {
                console.error(`❌ [${connection.id}] Command error:`, error);
                this.sendResponse(connection, 550, 'Internal server error');
            }
        }
    }
    
    /**
     * Process individual FTP command
     */
    private async processCommand(connection: FtpConnection, commandLine: string): Promise<void> {
        const parts = commandLine.split(' ');
        const command = parts[0].toUpperCase();
        const args = parts.slice(1).join(' ');
        
        switch (command) {
            case 'USER':
                await this.handleUser(connection, args);
                break;
                
            case 'PASS':
                await this.handlePass(connection, args);
                break;
                
            case 'PWD':
                await this.handlePwd(connection);
                break;
                
            case 'CWD':
                await this.handleCwd(connection, args);
                break;
                
            case 'LIST':
                await this.handleList(connection, args);
                break;
                
            case 'PASV':
                await this.handlePasv(connection);
                break;
                
            case 'EPSV':
                await this.handleEpsv(connection);
                break;
                
            case 'RETR':
                await this.handleRetr(connection, args);
                break;
                
            case 'STOR':
                await this.handleStor(connection, args);
                break;
                
            case 'EPRT':
                await this.handleEprt(connection, args);
                break;
                
            case 'PORT':
                await this.handlePort(connection, args);
                break;
                
            case 'QUIT':
                await this.handleQuit(connection);
                break;
                
            case 'SYST':
                this.sendResponse(connection, 215, 'UNIX Type: L8');
                break;
                
            case 'TYPE':
                this.sendResponse(connection, 200, 'Type set to I'); // Binary mode
                break;
                
            case 'FEAT':
                this.sendResponse(connection, 211, 'Features supported');
                break;
                
            case 'NOOP':
                this.sendResponse(connection, 200, 'NOOP command successful');
                break;
                
            default:
                console.log(`❓ [${connection.id}] Unknown command: ${command}`);
                this.sendResponse(connection, 502, `Command '${command}' not implemented`);
                break;
        }
    }
    
    /**
     * Handle USER command
     */
    private async handleUser(connection: FtpConnection, username: string): Promise<void> {
        if (!username) {
            this.sendResponse(connection, 501, 'USER command requires username');
            return;
        }
        
        connection.username = username;
        console.log(`👤 [${connection.id}] User: ${username}`);
        this.sendResponse(connection, 331, `User ${username} okay, need password`);
    }
    
    /**
     * Handle PASS command (JWT authentication)
     */
    private async handlePass(connection: FtpConnection, password: string): Promise<void> {
        if (!connection.username) {
            this.sendResponse(connection, 503, 'Login with USER first');
            return;
        }
        
        if (!password) {
            this.sendResponse(connection, 501, 'PASS command requires password');
            return;
        }
        
        console.log(`🔐 [${connection.id}] Authenticating ${connection.username}`);
        
        try {
            // Use our JWT authentication handler
            const system = await this.authHandler.validateLogin(connection.username, password);
            
            if (system) {
                connection.system = system;
                const user = system.getUser();
                console.log(`✅ [${connection.id}] Login successful for tenant: ${user.domain}`);
                this.sendResponse(connection, 230, `User ${connection.username} logged in`);
            } else {
                console.log(`❌ [${connection.id}] Login failed for ${connection.username}`);
                this.sendResponse(connection, 530, 'Authentication failed');
            }
        } catch (error) {
            console.error(`❌ [${connection.id}] Authentication error:`, error);
            this.sendResponse(connection, 530, 'Authentication error');
        }
    }
    
    /**
     * Handle PWD (Print Working Directory) command
     */
    private async handlePwd(connection: FtpConnection): Promise<void> {
        if (!connection.system) {
            this.sendResponse(connection, 530, 'Please login first');
            return;
        }
        
        this.sendResponse(connection, 257, `"${connection.currentPath}" is current directory`);
    }
    
    /**
     * Handle CWD (Change Working Directory) command
     */
    private async handleCwd(connection: FtpConnection, path: string): Promise<void> {
        if (!connection.system) {
            this.sendResponse(connection, 530, 'Please login first');
            return;
        }
        
        if (!path) {
            this.sendResponse(connection, 501, 'CWD command requires path');
            return;
        }
        
        try {
            // Resolve the new path
            const newPath = this.resolvePath(connection.currentPath, path);
            
            // Parse and validate the path
            const pathInfo = FtpPathParser.parse(newPath);
            
            // Check if it's a valid directory path
            if (!pathInfo.isDirectory) {
                this.sendResponse(connection, 550, 'Not a directory');
                return;
            }
            
            // TODO: Validate that directory exists (check schemas, records exist)
            
            connection.currentPath = newPath;
            console.log(`📁 [${connection.id}] Changed directory to: ${newPath}`);
            this.sendResponse(connection, 250, `Directory changed to ${newPath}`);
            
        } catch (error) {
            console.error(`❌ [${connection.id}] CWD error:`, error);
            this.sendResponse(connection, 550, 'Directory change failed');
        }
    }
    
    /**
     * Handle LIST command (directory listing)
     */
    private async handleList(connection: FtpConnection, path?: string): Promise<void> {
        if (!connection.system) {
            this.sendResponse(connection, 530, 'Please login first');
            return;
        }
        
        if (!connection.dataConnection) {
            this.sendResponse(connection, 425, 'Use PASV first');
            return;
        }
        
        try {
            // Determine the path to list
            const listPath = path ? this.resolvePath(connection.currentPath, path) : connection.currentPath;
            
            // Parse the path
            const pathInfo = FtpPathParser.parse(listPath);
            
            // Get directory listing using our directory handler
            const dirHandler = new FtpDirectoryHandler(connection.system);
            const files = await dirHandler.list(pathInfo);
            
            // Format as FTP listing
            const listing = files.map(file => {
                const permissions = file.permissions || (file.type === 'directory' ? 'drwxr-xr-x' : '-rw-r--r--');
                const size = file.size.toString().padStart(8);
                const date = file.modified.toLocaleDateString('en-US', { month: 'short', day: '2-digit' }) + 
                           ' ' + file.modified.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });
                
                return `${permissions} 1 ${file.owner || 'monk'} ${file.group || 'monk'} ${size} ${date} ${file.name}`;
            }).join('\r\n');
            
            console.log(`📋 [${connection.id}] Listing ${files.length} items for: ${listPath}`);
            
            // Send the listing over data connection
            this.sendResponse(connection, 150, 'Opening data connection');
            
            const dataSocket = await this.waitForDataConnection(connection);
            dataSocket.write(listing + '\r\n');
            dataSocket.end();
            
            this.sendResponse(connection, 226, 'Directory listing completed');
            
        } catch (error) {
            console.error(`❌ [${connection.id}] LIST error:`, error);
            this.sendResponse(connection, 550, 'Directory listing failed');
        }
    }
    
    /**
     * Handle PASV (Passive Mode) command
     */
    private async handlePasv(connection: FtpConnection): Promise<void> {
        try {
            // Close existing data connection if any
            if (connection.dataConnection) {
                connection.dataConnection.server?.close();
            }
            
            // Create new data server on random port
            const dataServer = net.createServer();
            
            return new Promise((resolve, reject) => {
                dataServer.listen(0, '127.0.0.1', () => {
                    const address = dataServer.address() as net.AddressInfo;
                    const port = address.port;
                    
                    connection.dataConnection = {
                        server: dataServer,
                        port
                    };
                    
                    // Set up data connection handler - CRITICAL: Store socket when client connects
                    dataServer.on('connection', (socket) => {
                        connection.dataConnection!.socket = socket;
                        console.log(`📡 [${connection.id}] PASV data connection established on port ${port}`);
                        
                        socket.on('close', () => {
                            console.log(`📡 [${connection.id}] PASV data connection closed`);
                            if (connection.dataConnection) {
                                connection.dataConnection.socket = undefined;
                            }
                        });
                    });
                    
                    // Format response: IP as comma-separated bytes + port as two bytes
                    const ip = '127,0,0,1'; // localhost
                    const p1 = Math.floor(port / 256);
                    const p2 = port % 256;
                    
                    this.sendResponse(connection, 227, `Entering passive mode (${ip},${p1},${p2})`);
                    console.log(`🔗 [${connection.id}] Passive mode on port ${port}`);
                    resolve();
                });
                
                dataServer.on('error', (error) => {
                    console.error(`❌ [${connection.id}] Data server error:`, error);
                    reject(error);
                });
            });
            
        } catch (error) {
            console.error(`❌ [${connection.id}] PASV error:`, error);
            this.sendResponse(connection, 425, 'Cannot open passive connection');
        }
    }
    
    /**
     * Handle RETR (Retrieve/Download) command
     */
    private async handleRetr(connection: FtpConnection, filename: string): Promise<void> {
        if (!connection.system) {
            this.sendResponse(connection, 530, 'Please login first');
            return;
        }
        
        if (!connection.dataConnection) {
            this.sendResponse(connection, 425, 'Use PASV first');
            return;
        }
        
        try {
            // Resolve file path
            const filePath = this.resolvePath(connection.currentPath, filename);
            
            // Parse the path
            const pathInfo = FtpPathParser.parse(filePath);
            
            // Check if it's a file (not directory)
            if (pathInfo.isDirectory) {
                this.sendResponse(connection, 550, 'Cannot retrieve directory');
                return;
            }
            
            // Read file content using file handler
            const fileHandler = new FtpFileHandler(connection.system);
            const fileContent = await fileHandler.readFile(pathInfo);
            
            console.log(`📥 [${connection.id}] Downloading: ${filePath} (${fileContent.size} bytes)`);
            
            // Send file over data connection
            this.sendResponse(connection, 150, `Opening data connection for ${filename}`);
            
            const dataSocket = await this.waitForDataConnection(connection);
            dataSocket.write(fileContent.content);
            dataSocket.end();
            
            this.sendResponse(connection, 226, 'Transfer complete');
            
        } catch (error) {
            console.error(`❌ [${connection.id}] RETR error:`, error);
            if (error instanceof Error && error.message.includes('not found')) {
                this.sendResponse(connection, 550, 'File not found');
            } else {
                this.sendResponse(connection, 550, 'File transfer failed');
            }
        }
    }
    
    /**
     * Handle STOR (Store/Upload) command  
     */
    private async handleStor(connection: FtpConnection, filename: string): Promise<void> {
        if (!connection.system) {
            this.sendResponse(connection, 530, 'Please login first');
            return;
        }
        
        if (!connection.dataConnection) {
            this.sendResponse(connection, 425, 'Use PASV first');
            return;
        }
        
        try {
            // Resolve file path
            const filePath = this.resolvePath(connection.currentPath, filename);
            
            // Parse the path
            const pathInfo = FtpPathParser.parse(filePath);
            
            // Check if it's a file (not directory)
            if (pathInfo.isDirectory) {
                this.sendResponse(connection, 550, 'Cannot store to directory');
                return;
            }
            
            console.log(`📤 [${connection.id}] Uploading: ${filePath}`);
            
            // Prepare to receive file data
            this.sendResponse(connection, 150, `Opening data connection for ${filename}`);
            
            const dataSocket = await this.waitForDataConnection(connection);
            let fileContent = '';
            
            dataSocket.on('data', (chunk: Buffer) => {
                fileContent += chunk.toString('utf8');
            });
            
            dataSocket.on('end', async () => {
                try {
                    // Write file content using file handler
                    const fileHandler = new FtpFileHandler(connection.system!);
                    await fileHandler.writeFile(pathInfo, fileContent);
                    
                    console.log(`✅ [${connection.id}] Upload complete: ${filePath} (${fileContent.length} bytes)`);
                    this.sendResponse(connection, 226, 'Transfer complete');
                    
                } catch (error) {
                    console.error(`❌ [${connection.id}] STOR write error:`, error);
                    this.sendResponse(connection, 550, 'File write failed');
                }
            });
            
            dataSocket.on('error', (error) => {
                console.error(`❌ [${connection.id}] Data connection error:`, error);
                this.sendResponse(connection, 426, 'Data connection error');
            });
            
        } catch (error) {
            console.error(`❌ [${connection.id}] STOR error:`, error);
            this.sendResponse(connection, 550, 'File upload failed');
        }
    }
    
    /**
     * Handle EPSV (Extended Passive Mode) command
     */
    private async handleEpsv(connection: FtpConnection): Promise<void> {
        try {
            // Close existing data connection if any
            if (connection.dataConnection) {
                connection.dataConnection.server?.close();
            }
            
            // Create new data server on random port
            const dataServer = net.createServer();
            
            return new Promise((resolve, reject) => {
                dataServer.listen(0, '127.0.0.1', () => {
                    const address = dataServer.address() as net.AddressInfo;
                    const port = address.port;
                    
                    connection.dataConnection = {
                        server: dataServer,
                        port
                    };
                    
                    // Set up data connection handler
                    dataServer.on('connection', (socket) => {
                        connection.dataConnection!.socket = socket;
                        console.log(`📡 [${connection.id}] Extended data connection established on port ${port}`);
                        
                        socket.on('close', () => {
                            console.log(`📡 [${connection.id}] Extended data connection closed`);
                            if (connection.dataConnection) {
                                connection.dataConnection.socket = undefined;
                            }
                        });
                    });
                    
                    // EPSV response format: |||port|
                    this.sendResponse(connection, 229, `Entering extended passive mode (|||${port}|)`);
                    console.log(`🔗 [${connection.id}] Extended passive mode on port ${port}`);
                    resolve();
                });
                
                dataServer.on('error', (error) => {
                    console.error(`❌ [${connection.id}] Extended data server error:`, error);
                    reject(error);
                });
            });
            
        } catch (error) {
            console.error(`❌ [${connection.id}] EPSV error:`, error);
            this.sendResponse(connection, 425, 'Cannot open extended passive connection');
        }
    }
    
    /**
     * Handle EPRT (Extended Port) command for active mode
     */
    private async handleEprt(connection: FtpConnection, args: string): Promise<void> {
        // EPRT format: |protocol|address|port|
        const match = args.match(/\|(\d+)\|([^|]+)\|(\d+)\|/);
        
        if (!match) {
            this.sendResponse(connection, 501, 'Invalid EPRT format');
            return;
        }
        
        const [, protocol, address, portStr] = match;
        const port = parseInt(portStr, 10);
        
        if (protocol !== '2' || isNaN(port)) {
            this.sendResponse(connection, 501, 'Unsupported protocol or invalid port');
            return;
        }
        
        console.log(`🔗 [${connection.id}] Active mode: client will listen on ${address}:${port}`);
        
        // Store active mode connection info
        connection.dataConnection = {
            server: null as any, // Not used in active mode
            port,
            activeMode: {
                address,
                port
            }
        };
        
        this.sendResponse(connection, 200, 'Extended port command successful');
    }
    
    /**
     * Handle PORT command for active mode
     */
    private async handlePort(connection: FtpConnection, args: string): Promise<void> {
        // PORT format: h1,h2,h3,h4,p1,p2 where IP=h1.h2.h3.h4 and port=p1*256+p2
        const parts = args.split(',');
        
        if (parts.length !== 6) {
            this.sendResponse(connection, 501, 'Invalid PORT format');
            return;
        }
        
        const ip = parts.slice(0, 4).join('.');
        const port = parseInt(parts[4]) * 256 + parseInt(parts[5]);
        
        console.log(`🔗 [${connection.id}] Active mode: client will listen on ${ip}:${port}`);
        
        // Store active mode connection info
        connection.dataConnection = {
            server: null as any, // Not used in active mode
            port,
            activeMode: {
                address: ip,
                port
            }
        };
        
        this.sendResponse(connection, 200, 'Port command successful');
    }
    
    /**
     * Handle QUIT command
     */
    private async handleQuit(connection: FtpConnection): Promise<void> {
        console.log(`👋 [${connection.id}] Client disconnecting`);
        this.sendResponse(connection, 221, 'Goodbye');
        this.closeConnection(connection);
    }
    
    /**
     * Send FTP response to client
     */
    private sendResponse(connection: FtpConnection, code: number, message: string): void {
        const response = `${code} ${message}\r\n`;
        connection.socket.write(response);
        console.log(`📤 [${connection.id}] Response: ${code} ${message}`);
    }
    
    /**
     * Wait for data connection to be established
     */
    private async waitForDataConnection(connection: FtpConnection, timeout = 2000): Promise<net.Socket> {
        // Check if data socket already exists (connected during PASV)
        if (connection.dataConnection?.socket) {
            console.log(`📡 [${connection.id}] Using existing data connection`);
            return connection.dataConnection.socket;
        }
        
        // Otherwise wait for new connection
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new Error('Data connection timeout'));
            }, timeout);
            
            if (connection.dataConnection?.server) {
                connection.dataConnection.server.once('connection', (socket) => {
                    clearTimeout(timer);
                    console.log(`📡 [${connection.id}] New data connection established`);
                    resolve(socket);
                });
            } else {
                clearTimeout(timer);
                reject(new Error('No data server'));
            }
        });
    }
    
    /**
     * Resolve relative path against current directory
     */
    private resolvePath(currentPath: string, relativePath: string): string {
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
    
    /**
     * Close client connection and cleanup
     */
    private closeConnection(connection: FtpConnection): void {
        console.log(`🔌 [${connection.id}] Closing connection`);
        
        // Close data connection
        if (connection.dataConnection) {
            connection.dataConnection.server?.close();
            connection.dataConnection.socket?.destroy();
        }
        
        // Close control connection
        connection.socket.destroy();
        
        // Remove from connections map
        this.connections.delete(connection.id);
    }
    
    /**
     * Handle connection errors
     */
    private handleConnectionError(connection: FtpConnection, error: Error): void {
        console.error(`❌ [${connection.id}] Connection error:`, error);
        this.closeConnection(connection);
    }
    
    /**
     * Handle server errors
     */
    private handleServerError(error: Error): void {
        console.error('❌ FTP server error:', error);
    }
    
    /**
     * Get server status
     */
    getStatus(): { running: boolean; connections: number; host: string; port: number } {
        return {
            running: this.isRunning,
            connections: this.connections.size,
            host: this.host,
            port: this.port
        };
    }
}