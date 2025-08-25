import { describe, test, expect } from 'vitest';

describe('Basic monk-ftp tests', () => {
    test('should pass basic assertion', () => {
        expect(1 + 1).toBe(2);
    });

    test('should verify testing framework is working', () => {
        const message = 'monk-ftp testing framework';
        expect(message).toContain('monk-ftp');
        expect(message).toContain('testing');
    });
});