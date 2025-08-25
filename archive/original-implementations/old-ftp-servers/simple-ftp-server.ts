/**
 * Simple FTP Server - Protocol Testing with Random Data
 * 
 * Minimal FTP server that serves random files and directories.
 * Purpose: Get the FTP protocol working correctly without database complexity.
 * 
 * Features:
 * - Basic authentication (any username/password)
 * - Random directory structure with dummy files
 * - Working data connections (passive + active mode)
 * - Proper FTP protocol implementation
 * - Extensive logging to debug protocol issues
 * 
 * Usage:
 *   tsx src/ftp/simple-ftp-server.ts
 */

import * as net from 'net';

interface SimpleConnection {
    socket: net.Socket;
    clientIp: string;
    id: string;
    username?: string;
    authenticated: boolean;
    currentPath: string;
    dataConnection?: {
        server?: net.Server;
        port?: number;
        socket?: net.Socket;
        mode: 'passive' | 'active';
        activeAddress?: string;
        activePort?: number;
    };
}

interface FakeFile {
    name: string;
    type: 'file' | 'directory';
    size: number;
    content?: string;
}

/**
 * Simple FTP Server for protocol testing
 */
export class SimpleFtpServer {
    private server: net.Server;
    private connections = new Map<string, SimpleConnection>();
    private isRunning = false;
    
    constructor(private port: number = 2122) {
        this.server = net.createServer(this.handleConnection.bind(this));
    }
    
