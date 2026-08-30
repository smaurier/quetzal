export interface GuestEntry {
  guestId: string;
  displayName: string;
  joinedAt: number;
}

export interface GuestRegistry {
  add(moduleSlug: string, sessionId: string, entry: GuestEntry): boolean;
  remove(moduleSlug: string, sessionId: string, guestId: string): void;
  list(moduleSlug: string, sessionId: string): GuestEntry[];
  count(moduleSlug: string, sessionId: string): number;
}

export class InMemoryGuestRegistry implements GuestRegistry {
  private readonly bySession = new Map<string, Map<string, GuestEntry>>();

  private key(moduleSlug: string, sessionId: string): string {
    return `${moduleSlug}:${sessionId}`;
  }

  add(moduleSlug: string, sessionId: string, entry: GuestEntry): boolean {
    const key = this.key(moduleSlug, sessionId);
    let entries = this.bySession.get(key);
    if (!entries) {
      entries = new Map();
      this.bySession.set(key, entries);
    }
    entries.set(entry.guestId, entry);
    return true;
  }

  remove(moduleSlug: string, sessionId: string, guestId: string): void {
    this.bySession.get(this.key(moduleSlug, sessionId))?.delete(guestId);
  }

  list(moduleSlug: string, sessionId: string): GuestEntry[] {
    return [...(this.bySession.get(this.key(moduleSlug, sessionId))?.values() ?? [])];
  }

  count(moduleSlug: string, sessionId: string): number {
    return this.bySession.get(this.key(moduleSlug, sessionId))?.size ?? 0;
  }
}

export const guestRegistry: GuestRegistry = new InMemoryGuestRegistry();
