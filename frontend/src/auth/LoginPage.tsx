import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import { translate } from "@/i18n";
import { MfaVerifyForm } from "@/auth/MfaVerifyForm";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Field";
import { AlertCircle, BarChart3, Eye, EyeOff, Lock, Mail, ShieldCheck, Users, Wallet } from "lucide-react";

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
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
        navigate("/");
      }
    } catch {
      setError(translate("ar", "login_error"));
    } finally {
      setIsSubmitting(false);
    }
  }

  if (mfaChallengeToken) {
    return <MfaVerifyForm challengeToken={mfaChallengeToken} onSuccess={() => navigate("/")} />;
  }

  return (
    <div className="grid min-h-screen grid-cols-1 bg-white lg:grid-cols-[minmax(480px,5fr)_6fr]" dir="rtl">
      {/* Form panel */}
      <div className="relative flex flex-col justify-between px-6 py-8 sm:px-14">
        <div className="flex items-center justify-between">
          <img src="/logo.png" alt="AiSchool" className="h-10 w-auto object-contain" />
          <span className="rounded-full bg-ink-50 px-3 py-1 text-xs font-medium text-ink-600 ring-1 ring-inset ring-ink-200">لوحة الإدارة</span>
        </div>

        <div className="mx-auto w-full max-w-[400px] animate-fade-in py-10">
          <h1 className="text-[32px] font-bold leading-tight tracking-tight text-ink-900">{translate("ar", "login_title")}</h1>
          <p className="mt-2 text-[15px] text-ink-600">أدخل بياناتك للوصول إلى لوحة التحكم</p>

          <form onSubmit={handleSubmit} className="mt-9 space-y-5">
            <div>
              <Label htmlFor="email">{translate("ar", "login_email")}</Label>
              <div className="relative">
                <Mail size={17} className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-ink-500" />
                <Input
                  id="email" type="email" required value={email}
                  onChange={(e) => setEmail(e.target.value)} autoComplete="email"
                  className="ltr-content h-12 pr-11 text-left text-[15px]" placeholder="name@company.com"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="password">{translate("ar", "login_password")}</Label>
              <div className="relative">
                <Lock size={17} className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-ink-500" />
                <Input
                  id="password" type={showPassword ? "text" : "password"} required value={password}
                  onChange={(e) => setPassword(e.target.value)} autoComplete="current-password"
                  className="h-12 pl-11 pr-11 text-[15px]" placeholder="••••••••••••"
                />
                <button
                  type="button" onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
                  className="absolute left-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-ink-500 hover:bg-ink-100 hover:text-ink-800"
                >
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex animate-scale-in items-center gap-2 rounded-xl bg-danger-50 px-4 py-3 text-sm font-medium text-danger-700 ring-1 ring-inset ring-danger-100">
                <AlertCircle size={17} className="shrink-0" />
                {error}
              </div>
            )}

            <Button type="submit" variant="primary" size="lg" isLoading={isSubmitting} className="h-12 w-full text-[15px]">
              {translate("ar", "login_submit")}
            </Button>
          </form>

          <div className="mt-8 flex items-center gap-2.5 rounded-xl bg-ink-50 px-4 py-3 text-[13px] text-ink-700 ring-1 ring-inset ring-ink-100">
            <ShieldCheck size={17} className="shrink-0 text-brand-600" />
            اتصال آمن وصلاحيات مخصّصة لكل دور، مع سجلّ تدقيق كامل.
          </div>
        </div>

        <p className="text-center text-xs text-ink-500">AiSchool Management Platform &copy; {new Date().getFullYear()}</p>
      </div>

      {/* Brand panel (large screens) */}
      <div className="relative hidden overflow-hidden bg-brand-gradient lg:flex lg:flex-col lg:items-center lg:justify-center lg:p-12">
        <div
          className="absolute inset-0 opacity-[0.08]"
          style={{
            backgroundImage: "radial-gradient(rgba(255,255,255,0.9) 1.2px, transparent 1.2px)",
            backgroundSize: "26px 26px",
          }}
        />
        <div className="pointer-events-none absolute -bottom-32 -right-24 h-[26rem] w-[26rem] rounded-full bg-accent-400/30 blur-3xl" />
        <div className="pointer-events-none absolute -top-24 left-0 h-80 w-80 rounded-full bg-white/10 blur-3xl" />

        <div className="relative z-10 w-full max-w-[520px] text-white">
          <h2 className="text-[34px] font-bold leading-[1.3] tracking-tight">كل ما تحتاجه الإدارة، في لوحة واحدة واضحة.</h2>
          <p className="mt-3 max-w-md text-[16px] leading-relaxed text-white/80">
            مؤشرات الأداء، الاشتراكات، الحملات الإعلانية، والشؤون المالية — بأرقام موثوقة ومقارنة بالفترة السابقة.
          </p>

          {/* Product preview card */}
          <div className="ltr-content mt-9 rounded-[28px] text-left bg-white/95 p-4 text-ink-900 shadow-xl ring-1 ring-white/40" dir="ltr">
            <div className="mb-3 flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-ink-200" /><span className="h-2 w-2 rounded-full bg-ink-200" /><span className="h-2 w-2 rounded-full bg-ink-200" />
              <span className="mx-auto h-2 w-28 rounded-full bg-ink-100" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              {[
                { icon: Wallet, label: "Revenue", value: "SAR 5.7k", tint: "bg-success-50 text-success-600" },
                { icon: Users, label: "Subscribers", value: "10", tint: "bg-brand-50 text-brand-600" },
                { icon: BarChart3, label: "ROAS", value: "0.26", tint: "bg-accent-50 text-accent-600" },
              ].map((k) => (
                <div key={k.label} className="rounded-2xl bg-ink-25 p-3 ring-1 ring-inset ring-ink-100">
                  <span className={`mb-2 flex h-8 w-8 items-center justify-center rounded-lg ${k.tint}`}><k.icon size={15} /></span>
                  <p className="text-[11px] font-medium text-ink-600">{k.label}</p>
                  <p className="text-[16px] font-bold text-ink-900">{k.value}</p>
                </div>
              ))}
            </div>
            <div className="mt-3 rounded-2xl bg-ink-25 p-4 ring-1 ring-inset ring-ink-100">
              <svg viewBox="0 0 400 110" className="h-[110px] w-full" fill="none" aria-hidden="true">
                <defs>
                  <linearGradient id="lg-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#6d3af2" stopOpacity="0.22" /><stop offset="1" stopColor="#6d3af2" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path d="M0 80 C40 70 60 30 100 42 S170 90 210 58 S290 10 330 30 S380 40 400 18 V110 H0Z" fill="url(#lg-fill)" />
                <path d="M0 80 C40 70 60 30 100 42 S170 90 210 58 S290 10 330 30 S380 40 400 18" stroke="#6d3af2" strokeWidth="3" strokeLinecap="round" />
                <path d="M0 92 C50 84 90 70 140 76 S230 96 280 70 S360 56 400 50" stroke="#ff8a3d" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="2 7" />
              </svg>
            </div>
          </div>

          {/* hand-drawn style brand stroke */}
          <svg viewBox="0 0 160 14" className="mt-8 h-3.5 w-40 text-accent-300" fill="none" aria-hidden="true">
            <path d="M2 8 C 14 1, 22 13, 34 7 S 54 1, 66 7 S 86 13, 98 7 S 118 1, 130 7 S 148 12, 158 6" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          </svg>
        </div>
      </div>
    </div>
  );
}
