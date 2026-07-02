import { describe, it, expect } from 'vitest';
import { cn, validateEmail } from './utils';

describe('cn', () => {
    it('merges class names', () => {
        expect(cn('foo', 'bar')).toBe('foo bar');
    });

    it('handles conditional classes', () => {
        expect(cn('base', false && 'hidden', 'visible')).toBe('base visible');
    });

    it('resolves tailwind conflicts', () => {
        expect(cn('px-4', 'px-2')).toBe('px-2');
    });
});

describe('validateEmail', () => {
    it('accepts valid email', () => {
        expect(validateEmail('user@example.com')).toBe(true);
    });

    it('rejects missing @', () => {
        expect(validateEmail('userexample.com')).toBe(false);
    });

    it('rejects empty string', () => {
        expect(validateEmail('')).toBe(false);
    });

    it('rejects missing domain', () => {
        expect(validateEmail('user@')).toBe(false);
    });
});
