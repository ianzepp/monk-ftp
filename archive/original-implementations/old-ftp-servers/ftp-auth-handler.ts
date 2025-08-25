import type { Context } from 'hono';
import { AuthService, type JWTPayload } from '../lib/auth.js';
import { System } from '../lib/system.js';
import { DatabaseManager } from '../lib/database-manager.js';

/**
 * FTP Authentication Handler
 * 
 * Bridges FTP authentication to the existing JWT authentication system.
 * Maps FTP login credentials to JWT tokens for secure API access.
 * 
 * Authentication Flow:
 * 1. FTP client provides username and JWT token as password
 * 2. Validate JWT token signature and expiration
 * 3. Create System instance with database context from JWT
 * 4. Return System context for FTP connection operations
 */
export class FtpAuthHandler {
    
    /**
     * Validate FTP login credentials against JWT authentication system
     * 
     * @param username - FTP username (can be api-user or domain-specific)  
     * @param password - JWT token string
     * @returns System instance for authenticated connection or null if invalid
     */
    async validateLogin(username: string, password: string): Promise<System | null> {
        try {
            // Password should be a JWT token
            const jwtPayload = await this.validateJwtToken(password);
            
            if (!jwtPayload) {
                console.log(`FTP auth failed: Invalid JWT token for user ${username}`);
                return null;
            }
            
            // Create System context from validated JWT
            const system = await this.createSystemContext(jwtPayload);
            
            if (!system) {
                console.log(`FTP auth failed: Could not create system context for user ${username}`);
                return null;
            }
            
            console.log(`FTP auth success: ${username} authenticated for tenant ${jwtPayload.tenant}`);
            return system;
            
        } catch (error) {
            console.error(`FTP authentication error for user ${username}:`, error);
            return null;
        }
    }
    
    /**
     * Validate JWT token using existing auth infrastructure
     * 
     * @param token - JWT token string
     * @returns Decoded JWT payload or null if invalid
     */
    private async validateJwtToken(token: string): Promise<JWTPayload | null> {
        try {
            const payload = await AuthService.verifyToken(token);
            
            // Check token expiration
            const now = Math.floor(Date.now() / 1000);
            if (payload.exp && payload.exp < now) {
                console.log('FTP auth failed: JWT token expired');
                return null;
            }
            
            // Validate required JWT fields
            if (!payload.tenant || !payload.database) {
                console.log('FTP auth failed: JWT missing required tenant/database fields');
                return null;
            }
            
            return payload;
            
        } catch (error) {
            console.error('JWT validation error:', error);
            return null;
        }
    }
    
    /**
     * Create System context from validated JWT payload
     * 
     * @param jwtPayload - Validated JWT payload
     * @returns System instance with proper database context
     */
    private async createSystemContext(jwtPayload: JWTPayload): Promise<System | null> {
        try {
            // Create mock Hono context for System initialization
            // This simulates the context that would be created by HTTP middleware
            const mockContext = this.createMockContext(jwtPayload);
            
            // Get database connection for the tenant
            const database = await DatabaseManager.getDatabaseForDomain(jwtPayload.database);
            if (!database) {
                console.error(`FTP auth failed: Could not connect to database ${jwtPayload.database}`);
                return null;
            }
            
            // Set database context in mock context (simulates middleware behavior)
            mockContext.set('database', database);
            mockContext.set('databaseDomain', jwtPayload.database);
            
            // Create System instance with mock context
            const system = new System(mockContext);
            
            return system;
            
        } catch (error) {
            console.error('System context creation error:', error);
            return null;
        }
    }
    
    /**
     * Create mock Hono context from JWT payload
     * Simulates the context that would be created by HTTP authentication middleware
     * 
     * @param payload - JWT payload with user/tenant information
     * @returns Mock context with required auth properties
     */
    private createMockContext(payload: JWTPayload): Context {
        // Use a proper Map for storage
        const storage = new Map();
        
        const mockContext = {
            // Mock get/set methods for context variables
            get: function(key: string) {
                return storage.get(key);
            },
            
            set: function(key: string, value: any) {
                storage.set(key, value);
                return this;
            }
        } as unknown as Context;
        
        // Set auth context variables (simulates getUserContextMiddleware behavior)
        mockContext.set('jwtPayload', payload);
        mockContext.set('userId', payload.sub);
        mockContext.set('userDomain', payload.database);
        mockContext.set('userRole', payload.access || 'user');
        mockContext.set('accessReadIds', payload.access_read || []);
        mockContext.set('accessEditIds', payload.access_edit || []);
        mockContext.set('accessFullIds', payload.access_full || []);
        
        // Set user object for compatibility
        mockContext.set('user', {
            id: payload.sub,
            user_id: payload.user_id,
            tenant: payload.tenant,
            database: payload.database,
            access: payload.access,
            access_read: payload.access_read || [],
            access_edit: payload.access_edit || [],
            access_full: payload.access_full || [],
            is_active: true
        });
        
        return mockContext;
    }
    
    /**
     * Create system context for authenticated FTP connection
     * Used by custom FTP protocol server for database operations
     * 
     * @param system - Authenticated System instance
     * @returns System instance for FTP connection operations
     */
    createConnectionContext(system: System): System {
        // With custom FTP protocol, we don't need temporary directories
        // Just return the authenticated System instance for database operations
        const user = system.getUser();
        console.log(`🔗 FTP connection context created for tenant: ${user.domain}`);
        
        return system;
    }
}