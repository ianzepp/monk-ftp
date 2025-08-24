/**
 * Path Validator - Security and Schema Validation
 * 
 * Provides advanced validation for FTP paths including:
 * - Security validation (path traversal prevention)
 * - Schema existence validation against database
 * - Field validation against schema definitions
 * - Record existence validation
 * - Access control validation
 */

import type { System } from '../lib/system.js';
import type { PathInfo, PathType } from './path-parser.js';
import type { ApiContext } from './api-context.js';
import { FtpPathError } from './path-parser.js';

export interface ValidationResult {
    /** Whether validation passed */
    isValid: boolean;
    
    /** Error message if validation failed */
    error?: string;
    
    /** Error code for specific error types */
    errorCode?: 'SECURITY' | 'SCHEMA_NOT_FOUND' | 'FIELD_NOT_FOUND' | 'RECORD_NOT_FOUND' | 'ACCESS_DENIED';
    
    /** Additional validation metadata */
    metadata?: {
        /** Schema definition if validated */
        schema?: any;
        
        /** Record data if validated */
        record?: any;
        
        /** Available fields for the schema */
        availableFields?: string[];
    };
}

/**
 * Path Validator - Main validation class
 */
export class FtpPathValidator {
    
    /**
     * Validate a path info with full security and database checks
     * 
     * @param pathInfo - Parsed path information to validate
     * @param apiContext - API context for the operation
     * @param system - System instance for database access
     * @returns Validation result
     */
    static async validate(
        pathInfo: PathInfo, 
        apiContext: ApiContext, 
        system: System
    ): Promise<ValidationResult> {
        try {
            // 1. Security validation (synchronous)
            const securityResult = this.validateSecurity(pathInfo);
            if (!securityResult.isValid) {
                return securityResult;
            }
            
            // 2. Schema validation (requires database access)
            if (pathInfo.schema) {
                const schemaResult = await this.validateSchema(pathInfo.schema, system);
                if (!schemaResult.isValid) {
                    return schemaResult;
                }
                
                // 3. Field validation (if field is specified)
                if (pathInfo.field) {
                    const fieldResult = this.validateField(
                        pathInfo.field, 
                        schemaResult.metadata!.schema
                    );
                    if (!fieldResult.isValid) {
                        return fieldResult;
                    }
                }
                
                // 4. Record validation (if record ID is specified)
                if (pathInfo.recordId) {
                    const recordResult = await this.validateRecord(
                        pathInfo.schema, 
                        pathInfo.recordId, 
                        system
                    );
                    if (!recordResult.isValid) {
                        return recordResult;
                    }
                }
            }
            
            // 5. Access control validation
            const accessResult = this.validateAccess(pathInfo, apiContext, system);
            if (!accessResult.isValid) {
                return accessResult;
            }
            
            return { isValid: true };
            
        } catch (error) {
            return {
                isValid: false,
                error: `Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`,
                errorCode: 'SECURITY'
            };
        }
    }
    
    /**
     * Validate path security (path traversal, etc.)
     */
    static validateSecurity(pathInfo: PathInfo): ValidationResult {
        const { originalPath, normalizedPath, segments } = pathInfo;
        
        // Check for suspicious patterns that might indicate path traversal attempts
        const suspiciousPatterns = [
            '../',      // Parent directory traversal
            '..\\',     // Windows-style traversal
            '/..',      // Hidden traversal
            '\\..',     // Windows hidden traversal
            '%2e%2e',   // URL-encoded traversal
            '\\x2e\\x2e', // Hex-encoded traversal
        ];
        
        for (const pattern of suspiciousPatterns) {
            if (originalPath.includes(pattern) || normalizedPath.includes(pattern)) {
                return {
                    isValid: false,
                    error: 'Path traversal attempt detected',
                    errorCode: 'SECURITY'
                };
            }
        }
        
        // Check for null bytes and control characters
        if (/[\x00-\x1f\x7f]/.test(originalPath)) {
            return {
                isValid: false,
                error: 'Path contains invalid control characters',
                errorCode: 'SECURITY'
            };
        }
        
        // Check for excessively long paths
        if (originalPath.length > 4096) {
            return {
                isValid: false,
                error: 'Path too long',
                errorCode: 'SECURITY'
            };
        }
        
        // Check for excessively deep paths
        if (segments.length > 10) {
            return {
                isValid: false,
                error: 'Path too deep',
                errorCode: 'SECURITY'
            };
        }
        
        // Validate individual segments
        for (const segment of segments) {
            if (segment.length === 0) {
                return {
                    isValid: false,
                    error: 'Path contains empty segments',
                    errorCode: 'SECURITY'
                };
            }
            
            if (segment.length > 255) {
                return {
                    isValid: false,
                    error: 'Path segment too long',
                    errorCode: 'SECURITY'
                };
            }
            
            // Check for reserved names (Windows compatibility)
            const reservedNames = ['CON', 'PRN', 'AUX', 'NUL', 'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9', 'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'];
            if (reservedNames.includes(segment.toUpperCase())) {
                return {
                    isValid: false,
                    error: `Reserved system name in path: ${segment}`,
                    errorCode: 'SECURITY'
                };
            }
        }
        
        return { isValid: true };
    }
    
