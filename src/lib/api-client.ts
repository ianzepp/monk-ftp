/**
 * HTTP client for monk-api /api/file/* endpoints
 */

export class MonkApiClient {
    constructor(private baseUrl: string, private debug: boolean = false) {}

    async callFileEndpoint(endpoint: string, payload: any, jwtToken: string): Promise<any> {
        const url = `${this.baseUrl}/api/file/${endpoint}`;
        
        if (this.debug) {
            console.log(`🌐 API Call: POST ${url}`);
            console.log(`🌐 Payload:`, JSON.stringify(payload, null, 2));
        }

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${jwtToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error(`API call failed: ${response.status} ${response.statusText}`);
        }

        const result = await response.json();
        
        if (this.debug) {
            console.log(`🌐 Response:`, JSON.stringify(result, null, 2));
        }

        return result;
    }

    async list(path: string, options: any, jwtToken: string): Promise<any> {
        return this.callFileEndpoint('list', { path, file_options: options }, jwtToken);
    }

    async store(path: string, content: any, options: any, jwtToken: string): Promise<any> {
        return this.callFileEndpoint('store', { path, content, file_options: options }, jwtToken);
    }

    async retrieve(path: string, options: any, jwtToken: string): Promise<any> {
        return this.callFileEndpoint('retrieve', { path, file_options: options }, jwtToken);
    }

    async delete(path: string, options: any, jwtToken: string): Promise<any> {
        return this.callFileEndpoint('delete', { path, file_options: options }, jwtToken);
    }

    async stat(path: string, jwtToken: string): Promise<any> {
        return this.callFileEndpoint('stat', { path }, jwtToken);
    }

    async append(path: string, content: any, options: any, jwtToken: string): Promise<any> {
        // APPEND is now handled via STORE with append_mode option
        return this.callFileEndpoint('store', { path, content, file_options: { ...options, append_mode: true } }, jwtToken);
    }

    async size(path: string, jwtToken: string): Promise<any> {
        return this.callFileEndpoint('size', { path }, jwtToken);
    }

    async modifyTime(path: string, jwtToken: string): Promise<any> {
        return this.callFileEndpoint('modify-time', { path }, jwtToken);
    }
}