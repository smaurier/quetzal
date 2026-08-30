export abstract class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class TenantContextMissingError extends DomainError {
  constructor() {
    super('No tenant context — code appelé hors requête ?');
  }
}
