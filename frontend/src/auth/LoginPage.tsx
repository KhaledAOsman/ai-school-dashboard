import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/auth/AuthContext";
import { translate } from "@/i18n";
import { MfaVerifyForm } from "@/auth/MfaVerifyForm";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Field";
import { AlertCircle, BarChart3, CreditCard, Eye, EyeOff, GraduationCap, Lock, Mail, Megaphone, ShieldCheck, Users } from "lucide-react";

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
            لوحة التشغيل · AI School
          </span>
          <h1 className="text-[44px] font-medium leading-[52px] tracking-tight text-ink-900">{translate("ar", "login_title")}</h1>
          <p className="mt-3 text-[18px] leading-7 text-ink-600">سجّل الدخول لتشغيل ومتابعة منصة AI School.</p>

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

        <p className="text-center text-[13px] text-ink-600">AI School Operations Panel &copy; {new Date().getFullYear()}</p>
      </div>

      {/* Operations-panel side: sheetventure-style canvas with module cards */}
      <div className="hidden bg-[#f5f7fa] p-6 lg:block">
        <div className="flex h-full flex-col justify-center px-8 xl:px-14">
          <span className="inline-flex w-fit items-center gap-2 rounded-full border border-[#e1e7ef] bg-white px-4 py-1.5 text-[14px] font-medium text-ink-800">
            <span className="h-2 w-2 rounded-full bg-[#2fa56f]" />
            لوحة التشغيل
          </span>
          <h2 className="mt-5 max-w-[560px] text-[40px] font-bold leading-[50px] tracking-tight text-[#0d141c]">
            لوحة التشغيل الخاصة بمنصة AI School
          </h2>
          <p className="mt-3 max-w-[480px] text-[18px] leading-7 text-ink-600">
            من هنا يُدار تشغيل المنصة يوميًا: العملاء والحجوزات والاشتراكات والحملات ومؤشرات الأداء.
          </p>
          <div className="mt-10 grid max-w-[640px] grid-cols-2 gap-4 xl:grid-cols-3">
            {[
              { icon: Users, t: "العملاء والحجوزات" },
              { icon: GraduationCap, t: "المحاضرات والحضور" },
              { icon: CreditCard, t: "الاشتراكات" },
              { icon: Megaphone, t: "الحملات الإعلانية" },
              { icon: BarChart3, t: "مؤشرات الأداء" },
              { icon: ShieldCheck, t: "الفريق والصلاحيات" },
            ].map((m) => (
              <div key={m.t} className="rounded-xl border border-[#e1e7ef] bg-white p-4 shadow-[0_4px_24px_-4px_rgba(138,151,171,0.5)]">
                <m.icon size={22} className="text-brand-600" />
                <p className="mt-3 text-[15px] font-semibold text-[#0d141c]">{m.t}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
