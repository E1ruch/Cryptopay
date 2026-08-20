# Redesign plan: Telegram Web App Crypto Wallet aesthetic

**Status:** not started. This is a handoff brief for a new chat/session to
pick up — read this fully before touching code.

## Context

Phase 0 of CryptoPay is complete and verified: monorepo, auth, organizations,
API keys, Docker Compose, CI — see [`README.md`](../../README.md) and
[`docs/architecture/ARCHITECTURE.md`](../architecture/ARCHITECTURE.md) for
what exists. `apps/web` currently has a **minimal Stripe/Apple-like** look
(per `CryptoPay_Master_Spec.md` §7): white background, indigo accent, plain
cards, system font stack. Hand-rolled Tailwind v4 UI primitives live in
`apps/web/src/components/ui/` (`Button`, `Input`, `Label`, `Card`) — there is
no shadcn/ui CLI install, just plain Tailwind-styled components matching
shadcn's API shape.

The user wants the visual language moved toward **"Telegram Web App Crypto
Wallet"** — they specifically like that aesthetic and want to get close to
it. This is a **pure design/frontend task** — no backend, auth, or API
changes are implied by this plan.

## First step: nail down which reference

"Telegram Web App Crypto Wallet" isn't one single design — Telegram has
shipped several: the native **Wallet** bot/mini-app (dark, TON-blue
gradients, big balance display, card carousel), **TON Space**, and
various third-party Telegram Mini Apps built with Telegram's own Bot UI
kit (`tgs`/`Telegram.WebApp` theming, which adopts the user's Telegram
theme colors — light or dark, blue accent `#2AABEE`/`#229ED9` family,
rounded 12–16px corners, bottom sheet modals, big tappable rows with
leading icons, minimal chrome, generous vertical spacing, SF Pro / system
font, haptic-feeling snappy transitions).

**Before writing any code, ask the user for a concrete reference**: a
screenshot, a link, or the specific app name. Do not guess and build against
an assumed palette — get this wrong and the whole pass has to be redone.
Good clarifying questions:
- Which specific app/screen (Telegram's own Wallet, a TON dApp, some other
  Mini App)? Do they have a screenshot handy?
- Dark theme only, or light+dark like Telegram itself?
- Is the target just the merchant **dashboard** (this is a B2B tool for
  managing invoices/API keys, not an end-user wallet), or does "wallet feel"
  mean specific elements — big number displays for volume/balance, card
  carousels, bottom nav on mobile?

## Reconciling wallet aesthetic with a merchant dashboard

CryptoPay's dashboard is B2B (organization overview, invoices, API keys,
transactions) — not a personal wallet with send/receive/swap. The redesign
should **borrow the visual language** (color, typography, spacing, card
treatment, motion) without literally cloning wallet-specific screens that
don't apply here. Concretely, what transfers well:

- Dark-first theme with a vivid blue accent, high-contrast big numbers for
  key stats (volume, successful payments — once Phase 1 has real data;
  Phase 0 can still apply the treatment to placeholder/zero states).
  - Rounded, elevated cards (16–20px radius) with subtle borders instead of
  heavy shadows.
- Icon-forward list rows (API keys list, member list) instead of dense
  tables.
- Bottom tab navigation on mobile viewports instead of a fixed sidebar
  (sidebar can stay for desktop ≥768px).
- Smooth, snappy transitions (Framer Motion or CSS transitions — keep it
  lightweight, this is a dashboard not a game).

## Scope for this pass

**In scope:**
- `apps/web/src/app/globals.css` — new design tokens (`@theme` block):
  dark-first palette, both light/dark CSS variable sets (the artifact/theme
  convention already used elsewhere in this environment is
  `prefers-color-scheme` + `:root[data-theme]` overrides — mirror that here
  even though this is a real app, not an Artifact, since it's a solid
  light/dark pattern).
- `apps/web/src/components/ui/*` — rebuild `Button`, `Input`, `Label`,
  `Card`, and likely add `StatCard`/`Balance`-style and list-row primitives.
- `apps/web/src/components/login-form.tsx`,
  `apps/web/src/components/register-form.tsx` — restyle only, keep all
  existing logic (Zod validation, error handling, i18n `useTranslations`
  calls) untouched.
- `apps/web/src/components/dashboard-shell.tsx` — sidebar → responsive
  sidebar (desktop) + bottom nav (mobile) pattern.
- `apps/web/src/app/[locale]/dashboard/page.tsx` — restyle the
  organization overview card.
- `apps/web/src/components/language-switcher.tsx` — restyle to fit.

**Out of scope (do not touch):**
- Anything in `apps/api`, `apps/worker`, `packages/*` — this is frontend-only.
- Auth/validation logic, i18n message keys (reuse existing
  `messages/en.json` / `messages/ru.json` keys; add new ones only if new UI
  text is genuinely needed, keeping both locales in sync).
- The Phase 1 checkout page doesn't exist yet — don't build it as part of
  this pass unless the user explicitly asks; if they do, it's the screen
  where a wallet aesthetic matters most (spec §19/§90), so treat it as a
  natural extension of the same design system once built here.

## Suggested execution order

1. Get the visual reference from the user (see above) before writing code.
2. Load the `dataviz`/`artifact-design` design skills if available in the
   new session for palette/contrast guidance — this environment has design
   skills that codify a validated color-formula approach; reuse that
   discipline even for a real Next.js app, not just Artifacts.
3. Define the token palette in `globals.css` (light + dark), pick one accent
   blue, verify contrast (WCAG AA at minimum for text).
4. Rebuild the four existing UI primitives against the new tokens — commit
   to visual consistency before touching page layouts.
5. Restyle login → register → dashboard shell → overview, in that order
   (simplest screens first, so the component library gets exercised and
   corrected before the more complex shell).
6. Add a light/dark toggle if the reference uses both (Telegram itself
   follows the user's OS/app theme) — `prefers-color-scheme` as the default
   signal is enough for Phase 0; a manual toggle can come later.
7. Verify RU and EN both still render correctly (existing i18n plumbing
   doesn't change) and that mobile (375px) and desktop (1280px) both look
   right — use the browser tool's `resize_window` to check both.
8. Run `pnpm --filter @cryptopay/web run lint typecheck build test:unit`
   before calling it done — the existing test suite
   (`src/lib/cn.test.ts`, `src/lib/api-client.test.ts`) must keep passing;
   add tests for any new non-trivial logic (e.g. a theme-detection hook),
   not for pure styling changes.

## What "done" looks like

Visually verified in the actual browser (not just code review) at both
mobile and desktop widths, in both RU and EN, for: login, register, and the
dashboard overview with an organization. Existing Phase 0 functionality
(register → verify → login → dashboard → sign out, CSRF, BOLA empty states)
must still work exactly as before — this is a reskin, not a rewrite of
behavior.
