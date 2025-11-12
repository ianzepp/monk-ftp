/**
 * Fake monk-api Server for Testing
 *
 * Implements the /api/file/* endpoints from monk-api File API docs
 * for independent monk-ftp testing without requiring full monk-api setup.
 */

import * as http from 'http';
import { URL } from 'url';

interface FakeApiConfig {
    port: number;
    host: string;
    debug: boolean;
}

interface FileListEntry {
    name: string;
    file_type: 'd' | 'f' | 'l';
    file_size: number;
    file_permissions: string;
    file_modified: string;
    path: string;
    api_context: {
        schema?: string;
        record_id?: string;
        access_level: string;
    };
}

interface FileListResponse {
    success: boolean;
    entries: FileListEntry[];
    file_metadata?: {
        path: string;
        type: string;
        permissions: string;
        size: number;
        modified_time: string;
    };
}

interface FileStoreResponse {
    success: boolean;
    operation: 'create' | 'update';
    result: {
        record_id: string;
        created: boolean;
        updated: boolean;
        validation_passed: boolean;
    };
    file_metadata: {
        path: string;
        type: string;
        permissions: string;
        size: number;
        modified_time: string;
        content_type: string;
        etag: string;
    };
}

interface FileDeleteResponse {
    success: boolean;
    operation: 'soft_delete' | 'permanent_delete' | 'field_delete';
    results: {
        deleted_count: number;
        paths: string[];
        records_affected: string[];
    };
    file_metadata?: {
        can_restore: boolean;
        restore_deadline?: string;
    };
}

interface FileRetrieveResponse {
    success: boolean;
    content: any;
    file_metadata: {
        size: number;
        modified_time: string;
        content_type: string;
        can_resume: boolean;
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
                console.log(`   Available endpoints: /api/file/list, /api/file/store, /api/file/delete, /api/file/retrieve`);
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
            if (url.pathname === '/api/file/list' && method === 'POST') {
                await this.handleFileList(req, res, body);
            } else if (url.pathname === '/api/file/store' && method === 'POST') {
                await this.handleFileStore(req, res, body);
            } else if (url.pathname === '/api/file/delete' && method === 'POST') {
                await this.handleFileDelete(req, res, body);
            } else if (url.pathname === '/api/file/retrieve' && method === 'POST') {
                await this.handleFileRetrieve(req, res, body);
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

    private async handleFileList(req: http.IncomingMessage, res: http.ServerResponse, body: any): Promise<void> {
        const { path, file_options = {} } = body;

        if (!this.isAuthenticated(req)) {
            this.sendJsonResponse(res, 401, { error: 'Authentication required' });
            return;
        }

        const entries = this.getFakeListEntries(path, file_options);

        const response: FileListResponse = {
            success: true,
            entries,
            file_metadata: {
                path: path,
                type: 'directory',
                permissions: 'r-x',
                size: 0,
                modified_time: this.getCurrentTimestamp()
            }
        };

        this.sendJsonResponse(res, 200, response);
    }

    private async handleFileStore(req: http.IncomingMessage, res: http.ServerResponse, body: any): Promise<void> {
        const { path, content, file_options = {} } = body;

        if (!this.isAuthenticated(req)) {
            this.sendJsonResponse(res, 401, { error: 'Authentication required' });
            return;
        }

        const existed = this.fakeDataStore.has(path);

        // Store content in fake data store
        this.fakeDataStore.set(path, content);

        const recordId = this.extractRecordIdFromPath(path);
        const response: FileStoreResponse = {
            success: true,
            operation: existed ? 'update' : 'create',
            result: {
                record_id: recordId,
                created: !existed,
                updated: existed,
                validation_passed: true
            },
            file_metadata: {
                path: path,
                type: 'file',
                permissions: 'rwx',
                size: JSON.stringify(content).length,
                modified_time: this.getCurrentTimestamp(),
                content_type: 'application/json',
                etag: Math.random().toString(36).substr(2, 12)
            }
        };

        this.sendJsonResponse(res, 201, response);
    }

    private async handleFileDelete(req: http.IncomingMessage, res: http.ServerResponse, body: any): Promise<void> {
        const { path, file_options = {} } = body;

        if (!this.isAuthenticated(req)) {
            this.sendJsonResponse(res, 401, { error: 'Authentication required' });
            return;
        }

        const recordId = this.extractRecordIdFromPath(path);
        const isField = path.includes('/') && !path.endsWith('.json');

        // Remove from fake data store
        this.fakeDataStore.delete(path);

        const response: FileDeleteResponse = {
            success: true,
            operation: file_options.permanent ? 'permanent_delete' : 'soft_delete',
            results: {
                deleted_count: 1,
                paths: [path],
                records_affected: [recordId]
            },
            file_metadata: {
                can_restore: !file_options.permanent,
                restore_deadline: file_options.permanent ? undefined : '2025-01-01T12:00:00Z'
            }
        };

        this.sendJsonResponse(res, 200, response);
    }

    private async handleFileRetrieve(req: http.IncomingMessage, res: http.ServerResponse, body: any): Promise<void> {
        const { path, file_options = {} } = body;

        if (!this.isAuthenticated(req)) {
            this.sendJsonResponse(res, 401, { error: 'Authentication required' });
            return;
        }

        const content = this.fakeDataStore.get(path) || this.generateFakeContent(path);

        const response: FileRetrieveResponse = {
            success: true,
            content,
            file_metadata: {
                size: JSON.stringify(content).length,
                modified_time: this.getCurrentTimestamp(),
                content_type: 'application/json',
                can_resume: false,
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

    private getFakeListEntries(path: string, options: any): FileListEntry[] {
        const now = this.getCurrentTimestamp();

        switch (path) {
            case '/':
            case '/data/':
                return [
                    {
                        name: 'users',
                        file_type: 'd',
                        file_size: 0,
                        file_permissions: 'rwx',
                        file_modified: now,
                        path: '/data/users/',
                        api_context: { access_level: 'full' }
                    },
                    {
                        name: 'accounts',
                        file_type: 'd',
                        file_size: 0,
                        file_permissions: 'rwx',
                        file_modified: now,
                        path: '/data/accounts/',
                        api_context: { access_level: 'full' }
                    }
                ];

            case '/data/users/':
                return [
                    {
                        name: 'user-123',
                        file_type: 'd',
                        file_size: 0,
                        file_permissions: 'rwx',
                        file_modified: now,
                        path: '/data/users/user-123/',
                        api_context: { schema: 'users', record_id: 'user-123', access_level: 'full' }
                    },
                    {
                        name: 'user-456',
                        file_type: 'd',
                        file_size: 0,
                        file_permissions: 'rwx',
                        file_modified: now,
                        path: '/data/users/user-456/',
                        api_context: { schema: 'users', record_id: 'user-456', access_level: 'full' }
                    }
                ];

            case '/data/users/user-123/':
                return [
                    {
                        name: 'id',
                        file_type: 'f',
                        file_size: 36,
                        file_permissions: 'rw-',
                        file_modified: now,
                        path: '/data/users/user-123/id',
                        api_context: { schema: 'users', record_id: 'user-123', access_level: 'read' }
                    },
                    {
                        name: 'name',
                        file_type: 'f',
                        file_size: 8,
                        file_permissions: 'rw-',
                        file_modified: now,
                        path: '/data/users/user-123/name',
                        api_context: { schema: 'users', record_id: 'user-123', access_level: 'edit' }
                    },
                    {
                        name: 'user-123.json',
                        file_type: 'f',
                        file_size: 256,
                        file_permissions: 'rw-',
                        file_modified: now,
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