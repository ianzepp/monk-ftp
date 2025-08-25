/**
 * HTTP client for monk-api /ftp/* endpoints
 */

export class MonkApiClient {
    constructor(private baseUrl: string, private debug: boolean = false) {}

    async callFtpEndpoint(endpoint: string, payload: any, jwtToken: string): Promise<any> {
        const url = `${this.baseUrl}/ftp/${endpoint}`;
        
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
        return this.callFtpEndpoint('list', { path, ftp_options: options }, jwtToken);
    }

    async store(path: string, content: any, options: any, jwtToken: string): Promise<any> {
        return this.callFtpEndpoint('store', { path, content, ftp_options: options }, jwtToken);
    }

    async retrieve(path: string, options: any, jwtToken: string): Promise<any> {
        return this.callFtpEndpoint('retrieve', { path, ftp_options: options }, jwtToken);
    }

    async delete(path: string, options: any, jwtToken: string): Promise<any> {
        return this.callFtpEndpoint('delete', { path, ftp_options: options }, jwtToken);
    }

    async stat(path: string, jwtToken: string): Promise<any> {
        return this.callFtpEndpoint('stat', { path }, jwtToken);
    }
}