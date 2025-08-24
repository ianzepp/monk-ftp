/**
 * API Context Translation - FTP to Database Operations
 * 
 * Translates parsed FTP path information into API operation context.
 * Maps FTP operations (LIST, RETR, STOR, DELE) to database operations
 * (read, write, delete) with proper parameters.
 */

import type { PathInfo, PathType } from './path-parser.js';

export type ApiOperation = 'list' | 'read' | 'write' | 'delete';
export type FtpOperation = 'LIST' | 'RETR' | 'STOR' | 'DELE' | 'SIZE' | 'MDTM';

export interface ApiContext {
    /** Database operation to perform */
    operation: ApiOperation;
    
    /** Schema name for data operations */
    schema?: string;
    
    /** Record ID for specific record operations */
    recordId?: string;
    
    /** Field name for field-specific operations */
    field?: string;
    
    /** Whether this is a complete record operation (JSON file) */
    isCompleteRecord: boolean;
    
    /** Whether this is a meta operation (schema definitions) */
    isMetaOperation: boolean;
    
    /** Whether this operation returns multiple items (directory listing) */
    isListOperation: boolean;
    
    /** Additional context for the operation */
    metadata: {
        /** Original FTP path */
        ftpPath: string;
        
        /** FTP operation that triggered this */
        ftpOperation: FtpOperation;
        
        /** Path type being accessed */
        pathType: PathType;
        
        /** Expected content type for response */
        contentType: string;
        
        /** Whether operation should be allowed */
        isReadOnly: boolean;
    };
}

/**
 * Custom error for API context translation
 */
export class ApiContextError extends Error {
    constructor(
        message: string,
        public readonly ftpOperation: FtpOperation,
        public readonly pathInfo: PathInfo,
        public readonly reason: string
    ) {
        super(`API context error: ${message}`);
        this.name = 'ApiContextError';
    }
}

/**
 * API Context Builder - Translates path info to API operations
 */
export class ApiContextBuilder {
    
    /**
     * Build API context from path info and FTP operation
     * 
     * @param pathInfo - Parsed path information
     * @param ftpOperation - FTP operation being performed
     * @returns API context for database operations
     */
    static fromPath(pathInfo: PathInfo, ftpOperation: FtpOperation): ApiContext {
        // Validate that the FTP operation is compatible with the path type
        this.validateOperationCompatibility(pathInfo, ftpOperation);
        
        // Map FTP operation to API operation
        const apiOperation = this.mapFtpToApiOperation(ftpOperation, pathInfo);
        
        // Build base context
        const context: ApiContext = {
            operation: apiOperation,
            schema: pathInfo.schema,
            recordId: pathInfo.recordId,
            field: pathInfo.field,
            isCompleteRecord: pathInfo.type === 'complete-record',
            isMetaOperation: this.isMetaPathType(pathInfo.type),
            isListOperation: pathInfo.isDirectory,
            metadata: {
                ftpPath: pathInfo.originalPath,
                ftpOperation,
                pathType: pathInfo.type,
                contentType: this.getContentType(pathInfo),
                isReadOnly: this.isReadOnlyOperation(ftpOperation, pathInfo)
            }
        };
        
        return context;
    }
    
    /**
     * Map FTP operation to API operation based on path context
     */
    private static mapFtpToApiOperation(ftpOperation: FtpOperation, pathInfo: PathInfo): ApiOperation {
        switch (ftpOperation) {
            case 'LIST':
                return 'list';
                
            case 'RETR':
            case 'SIZE':
            case 'MDTM':
                return 'read';
                
            case 'STOR':
                return 'write';
                
            case 'DELE':
                return 'delete';
                
            default:
                throw new ApiContextError(
                    `Unsupported FTP operation: ${ftpOperation}`,
                    ftpOperation,
                    pathInfo,
                    'FTP operation not implemented'
                );
        }
    }
    
    /**
     * Validate that FTP operation is compatible with path type
     */
    private static validateOperationCompatibility(pathInfo: PathInfo, ftpOperation: FtpOperation): void {
        const { type, isDirectory } = pathInfo;
        
        // LIST operations only work on directories
        if (ftpOperation === 'LIST' && !isDirectory) {
            throw new ApiContextError(
                'LIST operation on non-directory path',
                ftpOperation,
                pathInfo,
                'Cannot list files in a non-directory path'
            );
        }
        
        // File operations (RETR, STOR, DELE, SIZE, MDTM) only work on files
        const fileOperations: FtpOperation[] = ['RETR', 'STOR', 'DELE', 'SIZE', 'MDTM'];
        if (fileOperations.includes(ftpOperation) && isDirectory) {
            throw new ApiContextError(
                `${ftpOperation} operation on directory path`,
                ftpOperation,
                pathInfo,
                'File operations cannot be performed on directories'
            );
        }
        
        // Root directory operations
        if (type === 'root') {
            if (ftpOperation !== 'LIST') {
                throw new ApiContextError(
                    'Invalid operation on root directory',
                    ftpOperation,
                    pathInfo,
                    'Only LIST operations allowed on root directory'
                );
            }
        }
        
        // Meta operations validation
        if (this.isMetaPathType(type)) {
            // Meta schema files are read-only for now
            if (type === 'meta-schema' && ['STOR', 'DELE'].includes(ftpOperation)) {
                throw new ApiContextError(
                    'Write operations not supported on meta schemas',
                    ftpOperation,
                    pathInfo,
                    'Schema modification via FTP not yet implemented'
                );
            }
        }
        
        // Data operations validation
        if (this.isDataPathType(type)) {
            // Record fields and complete records support all operations
            // Directory operations (data-root, schema-records, record-fields) only support LIST
            if (isDirectory && ftpOperation !== 'LIST') {
                throw new ApiContextError(
                    'Invalid operation on data directory',
                    ftpOperation,
                    pathInfo,
                    'Only LIST operations allowed on data directories'
                );
            }
        }
    }
    
