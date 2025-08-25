/**
 * Core FTP Server with Command Dispatch
 * 
 * Manages FTP connections and dispatches commands to individual handlers
 */

import * as net from 'net';
import type { FtpConnection, FtpCommandHandler, ServerConfig } from './types.js';

export class FtpServer {
    private server: net.Server;
    private connections = new Map<string, FtpConnection>();
    private commandHandlers = new Map<string, FtpCommandHandler>();

    constructor(private config: ServerConfig) {
        this.server = net.createServer(this.handleConnection.bind(this));
    }

    async start(): Promise<void> {
        // Load command handlers first
        await this.loadCommandHandlers();
        
        return new Promise((resolve, reject) => {
            this.server.listen(this.config.port, this.config.host, () => {
                console.log(`🚀 FTP server listening on ${this.config.host}:${this.config.port}`);
                console.log(`📡 Connect with: lftp -u "root,<jwt-token>" ${this.config.host}:${this.config.port}`);
                console.log(`🔗 API endpoint: ${this.config.apiUrl}`);
                resolve();
            });
            
            this.server.on('error', reject);
        });
    }

    async stop(): Promise<void> {
        return new Promise((resolve) => {
            // Close all connections
            for (const connection of this.connections.values()) {
                this.closeConnection(connection);
            }
            
            this.server.close(() => {
                console.log('✅ FTP server stopped');
                resolve();
            });
        });
    }

    private async loadCommandHandlers(): Promise<void> {
        // Load command handlers
        try {
            const { UserCommand } = await import('../commands/user.js');
            const { PassCommand } = await import('../commands/pass.js');
            const { PwdCommand } = await import('../commands/pwd.js');
            const { CwdCommand } = await import('../commands/cwd.js');
            const { ListCommand } = await import('../commands/list.js');
            const { StorCommand } = await import('../commands/stor.js');
            const { RetrCommand } = await import('../commands/retr.js');
            const { DeleCommand } = await import('../commands/dele.js');
            const { StatCommand } = await import('../commands/stat.js');
            const { CdupCommand } = await import('../commands/cdup.js');
            const { SizeCommand } = await import('../commands/size.js');
            const { MdtmCommand } = await import('../commands/mdtm.js');
            const { PasvCommand } = await import('../commands/pasv.js');

            // Register commands
            this.registerCommand(new UserCommand(this.config.apiUrl, this.config.debug));
            this.registerCommand(new PassCommand(this.config.apiUrl, this.config.debug));
            this.registerCommand(new PwdCommand(this.config.apiUrl, this.config.debug));
            this.registerCommand(new CwdCommand(this.config.apiUrl, this.config.debug));
            this.registerCommand(new ListCommand(this.config.apiUrl, this.config.debug));
            this.registerCommand(new StorCommand(this.config.apiUrl, this.config.debug));
            this.registerCommand(new RetrCommand(this.config.apiUrl, this.config.debug));
            this.registerCommand(new DeleCommand(this.config.apiUrl, this.config.debug));
            this.registerCommand(new StatCommand(this.config.apiUrl, this.config.debug));
            this.registerCommand(new CdupCommand(this.config.apiUrl, this.config.debug));
            this.registerCommand(new SizeCommand(this.config.apiUrl, this.config.debug));
            this.registerCommand(new MdtmCommand(this.config.apiUrl, this.config.debug));
            this.registerCommand(new PasvCommand(this.config.apiUrl, this.config.debug));

            if (this.config.debug) {
                console.log(`📋 Command handlers loaded: ${this.commandHandlers.size}`);
            }
        } catch (error) {
            console.error('❌ Failed to load command handlers:', error);
        }
    }

