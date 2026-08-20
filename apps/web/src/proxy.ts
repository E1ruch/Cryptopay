import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

export default createMiddleware(routing);

export const config = {
  // /pay is the public checkout page (spec §19) — it lives outside the
  // [locale] segment (its own root layout, English-only for Phase 1) and
  // must not be redirected/rewritten by next-intl's locale detection.
  matcher: ['/((?!api|trpc|_next|_vercel|pay|.*\\..*).*)'],
};
