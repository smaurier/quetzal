'use client';

interface TokenResponse {
  token: string;
  exp?: number;
}

let cachedToken: string | null = null;
let expiresAt = 0;

async function getToken(): Promise<string | null> {
  if (cachedToken && Date.now() < expiresAt - 60_000) return cachedToken;
  const res = await fetch('/api/auth/token', { credentials: 'include' });
  if (!res.ok) return null;
  const data = (await res.json()) as TokenResponse;
  cachedToken = data.token;
  expiresAt = (data.exp ?? Math.floor(Date.now() / 1000) + 3600) * 1000;
  return data.token;
}

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await getToken();
  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return fetch(path, { ...init, headers, credentials: 'include' });
}
