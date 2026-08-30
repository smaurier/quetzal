export interface HelloGreetedEvent {
  userId: string;
  tenantId: string;
  requestId: string;
  message: string;
}

export interface HelloPingedEvent {
  userId: string;
  tenantId: string;
  latencyMs: number;
}
