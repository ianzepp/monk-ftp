#!/usr/bin/env node

import { MinimalFtpServer } from './ftp/ftp-server.js';

/**
 * Monk FTP Server CLI - Standalone FTP Server
 * 
 * This script starts the Monk FTP server as a standalone service.
 * The FTP server provides filesystem-like access to API data using
 * JWT authentication tokens.
 * 
 * Usage:
 *   npm run ftp:start        # Start FTP server
 *   npm run ftp:dev          # Start FTP server in watch mode
 * 
 * Environment Variables:
 *   FTP_PORT=2121            # FTP server port (default: 2121)
 *   FTP_HOST=localhost       # FTP server host (default: localhost)
 *   JWT_SECRET=secret        # JWT secret for token validation
 *   DB_HOST=localhost        # Database host
 *   DB_PORT=5432             # Database port
 *   DB_USER=postgres         # Database user
 * 
 * Authentication:
 *   Username: api-user (or tenant-specific)
 *   Password: <JWT-token-from-monk-auth>
 */

async function startFtpServer() {
    console.log('🚀 Starting Monk FTP Server...');
    console.log('=====================================');
    
    // Get configuration from environment
    const ftpPort = Number(process.env.FTP_PORT) || 2121;
    const ftpHost = process.env.FTP_HOST || 'localhost';
    
    console.log(`📡 FTP Server Configuration:`);
    console.log(`   Host: ${ftpHost}`);
    console.log(`   Port: ${ftpPort}`);
    console.log(`   Authentication: JWT tokens`);
    console.log('');
    
    try {
        // Create and start minimal FTP server
        const ftpServer = new MinimalFtpServer(ftpPort);
        
        // Start the server
        await ftpServer.start();
        
        console.log('✅ FTP Server started successfully!');
        console.log('');
        console.log('📋 Connection Instructions:');
        console.log(`   FTP URL: ftp://${ftpHost}:${ftpPort}`);
        console.log('   Username: api-user');
        console.log('   Password: <your-jwt-token>');
        console.log('');
        console.log('💡 To get JWT token:');
        console.log('   1. monk auth login <tenant> <user>');
        console.log('   2. Use the JWT token as FTP password');
        console.log('');
        console.log('🔌 Example FTP clients:');
        console.log(`   lftp -u "api-user,<JWT_TOKEN>" ${ftpHost}:${ftpPort}`);
        console.log(`   ftp ${ftpHost} ${ftpPort}`);
        console.log('');
        console.log('🗂️  Directory Structure:');
        console.log('   /data/               - Data operations');
        console.log('   /data/account/       - Account records');
        console.log('   /data/account/123/   - Record fields');
        console.log('   /meta/schema/        - Schema definitions');
        console.log('');
        
        // Handle graceful shutdown
        const shutdown = async () => {
            console.log('');
            console.log('🛑 Shutting down FTP server...');
            try {
                await ftpServer.stop();
                console.log('✅ FTP server stopped gracefully');
                process.exit(0);
            } catch (error) {
                console.error('❌ Error during FTP server shutdown:', error);
                process.exit(1);
            }
        };
        
        // Handle process signals
        process.on('SIGINT', shutdown);   // Ctrl+C
        process.on('SIGTERM', shutdown);  // Kill signal
        process.on('SIGHUP', shutdown);   // Terminal closed
        
        // Keep process alive
        process.on('uncaughtException', (error) => {
            console.error('❌ Uncaught exception in FTP server:', error);
            shutdown();
        });
        
        process.on('unhandledRejection', (reason, promise) => {
            console.error('❌ Unhandled rejection in FTP server:', reason);
            shutdown();
        });
        
    } catch (error) {
        console.error('❌ Failed to start FTP server:', error);
        process.exit(1);
    }
}

// Only run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    startFtpServer().catch((error) => {
        console.error('❌ FTP server startup failed:', error);
        process.exit(1);
    });
}

export { startFtpServer };