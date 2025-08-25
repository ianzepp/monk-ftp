#!/usr/bin/env node

/**
 * Monk FTP Proxy CLI - Start the FTP protocol proxy server
 */

import { MonkFtpProxyServer } from './ftp-proxy-server.js';

async function main() {
    const ftpPort = Number(process.env.FTP_PORT) || 2121;
    const ftpHost = process.env.FTP_HOST || 'localhost';
    const apiUrl = process.env.MONK_API_URL || 'http://localhost:9001';
    
    console.log('🚀 Starting Monk FTP Proxy Server...');
    console.log('====================================');
    console.log(`FTP Port: ${ftpHost}:${ftpPort}`);
    console.log(`Monk API: ${apiUrl}`);
    console.log('');
    
    const server = new MonkFtpProxyServer({
        port: ftpPort,
        host: ftpHost,
        apiUrl: apiUrl
    });
    
    // Handle graceful shutdown
    process.on('SIGINT', async () => {
        console.log('\n🛑 Shutting down FTP proxy...');
        await server.stop();
        process.exit(0);
    });
    
    try {
        await server.start();
        console.log('✅ FTP Proxy ready for connections!');
        console.log('');
        console.log('Test connection:');
        console.log(`  ftp ${ftpHost} ${ftpPort}`);
        console.log('  username: root');
        console.log('  password: <your-jwt-token>');
        console.log('');
        
    } catch (error) {
        console.error('❌ Failed to start FTP proxy:', error);
        process.exit(1);
    }
}

main().catch(console.error);