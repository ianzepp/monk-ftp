/**
 * FTP File Handler - Read/Write Operations for Field and Record Access
 * 
 * Implements FTP RETR (download) and STOR (upload) commands for:
 * - Individual field access (field-per-file pattern)
 * - Complete record access (JSON file pattern)
 * - Data type conversion and validation
 * - Transaction handling for atomic operations
 * 
 * File Patterns:
 * /data/account/123/name           → Field value as text
 * /data/account/123/age            → Parsed number/date/etc
 * /data/account/123/123.json       → Complete record as JSON
 * /meta/schema/account.yaml        → Schema definition as YAML
 */

import type { System } from '../lib/system.js';
import type { PathInfo } from './path-parser.js';
import { FtpPathError } from './path-parser.js';

/**
 * FTP file operation error
 */
export class FtpFileError extends Error {
    constructor(
        message: string,
        public readonly code: number = 500,
        public readonly ftpCode: string = '550'
    ) {
        super(message);
        this.name = 'FtpFileError';
    }
}

/**
 * File content with metadata for FTP operations
 */
export interface FileContent {
    /** File content as string */
    content: string;
    
    /** Content length in bytes */
    size: number;
    
    /** MIME content type */
    contentType: string;
    
    /** Last modified date */
    modified: Date;
}

/**
 * FTP File Handler - Core file read/write operations
 */
export class FtpFileHandler {
    
    constructor(private system: System) {}
    
    /**
     * Read file content for FTP RETR command
     * 
     * @param pathInfo - Parsed path information
     * @returns File content with metadata
     */
    async readFile(pathInfo: PathInfo): Promise<FileContent> {
        try {
            switch (pathInfo.type) {
                case 'record-field':
                    return await this.readRecordField(
                        pathInfo.schema!,
                        pathInfo.recordId!,
                        pathInfo.field!
                    );
                    
                case 'complete-record':
                    return await this.readCompleteRecord(
                        pathInfo.schema!,
                        pathInfo.recordId!
                    );
                    
                case 'meta-schema':
                    return await this.readSchemaDefinition(pathInfo.schema!);
                    
                default:
                    throw new FtpFileError(
                        `Cannot read file for path type: ${pathInfo.type}`,
                        404,
                        '550'
                    );
            }
        } catch (error) {
            if (error instanceof FtpFileError) {
                throw error;
            }
            
            console.error('File read error:', error);
            throw new FtpFileError(
                'Internal server error during file read',
                500,
                '550'
            );
        }
    }
    
    /**
     * Write file content for FTP STOR command
     * 
     * @param pathInfo - Parsed path information
     * @param content - File content to write
     */
    async writeFile(pathInfo: PathInfo, content: string): Promise<void> {
        try {
            // Check if this is a read-only operation
            if (pathInfo.type === 'meta-schema') {
                throw new FtpFileError(
                    'Schema files are read-only',
                    403,
                    '553'
                );
            }
            
            switch (pathInfo.type) {
                case 'record-field':
                    await this.writeRecordField(
                        pathInfo.schema!,
                        pathInfo.recordId!,
                        pathInfo.field!,
                        content
                    );
                    break;
                    
                case 'complete-record':
                    await this.writeCompleteRecord(
                        pathInfo.schema!,
                        pathInfo.recordId!,
                        content
                    );
                    break;
                    
                default:
                    throw new FtpFileError(
                        `Cannot write file for path type: ${pathInfo.type}`,
                        404,
                        '550'
                    );
            }
        } catch (error) {
            if (error instanceof FtpFileError) {
                throw error;
            }
            
            console.error('File write error:', error);
            throw new FtpFileError(
                'Internal server error during file write',
                500,
                '550'
            );
        }
    }
    
    /**
     * Read individual field value as text file
     */
    private async readRecordField(
        schemaName: string, 
        recordId: string, 
        fieldName: string
    ): Promise<FileContent> {
        // Get the record
        const record = await this.system.database.selectOne(schemaName, { where: { id: recordId } });
        
        if (!record) {
            throw new FtpFileError(
                `Record ${recordId} not found in schema ${schemaName}`,
                404,
                '550'
            );
        }
        
        // Check if field exists
        if (!(fieldName in record)) {
            throw new FtpFileError(
                `Field '${fieldName}' not found in record`,
                404,
                '550'
            );
        }
        
        // Format field value as string
        const fieldValue = record[fieldName];
        const content = FieldValueFormatter.format(fieldValue);
        
        return {
            content,
            size: Buffer.byteLength(content, 'utf8'),
            contentType: 'text/plain',
            modified: new Date(record.updated_at || record.created_at || Date.now())
        };
    }
    
