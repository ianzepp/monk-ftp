/**
 * monk-ftp - FTP Protocol Server for monk-api Integration
 * 
 * Main entry point that sets up the FTP server with command dispatch
 * to individual command handlers.
 */

import { FtpServer } from './lib/ftp-server.js';

interface ServerConfig {
    port: number;
    host: string;
    apiUrl: string;
    debug: boolean;
}

async function createServer(): Promise<FtpServer> {
    const config: ServerConfig = {
        port: parseInt(process.env.FTP_PORT || '2121'),
        host: process.env.FTP_HOST || 'localhost',
        apiUrl: process.env.MONK_API_URL || 'http://localhost:9001',
        debug: process.env.NODE_ENV === 'development'
    };

    return new FtpServer(config);
}

export async function main(): Promise<void> {
    console.log('🚀 monk-ftp server starting...');
    
    try {
        const server = await createServer();
        await server.start();
        
        console.log('✅ monk-ftp server ready');
        
        // Graceful shutdown handling
        process.on('SIGINT', async () => {
            console.log('\n📡 Received SIGINT, shutting down gracefully...');
            await server.stop();
            process.exit(0);
        });
        
        process.on('SIGTERM', async () => {
            console.log('\n📡 Received SIGTERM, shutting down gracefully...');
            await server.stop();
            process.exit(0);
        });
        
    } catch (error) {
        console.error('❌ Failed to start monk-ftp server:', error);
        process.exit(1);
    }
}

// Start server if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch((error) => {
        console.error('❌ monk-ftp startup error:', error);
        process.exit(1);
    });
}