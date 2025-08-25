/**
 * Fake monk-api Server for Testing
 * 
 * Implements the /ftp/* endpoints from monk-api/docs/FTP.md
 * for independent monk-ftp testing without requiring full monk-api setup.
 */

import * as http from 'http';
import { URL } from 'url';

interface FakeApiConfig {
    port: number;
    host: string;
    debug: boolean;
}

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

interface FtpListResponse {
    success: boolean;
    entries: FtpListEntry[];
    pattern_info?: {
        complexity: string;
        cache_hit: boolean;
        query_time_ms: number;
    };
}

interface FtpStoreResponse {
    success: boolean;
    operation: 'create' | 'update';
    result: {
        record_id: string;
        size: number;
        created: boolean;
        validation_passed: boolean;
    };
    ftp_metadata: {
        modified_time: string;
        permissions: string;
        etag: string;
        content_type: string;
    };
}

interface FtpDeleteResponse {
    success: boolean;
    operation: 'soft_delete' | 'hard_delete' | 'field_clear';
    result: {
        record_id?: string;
        field?: string;
        deleted: boolean;
    };
}

interface FtpRetrieveResponse {
    success: boolean;
    content: any;
    content_type: string;
    size: number;
    ftp_metadata: {
        modified_time: string;
        permissions: string;
        etag: string;
    };
}

export class FakeMonkApi {
    private server: http.Server;
    private fakeDataStore: Map<string, any>;

    constructor(private config: FakeApiConfig) {
        this.server = http.createServer(this.handleRequest.bind(this));
        this.fakeDataStore = this.initializeFakeData();
    }

    async start(): Promise<void> {
        return new Promise((resolve) => {
            this.server.listen(this.config.port, this.config.host, () => {
                console.log(`🎭 Fake monk-api server running on ${this.config.host}:${this.config.port}`);
                console.log(`   Available endpoints: /ftp/list, /ftp/store, /ftp/delete, /ftp/retrieve`);
                resolve();
            });
        });
    }

    async stop(): Promise<void> {
        return new Promise((resolve) => {
            this.server.close(() => {
                console.log('🎭 Fake monk-api server stopped');
                resolve();
            });
        });
    }