    /**
     * Read complete record as JSON file
     */
    private async readCompleteRecord(
        schemaName: string, 
        recordId: string
    ): Promise<FileContent> {
        // Get the record
        const record = await this.system.database.selectOne(schemaName, { where: { id: recordId } });
        
        if (!record) {
            throw new FtpFileError(
                `Record ${recordId} not found in schema ${schemaName}`,
                404,
                '550'
            );
        }
        
        // Format as JSON
        const content = JSON.stringify(record, null, 2);
        
        return {
            content,
            size: Buffer.byteLength(content, 'utf8'),
            contentType: 'application/json',
            modified: new Date(record.updated_at || record.created_at || Date.now())
        };
    }
    
    /**
     * Read schema definition as YAML file
     */
    private async readSchemaDefinition(schemaName: string): Promise<FileContent> {
        // Get schema from database
        const schemas = await this.system.database.selectAny('schemas', {
            where: { name: schemaName }
        });
        
        if (!schemas || schemas.length === 0) {
            throw new FtpFileError(
                `Schema '${schemaName}' not found`,
                404,
                '550'
            );
        }
        
        const schema = schemas[0];
        
        // Convert to YAML format
        const content = this.convertSchemaToYaml(schema);
        
        return {
            content,
            size: Buffer.byteLength(content, 'utf8'),
            contentType: 'application/x-yaml',
            modified: new Date(schema.updated_at || schema.created_at || Date.now())
        };
    }
    
    /**
     * Write individual field value
     */
    private async writeRecordField(
        schemaName: string,
        recordId: string,
        fieldName: string,
        content: string
    ): Promise<void> {
        // Get the current record to verify it exists
        const record = await this.system.database.selectOne(schemaName, { where: { id: recordId } });
        
        if (!record) {
            throw new FtpFileError(
                `Record ${recordId} not found in schema ${schemaName}`,
                404,
                '550'
            );
        }
        
        // Get schema definition for field validation
        const schemas = await this.system.database.selectAny('schemas', {
            where: { name: schemaName }
        });
        
        if (!schemas || schemas.length === 0) {
            throw new FtpFileError(
                `Schema '${schemaName}' not found`,
                404,
                '550'
            );
        }
        
        const schemaDefinition = this.parseSchemaDefinition(schemas[0]);
        
        // Validate field exists in schema
        if (!schemaDefinition.properties || !schemaDefinition.properties[fieldName]) {
            throw new FtpFileError(
                `Field '${fieldName}' not found in schema`,
                404,
                '550'
            );
        }
        
        // Parse field value according to schema type
        const fieldDef = schemaDefinition.properties[fieldName];
        const parsedValue = FieldValueParser.parse(content.trim(), fieldDef);
        
        // Update the field
        await this.system.database.updateOne(schemaName, recordId, {
            [fieldName]: parsedValue
        });
        
        console.log(`📝 Updated field ${fieldName} in record ${recordId}`);
    }
    
    /**
     * Write complete record from JSON
     */
    private async writeCompleteRecord(
        schemaName: string,
        recordId: string,
        content: string
    ): Promise<void> {
        // Parse JSON content
        let recordData;
        try {
            recordData = JSON.parse(content);
        } catch (error) {
            throw new FtpFileError(
                'Invalid JSON format in record file',
                400,
                '553'
            );
        }
        
        // Ensure the record ID matches
        if (recordData.id && recordData.id !== recordId) {
            throw new FtpFileError(
                'Record ID mismatch between path and JSON content',
                400,
                '553'
            );
        }
        
        // Set the correct ID
        recordData.id = recordId;
        
        // Get schema for validation
        const schemas = await this.system.database.selectAny('schemas', {
            where: { name: schemaName }
        });
        
        if (!schemas || schemas.length === 0) {
            throw new FtpFileError(
                `Schema '${schemaName}' not found`,
                404,
                '550'
            );
        }
        
        // TODO: Add schema validation here
        // const schemaObj = new Schema(this.system, schemaName, schemas[0]);
        // const isValid = await schemaObj.validate(recordData);
        
        // Update complete record
        await this.system.database.updateOne(schemaName, recordId, recordData);
        
        console.log(`📝 Updated complete record ${recordId} in schema ${schemaName}`);
    }
    
    /**
     * Parse schema definition from database record
     */
    private parseSchemaDefinition(schema: any): any {
        try {
            return typeof schema.definition === 'string'
                ? JSON.parse(schema.definition)
                : schema.definition;
        } catch (error) {
            throw new FtpFileError(
                'Invalid schema definition format',
                500,
                '550'
            );
        }
    }
    
