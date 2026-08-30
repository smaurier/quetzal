import { describe, it, expect } from 'vitest';
import { Greeting, DisplayName } from './greeting.js';
import { EmptyDisplayNameError, DisplayNameTooLongError } from './errors.js';

describe('DisplayName', () => {
  it('accepts a valid name', () => {
    const name = DisplayName.of('Elda');
    expect(name.toString()).toBe('Elda');
  });

  it('rejects empty string', () => {
    expect(() => DisplayName.of('')).toThrow(EmptyDisplayNameError);
  });

  it('rejects over 32 characters', () => {
    expect(() => DisplayName.of('x'.repeat(33))).toThrow(DisplayNameTooLongError);
  });

  it('accepts exactly 32 characters', () => {
    expect(() => DisplayName.of('x'.repeat(32))).not.toThrow();
  });
});

describe('Greeting', () => {
  it('formats the message with the display name', () => {
    const greeting = Greeting.for(DisplayName.of('Elda'));
    expect(greeting.message).toBe('Hello Elda');
  });
});
