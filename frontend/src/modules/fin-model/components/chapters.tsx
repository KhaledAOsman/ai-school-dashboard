/**
 * The investor presentation is told as numbered chapters, in the order a
 * non-financial reader needs them: what we are -> how we make money -> how we
 * grow -> the numbers -> what we need -> what could go wrong.
 */
import { createContext, useContext, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import clsx from "clsx";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Reveal } from "@/components/motion";
import { useFM } from "../context";

export interface Chapter { to: string; ar: string; en: string; lede_ar: string; lede_en: string; short?: [string, string] }

export const CHAPTERS: Chapter[] = [
  { to: "overview", short: ["الملخص", "Summary"], ar: "الملخص التنفيذي", en: "Executive summary",
    lede_ar: "المشروع ووضعه الحالي وأهم أرقام الخطة في صفحة واحدة.", lede_en: "The business, where it stands today and the plan's key figures on one page." },
  { to: "business-model", short: ["نموذج العمل", "Model"], ar: "نموذج العمل", en: "Business model",
    lede_ar: "كيف يصل العميل إلينا، وماذا يشتري، ومن يقدّم الخدمة.", lede_en: "How customers reach us, what they buy and who delivers the service." },
  { to: "unit-economics", short: ["اقتصاديات الاشتراك", "Unit economics"], ar: "اقتصاديات الاشتراك", en: "Unit economics",
    lede_ar: "إيراد الاشتراك الواحد وتكلفته وربحه، وتكلفة الحصول على مشترك جديد.", lede_en: "Revenue, cost and profit of one subscription, and the cost of winning a new subscriber." },
  { to: "sales-plan", short: ["المبيعات", "Sales"], ar: "خطة المبيعات والإيرادات", en: "Sales & revenue plan",
    lede_ar: "عدد المحاضرات المجانية والاشتراكات المدفوعة شهريًا وسنويًا، والإيراد الناتج عنها.", lede_en: "Free lectures and paid subscriptions per month and per year, and the revenue they produce." },
  { to: "expenses", short: ["المصروفات", "Expenses"], ar: "المصروفات واستخدام الأموال", en: "Expenses & use of funds",
    lede_ar: "أين تُصرف الأموال، موزعة على بنود واضحة لكل سنة.", lede_en: "Where the money goes, by clear category for every year." },
  { to: "statements", short: ["القوائم المالية", "Statements"], ar: "القوائم المالية", en: "Financial statements",
    lede_ar: "قائمة الدخل والتدفقات النقدية والمركز المالي لخمس سنوات.", lede_en: "Income statement, cash flow and balance sheet for five years." },
  { to: "funding", short: ["التمويل", "Funding"], ar: "التمويل والعائد", en: "Funding & returns",
    lede_ar: "حجم التمويل المطلوب وأوجه استخدامه وطريقة سداده والعائد المتوقع.", lede_en: "The funding required, how it is used, how it is repaid and the expected return." },
  { to: "scenarios", short: ["المخاطر", "Risks"], ar: "المخاطر والسيناريوهات", en: "Risks & scenarios",
    lede_ar: "العوامل التي قد تغيّر النتائج، وخطة التعامل معها.", lede_en: "What could change the outcome, and how it is managed." },
];

export const TOOLS = [
  { to: "actual-vs-plan", ar: "الفعلي مقابل الخطة", en: "Actual vs plan" },
  { to: "assumptions", ar: "الافتراضات", en: "Assumptions" },
  { to: "versions", ar: "النسخ والنشر", en: "Versions", editorsOnly: true },
];

/** true inside the printable report: chapter navigation is hidden there. */
export const ReportMode = createContext(false);

const two = (n: number) => String(n).padStart(2, "0");

export function ChapterHeader({ id, children }: { id: string; children?: ReactNode }) {
  const { lang } = useFM();
  const ar = lang === "ar";
  const i = CHAPTERS.findIndex((c) => c.to === id);
  const c = CHAPTERS[i];
  return (
    <Reveal>
      <header className={clsx("mb-6 print:mb-3", i > 0 && "print:break-before-page")}>
        <p className="text-[13px] font-semibold tracking-wide text-accent-600">
          {ar ? `الفصل ${two(i + 1)} من ${two(CHAPTERS.length)}` : `Chapter ${two(i + 1)} of ${two(CHAPTERS.length)}`}
        </p>
        <h2 className="mt-1 text-[24px] font-bold leading-9 tracking-tight text-ink-900 sm:text-[28px] sm:leading-10">{ar ? c.ar : c.en}</h2>
        <p className="mt-1 max-w-[760px] text-[15px] leading-7 text-ink-600">{ar ? c.lede_ar : c.lede_en}</p>
        {children}
      </header>
    </Reveal>
  );
}

