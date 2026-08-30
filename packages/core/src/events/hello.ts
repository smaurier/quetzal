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

export const HelloGreetedEvent = 'HelloGreetedEvent' as const;
export const HelloPingedEvent = 'HelloPingedEvent' as const;
