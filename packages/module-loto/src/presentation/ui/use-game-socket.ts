'use client';
import { useEffect, useRef, useState } from 'react';
import { connectSocket } from '@quetzal/core/client';
import type { Socket } from 'socket.io-client';
import type { GameSnapshot } from '../../application/game-snapshot.use-case.js';

export interface GameSocketState {
  snapshot: GameSnapshot | null;
  error: string | null;
  socket: Socket | null;
}

export function useGameSocket(options: { gameId: string; guestToken?: string }): GameSocketState {
  const [snapshot, setSnapshot] = useState<GameSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const [, force] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let socket: Socket | null = null;

    void (async () => {
      socket = await connectSocket('ws/loto', {
        ...(options.guestToken === undefined
          ? { query: { gameId: options.gameId } }
          : { guestToken: options.guestToken }),
      });
      if (cancelled) {
        socket.disconnect();
        return;
      }
      socketRef.current = socket;
      force((n) => n + 1);

      // A full state arrives on every connection AND every reconnection: that is
      // what makes a wifi drop invisible to the pupil.
      socket.on('state', (next: GameSnapshot) => setSnapshot(next));
      socket.on('join-failed', (payload: { reason: string }) => setError(payload.reason));

      socket.on('game-changed', (game: GameSnapshot['game']) =>
        setSnapshot((current) => (current === null ? current : { ...current, game })),
      );
      socket.on('card-drawn', (draw: { order: number; cardId: string; label: string }) =>
        setSnapshot((current) =>
          current === null
            ? current
            : {
                ...current,
                draws: [...current.draws, draw],
                game: {
                  ...current.game,
                  lastDrawOrder: draw.order,
                  remainingCardCount: current.game.remainingCardCount - 1,
                },
              },
        ),
      );
      socket.on('team-joined', (team: GameSnapshot['teams'][number]) =>
        setSnapshot((current) =>
          current === null
            ? current
            : {
                ...current,
                teams: [...current.teams.filter((t) => t.id !== team.id), team],
              },
        ),
      );
      socket.on('mark-changed', (payload: { cardId: string; marked: boolean }) =>
        setSnapshot((current) => {
          if (current === null || current.tabla === null) return current;
          const without = current.tabla.markedCardIds.filter((id) => id !== payload.cardId);
          return {
            ...current,
            tabla: {
              ...current.tabla,
              markedCardIds: payload.marked ? [...without, payload.cardId] : without,
            },
          };
        }),
      );
      socket.on('claim-result', (payload: { teamId: string; valid: boolean; blockedUntilDraw: number }) =>
        setSnapshot((current) => {
          if (current === null) return current;
          const tabla =
            current.tabla !== null && current.tabla.teamId === payload.teamId
              ? { ...current.tabla, blockedUntilDraw: payload.blockedUntilDraw }
              : current.tabla;
          return { ...current, tabla };
        }),
      );
      socket.on('game-finished', (payload: { wonByTeamId: string | null }) =>
        setSnapshot((current) =>
          current === null
            ? current
            : { ...current, game: { ...current.game, status: 'finished', wonByTeamId: payload.wonByTeamId } },
        ),
      );
    })();

    return () => {
      cancelled = true;
      socket?.disconnect();
      socketRef.current = null;
    };
  }, [options.gameId, options.guestToken]);

  return { snapshot, error, socket: socketRef.current };
}
