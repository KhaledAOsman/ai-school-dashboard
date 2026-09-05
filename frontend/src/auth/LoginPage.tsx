import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import { translate } from "@/i18n";
import { MfaVerifyForm } from "@/auth/MfaVerifyForm";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Field";
import { AlertCircle, Lock, Mail, ShieldCheck, Sparkles } from "lucide-react";

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mfaChallengeToken, setMfaChallengeToken] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const result = await login(email, password);
      if (result.mfaRequired && result.mfaChallengeToken) {
        setMfaChallengeToken(result.mfaChallengeToken);
      } else {
        navigate("/dashboard");
      }
    } catch {
      setError(translate("ar", "login_error"));
    } finally {
      setIsSubmitting(false);
    }
  }

  if (mfaChallengeToken) {
    return <MfaVerifyForm challengeToken={mfaChallengeToken} onSuccess={() => navigate("/dashboard")} />;
  }

  return (
    <div className="grid min-h-screen grid-cols-1 lg:grid-cols-5" dir="rtl">
      {/* Brand panel - visible on large screens only */}
      <div className="relative hidden overflow-hidden bg-ink-950 lg:col-span-2 lg:flex lg:flex-col lg:justify-between">
        <div className="absolute inset-0 bg-brand-gradient opacity-95" />
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)",
            backgroundSize: "36px 36px",
          }}
        />
        <div className="pointer-events-none absolute -bottom-32 -left-32 h-96 w-96 rounded-full bg-accent-400/30 blur-3xl" />
        <div className="pointer-events-none absolute -top-20 right-0 h-72 w-72 rounded-full bg-white/10 blur-3xl" />

        <div className="relative z-10 p-10">
          <img src="/logo.png" alt="AiSchool" className="h-10 w-auto object-contain brightness-0 invert" />
        </div>

        <div className="relative z-10 px-10 pb-14">
          <h2 className="max-w-sm text-[28px] font-bold leading-tight tracking-tight text-white">
            منصّة إدارة موحّدة لكل شؤونكم المالية والإدارية
          </h2>
          <p className="mt-3 max-w-sm text-[15px] leading-relaxed text-white/70">
            تحكّم كامل في المصروفات، الموافقات، والصلاحيات — في مكان واحد آمن وموثوق.
          </p>

          <div className="mt-8 flex flex-col gap-3">
            {[
              { icon: ShieldCheck, text: "صلاحيات دقيقة لكل دور في مؤسستك" },
              { icon: Sparkles, text: "سجل تدقيق كامل لكل عملية" },
            ].map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-3 text-sm text-white/85">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 ring-1 ring-inset ring-white/15">
                  <Icon size={15} />
                </span>
                {text}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center bg-ink-50 px-6 py-12 lg:col-span-3">
        <div className="w-full max-w-[380px] animate-fade-in">
          <div className="mb-8 flex flex-col items-center gap-3 lg:hidden">
            <img src="/logo.png" alt="AiSchool" className="h-12 w-auto object-contain" />
          </div>

          <h2 className="text-2xl font-bold tracking-tight text-ink-900">{translate("ar", "login_title")}</h2>
          <p className="mt-1.5 text-sm text-ink-500">أدخل بياناتك للوصول إلى لوحة التحكم</p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
            <div>
              <Label htmlFor="email">{translate("ar", "login_email")}</Label>
              <div className="relative">
                <Mail size={16} className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-ink-400" />
                <Input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  className="ltr-content pr-10 text-left"
                  placeholder="name@company.com"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="password">{translate("ar", "login_password")}</Label>
              <div className="relative">
                <Lock size={16} className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-ink-400" />
                <Input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  className="pr-10"
                  placeholder="••••••••"
                />
              </div>
            </div>

            {error && (
              <div className="flex animate-scale-in items-center gap-2 rounded-lg bg-danger-50 px-3.5 py-2.5 text-sm text-danger-700 ring-1 ring-inset ring-danger-100">
                <AlertCircle size={16} className="shrink-0" />
                {error}
              </div>
            )}

            <Button type="submit" variant="primary" size="lg" isLoading={isSubmitting} className="w-full">
              {translate("ar", "login_submit")}
            </Button>
          </form>

          <p className="mt-8 text-center text-xs text-ink-400">
            AiSchool Management Platform &copy; {new Date().getFullYear()}
          </p>
        </div>
      </div>
    </div>
  );
}
