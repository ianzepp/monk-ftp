/**
 * Filesystem-based Fake monk-api Server
 * 
 * Uses real filesystem data in spec/test-data/ to provide realistic
 * responses for /ftp/* endpoints with basic wildcard processing.
 */

import * as http from 'http';
import * as fs from 'fs/promises';
import * as path from 'path';
import { URL } from 'url';

interface FtpListEntry {
    name: string;
    ftp_type: 'd' | 'f' | 'l';
    ftp_size: number;
    ftp_permissions: string;
    ftp_modified: string;
    path: string;
    api_context: {
        schema?: string;
        record_id?: string;
        access_level: string;
    };
}

export class FilesystemFakeApi {
    private server: http.Server;
    private dataPath: string;

    constructor(private config: { port: number; host: string; debug: boolean }) {
        this.server = http.createServer(this.handleRequest.bind(this));
        this.dataPath = path.join(process.cwd(), 'spec/test-data');
    }

    async start(): Promise<void> {
        return new Promise((resolve) => {
            this.server.listen(this.config.port, this.config.host, () => {
                console.log(`🎭 Filesystem Fake API running on ${this.config.host}:${this.config.port}`);
                console.log(`📁 Using test data from: ${this.dataPath}`);
                resolve();
            });
        });
    }

    async stop(): Promise<void> {
        return new Promise((resolve) => {
            this.server.close(() => {
                console.log('🎭 Filesystem Fake API stopped');
                resolve();
            });
        });
    }

