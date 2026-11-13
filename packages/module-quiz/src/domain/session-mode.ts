export const SESSION_MODES = ['defi', 'controle'] as const;
export type SessionMode = (typeof SESSION_MODES)[number];

export function isSessionMode(valeur: string): valeur is SessionMode {
  return (SESSION_MODES as readonly string[]).includes(valeur);
}
