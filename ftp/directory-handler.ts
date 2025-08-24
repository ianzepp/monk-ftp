/**
 * FTP Directory Handler - Directory Listings and Navigation
 * 
 * Handles FTP LIST command for browsing tenant/schema/record hierarchy.
 * Provides filesystem metaphor for database operations with proper
 * FTP file metadata and directory structures.
 * 
 * Directory Structure (tenant-aware from JWT):
 * /                    - Root directory
 * /data/               - Data operations
 * /data/account/       - Account schema records
 * /data/account/123/   - Record fields + complete JSON
 * /meta/               - Meta operations
 * /meta/schema/        - Schema definitions
 * /files/              - Future: File attachments
 */

import type { System } from '../lib/system.js';
import type { PathInfo } from './path-parser.js';
import { FtpPathError } from './path-parser.js';

/**
 * FTP file representation for directory listings
 */
export interface FtpFile {
    /** File or directory name */
    name: string;
    
    /** File type for FTP listing */
    type: 'file' | 'directory';
    
    /** File size in bytes */
    size: number;
    
    /** Last modified date */
    modified: Date;
    
    /** Unix-style permissions string (optional) */
    permissions?: string;
    
    /** File owner (optional) */
    owner?: string;
    
    /** File group (optional) */
    group?: string;
}

/**
 * FTP-specific error for directory operations
 */
export class FtpDirectoryError extends Error {
    constructor(
        message: string,
        public readonly code: number = 500,
        public readonly ftpCode: string = '550'
    ) {
        super(message);
        this.name = 'FtpDirectoryError';
    }
}

/**
 * FTP Directory Handler - Core directory listing and navigation
 */
export class FtpDirectoryHandler {
    
    constructor(private system: System) {}
    
    /**
     * Generate directory listing for FTP LIST command
     * 
     * @param pathInfo - Parsed path information
     * @returns Array of FTP files for listing
     */
    async list(pathInfo: PathInfo): Promise<FtpFile[]> {
        try {
            switch (pathInfo.type) {
                case 'root':
                    return this.listRoot();
                    
                case 'data-root':
                    return this.listDataRoot();
                    
                case 'schema-records':
                    return this.listSchemaRecords(pathInfo.schema!);
                    
                case 'record-fields':
                    return this.listRecordFields(pathInfo.schema!, pathInfo.recordId!);
                    
                case 'meta-root':
                    return this.listMetaRoot();
                    
                case 'meta-schemas':
                    return this.listSchemas();
                    
                case 'files-root':
                    return this.listFilesRoot();
                    
                default:
                    throw new FtpDirectoryError(
                        `Cannot list directory for path type: ${pathInfo.type}`,
                        404,
                        '550'
                    );
            }
        } catch (error) {
            if (error instanceof FtpDirectoryError) {
                throw error;
            }
            
            console.error('Directory listing error:', error);
            throw new FtpDirectoryError(
                'Internal server error during directory listing',
                500,
                '550'
            );
        }
    }
    
    /**
     * List root directory contents
     * Shows main data/meta/files directories
     */
    private async listRoot(): Promise<FtpFile[]> {
        const now = new Date();
        
        return [
            {
                name: 'data',
                type: 'directory',
                size: 0,
                modified: now,
                permissions: 'drwxr-xr-x',
                owner: 'monk',
                group: 'monk'
            },
            {
                name: 'meta', 
                type: 'directory',
                size: 0,
                modified: now,
                permissions: 'drwxr-xr-x',
                owner: 'monk',
                group: 'monk'
            },
            {
                name: 'files',
                type: 'directory', 
                size: 0,
                modified: now,
                permissions: 'drwxr-xr-x',
                owner: 'monk',
                group: 'monk'
            }
        ];
    }
    