    private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
        try {
            const url = new URL(req.url!, `http://${req.headers.host}`);
            
            if (this.config.debug) {
                console.log(`🎭 ${req.method} ${url.pathname}`);
            }

            // Parse request body for POST requests
            let body: any = {};
            if (req.method === 'POST') {
                body = await this.parseRequestBody(req);
            }

            // Route requests
            if (url.pathname === '/ftp/list' && req.method === 'POST') {
                await this.handleFtpList(req, res, body);
            } else if (url.pathname === '/ftp/store' && req.method === 'POST') {
                await this.handleFtpStore(req, res, body);
            } else if (url.pathname === '/ftp/retrieve' && req.method === 'POST') {
                await this.handleFtpRetrieve(req, res, body);
            } else if (url.pathname === '/ftp/delete' && req.method === 'POST') {
                await this.handleFtpDelete(req, res, body);
            } else if (url.pathname === '/ftp/stat' && req.method === 'POST') {
                await this.handleFtpStat(req, res, body);
            } else if (url.pathname === '/ftp/append' && req.method === 'POST') {
                await this.handleFtpAppend(req, res, body);
            } else if (url.pathname === '/health' && req.method === 'GET') {
                this.sendJsonResponse(res, 200, { status: 'ok', server: 'filesystem-fake-api' });
            } else {
                this.sendJsonResponse(res, 404, { error: 'Endpoint not found' });
            }

        } catch (error) {
            console.error('🎭 Request error:', error);
            this.sendJsonResponse(res, 500, { error: 'Internal server error' });
        }
    }

    private async handleFtpList(req: http.IncomingMessage, res: http.ServerResponse, body: any): Promise<void> {
        const { path: ftpPath, ftp_options = {} } = body;
        
        if (!this.isAuthenticated(req)) {
            this.sendJsonResponse(res, 401, { error: 'Authentication required' });
            return;
        }

        try {
            const entries = await this.listPath(ftpPath);
            
            this.sendJsonResponse(res, 200, {
                success: true,
                entries,
                pattern_info: {
                    complexity: 'simple',
                    cache_hit: false,
                    query_time_ms: Math.random() * 10
                }
            });
        } catch (error) {
            this.sendJsonResponse(res, 404, { 
                success: false, 
                error: error instanceof Error ? error.message : 'Path not found' 
            });
        }
    }

    private async handleFtpRetrieve(req: http.IncomingMessage, res: http.ServerResponse, body: any): Promise<void> {
        const { path: ftpPath } = body;
        
        if (!this.isAuthenticated(req)) {
            this.sendJsonResponse(res, 401, { error: 'Authentication required' });
            return;
        }

        try {
            const content = await this.retrieveFile(ftpPath);
            
            this.sendJsonResponse(res, 200, {
                success: true,
                content,
                content_type: ftpPath.endsWith('.json') ? 'application/json' : 'text/plain',
                size: JSON.stringify(content).length,
                ftp_metadata: {
                    modified_time: this.getCurrentTimestamp(),
                    permissions: 'rw-',
                    etag: Math.random().toString(36).substr(2, 12)
                }
            });
        } catch (error) {
            this.sendJsonResponse(res, 404, { 
                success: false, 
                error: error instanceof Error ? error.message : 'File not found' 
            });
        }
    }

    private async handleFtpStore(req: http.IncomingMessage, res: http.ServerResponse, body: any): Promise<void> {
        const { path: ftpPath, content } = body;
        
        if (!this.isAuthenticated(req)) {
            this.sendJsonResponse(res, 401, { error: 'Authentication required' });
            return;
        }

        try {
            await this.storeFile(ftpPath, content);
            
            this.sendJsonResponse(res, 200, {
                success: true,
                operation: 'create',
                result: {
                    record_id: this.extractRecordId(ftpPath),
                    size: JSON.stringify(content).length,
                    created: true,
                    validation_passed: true
                },
                ftp_metadata: {
                    modified_time: this.getCurrentTimestamp(),
                    permissions: 'rw-',
                    etag: Math.random().toString(36).substr(2, 12),
                    content_type: 'application/json'
                }
            });
        } catch (error) {
            this.sendJsonResponse(res, 500, { 
                success: false, 
                error: error instanceof Error ? error.message : 'Store failed' 
            });
        }
    }

    private async handleFtpAppend(req: http.IncomingMessage, res: http.ServerResponse, body: any): Promise<void> {
        const { path: ftpPath, content } = body;
        
        if (!this.isAuthenticated(req)) {
            this.sendJsonResponse(res, 401, { error: 'Authentication required' });
            return;
        }

        try {
            await this.appendToFile(ftpPath, content);
            
            this.sendJsonResponse(res, 200, {
                success: true,
                operation: 'append',
                result: {
                    record_id: this.extractRecordId(ftpPath),
                    appended: true,
                    validation_passed: true
                },
                ftp_metadata: {
                    modified_time: this.getCurrentTimestamp(),
                    permissions: 'rw-',
                    etag: Math.random().toString(36).substr(2, 12)
                }
            });
        } catch (error) {
            this.sendJsonResponse(res, 500, { 
                success: false, 
                error: error instanceof Error ? error.message : 'Append failed' 
            });
        }
    }

    private async handleFtpDelete(req: http.IncomingMessage, res: http.ServerResponse, body: any): Promise<void> {
        const { path: ftpPath } = body;
        
        if (!this.isAuthenticated(req)) {
            this.sendJsonResponse(res, 401, { error: 'Authentication required' });
            return;
        }

        this.sendJsonResponse(res, 200, {
            success: true,
            operation: 'soft_delete',
            result: {
                record_id: this.extractRecordId(ftpPath),
                deleted: true
            }
        });
    }

    private async listPath(ftpPath: string): Promise<FtpListEntry[]> {
        const fsPath = this.ftpPathToFilesystem(ftpPath);
        const fullPath = path.join(this.dataPath, fsPath);

        try {
            const stats = await fs.stat(fullPath);
            
            if (stats.isDirectory()) {
                const entries = await fs.readdir(fullPath);
                const results: FtpListEntry[] = [];

                for (const entry of entries) {
                    const entryPath = path.join(fullPath, entry);
                    const entryStats = await fs.stat(entryPath);
                    
                    results.push({
                        name: entry,
                        ftp_type: entryStats.isDirectory() ? 'd' : 'f',
                        ftp_size: entryStats.isFile() ? entryStats.size : 0,
                        ftp_permissions: entryStats.isDirectory() ? 'rwx' : 'rw-',
                        ftp_modified: this.dateToFtpTimestamp(entryStats.mtime),
                        path: `${ftpPath}${entry}${entryStats.isDirectory() ? '/' : ''}`,
                        api_context: this.generateApiContext(ftpPath, entry)
                    });
                }
                
                return results.sort((a, b) => a.name.localeCompare(b.name));
            } else {
                throw new Error('Not a directory');
            }
        } catch (error) {
            throw new Error(`Directory not found: ${ftpPath}`);
        }
    }

    private async retrieveFile(ftpPath: string): Promise<any> {
        const fsPath = this.ftpPathToFilesystem(ftpPath);
        const fullPath = path.join(this.dataPath, fsPath);

        try {
            if (ftpPath.endsWith('.json')) {
                // Complete record
                const content = await fs.readFile(fullPath, 'utf-8');
                return JSON.parse(content);
            } else {
                // Individual field
                const content = await fs.readFile(fullPath, 'utf-8');
                return content.trim();
            }
        } catch (error) {
            throw new Error(`File not found: ${ftpPath}`);
        }
    }

    private async storeFile(ftpPath: string, content: any): Promise<void> {
        const fsPath = this.ftpPathToFilesystem(ftpPath);
        const fullPath = path.join(this.dataPath, fsPath);

        // Ensure directory exists
        await fs.mkdir(path.dirname(fullPath), { recursive: true });

        if (ftpPath.endsWith('.json')) {
            // Complete record
            await fs.writeFile(fullPath, JSON.stringify(content, null, 2));
        } else {
            // Individual field
            await fs.writeFile(fullPath, String(content));
        }
    }

    private async appendToFile(ftpPath: string, content: any): Promise<void> {
        const fsPath = this.ftpPathToFilesystem(ftpPath);
        const fullPath = path.join(this.dataPath, fsPath);

        if (ftpPath.endsWith('.json')) {
            // For JSON files, append is more complex - would need to merge objects
            // For now, just append the content as string (simplified)
            const existingContent = await fs.readFile(fullPath, 'utf-8').catch(() => '{}');
            const newContent = existingContent.trimEnd() + '\n' + JSON.stringify(content, null, 2);
            await fs.writeFile(fullPath, newContent);
        } else {
            // Individual field - append content
            await fs.appendFile(fullPath, String(content));
        }
    }

    private ftpPathToFilesystem(ftpPath: string): string {
        // Remove leading slash and normalize
        return ftpPath.startsWith('/') ? ftpPath.substring(1) : ftpPath;
    }

    private generateApiContext(basePath: string, entryName: string): any {
        const pathParts = basePath.split('/').filter(p => p.length > 0);
        
        if (pathParts.length >= 2 && pathParts[0] === 'data') {
            const schema = pathParts[1];
            
            if (entryName.includes('-') && (entryName.includes('.json') || !entryName.includes('.'))) {
                // Record entry
                const recordId = entryName.replace('.json', '');
                return {
                    schema,
                    record_id: recordId,
                    access_level: 'full'
                };
            } else if (pathParts.length >= 3) {
                // Field entry
                return {
                    schema,
                    record_id: pathParts[2],
                    access_level: 'edit'
                };
            }
        }
        
        return { access_level: 'read' };
    }

    private extractRecordId(ftpPath: string): string {
        const parts = ftpPath.split('/');
        const recordPart = parts.find(p => p.includes('-') && p.length > 10);
        return recordPart?.replace('.json', '') || 'unknown';
    }

    private dateToFtpTimestamp(date: Date): string {
        return date.getFullYear() +
            (date.getMonth() + 1).toString().padStart(2, '0') +
            date.getDate().toString().padStart(2, '0') +
            date.getHours().toString().padStart(2, '0') +
            date.getMinutes().toString().padStart(2, '0') +
            date.getSeconds().toString().padStart(2, '0');
    }

    private getCurrentTimestamp(): string {
        return this.dateToFtpTimestamp(new Date());
    }

    private isAuthenticated(req: http.IncomingMessage): boolean {
        const auth = req.headers.authorization;
        if (!auth || !auth.startsWith('Bearer ')) {
            return false;
        }
        const token = auth.substring(7);
        return token.split('.').length === 3;
    }

    private async parseRequestBody(req: http.IncomingMessage): Promise<any> {
        return new Promise((resolve, reject) => {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', () => {
                try {
                    resolve(body ? JSON.parse(body) : {});
                } catch (error) {
                    reject(new Error('Invalid JSON'));
                }
            });
        });
    }

    private sendJsonResponse(res: http.ServerResponse, statusCode: number, data: any): void {
        res.writeHead(statusCode, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization'
        });
        res.end(JSON.stringify(data, null, 2));
        
        if (this.config.debug) {
            console.log(`🎭 Response ${statusCode}:`, JSON.stringify(data, null, 2));
        }
    }

    private async handleFtpStat(req: http.IncomingMessage, res: http.ServerResponse, body: any): Promise<void> {
        const { path: ftpPath } = body;
        
        if (!this.isAuthenticated(req)) {
            this.sendJsonResponse(res, 401, { error: 'Authentication required' });
            return;
        }

        try {
            const statInfo = await this.getFileSystemStat(ftpPath);
            this.sendJsonResponse(res, 200, statInfo);
        } catch (error) {
            this.sendJsonResponse(res, 404, { 
                success: false, 
                error: error instanceof Error ? error.message : 'Path not found' 
            });
        }
    }

    private async getFileSystemStat(ftpPath: string): Promise<any> {
        const fsPath = this.ftpPathToFilesystem(ftpPath);
        const fullPath = path.join(this.dataPath, fsPath);

        try {
            const stats = await fs.stat(fullPath);
            
            // Parse path to understand what we're looking at
            const pathParts = ftpPath.split('/').filter(p => p.length > 0);
            const isSchema = pathParts.length === 2 && pathParts[0] === 'data';
            const isRecord = pathParts.length === 3 && pathParts[0] === 'data';
            const isField = pathParts.length === 4 && pathParts[0] === 'data';
            
            const response = {
                success: true,
                path: ftpPath,
                type: stats.isDirectory() ? 'directory' : 'file',
                permissions: stats.isDirectory() ? 'rwx' : 'rw-',
                size: stats.size,
                modified_time: this.dateToFtpTimestamp(stats.mtime),
                created_time: this.dateToFtpTimestamp(stats.birthtime || stats.mtime),
                access_time: this.dateToFtpTimestamp(stats.atime),
                record_info: {
                    schema: isSchema || isRecord || isField ? pathParts[1] : undefined,
                    record_id: isRecord || isField ? pathParts[2] : undefined,
                    field_name: isField ? pathParts[3] : undefined,
                    soft_deleted: false,
                    access_permissions: ['read', 'edit', 'full']
                }
            };

            // Add directory-specific information
            if (stats.isDirectory()) {
                try {
                    const entries = await fs.readdir(fullPath);
                    response.children_count = entries.length;
                    
                    // Calculate total size for directories
                    let totalSize = 0;
                    for (const entry of entries) {
                        try {
                            const entryStats = await fs.stat(path.join(fullPath, entry));
                            totalSize += entryStats.size;
                        } catch {
                            // Skip entries we can't stat
                        }
                    }
                    response.total_size = totalSize;
                } catch {
                    response.children_count = 0;
                    response.total_size = 0;
                }
            }

            // Add field count for record directories
            if (isRecord && stats.isDirectory()) {
                try {
                    const recordJsonPath = path.join(fullPath, `../${pathParts[2]}.json`);
                    const recordContent = await fs.readFile(recordJsonPath, 'utf-8');
                    const recordData = JSON.parse(recordContent);
                    response.record_info.field_count = Object.keys(recordData).length;
                } catch {
                    response.record_info.field_count = 0;
                }
            }

            return response;
            
        } catch (error) {
            throw new Error(`Path not found: ${ftpPath}`);
        }
    }
}

// CLI interface
export async function startFilesystemFakeApi(port = 9001, host = 'localhost'): Promise<FilesystemFakeApi> {
    const server = new FilesystemFakeApi({
        port,
        host,
        debug: process.env.NODE_ENV === 'development'
    });
    
    await server.start();
    return server;
}

// Start server if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
    startFilesystemFakeApi().catch((error) => {
        console.error('❌ Failed to start filesystem fake API:', error);
        process.exit(1);
    });
}