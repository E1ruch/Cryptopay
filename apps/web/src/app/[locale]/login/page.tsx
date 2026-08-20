import { LoginForm } from '@/components/login-form';
import { LanguageSwitcher } from '@/components/language-switcher';

export default function LoginPage() {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center gap-6 overflow-hidden bg-ink-50 px-4">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(50%_60%_at_50%_0%,var(--color-brand-100),transparent)]"
      />
      <div className="relative animate-fade-up">
        <LanguageSwitcher />
      </div>
      <div className="relative animate-fade-up [animation-delay:80ms]">
        <LoginForm />
      </div>
    </main>
  );
}
