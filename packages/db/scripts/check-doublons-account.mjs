// LECTURE SEULE. Aucun INSERT, UPDATE, DELETE, ALTER, TRUNCATE.
// N'affiche que des comptes : aucun identifiant de compte ne sort.
//
// Pourquoi ce script existe : la migration 20261103063000 pose
// @@unique([providerId, accountId]) sur `account` et echoue au deploiement si
// des doublons existent deja. Render joue `prisma migrate deploy` en derniere
// ligne de son buildCommand, avec `set -e` : un doublon bloque donc tout le
// deploiement de l'API. Observe le 04/11 : l'API servait encore 9949f87
// (29/10) alors que main etait sur 05f5017, et le host Vercel, lui, etait
// bien a jour.
//
// Lancer depuis la racine du depot :
//   pnpm --filter @quetzal/db exec node scripts/check-doublons-account.mjs
//
// Place dans packages/db parce que @prisma/client n'est resoluble que d'ici
// (pnpm strict) et que la resolution ESM suit l'emplacement du FICHIER, pas
// le repertoire courant. `pg` n'est declare par aucun paquet de ce depot : il
// n'arrivait que comme peer optionnel de better-auth.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { PrismaClient } from "@prisma/client";

const racine = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const env = readFileSync(join(racine, ".env.local"), "utf8");
const url = env.match(/^DATABASE_URL=(.+)$/m)?.[1]?.trim();
if (!url) {
  console.error("DATABASE_URL absente de .env.local");
  process.exit(1);
}

const prisma = new PrismaClient({ datasources: { db: { url } } });

const un = async (sql) => Number((await prisma.$queryRawUnsafe(sql))[0].n);

const lignes = await un('SELECT count(*)::int AS n FROM "account"');
const groupes = await un(
  `SELECT count(*)::int AS n FROM (SELECT 1 FROM "account"
     GROUP BY "providerId", "accountId" HAVING count(*) > 1) d`,
);
const enTrop = await un(
  `SELECT COALESCE(SUM(c - 1), 0)::int AS n FROM (SELECT count(*) AS c FROM "account"
     GROUP BY "providerId", "accountId" HAVING count(*) > 1) d`,
);
const index = await prisma.$queryRawUnsafe(
  `SELECT indexname FROM pg_indexes WHERE tablename = 'account' ORDER BY indexname`,
);
const migrations = await prisma.$queryRawUnsafe(
  `SELECT migration_name, (finished_at IS NOT NULL) AS ok
     FROM "_prisma_migrations" ORDER BY started_at DESC LIMIT 4`,
);

console.log("lignes dans account       :", lignes);
console.log("groupes en doublon        :", groupes);
console.log("lignes a retirer si > 0   :", enTrop);
console.log("index sur account         :", index.map((r) => r.indexname).join(", ") || "aucun");
console.log("4 dernieres migrations    :");
for (const m of migrations) console.log("   ", m.ok ? "ok " : "KO ", m.migration_name);

await prisma.$disconnect();
