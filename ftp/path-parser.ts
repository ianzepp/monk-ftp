/**
 * FTP Path Parser - Filesystem to Database Mapping
 * 
 * Translates FTP filesystem paths to database operations context.
 * Works within the authenticated tenant's context - tenant is determined
 * by JWT authentication, not by path selection.
 * 
 * Path Structure (within authenticated tenant):
 * /                                - Root directory (tenant's data)
 * /data/                          - Data operations root
 * /data/<schema>/                 - Schema records listing
 * /data/<schema>/<id>/            - Individual record fields
 * /data/<schema>/<id>/<field>     - Individual field value
 * /data/<schema>/<id>/<id>.json   - Complete record JSON
 * /meta/                          - Meta operations root  
 * /meta/schema/                   - Schema definitions
 * /meta/schema/<name>             - Individual schema YAML
 * /files/                         - Future: File attachments
 */

export type PathType = 
    | 'root'              // /
    | 'data-root'         // /data/
    | 'schema-records'    // /data/<schema>/
    | 'record-fields'     // /data/<schema>/<id>/
    | 'record-field'      // /data/<schema>/<id>/<field>
    | 'complete-record'   // /data/<schema>/<id>/<id>.json
    | 'meta-root'         // /meta/
    | 'meta-schemas'      // /meta/schema/
    | 'meta-schema'       // /meta/schema/<name>
    | 'files-root';       // /files/ (future)

export interface PathInfo {
    /** Type of path being accessed */
    type: PathType;
    
    /** Original FTP path */
    originalPath: string;
    
    /** Normalized path (no trailing slash, resolved) */
    normalizedPath: string;
    
    /** Schema name for data operations */
    schema?: string;
    
    /** Record ID for specific record operations */
    recordId?: string;
    
    /** Field name for field-specific operations */
    field?: string;
    
    /** File name if accessing as file */
    fileName?: string;
    
    /** Whether this represents a directory (for LIST operations) */
    isDirectory: boolean;
    
    /** Path segments for easy traversal */
    segments: string[];
}

/**
 * Custom error class for path parsing errors
 */
export class FtpPathError extends Error {
    constructor(
        message: string,
        public readonly path: string,
        public readonly reason: string,
        public readonly code: 'INVALID_PATH' | 'SECURITY_VIOLATION' | 'NOT_FOUND' | 'ACCESS_DENIED' = 'INVALID_PATH'
    ) {
        super(`Path error: ${message} (${path})`);
        this.name = 'FtpPathError';
    }
}

/**
 * FTP Path Parser - Core parsing and validation logic
 */
export class FtpPathParser {
    
    /**
     * Parse an FTP path into structured path information
     * 
     * Works within authenticated tenant context - no tenant selection in paths.
     * Tenant/domain context comes from JWT authentication.
     * 
     * @param ftpPath - The FTP path to parse (e.g., "/data/users/123/name")
     * @returns Structured path information
     */
    static parse(ftpPath: string): PathInfo {
        // Normalize the path - remove trailing slashes, resolve . and ..
        const normalizedPath = this.normalizePath(ftpPath);
        
        // Security check - prevent path traversal attacks
        this.validatePathSecurity(normalizedPath);
        
        // Split into segments, removing empty segments
        const segments = normalizedPath.split('/').filter(segment => segment.length > 0);
        
        // Create base path info
        let pathInfo: PathInfo = {
            type: 'root',
            originalPath: ftpPath,
            normalizedPath,
            segments,
            isDirectory: true, // Will be updated based on path type
        };
        
        // Parse based on segments
        if (segments.length === 0) {
            // Root directory: /
            pathInfo.type = 'root';
            
        } else if (segments[0] === 'data') {
            // Data operation paths
            pathInfo = this.parseDataPath(pathInfo, segments);
            
        } else if (segments[0] === 'meta') {
            // Meta operation paths
            pathInfo = this.parseMetaPath(pathInfo, segments);
            
        } else if (segments[0] === 'files') {
            // Files operation paths (future)
            pathInfo = this.parseFilesPath(pathInfo, segments);
            
        } else {
            throw new FtpPathError('Invalid root path', ftpPath, `Unknown root segment: ${segments[0]}. Expected 'data', 'meta', or 'files'`);
        }
        
        return pathInfo;
    }
    
    
    /**
     * Parse data operation paths (/data/...)
     */
    private static parseDataPath(pathInfo: PathInfo, segments: string[]): PathInfo {
        const { originalPath } = pathInfo;
        
        if (segments.length === 1) {
            // /data/ - data root
            pathInfo.type = 'data-root';
            return pathInfo;
        }
        
        // Extract schema name
        const schema = segments[1];
        pathInfo.schema = schema;
        
        // Validate schema name format
        this.validateSchemaName(schema, originalPath);
        
        if (segments.length === 2) {
            // /data/<schema>/ - list records in schema
            pathInfo.type = 'schema-records';
            return pathInfo;
        }
        
        // Extract record ID
        const recordId = segments[2];
        pathInfo.recordId = recordId;
        
        // Validate record ID format (should be UUID)
        this.validateRecordId(recordId, originalPath);
        
        if (segments.length === 3) {
            // /data/<schema>/<id>/ - list record fields
            pathInfo.type = 'record-fields';
            return pathInfo;
        }
        
        if (segments.length === 4) {
            const fieldOrFile = segments[3];
            
            // Check if this is a complete record JSON file
            const jsonFileName = `${recordId}.json`;
            if (fieldOrFile === jsonFileName) {
                // /data/<schema>/<id>/<id>.json - complete record
                pathInfo.type = 'complete-record';
                pathInfo.fileName = jsonFileName;
                pathInfo.isDirectory = false;
                return pathInfo;
            } else {
                // /data/<schema>/<id>/<field> - individual field
                pathInfo.type = 'record-field';
                pathInfo.field = fieldOrFile;
                pathInfo.isDirectory = false;
                
                // Validate field name format
                this.validateFieldName(fieldOrFile, originalPath);
                return pathInfo;
            }
        }
        
        throw new FtpPathError(
            'Invalid data path depth',
            originalPath,
            'Data paths cannot exceed 4 segments'
        );
    }
    
