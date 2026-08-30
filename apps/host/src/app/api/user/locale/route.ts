import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@quetzal/auth';
import { rootPrisma } from '@quetzal/db';

const schema = z.object({ locale: z.enum(['fr', 'en', 'es']) });

export async function PATCH(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  await rootPrisma.user.update({
    where: { id: session.user.id },
    data: { locale: parsed.data.locale },
  });

  const response = NextResponse.json({ ok: true });
  response.cookies.set('NEXT_LOCALE', parsed.data.locale, { path: '/', maxAge: 60 * 60 * 24 * 365 });
  return response;
}