export function ChapterNav({ id }: { id: string }) {
  const inReport = useContext(ReportMode);
  const { lang } = useFM();
  const { search } = useLocation();
  if (inReport) return null;
  const ar = lang === "ar";
  const i = CHAPTERS.findIndex((c) => c.to === id);
  const prev = CHAPTERS[i - 1], next = CHAPTERS[i + 1];
  const Back = ar ? ArrowRight : ArrowLeft, Fwd = ar ? ArrowLeft : ArrowRight;
  return (
    <nav className="mt-8 grid gap-3 border-t border-ink-200 pt-6 sm:grid-cols-2 print:hidden">
      {prev ? (
        <Link to={`../${prev.to}${search}`} className="group rounded-xl border border-[#e1e7ef] bg-white p-4 transition-colors hover:border-brand-600">
          <span className="flex items-center gap-1.5 text-[12.5px] text-ink-600"><Back size={14} /> {ar ? "السابق" : "Previous"}</span>
          <span className="mt-1 block text-[16px] font-bold text-ink-900 group-hover:text-brand-700">{two(i)} · {ar ? prev.ar : prev.en}</span>
        </Link>
      ) : <span className="hidden sm:block" />}
      {next && (
        <Link to={`../${next.to}${search}`} className="group rounded-xl border border-brand-600 bg-brand-600 p-4 text-white transition-colors hover:bg-brand-700 sm:text-end">
          <span className="flex items-center gap-1.5 text-[12.5px] text-white/80 sm:justify-end">{ar ? "التالي" : "Next"} <Fwd size={14} /></span>
          <span className="mt-1 block text-[16px] font-bold">{two(i + 2)} · {ar ? next.ar : next.en}</span>
        </Link>
      )}
    </nav>
  );
}

/** A titled block inside a chapter: numbered sub-heading + short explanation. */
export function Block({ n, title, lede, children, className }: { n?: string; title: string; lede?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={clsx("print:break-inside-avoid", className)}>
      <div className="mb-3">
        <h3 className="flex items-baseline gap-2 text-[19px] font-bold leading-8 text-ink-900">
          {n && <span className="ltr-content text-[14px] font-bold text-brand-600">{n}</span>}
          <span>{title}</span>
        </h3>
        {lede && <p className="mt-0.5 max-w-[820px] text-[14.5px] leading-7 text-ink-600">{lede}</p>}
      </div>
      {children}
    </section>
  );
}

const TOOL_LEDE: Record<string, [string, string]> = {
  "actual-vs-plan": ["مقارنة شهرية بين الأرقام الفعلية في لوحة التحكم وأرقام الخطة.", "Monthly comparison of actual dashboard figures with the plan."],
  assumptions: ["جميع المدخلات التي تُبنى عليها الخطة. يعدّلها المحلل المالي في المسودات فقط.", "Every input the plan is built on. Editable by the financial analyst on drafts only."],
  versions: ["المسودات والنسخ المعتمدة للمستثمرين وسجل التعديلات.", "Drafts, versions published to investors and the change history."],
};

export function ToolHeader({ to }: { to: string }) {
  const { lang } = useFM();
  const ar = lang === "ar";
  const tool = TOOLS.find((x) => x.to === to)!;
  return (
    <header className="mb-5">
      <p className="text-[13px] font-semibold text-ink-500">{ar ? "أدوات المحلل" : "Analyst tools"}</p>
      <h2 className="mt-0.5 text-[22px] font-bold leading-8 text-ink-900">{ar ? tool.ar : tool.en}</h2>
      <p className="mt-0.5 text-[14.5px] leading-7 text-ink-600">{TOOL_LEDE[to][ar ? 0 : 1]}</p>
    </header>
  );
}