    /**
     * Parse meta operation paths (/meta/...)
     */
    private static parseMetaPath(pathInfo: PathInfo, segments: string[]): PathInfo {
        const { originalPath } = pathInfo;
        
        if (segments.length === 1) {
            // /meta/ - meta root
            pathInfo.type = 'meta-root';
            return pathInfo;
        }
        
        const metaOperation = segments[1]; // 'schema', etc.
        
        if (metaOperation === 'schema') {
            if (segments.length === 2) {
                // /meta/schema/ - list schemas
                pathInfo.type = 'meta-schemas';
                return pathInfo;
            } else if (segments.length === 3) {
                // /meta/schema/<name> - specific schema
                const schemaName = segments[2];
                pathInfo.schema = schemaName;
                pathInfo.fileName = `${schemaName}.yaml`;
                pathInfo.type = 'meta-schema';
                pathInfo.isDirectory = false;
                
                // Validate schema name format
                this.validateSchemaName(schemaName, originalPath);
                return pathInfo;
            }
        }
        
        throw new FtpPathError(
            'Invalid meta path',
            originalPath,
            `Unknown meta operation: ${metaOperation}. Expected 'schema'`
        );
    }
    
    /**
     * Parse files operation paths (/files/...) - Future implementation
     */
    private static parseFilesPath(pathInfo: PathInfo, segments: string[]): PathInfo {
        const { originalPath } = pathInfo;
        
        if (segments.length === 1) {
            // /files/ - files root
            pathInfo.type = 'files-root';
            return pathInfo;
        }
        
        // Future: Implement file attachment paths
        // /files/<schema>/<record-id>/<attachment-name>
        
        throw new FtpPathError(
            'Files operations not yet implemented',
            originalPath,
            'File attachment support is planned for future release'
        );
    }
    
    /**
     * Normalize a path by resolving . and .. and removing trailing slashes
     */
    private static normalizePath(path: string): string {
        // Ensure path starts with /
        if (!path.startsWith('/')) {
            path = '/' + path;
        }
        
        // Split into segments and resolve . and ..
        const segments: string[] = [];
        const parts = path.split('/');
        
        for (const part of parts) {
            if (part === '' || part === '.') {
                // Skip empty segments and current directory
                continue;
            } else if (part === '..') {
                // Parent directory - remove last segment if exists
                if (segments.length > 0) {
                    segments.pop();
                }
            } else {
                segments.push(part);
            }
        }
        
        // Reconstruct path
        return segments.length === 0 ? '/' : '/' + segments.join('/');
    }
    
    /**
     * Validate path for security issues (path traversal, etc.)
     */
    private static validatePathSecurity(path: string): void {
        // Check for null bytes (can cause issues in some systems)
        if (path.includes('\0')) {
            throw new FtpPathError(
                'Path contains null bytes',
                path,
                'Null bytes not allowed in paths',
                'SECURITY_VIOLATION'
            );
        }
        
        // Check for control characters
        if (/[\x00-\x1f\x7f]/.test(path)) {
            throw new FtpPathError(
                'Path contains control characters',
                path,
                'Control characters not allowed in paths',
                'SECURITY_VIOLATION'
            );
        }
        
        // Path should start with / after normalization
        if (!path.startsWith('/')) {
            throw new FtpPathError(
                'Path must be absolute',
                path,
                'All paths must start with /',
                'SECURITY_VIOLATION'
            );
        }
    }
    
    /**
     * Validate schema name format
     */
    private static validateSchemaName(schema: string, originalPath: string): void {
        // Schema names should be valid identifiers
        if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(schema)) {
            throw new FtpPathError(
                'Invalid schema name',
                originalPath,
                `Schema name "${schema}" must be a valid identifier (alphanumeric, underscore, dash)`
            );
        }
        
        // Reasonable length limit
        if (schema.length > 64) {
            throw new FtpPathError(
                'Schema name too long',
                originalPath,
                `Schema name "${schema}" exceeds 64 character limit`
            );
        }
    }
    
    /**
     * Validate record ID format (should be UUID)
     */
    private static validateRecordId(recordId: string, originalPath: string): void {
        // UUID format validation
        const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        
        if (!uuidPattern.test(recordId)) {
            throw new FtpPathError(
                'Invalid record ID',
                originalPath,
                `Record ID "${recordId}" must be a valid UUID`
            );
        }
    }
    
    /**
     * Validate field name format
     */
    private static validateFieldName(field: string, originalPath: string): void {
        // Field names should be valid identifiers
        if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(field)) {
            throw new FtpPathError(
                'Invalid field name',
                originalPath,
                `Field name "${field}" must be a valid identifier (alphanumeric, underscore)`
            );
        }
        
        // Reasonable length limit
        if (field.length > 64) {
            throw new FtpPathError(
                'Field name too long',
                originalPath,
                `Field name "${field}" exceeds 64 character limit`
            );
        }
    }
}