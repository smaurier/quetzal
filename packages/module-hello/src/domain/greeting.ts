import { EmptyDisplayNameError, DisplayNameTooLongError } from './errors.js';

export class DisplayName {
  private constructor(private readonly value: string) {}

  static of(raw: string): DisplayName {
    if (raw.length === 0) throw new EmptyDisplayNameError();
    if (raw.length > 32) throw new DisplayNameTooLongError();
    return new DisplayName(raw);
  }

  toString(): string { return this.value; }
}

export class Greeting {
  private constructor(readonly message: string) {}

  static for(name: DisplayName): Greeting {
    return new Greeting(`Hello ${name.toString()}`);
  }
}