    /**
     * Convert schema to YAML format
     */
    private convertSchemaToYaml(schema: any): string {
        try {
            const definition = this.parseSchemaDefinition(schema);
            
            // Simple YAML conversion (could use proper YAML library later)
            const lines = [
                `title: ${schema.name}`,
                `description: ${definition.description || 'Schema definition'}`,
                `type: ${definition.type || 'object'}`,
                'properties:'
            ];
            
            // Add properties
            if (definition.properties) {
                for (const [propName, propDef] of Object.entries(definition.properties as Record<string, any>)) {
                    lines.push(`  ${propName}:`);
                    lines.push(`    type: ${propDef.type || 'string'}`);
                    
                    if (propDef.description) {
                        lines.push(`    description: "${propDef.description}"`);
                    }
                    
                    if (propDef.format) {
                        lines.push(`    format: ${propDef.format}`);
                    }
                }
            }
            
            // Add required fields
            if (definition.required && Array.isArray(definition.required)) {
                lines.push('required:');
                for (const req of definition.required) {
                    lines.push(`  - ${req}`);
                }
            }
            
            return lines.join('\n') + '\n';
            
        } catch (error) {
            console.error('Error converting schema to YAML:', error);
            return `title: ${schema.name}\ndescription: Error parsing schema\ntype: object\n`;
        }
    }
}

/**
 * Field Value Parser - Convert text content to typed values
 */
export class FieldValueParser {
    
    /**
     * Parse field content according to schema field definition
     */
    static parse(content: string, fieldDefinition: any): any {
        const fieldType = fieldDefinition.type;
        const trimmed = content.trim();
        
        // Handle null/empty values
        if (!trimmed) {
            return null;
        }
        
        try {
            switch (fieldType) {
                case 'integer':
                    const intValue = parseInt(trimmed, 10);
                    if (isNaN(intValue)) {
                        throw new Error(`Invalid integer: ${trimmed}`);
                    }
                    return intValue;
                    
                case 'number':
                    const numValue = parseFloat(trimmed);
                    if (isNaN(numValue)) {
                        throw new Error(`Invalid number: ${trimmed}`);
                    }
                    return numValue;
                    
                case 'boolean':
                    const lowerValue = trimmed.toLowerCase();
                    if (lowerValue === 'true' || lowerValue === '1' || lowerValue === 'yes') {
                        return true;
                    } else if (lowerValue === 'false' || lowerValue === '0' || lowerValue === 'no') {
                        return false;
                    } else {
                        throw new Error(`Invalid boolean: ${trimmed}`);
                    }
                    
                case 'array':
                    // Arrays are represented as line-separated values
                    return trimmed.split('\n').map(line => line.trim()).filter(line => line.length > 0);
                    
                case 'object':
                    // Objects should be JSON
                    return JSON.parse(trimmed);
                    
                case 'string':
                default:
                    // Format validation for string types
                    if (fieldDefinition.format === 'email' && !this.isValidEmail(trimmed)) {
                        throw new Error(`Invalid email format: ${trimmed}`);
                    }
                    
                    if (fieldDefinition.format === 'uuid' && !this.isValidUuid(trimmed)) {
                        throw new Error(`Invalid UUID format: ${trimmed}`);
                    }
                    
                    if (fieldDefinition.format === 'date-time') {
                        const date = new Date(trimmed);
                        if (isNaN(date.getTime())) {
                            throw new Error(`Invalid date-time format: ${trimmed}`);
                        }
                        return date.toISOString();
                    }
                    
                    return trimmed;
            }
        } catch (error) {
            throw new FtpFileError(
                `Field parsing error: ${error instanceof Error ? error.message : 'Unknown error'}`,
                400,
                '553'
            );
        }
    }
    
    /**
     * Simple email validation
     */
    private static isValidEmail(email: string): boolean {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    }
    
    /**
     * Simple UUID validation  
     */
    private static isValidUuid(uuid: string): boolean {
        return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uuid);
    }
}

/**
 * Field Value Formatter - Convert typed values to text content
 */
export class FieldValueFormatter {
    
    /**
     * Format field value for display in FTP file
     */
    static format(value: any): string {
        if (value === null || value === undefined) {
            return '';
        }
        
        switch (typeof value) {
            case 'string':
                return value;
                
            case 'number':
                return value.toString();
                
            case 'boolean':
                return value ? 'true' : 'false';
                
            case 'object':
                if (Array.isArray(value)) {
                    // Arrays as line-separated values
                    return value.map(item => String(item)).join('\n');
                } else if (value instanceof Date) {
                    // Dates as ISO strings
                    return value.toISOString();
                } else {
                    // Objects as JSON
                    return JSON.stringify(value, null, 2);
                }
                
            default:
                return String(value);
        }
    }
}