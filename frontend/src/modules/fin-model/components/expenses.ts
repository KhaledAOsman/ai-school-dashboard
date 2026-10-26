/** Board-level expense categories: every cost line of the model maps to exactly one. */
import type { ExpenseCategory, HireCategory } from "../api";

export const EXPENSE_ORDER: ExpenseCategory[] = [
  "teachers", "content", "marketing_team", "ads", "marketing_extra", "cs", "quality", "tools",
  "commissions", "payment_fees", "admin", "launch",
];

export const EXPENSE_LABELS: Record<ExpenseCategory, { ar: string; en: string; d_ar: string; d_en: string; color: string }> = {
  teachers: { ar: "المعلمون", en: "Teachers", color: "#ff8a3d",
    d_ar: "أجر عن كل محاضرة مدفوعة أو مجانية، دون رواتب ثابتة، إضافة إلى تكلفة تأهيل المعلمين الجدد.",
    d_en: "A fee per paid or free lecture with no fixed salary, plus onboarding of new teachers." },
  content: { ar: "تطوير المحتوى والمناهج", en: "Content & curriculum", color: "#3d1fa3",
    d_ar: "فريق تطوير المحتوى لتحديث المناهج وتحسينها وإعداد المستويات الجديدة.",
    d_en: "The content team that updates and improves the curriculum and builds new levels." },
  marketing_team: { ar: "فريق التسويق والمبيعات", en: "Marketing & sales team", color: "#6d3af2",
    d_ar: "رواتب فريق التسويق والتصميم ومشتري الإعلانات ومسؤولي مبيعات الشراكات.",
    d_en: "Salaries of the marketing, design, media-buying and partnership sales staff." },
  ads: { ar: "الإعلانات الممولة", en: "Paid advertising", color: "#9b7bff",
    d_ar: "الإنفاق الإعلاني اللازم لجلب العملاء المحتملين للمحاضرات المجانية.",
    d_en: "Ad spend needed to bring the leads who book the free lectures." },
  marketing_extra: { ar: "المؤثرون ومحتوى UGC", en: "Influencers & UGC", color: "#bea3ff",
    d_ar: "حملات المؤثرين ومحتوى المستخدمين (UGC) والإنتاج التسويقي.",
    d_en: "Influencer campaigns, user-generated content and marketing production." },
  cs: { ar: "خدمة العملاء", en: "Customer service", color: "#f5b83d",
    d_ar: "فريق متابعة الحجوزات والاشتراكات وأولياء الأمور، ويزيد مع حجم العمليات.",
    d_en: "The team handling bookings, subscriptions and parents; it grows with volume." },
  quality: { ar: "الجودة ومتابعة المحاضرات", en: "Quality & lecture review", color: "#ffc49b",
    d_ar: "فريق جديد يراجع عينات من المحاضرات ويقيّم المعلمين ويتابع رضا العملاء.",
    d_en: "A new team that reviews sample lectures, evaluates teachers and tracks satisfaction." },
  tools: { ar: "الاشتراكات الشهرية", en: "Monthly subscriptions", color: "#8f97b3",
    d_ar: "منصات المحاضرات وأدوات الذكاء الاصطناعي والاتصالات والبرمجيات.",
    d_en: "Lecture platforms, AI tools, telecom and software." },
  commissions: { ar: "عمولات المبيعات", en: "Sales commissions", color: "#c9cee0",
    d_ar: "عمولة ثابتة عن كل اشتراك مدفوع.", d_en: "A fixed commission on every paid subscription." },
  payment_fees: { ar: "رسوم الدفع الإلكتروني", en: "Payment fees", color: "#dcdfeb",
    d_ar: "رسوم بوابات الدفع على كل عملية.", d_en: "Payment-gateway fees on every transaction." },
  admin: { ar: "الإدارة والرسوم النظامية", en: "Management & statutory fees", color: "#555b7a",
    d_ar: "الإدارة والعمليات والمحاسبة والتراخيص والاعتمادات والرسوم الحكومية.",
    d_en: "Management, operations, accounting, licences, accreditation and government fees." },
  launch: { ar: "إطلاق منتجات جديدة", en: "New product launches", color: "#2d3149",
    d_ar: "تكلفة إطلاق كل منتج جديد لمرة واحدة.", d_en: "One-off launch cost of each new product." },
};

export const HIRE_CATEGORIES: { value: HireCategory; ar: string; en: string }[] = [
  { value: "marketing", ar: "التسويق والمبيعات", en: "Marketing & sales" },
  { value: "content", ar: "تطوير المحتوى", en: "Content" },
  { value: "cs", ar: "خدمة العملاء", en: "Customer service" },
  { value: "quality", ar: "الجودة", en: "Quality" },
  { value: "admin", ar: "الإدارة", en: "Management" },
];
