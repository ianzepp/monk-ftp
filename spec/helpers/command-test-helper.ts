/**
 * Helper utilities for testing FTP commands
 */

import type { FtpConnection } from '@src/lib/types.js';
import * as net from 'net';

export interface MockFtpConnection extends FtpConnection {
    responses: string[];
}

/**
 * Create a mock FTP connection for testing commands
 */
export function createMockConnection(overrides: Partial<FtpConnection> = {}): MockFtpConnection {
    const responses: string[] = [];
    
    // Mock socket that captures written responses
    const mockSocket = {
        write: (data: string) => {
            responses.push(data);
        },
        destroy: () => {},
        end: () => {}
    } as any;

    const connection: MockFtpConnection = {
        socket: mockSocket,
        id: 'test-connection',
        authenticated: true,
        currentPath: '/',
        jwtToken: 'fake.jwt.token',
        responses,
        ...overrides
    };

    return connection;
}

/**
 * Extract FTP response code and message from response string
 */
export function parseFtpResponse(response: string): { code: number; message: string } {
    const match = response.match(/^(\d{3})\s+(.+)$/m);
    if (match) {
        return {
            code: parseInt(match[1]),
            message: match[2].replace(/\r?\n$/, '')
        };
    }
    throw new Error(`Invalid FTP response format: ${response}`);
}

/**
 * Extract all responses from mock connection
 */
export function getResponses(connection: MockFtpConnection): Array<{ code: number; message: string }> {
    return connection.responses.map(response => parseFtpResponse(response));
}

/**
 * Get the last response from mock connection
 */
export function getLastResponse(connection: MockFtpConnection): { code: number; message: string } {
    if (connection.responses.length === 0) {
        throw new Error('No responses recorded');
    }
    return parseFtpResponse(connection.responses[connection.responses.length - 1]);
}

/**
 * Mock API client for testing commands that need API integration
 */
export class MockApiClient {
    private mockResponses = new Map<string, any>();
    public callLog: Array<{ endpoint: string; payload: any }> = [];

    setMockResponse(endpoint: string, response: any): void {
        this.mockResponses.set(endpoint, response);
    }

    async callFtpEndpoint(endpoint: string, payload: any, jwtToken: string): Promise<any> {
        this.callLog.push({ endpoint, payload });
        
        const mockResponse = this.mockResponses.get(endpoint);
        if (mockResponse) {
            return mockResponse;
        }
        
        // Default successful response
        return { success: true };
    }

    async stat(path: string, jwtToken: string): Promise<any> {
        return this.callFtpEndpoint('stat', { path }, jwtToken);
    }

    async list(path: string, options: any, jwtToken: string): Promise<any> {
        return this.callFtpEndpoint('list', { path, ftp_options: options }, jwtToken);
    }
}

/**
 * Create a command instance with mock API client for testing
 */
export function createTestCommand<T>(
    CommandClass: new (apiUrl: string, debug: boolean) => T,
    mockApiResponses: Record<string, any> = {}
): { command: T; mockApi: MockApiClient } {
    const mockApi = new MockApiClient();
    
    // Set up mock responses
    Object.entries(mockApiResponses).forEach(([endpoint, response]) => {
        mockApi.setMockResponse(endpoint, response);
    });

    // Create command with mock API
    const command = new CommandClass('http://fake-api', false);
    
    // Replace API client with mock
    (command as any).apiClient = mockApi;
    
    return { command, mockApi };
}