    private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
        try {
            const url = new URL(req.url!, `http://${req.headers.host}`);
            const method = req.method;
            
            if (this.config.debug) {
                console.log(`🎭 ${method} ${url.pathname}`);
            }

            // Parse request body for POST requests
            let body: any = {};
            if (method === 'POST') {
                body = await this.parseRequestBody(req);
                if (this.config.debug) {
                    console.log(`🎭 Request body:`, JSON.stringify(body, null, 2));
                }
            }

            // Route to appropriate handler
            if (url.pathname === '/ftp/list' && method === 'POST') {
                await this.handleFtpList(req, res, body);
            } else if (url.pathname === '/ftp/store' && method === 'POST') {
                await this.handleFtpStore(req, res, body);
            } else if (url.pathname === '/ftp/delete' && method === 'POST') {
                await this.handleFtpDelete(req, res, body);
            } else if (url.pathname === '/ftp/retrieve' && method === 'POST') {
                await this.handleFtpRetrieve(req, res, body);
            } else if (url.pathname === '/health' && method === 'GET') {
                this.sendJsonResponse(res, 200, { status: 'ok', server: 'fake-monk-api' });
            } else {
                this.sendJsonResponse(res, 404, { error: 'Endpoint not found' });
            }

        } catch (error) {
            console.error('🎭 Request error:', error);
            this.sendJsonResponse(res, 500, { error: 'Internal server error' });
        }
    }

    private async handleFtpList(req: http.IncomingMessage, res: http.ServerResponse, body: any): Promise<void> {
        const { path, ftp_options = {} } = body;
        
        if (!this.isAuthenticated(req)) {
            this.sendJsonResponse(res, 401, { error: 'Authentication required' });
            return;
        }

        const entries = this.getFakeListEntries(path, ftp_options);
        
        const response: FtpListResponse = {
            success: true,
            entries,
            pattern_info: {
                complexity: 'simple',
                cache_hit: false,
                query_time_ms: Math.random() * 50
            }
        };

        this.sendJsonResponse(res, 200, response);
    }

    private async handleFtpStore(req: http.IncomingMessage, res: http.ServerResponse, body: any): Promise<void> {
        const { path, content, ftp_options = {} } = body;
        
        if (!this.isAuthenticated(req)) {
            this.sendJsonResponse(res, 401, { error: 'Authentication required' });
            return;
        }

        // Store content in fake data store
        this.fakeDataStore.set(path, content);

        const recordId = this.extractRecordIdFromPath(path);
        const response: FtpStoreResponse = {
            success: true,
            operation: this.fakeDataStore.has(path) ? 'update' : 'create',
            result: {
                record_id: recordId,
                size: JSON.stringify(content).length,
                created: !this.fakeDataStore.has(path),
                validation_passed: true
            },
            ftp_metadata: {
                modified_time: this.getCurrentTimestamp(),
                permissions: 'rwx',
                etag: Math.random().toString(36).substr(2, 12),
                content_type: 'application/json'
            }
        };

        this.sendJsonResponse(res, 200, response);
    }

    private async handleFtpDelete(req: http.IncomingMessage, res: http.ServerResponse, body: any): Promise<void> {
        const { path, ftp_options = {} } = body;
        
        if (!this.isAuthenticated(req)) {
            this.sendJsonResponse(res, 401, { error: 'Authentication required' });
            return;
        }

        const recordId = this.extractRecordIdFromPath(path);
        const isField = path.includes('/') && !path.endsWith('.json');
        
        // Remove from fake data store
        this.fakeDataStore.delete(path);

        const response: FtpDeleteResponse = {
            success: true,
            operation: ftp_options.permanent ? 'hard_delete' : 'soft_delete',
            result: {
                record_id: recordId,
                field: isField ? path.split('/').pop() : undefined,
                deleted: true
            }
        };

        this.sendJsonResponse(res, 200, response);
    }

    private async handleFtpRetrieve(req: http.IncomingMessage, res: http.ServerResponse, body: any): Promise<void> {
        const { path, ftp_options = {} } = body;
        
        if (!this.isAuthenticated(req)) {
            this.sendJsonResponse(res, 401, { error: 'Authentication required' });
            return;
        }

        const content = this.fakeDataStore.get(path) || this.generateFakeContent(path);

        const response: FtpRetrieveResponse = {
            success: true,
            content,
            content_type: 'application/json',
            size: JSON.stringify(content).length,
            ftp_metadata: {
                modified_time: this.getCurrentTimestamp(),
                permissions: 'rwx',
                etag: Math.random().toString(36).substr(2, 12)
            }
        };

        this.sendJsonResponse(res, 200, response);
    }

    private initializeFakeData(): Map<string, any> {
        const data = new Map();
        
        // Fake users data
        data.set('/data/users/user-123.json', {
            id: 'user-123',
            name: 'John Doe',
            email: 'john@example.com',
            created_at: '2024-01-01T00:00:00Z'
        });
        
        data.set('/data/users/user-456.json', {
            id: 'user-456', 
            name: 'Jane Smith',
            email: 'jane@example.com',
            created_at: '2024-01-02T00:00:00Z'
        });

        // Fake accounts data
        data.set('/data/accounts/acc-789.json', {
            id: 'acc-789',
            name: 'Test Account',
            type: 'business',
            created_at: '2024-01-03T00:00:00Z'
        });

        return data;
    }

    private getFakeListEntries(path: string, options: any): FtpListEntry[] {
        const now = this.getCurrentTimestamp();
        
        switch (path) {
            case '/':
            case '/data/':
                return [
                    {
                        name: 'users',
                        ftp_type: 'd',
                        ftp_size: 0,
                        ftp_permissions: 'rwx',
                        ftp_modified: now,
                        path: '/data/users/',
                        api_context: { access_level: 'full' }
                    },
                    {
                        name: 'accounts', 
                        ftp_type: 'd',
                        ftp_size: 0,
                        ftp_permissions: 'rwx',
                        ftp_modified: now,
                        path: '/data/accounts/',
                        api_context: { access_level: 'full' }
                    }
                ];

            case '/data/users/':
                return [
                    {
                        name: 'user-123',
                        ftp_type: 'd',
                        ftp_size: 0,
                        ftp_permissions: 'rwx',
                        ftp_modified: now,
                        path: '/data/users/user-123/',
                        api_context: { schema: 'users', record_id: 'user-123', access_level: 'full' }
                    },
                    {
                        name: 'user-456',
                        ftp_type: 'd',
                        ftp_size: 0,
                        ftp_permissions: 'rwx', 
                        ftp_modified: now,
                        path: '/data/users/user-456/',
                        api_context: { schema: 'users', record_id: 'user-456', access_level: 'full' }
                    }
                ];

            case '/data/users/user-123/':
                return [
                    {
                        name: 'id',
                        ftp_type: 'f',
                        ftp_size: 36,
                        ftp_permissions: 'rw-',
                        ftp_modified: now,
                        path: '/data/users/user-123/id',
                        api_context: { schema: 'users', record_id: 'user-123', access_level: 'read' }
                    },
                    {
                        name: 'name',
                        ftp_type: 'f',
                        ftp_size: 8,
                        ftp_permissions: 'rw-',
                        ftp_modified: now,
                        path: '/data/users/user-123/name',
                        api_context: { schema: 'users', record_id: 'user-123', access_level: 'edit' }
                    },
                    {
                        name: 'user-123.json',
                        ftp_type: 'f',
                        ftp_size: 256,
                        ftp_permissions: 'rw-',
                        ftp_modified: now,
                        path: '/data/users/user-123.json',
                        api_context: { schema: 'users', record_id: 'user-123', access_level: 'full' }
                    }
                ];

            default:
                return [];
        }
    }

    private generateFakeContent(path: string): any {
        if (path.endsWith('.json')) {
            const recordId = this.extractRecordIdFromPath(path);
            return {
                id: recordId,
                name: `Fake User ${recordId}`,
                email: `${recordId}@example.com`,
                created_at: '2024-01-01T00:00:00Z'
            };
        } else {
            // Individual field
            const field = path.split('/').pop();
            switch (field) {
                case 'id': return path.split('/').slice(-2, -1)[0];
                case 'name': return 'Fake User Name';
                case 'email': return 'fake@example.com';
                default: return `Fake value for ${field}`;
            }
        }
    }

    private extractRecordIdFromPath(path: string): string {
        const parts = path.split('/').filter(p => p.length > 0);
        // Look for UUID-like patterns or use a default
        const possibleId = parts.find(p => p.includes('-') || p.length > 10);
        return possibleId || 'fake-record-id';
    }

    private getCurrentTimestamp(): string {
        const now = new Date();
        return now.getFullYear() +
            (now.getMonth() + 1).toString().padStart(2, '0') +
            now.getDate().toString().padStart(2, '0') +
            now.getHours().toString().padStart(2, '0') +
            now.getMinutes().toString().padStart(2, '0') +
            now.getSeconds().toString().padStart(2, '0');
    }

    private isAuthenticated(req: http.IncomingMessage): boolean {
        const auth = req.headers.authorization;
        if (!auth || !auth.startsWith('Bearer ')) {
            return false;
        }

        const token = auth.substring(7);
        // Simple fake JWT validation - just check if it has 3 parts
        const parts = token.split('.');
        return parts.length === 3;
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
}

// CLI interface for starting the fake server
export async function startFakeMonkApi(port = 9001, host = 'localhost'): Promise<FakeMonkApi> {
    const server = new FakeMonkApi({
        port,
        host,
        debug: process.env.NODE_ENV === 'development'
    });
    
    await server.start();
    return server;
}

// Start server if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
    startFakeMonkApi().catch((error) => {
        console.error('❌ Failed to start fake monk-api:', error);
        process.exit(1);
    });
}