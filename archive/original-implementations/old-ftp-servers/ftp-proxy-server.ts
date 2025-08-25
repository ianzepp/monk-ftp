/**
 * Monk FTP Proxy Server - Protocol Translation Proxy
 * 
 * Translates traditional FTP commands to Monk API HTTP requests.
 * Provides standard FTP protocol compatibility while leveraging
 * the sophisticated monk-api middleware system.
 */

import * as net from 'net';
import fetch from 'node-fetch';

interface FtpConnection {
    socket: net.Socket;
    id: string;
    username: string;
    jwtToken: string;
    authenticated: boolean;
    currentPath: string;
    apiUrl: string;
}

interface FtpConfig {
    port: number;
    host: string;
    apiUrl: string;
}

export class MonkFtpProxyServer {
    private server: net.Server;
    private connections = new Map<string, FtpConnection>();
    private config: FtpConfig;
    
    constructor(config: Partial<FtpConfig> = {}) {
        this.config = {
            port: 2121,
            host: 'localhost',
            apiUrl: 'http://localhost:9001',
            ...config
        };
        
        this.server = net.createServer(this.handleConnection.bind(this));
    }
    
    async start(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.server.listen(this.config.port, this.config.host, () => {
                console.log(`🎯 Monk FTP Proxy Server started`);
                console.log(`   FTP Port: ${this.config.host}:${this.config.port}`);
                console.log(`   API URL: ${this.config.apiUrl}`);
                console.log(`   Test: ftp ${this.config.host} ${this.config.port}`);
                console.log(`   Login: username="root", password="<jwt-token>"`);
                resolve();
            });
            this.server.on('error', reject);
        });
    }
    
    async stop(): Promise<void> {
        return new Promise((resolve) => {
            // Close all connections
            for (const conn of this.connections.values()) {
                conn.socket.destroy();
            }
            
            this.server.close(() => {
                console.log(`🎯 FTP Proxy stopped`);
                resolve();
            });
        });
    }
    
    private handleConnection(socket: net.Socket): void {
        const id = `ftp-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
        console.log(`[${id}] New FTP connection`);
        
        const connection: FtpConnection = {
            socket,
            id,
            username: '',
            jwtToken: '',
            authenticated: false,
            currentPath: '/',
            apiUrl: this.config.apiUrl
        };
        
        this.connections.set(id, connection);
        
        socket.setEncoding('utf8');
        socket.on('data', (data: Buffer) => this.handleData(connection, data.toString()));
        socket.on('close', () => this.cleanup(connection));
        socket.on('error', (err) => {
            console.log(`[${id}] Socket error: ${err.message}`);
            this.cleanup(connection);
        });
        
        // Send FTP welcome message
        this.sendResponse(connection, 220, 'Monk FTP Proxy Ready');
    }
    
    private async handleData(conn: FtpConnection, data: string): Promise<void> {
        const commands = data.trim().split('\r\n').filter(cmd => cmd.length > 0);
        
        for (const commandLine of commands) {
            const [command, ...args] = commandLine.trim().split(' ');
            await this.processCommand(conn, command.toUpperCase(), args);
        }
    }
    
    private async processCommand(conn: FtpConnection, command: string, args: string[]): Promise<void> {
        console.log(`[${conn.id}] ${command} ${args.join(' ')}`);
        
        try {
            switch (command) {
                case 'USER':
                    await this.handleUser(conn, args[0] || '');
                    break;
                    
                case 'PASS':
                    await this.handlePass(conn, args.join(' '));
                    break;
                    
                case 'PWD':
                    this.sendResponse(conn, 257, `"${conn.currentPath}" is current directory`);
                    break;
                    
                case 'CWD':
                    await this.handleCwd(conn, args.join(' '));
                    break;
                    
                case 'LIST':
                    await this.handleList(conn, args.join(' '));
                    break;
                    
                case 'STOR':
                    await this.handleStor(conn, args.join(' '));
                    break;
                    
                case 'DELE':
                    await this.handleDele(conn, args.join(' '));
                    break;
                    
                case 'RETR':
                    await this.handleRetr(conn, args.join(' '));
                    break;
                    
                case 'TYPE':
                    this.sendResponse(conn, 200, 'Type set to I'); // Binary mode
                    break;
                    
                case 'PASV':
                    this.sendResponse(conn, 500, 'PASV not supported - using direct transfer');
                    break;
                    
                case 'QUIT':
                    this.sendResponse(conn, 221, 'Goodbye');
                    conn.socket.end();
                    break;
                    
                default:
                    this.sendResponse(conn, 502, `Command ${command} not implemented`);
            }
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            console.log(`[${conn.id}] Command error: ${errorMsg}`);
            this.sendResponse(conn, 550, `Error: ${errorMsg}`);
        }
    }
    
    private async handleUser(conn: FtpConnection, username: string): Promise<void> {
        conn.username = username || 'root';
        this.sendResponse(conn, 331, `User ${conn.username} OK, password required`);
    }
    
    private async handlePass(conn: FtpConnection, password: string): Promise<void> {
        if (!conn.username) {
            this.sendResponse(conn, 503, 'Login with USER first');
            return;
        }
        
        // Password should be JWT token
        const isValid = await this.validateJwtToken(password);
        
        if (isValid) {
            conn.jwtToken = password;
            conn.authenticated = true;
            this.sendResponse(conn, 230, `User ${conn.username} logged in`);
        } else {
            this.sendResponse(conn, 530, 'Authentication failed - invalid JWT token');
        }
    }
    
    private async handleCwd(conn: FtpConnection, path: string): Promise<void> {
        if (!conn.authenticated) {
            this.sendResponse(conn, 530, 'Not logged in');
            return;
        }
        
        // Normalize and validate path
        const newPath = this.normalizePath(conn.currentPath, path);
        
        // Validate path exists by trying to list it
        try {
            const response = await this.callMonkApi(conn, 'POST', '/ftp/list', {
                path: newPath,
                ftp_options: {
                    show_hidden: false,
                    long_format: false,
                    recursive: false
                }
            });
            
            if (response.success) {
                conn.currentPath = newPath;
                this.sendResponse(conn, 250, `Directory changed to ${newPath}`);
            } else {
                this.sendResponse(conn, 550, 'Directory not found');
            }
        } catch (error) {
            this.sendResponse(conn, 550, 'Directory not accessible');
        }
    }
    
    private async handleList(conn: FtpConnection, path: string): Promise<void> {
        if (!conn.authenticated) {
            this.sendResponse(conn, 530, 'Not logged in');
            return;
        }
        
        const listPath = path ? this.normalizePath(conn.currentPath, path) : conn.currentPath;
        
        try {
            const response = await this.callMonkApi(conn, 'POST', '/ftp/list', {
                path: listPath,
                ftp_options: {
                    show_hidden: false,
                    long_format: true,
                    recursive: false
                }
            });
            
            console.log(`[${conn.id}] API Response:`, JSON.stringify(response, null, 2));
            
            if (response.success && response.data && response.data.entries) {
                this.sendResponse(conn, 150, 'Opening data connection');
                
                // Convert JSON response to FTP listing format
                const listing = this.formatFtpListing(response.data.entries);
                
                // Send the actual listing data first
                conn.socket.write(listing + '\r\n');
                
                // Then send completion status
                this.sendResponse(conn, 226, `Transfer complete (${response.data.entries.length} entries)`);
            } else {
                this.sendResponse(conn, 550, 'Directory listing failed');
            }
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            this.sendResponse(conn, 550, `List error: ${errorMsg}`);
        }
    }
    
    private async handleStor(conn: FtpConnection, filename: string): Promise<void> {
        if (!conn.authenticated) {
            this.sendResponse(conn, 530, 'Not logged in');
            return;
        }
        
        // For now, return not implemented - need to handle binary data stream
        this.sendResponse(conn, 502, 'STOR not implemented yet - requires data channel handling');
    }
    
    private async handleDele(conn: FtpConnection, filename: string): Promise<void> {
        if (!conn.authenticated) {
            this.sendResponse(conn, 530, 'Not logged in');
            return;
        }
        
        const deletePath = this.normalizePath(conn.currentPath, filename);
        
        try {
            const response = await this.callMonkApi(conn, 'POST', '/ftp/delete', {
                path: deletePath,
                ftp_options: {
                    recursive: false,
                    force: false,
                    permanent: false,
                    atomic: true
                }
            });
            
            if (response.success) {
                this.sendResponse(conn, 250, `File ${filename} deleted`);
            } else {
                this.sendResponse(conn, 550, 'Delete failed');
            }
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            this.sendResponse(conn, 550, `Delete error: ${errorMsg}`);
        }
    }
    
    private async handleRetr(conn: FtpConnection, filename: string): Promise<void> {
        if (!conn.authenticated) {
            this.sendResponse(conn, 530, 'Not logged in');
            return;
        }
        
        // For now, return not implemented
        this.sendResponse(conn, 502, 'RETR not implemented yet - requires data channel handling');
    }
    
    // Helper methods
    private async validateJwtToken(token: string): Promise<boolean> {
        try {
            // Simple validation - just check if it looks like a JWT
            const parts = token.split('.');
            if (parts.length !== 3) return false;
            
            // Try to decode the payload (basic validation)
            const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
            return payload.tenant && payload.access;
        } catch {
            return false;
        }
    }
    
    private async callMonkApi(conn: FtpConnection, method: string, endpoint: string, body?: any): Promise<any> {
        const url = `${conn.apiUrl}${endpoint}`;
        
        const response = await fetch(url, {
            method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${conn.jwtToken}`
            },
            body: body ? JSON.stringify(body) : undefined
        });
        
        if (!response.ok) {
            throw new Error(`API call failed: ${response.status} ${response.statusText}`);
        }
        
        return await response.json();
    }
    
    private normalizePath(currentPath: string, relativePath: string): string {
        if (relativePath.startsWith('/')) {
            return relativePath; // Absolute path
        }
        
        // Relative path - combine with current path
        const combined = currentPath.endsWith('/') 
            ? currentPath + relativePath 
            : currentPath + '/' + relativePath;
            
        return combined.replace(/\/+/g, '/').replace(/\/$/, '') || '/';
    }
    
    private formatFtpListing(entries: any[]): string {
        return entries.map(entry => {
            // Format: drwxrwxrwx 1 user group size date time name
            const permissions = entry.ftp_permissions || 'rwx';
            const type = entry.ftp_type || 'd';
            const size = entry.ftp_size || 0;
            const name = entry.name;
            
            // Convert timestamp to FTP format
            const date = this.formatFtpDate(entry.ftp_modified);
            
            return `${type}${permissions} 1 user group ${size} ${date} ${name}`;
        }).join('\r\n');
    }
    
    private formatFtpDate(timestamp: string): string {
        try {
            // Convert from "20241201120000" to "Dec 01 12:00"
            const year = timestamp.substr(0, 4);
            const month = timestamp.substr(4, 2);
            const day = timestamp.substr(6, 2);
            const hour = timestamp.substr(8, 2);
            const minute = timestamp.substr(10, 2);
            
            const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                          'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            
            return `${months[parseInt(month) - 1]} ${day} ${hour}:${minute}`;
        } catch {
            return 'Jan 01 00:00';
        }
    }
    
    private sendResponse(conn: FtpConnection, code: number, message: string): void {
        const response = `${code} ${message}\r\n`;
        console.log(`[${conn.id}] → ${code} ${message}`);
        conn.socket.write(response);
    }
    
    private cleanup(conn: FtpConnection): void {
        console.log(`[${conn.id}] Connection closed`);
        this.connections.delete(conn.id);
    }
}