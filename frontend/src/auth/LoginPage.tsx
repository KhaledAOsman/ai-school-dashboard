import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import { translate } from "@/i18n";
import { MfaVerifyForm } from "@/auth/MfaVerifyForm";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Field";
import { AlertCircle, Bell, Clock, Eye, EyeOff, Globe, HelpCircle, Heart, LayoutGrid, Lock, Mail, Search, ShieldCheck } from "lucide-react";

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
    <div className="grid min-h-screen grid-cols-1 bg-white lg:grid-cols-[minmax(460px,5fr)_7fr]" dir="rtl">
      {/* Form side */}
      <div className="flex flex-col px-6 py-8 sm:px-16">
        <img src="/logo.png" alt="AiSchool" className="h-11 w-auto self-start object-contain" />

        <div className="mx-auto flex w-full max-w-[420px] flex-1 animate-fade-in flex-col justify-center py-10">
          <span className="mb-5 inline-flex w-fit items-center rounded-full bg-brand-50 px-5 py-2 text-[14px] font-semibold text-brand-600">
            لوحة إدارة AiSchool
          </span>
          <h1 className="text-[44px] font-medium leading-[52px] tracking-tight text-ink-900">{translate("ar", "login_title")}</h1>
          <p className="mt-3 text-[18px] leading-7 text-ink-600">أدخل بياناتك للوصول إلى لوحة التحكم.</p>

          <form onSubmit={handleSubmit} className="mt-10 space-y-6">
            <div>
              <Label htmlFor="email">{translate("ar", "login_email")}</Label>
              <div className="relative">
                <Mail size={19} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-ink-500" />
                <Input
                  id="email" type="email" required value={email}
                  onChange={(e) => setEmail(e.target.value)} autoComplete="email"
                  className="ltr-content h-14 pr-12 text-left text-[16px]" placeholder="name@company.com"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="password">{translate("ar", "login_password")}</Label>
              <div className="relative">
                <Lock size={19} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-ink-500" />
                <Input
                  id="password" type={showPassword ? "text" : "password"} required value={password}
                  onChange={(e) => setPassword(e.target.value)} autoComplete="current-password"
                  className="h-14 pl-12 pr-12 text-[16px]" placeholder="••••••••••••"
                />
                <button
                  type="button" onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
                  className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full p-2 text-ink-600 hover:bg-ink-100"
                >
                  {showPassword ? <EyeOff size={19} /> : <Eye size={19} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex animate-scale-in items-center gap-2 rounded-2xl bg-danger-50 px-4 py-3 text-[15px] font-medium text-danger-700 ring-1 ring-inset ring-danger-100">
                <AlertCircle size={18} className="shrink-0" />
                {error}
              </div>
            )}

            <Button type="submit" variant="primary" size="lg" isLoading={isSubmitting} className="w-full">
              {translate("ar", "login_submit")}
            </Button>
          </form>

          <p className="mt-8 flex items-center gap-2.5 text-[14px] text-ink-600">
            <ShieldCheck size={18} className="shrink-0 text-brand-600" />
            اتصال آمن وصلاحيات مخصّصة لكل دور، مع سجلّ تدقيق كامل.
          </p>
        </div>

        <p className="text-center text-[13px] text-ink-600">AiSchool Management Platform &copy; {new Date().getFullYear()}</p>
      </div>

      {/* Kit "graphics" container: lavender rounded panel holding a product preview */}
      <div className="hidden p-6 lg:block">
        <div className="relative flex h-full flex-col items-center justify-center overflow-hidden rounded-[40px] bg-brand-50 px-12 pb-0 pt-14">
          <div className="text-center">
            <span className="inline-flex rounded-full bg-white px-5 py-2 text-[14px] font-semibold text-brand-600 ring-1 ring-inset ring-brand-200/70">
              مؤشرات الأداء · الاشتراكات · الحملات
            </span>
            <div className="mx-auto mt-5 h-1.5 w-16 rounded-full bg-accent-400" />
            <h2 className="mx-auto mt-5 max-w-[560px] text-[40px] font-medium leading-[48px] tracking-tight text-ink-900">
              كل ما تحتاجه الإدارة، في لوحة واحدة واضحة
            </h2>
            <p className="mx-auto mt-3 max-w-[480px] text-[18px] leading-7 text-ink-600">
              أرقام موثوقة ومقارنة بالفترة السابقة لاتخاذ قرارات أسرع.
            </p>
          </div>

          {/* Product preview (mirrors the kit's dashboard mockup) */}
          <div className="ltr-content mt-10 w-full max-w-[760px] flex-1 overflow-hidden rounded-t-[28px] bg-white p-3 text-left shadow-lg ring-1 ring-ink-200" dir="ltr">
            <div className="grid h-full grid-cols-[150px_1fr] gap-4 rounded-[20px] bg-white">
              <div className="border-e border-ink-100 p-3">
                <div className="mb-4 flex items-center gap-2"><span className="h-6 w-6 rounded-full bg-brand-600" /><span className="text-[13px] font-semibold text-ink-900">AiSchool</span></div>
                {["Dashboard", "Subscribers", "Campaigns", "Finance", "CRM"].map((n, i) => (
                  <div key={n} className={`mb-1 rounded-lg px-2.5 py-2 text-[12px] font-medium ${i === 0 ? "bg-ink-100 text-ink-900" : "text-ink-600"}`}>{n}</div>
                ))}
              </div>
              <div className="min-w-0 py-3 pe-3">
                <div className="mb-3 flex items-center gap-2">
                  <div className="flex flex-1 items-center gap-2 rounded-lg border border-ink-200 px-3 py-1.5 text-[12px] text-ink-500"><Search size={13} /> Search</div>
                  <Bell size={14} className="text-ink-500" /><Globe size={14} className="text-ink-500" /><HelpCircle size={14} className="text-ink-500" />
                </div>
                <div className="grid grid-cols-4 gap-2.5">
                  {[
                    { icon: Clock, label: "Revenue", value: "5.7k", d: "12%" },
                    { icon: LayoutGrid, label: "Subscribers", value: "10", d: "8%" },
                    { icon: Heart, label: "Conversion", value: "25%", d: "4%" },
                    { icon: Globe, label: "ROAS", value: "0.26", d: "2%" },
                  ].map((k) => (
                    <div key={k.label} className="rounded-xl border border-ink-200 p-2.5">
                      <span className="mb-2 flex h-7 w-7 items-center justify-center rounded-lg bg-brand-50 text-brand-600"><k.icon size={13} /></span>
                      <p className="text-[11px] text-ink-600">{k.label}</p>
                      <div className="flex items-center justify-between"><span className="text-[17px] font-medium text-ink-900">{k.value}</span><span className="rounded-full bg-[#e3f7ea] px-1.5 text-[10px] font-semibold text-[#136c3a]">{k.d} ▲</span></div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 grid grid-cols-[1.7fr_1fr] gap-2.5">
                  <div className="rounded-xl border border-ink-200 p-3">
                    <p className="mb-1 text-[12px] font-semibold text-ink-900">Performance</p>
                    <svg viewBox="0 0 400 110" className="h-[100px] w-full" fill="none" aria-hidden="true">
                      <defs><linearGradient id="lg-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#6d3af2" stopOpacity="0.2" /><stop offset="1" stopColor="#6d3af2" stopOpacity="0" /></linearGradient></defs>
                      <path d="M0 70 C40 60 60 25 100 38 S170 85 210 55 S290 12 330 30 S380 36 400 18 V110 H0Z" fill="url(#lg-fill)" />
                      <path d="M0 70 C40 60 60 25 100 38 S170 85 210 55 S290 12 330 30 S380 36 400 18" stroke="#6d3af2" strokeWidth="2.5" strokeLinecap="round" />
                      <path d="M0 92 C50 84 90 70 140 76 S230 96 280 70 S360 56 400 50" stroke="#bea3ff" strokeWidth="2.5" strokeLinecap="round" />
                    </svg>
                  </div>
                  <div className="flex items-center justify-center rounded-xl border border-ink-200 p-3">
                    <svg viewBox="0 0 100 100" className="h-[96px] w-[96px]" fill="none" aria-hidden="true">
                      <circle cx="50" cy="50" r="36" stroke="#ebe4ff" strokeWidth="12" />
                      <circle cx="50" cy="50" r="36" stroke="#6d3af2" strokeWidth="12" strokeLinecap="round" strokeDasharray="130 226" transform="rotate(-90 50 50)" />
                      <circle cx="50" cy="50" r="36" stroke="#bea3ff" strokeWidth="12" strokeLinecap="round" strokeDasharray="50 226" strokeDashoffset="-140" transform="rotate(-90 50 50)" />
                    </svg>
                  </div>
                </div>
                <div className="mt-3 rounded-xl border border-ink-200">
                  {[["Snapchat", "40.2%", "263"], ["Meta", "49.1%", "371"], ["TikTok", "10.7%", "22"]].map(([n, a, b]) => (
                    <div key={n} className="flex items-center justify-between border-b border-ink-100 px-3 py-2 text-[12px] last:border-0">
                      <span className="font-medium text-ink-900">{n}</span><span className="text-ink-600">{a}</span><span className="text-ink-900">{b}</span>
                      <span className="rounded-full bg-[#e3f7ea] px-2 text-[10px] font-semibold text-[#136c3a]">Active</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