    /**
     * Determine content type based on path info
     */
    private static getContentType(pathInfo: PathInfo): string {
        switch (pathInfo.type) {
            case 'complete-record':
                return 'application/json';
                
            case 'meta-schema':
                return 'application/x-yaml';
                
            case 'record-field':
                return 'text/plain'; // Field values are typically text
                
            case 'root':
            case 'data-root':
            case 'meta-root':
            case 'schema-records':
            case 'record-fields':
            case 'meta-schemas':
            case 'files-root':
                return 'text/plain'; // Directory listings as text
                
            default:
                return 'application/octet-stream';
        }
    }
    
    /**
     * Determine if operation should be read-only
     */
    private static isReadOnlyOperation(ftpOperation: FtpOperation, pathInfo: PathInfo): boolean {
        // Meta operations are currently read-only
        if (this.isMetaPathType(pathInfo.type)) {
            return true;
        }
        
        // Files operations are not implemented yet
        if (pathInfo.type === 'files-root') {
            return true;
        }
        
        // Read operations are always read-only
        const readOperations: FtpOperation[] = ['LIST', 'RETR', 'SIZE', 'MDTM'];
        return readOperations.includes(ftpOperation);
    }
    
    /**
     * Check if path type is a meta operation
     */
    private static isMetaPathType(type: PathType): boolean {
        const metaTypes: PathType[] = ['meta-root', 'meta-schemas', 'meta-schema'];
        return metaTypes.includes(type);
    }
    
    /**
     * Check if path type is a data operation
     */
    private static isDataPathType(type: PathType): boolean {
        const dataTypes: PathType[] = [
            'data-root', 
            'schema-records', 
            'record-fields', 
            'record-field', 
            'complete-record'
        ];
        return dataTypes.includes(type);
    }
}

/**
 * API Context Validator - Additional validation for API contexts
 */
export class ApiContextValidator {
    
    /**
     * Validate API context against System capabilities
     * 
     * @param context - API context to validate
     * @returns Whether the context is valid
     */
    static validate(context: ApiContext): boolean {
        // Validate that required fields are present for the operation
        switch (context.operation) {
            case 'list':
                return this.validateListContext(context);
                
            case 'read':
                return this.validateReadContext(context);
                
            case 'write':
                return this.validateWriteContext(context);
                
            case 'delete':
                return this.validateDeleteContext(context);
                
            default:
                return false;
        }
    }
    
    /**
     * Validate list operation context
     */
    private static validateListContext(context: ApiContext): boolean {
        // List operations should be on directories
        if (!context.isListOperation) {
            return false;
        }
        
        // Schema listing requires schema name
        if (context.metadata.pathType === 'schema-records' && !context.schema) {
            return false;
        }
        
        // Record fields listing requires schema and record ID
        if (context.metadata.pathType === 'record-fields') {
            return !!(context.schema && context.recordId);
        }
        
        return true;
    }
    
    /**
     * Validate read operation context
     */
    private static validateReadContext(context: ApiContext): boolean {
        // Read operations should be on files
        if (context.isListOperation) {
            return false;
        }
        
        // Field reads require schema, record ID, and field name
        if (context.metadata.pathType === 'record-field') {
            return !!(context.schema && context.recordId && context.field);
        }
        
        // Complete record reads require schema and record ID
        if (context.metadata.pathType === 'complete-record') {
            return !!(context.schema && context.recordId);
        }
        
        // Meta schema reads require schema name
        if (context.metadata.pathType === 'meta-schema') {
            return !!context.schema;
        }
        
        return true;
    }
    
    /**
     * Validate write operation context
     */
    private static validateWriteContext(context: ApiContext): boolean {
        // Write operations should be on files
        if (context.isListOperation) {
            return false;
        }
        
        // Meta operations are read-only for now
        if (context.isMetaOperation) {
            return false;
        }
        
        // Field writes require schema, record ID, and field name
        if (context.metadata.pathType === 'record-field') {
            return !!(context.schema && context.recordId && context.field);
        }
        
        // Complete record writes require schema and record ID
        if (context.metadata.pathType === 'complete-record') {
            return !!(context.schema && context.recordId);
        }
        
        return true;
    }
    
    /**
     * Validate delete operation context
     */
    private static validateDeleteContext(context: ApiContext): boolean {
        // Delete operations should be on files
        if (context.isListOperation) {
            return false;
        }
        
        // Meta operations are read-only for now
        if (context.isMetaOperation) {
            return false;
        }
        
        // Field deletes require schema, record ID, and field name
        if (context.metadata.pathType === 'record-field') {
            return !!(context.schema && context.recordId && context.field);
        }
        
        // Complete record deletes require schema and record ID
        if (context.metadata.pathType === 'complete-record') {
            return !!(context.schema && context.recordId);
        }
        
        return true;
    }
}