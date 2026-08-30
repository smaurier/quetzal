export class DomainError extends Error {}
export class EmptyDisplayNameError extends DomainError {
  constructor() { super('DisplayName cannot be empty'); this.name = 'EmptyDisplayNameError'; }
}
export class DisplayNameTooLongError extends DomainError {
  constructor() { super('DisplayName exceeds 32 characters'); this.name = 'DisplayNameTooLongError'; }
}