    private handleConnection(socket: net.Socket): void {
        const connectionId = `ftp-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
        const clientIp = socket.remoteAddress || 'unknown';
        
        console.log(`📞 New FTP connection from ${clientIp} (${connectionId})`);

        const connection: FtpConnection = {
            socket,
            id: connectionId,
            authenticated: false,
            currentPath: '/'
        };

        this.connections.set(connectionId, connection);

        // Set up socket event handlers
        socket.setEncoding('utf8');
        socket.on('data', (data: Buffer) => this.handleData(connection, data.toString()));
        socket.on('close', () => this.closeConnection(connection));
        socket.on('error', (error) => this.handleConnectionError(connection, error));

        // Send welcome message
        this.sendResponse(connection, 220, 'monk-ftp server ready');
    }

    private async handleData(connection: FtpConnection, data: string): Promise<void> {
        const lines = data.trim().split('\r\n').filter(line => line.length > 0);
        
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            
            if (this.config.debug) {
                console.log(`📨 [${connection.id}] Command: ${trimmed}`);
            }
            
            await this.processCommand(connection, trimmed);
        }
    }

    private async processCommand(connection: FtpConnection, commandLine: string): Promise<void> {
        const parts = commandLine.split(' ');
        const command = parts[0].toUpperCase();
        const args = parts.slice(1).join(' ');

        try {
            const handler = this.commandHandlers.get(command);
            
            if (handler) {
                // Check authentication requirement
                if (handler.needsAuth && !connection.authenticated) {
                    this.sendResponse(connection, 530, 'Please login first');
                    return;
                }
                
                // Check data connection requirement
                if (handler.needsDataConnection && !connection.dataConnection) {
                    this.sendResponse(connection, 425, 'Use PASV first');
                    return;
                }
                
                await handler.execute(connection, args);
            } else {
                // Handle basic system commands
                await this.handleSystemCommand(connection, command, args);
            }
        } catch (error) {
            console.error(`❌ [${connection.id}] Command error:`, error);
            this.sendResponse(connection, 550, 'Command failed');
        }
    }

    private async handleSystemCommand(connection: FtpConnection, command: string, args: string): Promise<void> {
        switch (command) {
            case 'QUIT':
                this.sendResponse(connection, 221, 'Goodbye');
                this.closeConnection(connection);
                break;
                
            case 'SYST':
                this.sendResponse(connection, 215, 'UNIX Type: L8');
                break;
                
            case 'TYPE':
                this.sendResponse(connection, 200, 'Type set');
                break;
                
            case 'FEAT':
                this.sendResponse(connection, 211, 'No features');
                break;
                
            case 'NOOP':
                this.sendResponse(connection, 200, 'NOOP command successful');
                break;
                
            default:
                if (this.config.debug) {
                    console.log(`❓ [${connection.id}] Unknown command: ${command}`);
                }
                this.sendResponse(connection, 502, `Command '${command}' not implemented`);
                break;
        }
    }

    public sendResponse(connection: FtpConnection, code: number, message: string): void {
        const response = `${code} ${message}\r\n`;
        connection.socket.write(response);
        
        if (this.config.debug) {
            console.log(`📤 [${connection.id}] Response: ${code} ${message}`);
        }
    }

    private closeConnection(connection: FtpConnection): void {
        if (this.config.debug) {
            console.log(`🔌 [${connection.id}] Closing connection`);
        }
        
        // Close data connection if exists
        if (connection.dataConnection) {
            connection.dataConnection.server?.close();
            connection.dataConnection.socket?.destroy();
        }
        
        // Close control connection
        connection.socket.destroy();
        
        // Remove from connections map
        this.connections.delete(connection.id);
    }

    private handleConnectionError(connection: FtpConnection, error: Error): void {
        console.error(`❌ [${connection.id}] Connection error:`, error);
        this.closeConnection(connection);
    }

    registerCommand(handler: FtpCommandHandler): void {
        this.commandHandlers.set(handler.name, handler);
        if (this.config.debug) {
            console.log(`📋 Registered command: ${handler.name}`);
        }
    }

    getStatus(): { running: boolean; connections: number; commands: number } {
        return {
            running: this.server.listening,
            connections: this.connections.size,
            commands: this.commandHandlers.size
        };
    }
}