    /**
     * Start the server
     */
    async start(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.server.listen(this.port, '0.0.0.0', () => {
                this.isRunning = true;
                console.log(`🚀 Simple FTP server listening on 0.0.0.0:${this.port}`);
                console.log(`📡 Test with: lftp localhost:${this.port}`);
                console.log(`🔐 Any username/password will work`);
                resolve();
            });
            
            this.server.on('error', reject);
        });
    }
    
    /**
     * Handle new client connection
     */
    private handleConnection(socket: net.Socket): void {
        const clientIp = socket.remoteAddress || 'unknown';
        const connectionId = `simple-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
        
        console.log(`📞 [${connectionId}] Connection from ${clientIp}`);
        
        const connection: SimpleConnection = {
            socket,
            clientIp,
            id: connectionId,
            authenticated: false,
            currentPath: '/'
        };
        
        this.connections.set(connectionId, connection);
        
        // Set up socket handlers
        socket.setEncoding('utf8');
        socket.on('data', (data: Buffer) => this.handleCommand(connection, data.toString('utf8')));
        socket.on('close', () => this.closeConnection(connection));
        socket.on('error', (error) => console.error(`❌ [${connectionId}] Socket error:`, error));
        
        // Send welcome
        this.sendResponse(connection, 220, 'Simple FTP Server Ready');
    }
    
    /**
     * Handle FTP commands
     */
    private async handleCommand(connection: SimpleConnection, data: string): Promise<void> {
        const lines = data.trim().split('\r\n').filter(line => line.length > 0);
        
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            
            console.log(`📨 [${connection.id}] Command: "${trimmed}"`);
            
            const parts = trimmed.split(' ');
            const command = parts[0].toUpperCase();
            const args = parts.slice(1).join(' ');
            
            try {
                await this.processCommand(connection, command, args);
            } catch (error) {
                console.error(`❌ [${connection.id}] Command error:`, error);
                this.sendResponse(connection, 550, 'Command failed');
            }
        }
    }
    
    /**
     * Process individual command
     */
    private async processCommand(connection: SimpleConnection, command: string, args: string): Promise<void> {
        switch (command) {
            case 'USER':
                connection.username = args || 'anonymous';
                console.log(`👤 [${connection.id}] User: ${connection.username}`);
                this.sendResponse(connection, 331, `User ${connection.username} okay, need password`);
                break;
                
            case 'PASS':
                // Accept any password
                connection.authenticated = true;
                console.log(`✅ [${connection.id}] Authentication successful`);
                this.sendResponse(connection, 230, 'User logged in');
                break;
                
            case 'PWD':
                if (!connection.authenticated) {
                    this.sendResponse(connection, 530, 'Please login first');
                    return;
                }
                this.sendResponse(connection, 257, `"${connection.currentPath}" is current directory`);
                break;
                
            case 'CWD':
                if (!connection.authenticated) {
                    this.sendResponse(connection, 530, 'Please login first');
                    return;
                }
                // Simple path resolution
                connection.currentPath = this.resolvePath(connection.currentPath, args);
                console.log(`📁 [${connection.id}] Changed to: ${connection.currentPath}`);
                this.sendResponse(connection, 250, `Directory changed to ${connection.currentPath}`);
                break;
                
            case 'PASV':
                await this.handlePasv(connection);
                break;
                
            case 'EPSV':
                await this.handleEpsv(connection);
                break;
                
            case 'LIST':
                await this.handleList(connection, args);
                break;
                
            case 'RETR':
                await this.handleRetr(connection, args);
                break;
                
            case 'QUIT':
                console.log(`👋 [${connection.id}] Client disconnecting`);
                this.sendResponse(connection, 221, 'Goodbye');
                this.closeConnection(connection);
                break;
                
            case 'SYST':
                this.sendResponse(connection, 215, 'UNIX Type: L8');
                break;
                
            case 'TYPE':
                this.sendResponse(connection, 200, 'Type set to I');
                break;
                
            case 'FEAT':
                this.sendResponse(connection, 211, 'No extended features');
                break;
                
            default:
                console.log(`❓ [${connection.id}] Unknown command: ${command}`);
                this.sendResponse(connection, 502, `Command '${command}' not implemented`);
                break;
        }
    }
    
    /**
     * Handle PASV command - focus on getting this working
     */
    private async handlePasv(connection: SimpleConnection): Promise<void> {
        try {
            // Close existing data connection
            if (connection.dataConnection?.server) {
                connection.dataConnection.server.close();
            }
            
            console.log(`🔗 [${connection.id}] Setting up passive mode...`);
            
            // Create data server
            const dataServer = net.createServer();
            
            return new Promise((resolve, reject) => {
                // Listen on any available port
                dataServer.listen(0, '127.0.0.1', () => {
                    const address = dataServer.address() as net.AddressInfo;
                    const port = address.port;
                    
                    console.log(`📡 [${connection.id}] Data server listening on 127.0.0.1:${port}`);
                    
                    // Store connection info
                    connection.dataConnection = {
                        server: dataServer,
                        port,
                        mode: 'passive'
                    };
                    
                    // Set up connection handler
                    dataServer.on('connection', (socket) => {
                        console.log(`🔌 [${connection.id}] Data connection established!`);
                        connection.dataConnection!.socket = socket;
                    });
                    
                    dataServer.on('error', (error) => {
                        console.error(`❌ [${connection.id}] Data server error:`, error);
                    });
                    
                    // Calculate port bytes for PASV response
                    const p1 = Math.floor(port / 256);
                    const p2 = port % 256;
                    
                    // Send PASV response
                    const response = `227 Entering passive mode (127,0,0,1,${p1},${p2})`;
                    this.sendResponse(connection, 227, `Entering passive mode (127,0,0,1,${p1},${p2})`);
                    
                    console.log(`📋 [${connection.id}] PASV response: ${response}`);
                    console.log(`📋 [${connection.id}] Client should connect to 127.0.0.1:${port}`);
                    
                    resolve();
                });
                
                dataServer.on('error', (error) => {
                    console.error(`❌ [${connection.id}] Failed to create data server:`, error);
                    reject(error);
                });
            });
            
        } catch (error) {
            console.error(`❌ [${connection.id}] PASV error:`, error);
            this.sendResponse(connection, 425, 'Cannot open passive connection');
        }
    }
    
    /**
     * Handle EPSV command
     */
    private async handleEpsv(connection: SimpleConnection): Promise<void> {
        // Similar to PASV but with extended format
        try {
            if (connection.dataConnection?.server) {
                connection.dataConnection.server.close();
            }
            
            console.log(`🔗 [${connection.id}] Setting up extended passive mode...`);
            
            const dataServer = net.createServer();
            
            return new Promise((resolve, reject) => {
                dataServer.listen(0, '127.0.0.1', () => {
                    const address = dataServer.address() as net.AddressInfo;
                    const port = address.port;
                    
                    connection.dataConnection = {
                        server: dataServer,
                        port,
                        mode: 'passive'
                    };
                    
                    dataServer.on('connection', (socket) => {
                        console.log(`🔌 [${connection.id}] Extended data connection established!`);
                        connection.dataConnection!.socket = socket;
                    });
                    
                    this.sendResponse(connection, 229, `Entering extended passive mode (|||${port}|)`);
                    console.log(`📋 [${connection.id}] EPSV on port ${port}`);
                    
                    resolve();
                });
                
                dataServer.on('error', reject);
            });
            
        } catch (error) {
            console.error(`❌ [${connection.id}] EPSV error:`, error);
            this.sendResponse(connection, 425, 'Cannot open extended passive connection');
        }
    }
    
    /**
     * Handle LIST command with random data
     */
    private async handleList(connection: SimpleConnection, path?: string): Promise<void> {
        if (!connection.authenticated) {
            this.sendResponse(connection, 530, 'Please login first');
            return;
        }
        
        if (!connection.dataConnection) {
            this.sendResponse(connection, 425, 'Use PASV first');
            return;
        }
        
        console.log(`📂 [${connection.id}] LIST command for path: ${path || connection.currentPath}`);
        
        // Generate random directory listing
        const files = this.generateRandomFiles(connection.currentPath);
        
        // Format as FTP listing
        const listing = files.map(file => {
            const perms = file.type === 'directory' ? 'drwxr-xr-x' : '-rw-r--r--';
            const size = file.size.toString().padStart(8);
            const date = 'Jan 01 12:00';
            return `${perms} 1 user group ${size} ${date} ${file.name}`;
        }).join('\r\n');
        
        console.log(`📋 [${connection.id}] Generated ${files.length} files for listing`);
        
        try {
            // Wait for data connection
            this.sendResponse(connection, 150, 'Opening data connection');
            
            const dataSocket = await this.waitForDataConnection(connection);
            
            console.log(`📤 [${connection.id}] Sending listing (${listing.length} bytes)`);
            dataSocket.write(listing + '\r\n');
            dataSocket.end();
            
            this.sendResponse(connection, 226, 'Directory listing completed');
            console.log(`✅ [${connection.id}] LIST completed successfully`);
            
        } catch (error) {
            console.error(`❌ [${connection.id}] LIST error:`, error);
            this.sendResponse(connection, 550, 'Directory listing failed');
        }
    }
    
    /**
     * Handle RETR command with random content
     */
    private async handleRetr(connection: SimpleConnection, filename: string): Promise<void> {
        if (!connection.authenticated) {
            this.sendResponse(connection, 530, 'Please login first');
            return;
        }
        
        if (!connection.dataConnection) {
            this.sendResponse(connection, 425, 'Use PASV first');
            return;
        }
        
        console.log(`📥 [${connection.id}] RETR command for: ${filename}`);
        
        // Generate random file content
        const content = this.generateRandomFileContent(filename);
        
        try {
            this.sendResponse(connection, 150, `Opening data connection for ${filename}`);
            
            const dataSocket = await this.waitForDataConnection(connection);
            
            console.log(`📤 [${connection.id}] Sending file content (${content.length} bytes)`);
            dataSocket.write(content);
            dataSocket.end();
            
            this.sendResponse(connection, 226, 'Transfer complete');
            console.log(`✅ [${connection.id}] RETR completed successfully`);
            
        } catch (error) {
            console.error(`❌ [${connection.id}] RETR error:`, error);
            this.sendResponse(connection, 550, 'File transfer failed');
        }
    }
    
    /**
     * Wait for data connection to be established
     */
    private async waitForDataConnection(connection: SimpleConnection, timeout = 10000): Promise<net.Socket> {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new Error(`Data connection timeout after ${timeout}ms`));
            }, timeout);
            
            const checkConnection = () => {
                if (connection.dataConnection?.socket) {
                    clearTimeout(timer);
                    console.log(`🔌 [${connection.id}] Data connection ready!`);
                    resolve(connection.dataConnection.socket);
                } else {
                    console.log(`⏳ [${connection.id}] Waiting for data connection...`);
                    setTimeout(checkConnection, 500);
                }
            };
            
            checkConnection();
        });
    }
    
    /**
     * Generate random files for directory listing
     */
    private generateRandomFiles(path: string): FakeFile[] {
        const files: FakeFile[] = [];
        
        // Always include some directories
        files.push(
            { name: 'documents', type: 'directory', size: 0 },
            { name: 'images', type: 'directory', size: 0 },
            { name: 'data', type: 'directory', size: 0 }
        );
        
        // Add some random files
        const fileNames = ['readme.txt', 'config.json', 'data.csv', 'notes.md', 'script.sh'];
        for (let i = 0; i < 3; i++) {
            const name = fileNames[Math.floor(Math.random() * fileNames.length)];
            const size = Math.floor(Math.random() * 10000) + 100;
            files.push({ name, type: 'file', size });
        }
        
        return files;
    }
    
    /**
     * Generate random file content
     */
    private generateRandomFileContent(filename: string): string {
        if (filename.endsWith('.json')) {
            return JSON.stringify({
                name: 'Random Data',
                value: Math.floor(Math.random() * 1000),
                timestamp: new Date().toISOString()
            }, null, 2);
        } else if (filename.endsWith('.txt')) {
            return `This is random content for ${filename}\nGenerated at: ${new Date().toISOString()}\nRandom number: ${Math.random()}`;
        } else {
            return `Random content for ${filename}\nSize: ${Math.floor(Math.random() * 1000)} bytes`;
        }
    }
    
    /**
     * Simple path resolution
     */
    private resolvePath(currentPath: string, relativePath: string): string {
        if (relativePath.startsWith('/')) {
            return relativePath;
        }
        
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
     * Send FTP response
     */
    private sendResponse(connection: SimpleConnection, code: number, message: string): void {
        const response = `${code} ${message}\r\n`;
        connection.socket.write(response);
        console.log(`📤 [${connection.id}] Response: ${code} ${message}`);
    }
    
    /**
     * Close connection
     */
    private closeConnection(connection: SimpleConnection): void {
        console.log(`🔌 [${connection.id}] Closing connection`);
        
        if (connection.dataConnection?.server) {
            connection.dataConnection.server.close();
        }
        
        connection.socket.destroy();
        this.connections.delete(connection.id);
    }
    
    /**
     * Stop server
     */
    async stop(): Promise<void> {
        return new Promise((resolve) => {
            for (const conn of this.connections.values()) {
                this.closeConnection(conn);
            }
            
            this.server.close(() => {
                console.log('✅ Simple FTP server stopped');
                resolve();
            });
        });
    }
}

// If run directly, start the server
if (import.meta.url === `file://${process.argv[1]}`) {
    const server = new SimpleFtpServer(2122);
    
    server.start().then(() => {
        console.log('Simple FTP server started on port 2122');
        console.log('Test with: lftp localhost:2122');
    }).catch((error) => {
        console.error('Failed to start server:', error);
        process.exit(1);
    });
    
    // Graceful shutdown
    process.on('SIGINT', async () => {
        console.log('\nShutting down...');
        await server.stop();
        process.exit(0);
    });
}