    /**
     * Validate that schema exists in database
     */
    static async validateSchema(schemaName: string, system: System): Promise<ValidationResult> {
        try {
            // Get schema definition from database
            const schemas = await system.database.selectAny('schemas', {
                where: { name: schemaName, trashed_at: null, deleted_at: null }
            });
            
            if (!schemas || schemas.length === 0) {
                return {
                    isValid: false,
                    error: `Schema '${schemaName}' not found`,
                    errorCode: 'SCHEMA_NOT_FOUND'
                };
            }
            
            const schema = schemas[0];
            
            // Parse schema definition
            let schemaDefinition;
            try {
                schemaDefinition = typeof schema.definition === 'string' 
                    ? JSON.parse(schema.definition)
                    : schema.definition;
            } catch (error) {
                return {
                    isValid: false,
                    error: `Invalid schema definition for '${schemaName}'`,
                    errorCode: 'SCHEMA_NOT_FOUND'
                };
            }
            
            return {
                isValid: true,
                metadata: {
                    schema: schemaDefinition,
                    availableFields: Object.keys(schemaDefinition.properties || {})
                }
            };
            
        } catch (error) {
            return {
                isValid: false,
                error: `Database error validating schema: ${error instanceof Error ? error.message : 'Unknown error'}`,
                errorCode: 'SCHEMA_NOT_FOUND'
            };
        }
    }
    
    /**
     * Validate that field exists in schema definition
     */
    static validateField(fieldName: string, schemaDefinition: any): ValidationResult {
        if (!schemaDefinition || !schemaDefinition.properties) {
            return {
                isValid: false,
                error: 'Schema has no field definitions',
                errorCode: 'FIELD_NOT_FOUND'
            };
        }
        
        const properties = schemaDefinition.properties;
        
        if (!properties[fieldName]) {
            const availableFields = Object.keys(properties);
            return {
                isValid: false,
                error: `Field '${fieldName}' not found in schema. Available fields: ${availableFields.join(', ')}`,
                errorCode: 'FIELD_NOT_FOUND',
                metadata: {
                    availableFields
                }
            };
        }
        
        return { isValid: true };
    }
    
    /**
     * Validate that record exists in database
     */
    static async validateRecord(
        schemaName: string, 
        recordId: string, 
        system: System
    ): Promise<ValidationResult> {
        try {
            // Check if record exists in the schema's table
            const records = await system.database.selectAny(schemaName, {
                where: { id: recordId, trashed_at: null, deleted_at: null },
                limit: 1
            });
            
            if (!records || records.length === 0) {
                return {
                    isValid: false,
                    error: `Record '${recordId}' not found in schema '${schemaName}'`,
                    errorCode: 'RECORD_NOT_FOUND'
                };
            }
            
            return {
                isValid: true,
                metadata: {
                    record: records[0]
                }
            };
            
        } catch (error) {
            // If table doesn't exist, it means schema exists but has no data
            if (error instanceof Error && error.message.includes('does not exist')) {
                return {
                    isValid: false,
                    error: `No data table found for schema '${schemaName}'`,
                    errorCode: 'RECORD_NOT_FOUND'
                };
            }
            
            return {
                isValid: false,
                error: `Database error validating record: ${error instanceof Error ? error.message : 'Unknown error'}`,
                errorCode: 'RECORD_NOT_FOUND'
            };
        }
    }
    
    /**
     * Validate access control based on user permissions
     */
    static validateAccess(
        pathInfo: PathInfo, 
        apiContext: ApiContext, 
        system: System
    ): ValidationResult {
        const user = system.getUser();
        
        // Root users have full access
        if (system.isRoot()) {
            return { isValid: true };
        }
        
        // Check schema-level access for data operations
        if (pathInfo.schema && !apiContext.isMetaOperation) {
            const hasAccess = this.checkSchemaAccess(
                pathInfo.schema, 
                apiContext.operation, 
                user
            );
            
            if (!hasAccess) {
                return {
                    isValid: false,
                    error: `Access denied for ${apiContext.operation} operation on schema '${pathInfo.schema}'`,
                    errorCode: 'ACCESS_DENIED'
                };
            }
        }
        
        // Meta operations require read access for now
        if (apiContext.isMetaOperation && apiContext.operation !== 'read' && apiContext.operation !== 'list') {
            return {
                isValid: false,
                error: 'Write operations on meta schemas not permitted',
                errorCode: 'ACCESS_DENIED'
            };
        }
        
        return { isValid: true };
    }
    
    /**
     * Check schema-level access permissions
     */
    private static checkSchemaAccess(
        schemaName: string,
        operation: string,
        user: any
    ): boolean {
        // For now, implement basic role-based access
        // Future: Implement field-level and record-level ACLs
        
        const { accessRead, accessEdit, accessFull } = user;
        
        switch (operation) {
            case 'list':
            case 'read':
                return accessRead.includes(schemaName) || 
                       accessEdit.includes(schemaName) || 
                       accessFull.includes(schemaName);
                
            case 'write':
                return accessEdit.includes(schemaName) || 
                       accessFull.includes(schemaName);
                
            case 'delete':
                return accessFull.includes(schemaName);
                
            default:
                return false;
        }
    }
}

/**
 * Schema Cache for validation performance
 */
export class SchemaValidationCache {
    private static cache = new Map<string, any>();
    private static ttl = 5 * 60 * 1000; // 5 minutes TTL
    
    /**
     * Get cached schema definition
     */
    static get(schemaName: string): any | null {
        const cached = this.cache.get(schemaName);
        if (!cached) return null;
        
        // Check TTL
        if (Date.now() - cached.timestamp > this.ttl) {
            this.cache.delete(schemaName);
            return null;
        }
        
        return cached.data;
    }
    
    /**
     * Cache schema definition
     */
    static set(schemaName: string, schemaDefinition: any): void {
        this.cache.set(schemaName, {
            data: schemaDefinition,
            timestamp: Date.now()
        });
    }
    
    /**
     * Clear cache
     */
    static clear(): void {
        this.cache.clear();
    }
    
    /**
     * Clear specific schema from cache
     */
    static delete(schemaName: string): void {
        this.cache.delete(schemaName);
    }
}