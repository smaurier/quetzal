/** Sans O, 0, I, 1 ni L : le code est lu de loin sur un écran projeté. */
export const JOIN_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const JOIN_CODE_LENGTH = 6;

export function generateJoinCode(random: () => number): string {
  let code = '';
  for (let i = 0; i < JOIN_CODE_LENGTH; i++) {
    const index = Math.floor(random() * JOIN_CODE_ALPHABET.length) % JOIN_CODE_ALPHABET.length;
    code += JOIN_CODE_ALPHABET[index]!;
  }
  return code;
}
