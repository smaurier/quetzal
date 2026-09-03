import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { io, type Socket } from 'socket.io-client';
import { HelloGateway } from './hello.gateway.js';

// Contract of a module gateway over a real socket.io connection: Nest answers a
// @SubscribeMessage returning { event, data } as an EVENT, never as an ack callback.
// The UI listened for an ack, so the ping never resolved (e2e smoke failure).
describe('HelloGateway over socket.io (integration)', () => {
  let app: INestApplication;
  let url: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ providers: [HelloGateway] }).compile();
    app = moduleRef.createNestApplication();
    await app.listen(0);
    const port = (app.getHttpServer().address() as { port: number }).port;
    url = `http://127.0.0.1:${port}/ws/hello`;
  });

  afterAll(async () => { await app.close(); });

  function connect(): Promise<Socket> {
    return new Promise((resolve, reject) => {
      const socket = io(url, { transports: ['websocket'], timeout: 5000 });
      socket.on('connect', () => resolve(socket));
      socket.on('connect_error', reject);
    });
  }

  it('answers ping with a pong event carrying the latency', async () => {
    const socket = await connect();
    try {
      const pong = await new Promise<{ latencyMs: number; serverAt: number }>((resolve, reject) => {
        socket.on('pong', resolve);
        socket.emit('ping', { at: Date.now() - 10 });
        setTimeout(() => reject(new Error('no pong event within 5s')), 5000);
      });
      expect(pong.latencyMs).toBeGreaterThanOrEqual(10);
      expect(typeof pong.serverAt).toBe('number');
    } finally {
      socket.close();
    }
  });

  it('does not answer through the ack callback', async () => {
    const socket = await connect();
    try {
      const acked = await new Promise<boolean>((resolve) => {
        socket.emit('ping', { at: Date.now() }, () => resolve(true));
        setTimeout(() => resolve(false), 1500);
      });
      expect(acked).toBe(false);
    } finally {
      socket.close();
    }
  });
});
