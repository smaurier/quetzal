'use client';
import { useEffect, useReducer, useRef, useState } from 'react';
import { connectSocket } from '@quetzal/core/client';
import type { Socket } from 'socket.io-client';
import {
  ETAT_INITIAL,
  reduireQuiz,
  type EtatQuiz,
  type EvenementQuiz,
} from './quiz-socket-state.js';

export interface QuizSocketState extends EtatQuiz {
  socket: Socket | null;
}

/**
 * Le squelette de `use-game-socket` du loto, gardé tel quel : connexion
 * annulable, déconnexion au démontage, état complet à chaque (re)connexion.
 * Les événements, eux, sont ceux du quiz, et leur effet vit dans
 * `reduireQuiz`, pur et testé.
 */
export function useQuizSocket(options: { sessionId: string; guestToken?: string }): QuizSocketState {
  const [etat, dispatch] = useReducer(reduireQuiz, ETAT_INITIAL);
  const socketRef = useRef<Socket | null>(null);
  const [, force] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let socket: Socket | null = null;

    void (async () => {
      socket = await connectSocket('ws/quiz', {
        ...(options.guestToken === undefined
          ? { query: { sessionId: options.sessionId } }
          : { guestToken: options.guestToken }),
      });
      if (cancelled) {
        socket.disconnect();
        return;
      }
      socketRef.current = socket;
      force((n) => n + 1);

      const recu = (evenement: EvenementQuiz): void => dispatch(evenement);

      // Un état complet arrive à chaque connexion ET reconnexion : c'est ce qui
      // rend une coupure wifi invisible.
      socket.on('state', (payload: Extract<EvenementQuiz, { type: 'state' }>['payload']) =>
        recu({ type: 'state', payload, recuA: Date.now() }));
      socket.on('join-failed', (payload: { reason: string }) => recu({ type: 'join-failed', payload }));
      socket.on('session-changed', (payload: Extract<EvenementQuiz, { type: 'session-changed' }>['payload']) =>
        recu({ type: 'session-changed', payload }));
      socket.on('question-opened', (payload: Extract<EvenementQuiz, { type: 'question-opened' }>['payload']) =>
        recu({ type: 'question-opened', payload, recuA: Date.now() }));
      socket.on('question-closed', (payload: Extract<EvenementQuiz, { type: 'question-closed' }>['payload']) =>
        recu({ type: 'question-closed', payload }));
      socket.on('session-finished', (payload: Extract<EvenementQuiz, { type: 'session-finished' }>['payload']) =>
        recu({ type: 'session-finished', payload }));
      socket.on('answer-result', (payload: Extract<EvenementQuiz, { type: 'answer-result' }>['payload']) =>
        recu({ type: 'answer-result', payload }));
      socket.on('answer-refused', (payload: { reason: string }) => recu({ type: 'answer-refused', payload }));
    })();

    return () => {
      cancelled = true;
      socket?.disconnect();
      socketRef.current = null;
    };
  }, [options.sessionId, options.guestToken]);

  return { ...etat, socket: socketRef.current };
}