    /**
     * List data root directory - shows available schemas
     */
    private async listDataRoot(): Promise<FtpFile[]> {
        try {
            // Get all schemas from database using System context
            const schemas = await this.system.database.selectAny('schemas');
            
            return schemas.map(schema => ({
                name: schema.name,
                type: 'directory' as const,
                size: 0,
                modified: new Date(schema.updated_at || schema.created_at || Date.now()),
                permissions: 'drwxr-xr-x',
                owner: 'monk',
                group: 'monk'
            }));
            
        } catch (error) {
            console.error('Error listing schemas:', error);
            // Return empty listing if schemas table doesn't exist or error occurs
            return [];
        }
    }
    
    /**
     * List records in a specific schema
     */
    private async listSchemaRecords(schemaName: string): Promise<FtpFile[]> {
        try {
            // Get records from the schema's table using System database context
            const records = await this.system.database.selectAny(schemaName);
            
            return records.map(record => ({
                name: record.id,
                type: 'directory' as const,
                size: 0,
                modified: new Date(record.updated_at || record.created_at || Date.now()),
                permissions: 'drwxr-xr-x',
                owner: 'monk',
                group: 'monk'
            }));
            
        } catch (error) {
            // If table doesn't exist or error occurs, return empty listing
            console.error(`Error listing records for schema ${schemaName}:`, error);
            return [];
        }
    }
    
    /**
     * List fields in a specific record + complete JSON file
     */
    private async listRecordFields(schemaName: string, recordId: string): Promise<FtpFile[]> {
        try {
            // Get the specific record using System database context
            const record = await this.system.database.selectOne(schemaName, { where: { id: recordId } });
            
            if (!record) {
                throw new FtpDirectoryError(
                    `Record ${recordId} not found in schema ${schemaName}`,
                    404,
                    '550'
                );
            }
            
            const modifiedDate = new Date(record.updated_at || record.created_at || Date.now());
            const files: FtpFile[] = [];
            
            // Individual field files (exclude internal fields)
            const internalFields = ['id', 'created_at', 'updated_at', 'trashed_at', 'deleted_at'];
            
            for (const [fieldName, fieldValue] of Object.entries(record)) {
                if (internalFields.includes(fieldName)) {
                    continue;
                }
                
                // Calculate field value size
                const valueStr = fieldValue != null ? String(fieldValue) : '';
                
                files.push({
                    name: fieldName,
                    type: 'file',
                    size: Buffer.byteLength(valueStr, 'utf8'),
                    modified: modifiedDate,
                    permissions: '-rw-r--r--',
                    owner: 'monk',
                    group: 'monk'
                });
            }
            
            // Complete record JSON file
            const recordJson = JSON.stringify(record, null, 2);
            files.push({
                name: `${recordId}.json`,
                type: 'file',
                size: Buffer.byteLength(recordJson, 'utf8'),
                modified: modifiedDate,
                permissions: '-rw-r--r--',
                owner: 'monk',
                group: 'monk'
            });
            
            return files.sort((a, b) => a.name.localeCompare(b.name));
            
        } catch (error) {
            if (error instanceof FtpDirectoryError) {
                throw error;
            }
            
            console.error(`Error listing fields for record ${recordId}:`, error);
            throw new FtpDirectoryError(
                `Error accessing record ${recordId}`,
                500,
                '550'
            );
        }
    }
    
    /**
     * List meta root directory
     */
    private async listMetaRoot(): Promise<FtpFile[]> {
        const now = new Date();
        
        return [
            {
                name: 'schema',
                type: 'directory',
                size: 0,
                modified: now,
                permissions: 'drwxr-xr-x',
                owner: 'monk',
                group: 'monk'
            }
        ];
    }
    
    /**
     * List schema definitions as YAML files
     */
    private async listSchemas(): Promise<FtpFile[]> {
        try {
            // Get all schemas from database using System context
            const schemas = await this.system.database.selectAny('schemas');
            
            return schemas.map(schema => {
                // Convert schema definition to YAML for size calculation
                const yamlContent = this.convertSchemaToYaml(schema);
                
                return {
                    name: `${schema.name}.yaml`,
                    type: 'file' as const,
                    size: Buffer.byteLength(yamlContent, 'utf8'),
                    modified: new Date(schema.updated_at || schema.created_at || Date.now()),
                    permissions: '-r--r--r--', // Read-only for now
                    owner: 'monk',
                    group: 'monk'
                };
            });
            
        } catch (error) {
            console.error('Error listing schema definitions:', error);
            return [];
        }
    }
    
