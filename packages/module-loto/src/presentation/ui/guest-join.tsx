'use client';

import type { GuestJoinProps } from '@quetzal/core';

// Écran joueur, monté par la plateforme au rejoint QR. Implémenté à la tâche
// 33 : ce placeholder existe uniquement pour que le manifeste client (tâche
// 29) pointe vers un module réel et que le typecheck reste vert entre les
// deux tâches.
export default function GuestJoin(_props: GuestJoinProps) {
  return null;
}
