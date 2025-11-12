import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { FakeMonkApi } from '@spec/helpers/fake-monk-api.js';

describe('Fake monk-api server', () => {
    let fakeApi: FakeMonkApi;
    const apiPort = 9002; // Use different port to avoid conflicts

    beforeAll(async () => {
        fakeApi = new FakeMonkApi({
            port: apiPort,
            host: 'localhost',
            debug: false
        });
        await fakeApi.start();
    });

    afterAll(async () => {
        if (fakeApi) {
            await fakeApi.stop();
        }
    });

    test('should respond to health check', async () => {
        const response = await fetch(`http://localhost:${apiPort}/health`);
        const data = await response.json();
        
        expect(response.status).toBe(200);
        expect(data.status).toBe('ok');
        expect(data.server).toBe('fake-monk-api');
    });

    test('should handle /api/file/list endpoint', async () => {
        const response = await fetch(`http://localhost:${apiPort}/api/file/list`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer fake.jwt.token'
            },
            body: JSON.stringify({
                path: '/data/users/',
                file_options: {
                    show_hidden: false,
                    long_format: true
                }
            })
        });

        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.success).toBe(true);
        expect(data.entries).toBeDefined();
        expect(Array.isArray(data.entries)).toBe(true);
        expect(data.entries.length).toBeGreaterThan(0);

        // Check entry structure matches File API spec
        const entry = data.entries[0];
        expect(entry).toHaveProperty('name');
        expect(entry).toHaveProperty('file_type');
        expect(entry).toHaveProperty('file_size');
        expect(entry).toHaveProperty('file_permissions');
        expect(entry).toHaveProperty('file_modified');
        expect(entry).toHaveProperty('api_context');
    });

    test('should handle /api/file/store endpoint', async () => {
        const response = await fetch(`http://localhost:${apiPort}/api/file/store`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer fake.jwt.token'
            },
            body: JSON.stringify({
                path: '/data/users/test-user.json',
                content: {
                    id: 'test-user',
                    name: 'Test User',
                    email: 'test@example.com'
                },
                file_options: {
                    atomic: true,
                    overwrite: true
                }
            })
        });

        const data = await response.json();

        expect(response.status).toBe(201);
        expect(data.success).toBe(true);
        expect(data.operation).toMatch(/create|update/);
        expect(data.result).toHaveProperty('record_id');
        expect(data.file_metadata).toHaveProperty('modified_time');
    });

    test('should require authentication', async () => {
        const response = await fetch(`http://localhost:${apiPort}/api/file/list`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
                // No Authorization header
            },
            body: JSON.stringify({
                path: '/data/'
            })
        });

        expect(response.status).toBe(401);
        const data = await response.json();
        expect(data.error).toBe('Authentication required');
    });

    test('should handle 404 for unknown endpoints', async () => {
        const response = await fetch(`http://localhost:${apiPort}/unknown`, {
            method: 'GET'
        });

        expect(response.status).toBe(404);
        const data = await response.json();
        expect(data.error).toBe('Endpoint not found');
    });
});