    /**
     * List files root directory (future implementation)
     */
    private async listFilesRoot(): Promise<FtpFile[]> {
        // Placeholder for future file attachment support
        return [
            {
                name: '.placeholder',
                type: 'file',
                size: 44,
                modified: new Date(),
                permissions: '-r--r--r--',
                owner: 'monk',
                group: 'monk'
            }
        ];
    }
    
    /**
     * Convert schema database record to YAML representation
     */
    private convertSchemaToYaml(schema: any): string {
        try {
            // Parse the schema definition if it's a string
            let definition = schema.definition;
            if (typeof definition === 'string') {
                definition = JSON.parse(definition);
            }
            
            // For now, return JSON formatted as YAML-like structure
            // TODO: Use a proper YAML library for better formatting
            const yamlContent = [
                `title: ${schema.name}`,
                `description: ${definition.description || 'Auto-generated schema definition'}`,
                `type: ${definition.type || 'object'}`,
                'properties:',
                ...this.formatPropertiesAsYaml(definition.properties || {}),
                'required:',
                ...((definition.required || []).map((req: string) => `  - ${req}`)),
                `additionalProperties: ${definition.additionalProperties !== false ? 'true' : 'false'}`
            ].join('\n');
            
            return yamlContent;
            
        } catch (error) {
            console.error('Error converting schema to YAML:', error);
            return `title: ${schema.name}\ndescription: Error parsing schema definition\ntype: object`;
        }
    }
    
    /**
     * Format schema properties as YAML-like structure
     */
    private formatPropertiesAsYaml(properties: Record<string, any>): string[] {
        const lines: string[] = [];
        
        for (const [propName, propDef] of Object.entries(properties)) {
            lines.push(`  ${propName}:`);
            lines.push(`    type: ${propDef.type || 'string'}`);
            
            if (propDef.description) {
                lines.push(`    description: "${propDef.description}"`);
            }
            
            if (propDef.format) {
                lines.push(`    format: ${propDef.format}`);
            }
            
            if (propDef.example !== undefined) {
                lines.push(`    example: "${propDef.example}"`);
            }
        }
        
        return lines;
    }
}

/**
 * FTP listing formatter - converts FtpFile array to FTP LIST format
 */
export class FtpListingFormatter {
    
    /**
     * Format files array as FTP LIST response
     * 
     * @param files - Array of FTP files to format
     * @returns Formatted FTP listing string
     */
    static format(files: FtpFile[]): string {
        return files.map(file => this.formatFile(file)).join('\n');
    }
    
    /**
     * Format single file as FTP LIST line
     * Uses Unix ls -la format: permissions owner group size date name
     */
    private static formatFile(file: FtpFile): string {
        const permissions = file.permissions || (file.type === 'directory' ? 'drwxr-xr-x' : '-rw-r--r--');
        const owner = file.owner || 'monk';
        const group = file.group || 'monk';
        const size = file.size.toString().padStart(8);
        
        // Format date as "MMM dd HH:mm" or "MMM dd  yyyy" for older files
        const now = new Date();
        const isRecentFile = (now.getTime() - file.modified.getTime()) < (180 * 24 * 60 * 60 * 1000); // 6 months
        
        const dateStr = isRecentFile 
            ? file.modified.toLocaleDateString('en-US', { 
                month: 'short', 
                day: '2-digit' 
              }) + ' ' + file.modified.toLocaleTimeString('en-US', { 
                hour12: false, 
                hour: '2-digit', 
                minute: '2-digit' 
              })
            : file.modified.toLocaleDateString('en-US', { 
                month: 'short', 
                day: '2-digit', 
                year: 'numeric' 
              });
        
        return `${permissions} 1 ${owner} ${group} ${size} ${dateStr} ${file.name}`;
    }
}