import type { Server, Socket } from 'socket.io';

/** Un serveur socket.io réduit à ce que le diffuseur en utilise : `to(room).emit()`. */
export function fakeServer(options: { casse?: (event: string) => boolean } = {}) {
  const emis: { room: string; event: string; payload: unknown }[] = [];
  const server = {
    to: (room: string) => ({
      emit: (event: string, payload: unknown) => {
        emis.push({ room, event, payload });
        if (options.casse?.(event) === true) throw new Error(`emission cassee : ${event}`);
      },
    }),
  };
  return { emis, server: server as unknown as Server };
}

/** Un socket réduit à ce que la passerelle en lit et en appelle. */
export function fauxSocket(data: Record<string, unknown>, query: Record<string, string> = {}) {
  const emis: { event: string; payload: unknown }[] = [];
  const salles: string[] = [];
  const etat = { coupe: false };
  const socket = {
    data,
    handshake: { query },
    emit: (event: string, payload: unknown) => {
      emis.push({ event, payload });
      return true;
    },
    join: async (salle: string) => {
      salles.push(salle);
    },
    disconnect: () => {
      etat.coupe = true;
    },
  };
  return { socket: socket as unknown as Socket, emis, salles, etat };
}

/** Toutes les clés d'une charge, à toute profondeur : une fuite se cache dans un tableau imbriqué. */
export function clesProfondes(valeur: unknown): Set<string> {
  const cles = new Set<string>();
  const visiter = (v: unknown): void => {
    if (Array.isArray(v)) {
      v.forEach(visiter);
      return;
    }
    if (v !== null && typeof v === 'object') {
      for (const [cle, enfant] of Object.entries(v)) {
        cles.add(cle);
        visiter(enfant);
      }
    }
  };
  visiter(valeur);
  return cles;
}
