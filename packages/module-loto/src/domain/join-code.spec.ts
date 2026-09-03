import { describe, it, expect } from 'vitest';
import { generateJoinCode, JOIN_CODE_LENGTH, JOIN_CODE_ALPHABET } from './join-code.js';

describe('generateJoinCode', () => {
  it('fait la longueur annoncée', () => {
    expect(generateJoinCode(Math.random)).toHaveLength(JOIN_CODE_LENGTH);
  });

  it('n emploie que l alphabet retenu', () => {
    for (const ch of generateJoinCode(Math.random)) {
      expect(JOIN_CODE_ALPHABET).toContain(ch);
    }
  });

  it('évite les caractères qu un élève confondrait de loin', () => {
    for (const ambiguous of ['O', '0', 'I', '1', 'L']) {
      expect(JOIN_CODE_ALPHABET).not.toContain(ambiguous);
    }
  });

  it('est reproductible à générateur identique', () => {
    const fixed = () => 0.5;
    expect(generateJoinCode(fixed)).toBe(generateJoinCode(fixed));
  });
});
