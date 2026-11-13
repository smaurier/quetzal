'use client';
import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';

/**
 * Spec § 8 point 2. Les jalons, et non chaque seconde : le contenu d'un
 * `role="status"` qui change trente fois noie l'utilisateur de lecteur d'écran
 * sous trente annonces, ce qui est pire qu'un décompte muet.
 *
 * Resserrés sur la fin, là où l'information compte.
 */
export const JALONS_SECONDES = [30, 20, 10, 5, 3, 2, 1] as const;

export function secondesRestantes(echeanceMs: number, maintenantMs: number): number {
  return Math.max(0, Math.ceil((echeanceMs - maintenantMs) / 1000));
}

/**
 * Le jalon à annoncer, ou `null`.
 *
 * ⛔ Compare au tour PRÉCÉDENT, strictement (`precedent > jalon`) : sans ça,
 * un `role="status"` réannonce à chaque rendu React, et React rend plusieurs
 * fois par seconde. Ce seul garde suffit : un tour sans recul ne franchit
 * aucun jalon.
 *
 * ⛔ Rend le jalon le PLUS BAS franchi quand plusieurs le sont d'un coup : un
 * onglet mis en arrière-plan gèle ses minuteurs, donc dix secondes peuvent
 * passer d'un bloc au retour.
 */
export function jalonAtteint(restant: number | null, precedent: number | null): number | null {
  if (restant === null || precedent === null) return null;

  const franchis = JALONS_SECONDES.filter((jalon) => restant <= jalon && precedent > jalon);
  if (franchis.length === 0) return null;
  return Math.min(...franchis);
}

/**
 * `echeanceMs` est un instant de l'horloge LOCALE (`echeanceLocale`), jamais
 * `deadlineAt` brut : c'est ce zéro qui déclenche la fermeture (D8).
 */
export function Countdown({ echeanceMs, onZero }: { echeanceMs: number | null; onZero?: () => void }) {
  const t = useTranslations('module.quiz.countdown');
  const [restant, setRestant] = useState<number | null>(null);
  const [jalon, setJalon] = useState<number | null>(null);
  const precedent = useRef<number | null>(null);
  // Le rappel change d'identité à chaque rendu du parent : dans les
  // dépendances de l'effet, il relancerait le décompte à chaque seconde.
  const surZero = useRef(onZero);
  useEffect(() => {
    surZero.current = onZero;
  }, [onZero]);

  useEffect(() => {
    precedent.current = null;
    setJalon(null);
    if (echeanceMs === null) {
      setRestant(null);
      return;
    }
    const echeance = echeanceMs;
    let zeroAtteint = false;

    function battre(): void {
      const valeur = secondesRestantes(echeance, Date.now());
      const atteint = jalonAtteint(valeur, precedent.current);
      if (atteint !== null) setJalon(atteint);
      precedent.current = valeur;
      setRestant(valeur);
      if (valeur === 0 && !zeroAtteint) {
        zeroAtteint = true;
        clearInterval(battement);
        surZero.current?.();
      }
    }

    const battement = setInterval(battre, 250);
    battre();
    return () => clearInterval(battement);
  }, [echeanceMs]);

  if (restant === null) return null;

  return (
    <div className="flex flex-col items-center gap-1">
      {/* Le chiffre seul ne dit rien à un lecteur d'écran : la phrase
          équivalente le suit, hors zone vivante, lisible à la demande. */}
      <p className="text-7xl font-bold tabular-nums" data-testid="countdown" aria-hidden="true">
        {restant}
      </p>
      <p className="sr-only">{t('secondsLeft', { count: restant })}</p>
      {/* ⛔ `role="status"` (poli) : il n'interrompt pas la lecture et NE VOLE
          PAS LE FOCUS, `autoFocus` est banni dans ce dépôt. */}
      <p role="status" className="sr-only" data-testid="countdown-announce">
        {jalon === null ? '' : t('secondsLeft', { count: jalon })}
      </p>
    </div>
  );
}
