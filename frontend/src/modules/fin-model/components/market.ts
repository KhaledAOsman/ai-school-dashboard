/** Public market figures used on the investor summary (sources shown on the page). */
export const MARKET = {
  ksaStudents: 6_000_000, // general-education students, school year 2025/26
  ksaSchools: 32_000,
  gccStudents: 13_100_000, // ~13.1M today, 14.2M projected for 2027
  ksaOnlineTutoringUsd2026: 118.9e6,
  ksaOnlineTutoringCagr: 0.1306,
  usdSar: 3.75,
  sources: [
    { ar: "أكثر من 6 ملايين طالب و32 ألف مدرسة في التعليم العام بالسعودية — النهار، أغسطس 2025", en: "6M+ students and ~32K schools in Saudi general education — Annahar, Aug 2025", url: "https://www.annahar.com/arab-world/arabian-gulf/239541/" },
    { ar: "سوق الدروس الخصوصية الأونلاين في السعودية 118.9 مليون دولار (2026) ونمو 13.06% سنويًا حتى 2034 — IMARC", en: "Saudi online tutoring market USD 118.9M (2026), 13.06% CAGR to 2034 — IMARC Group", url: "https://www.imarcgroup.com/saudi-arabia-online-tutoring-market" },
    { ar: "طلاب الخليج نحو 14.2 مليون بحلول 2027 — Alpen Capital عبر Arabian Business", en: "GCC students to reach 14.2M by 2027 — Alpen Capital via Arabian Business", url: "https://www.arabianbusiness.com/gcc/number-of-students-in-gcc-projected-to-reach-14-2-million-by-2027-report" },
  ],
};

export function onlineTutoringMarketSar(yearsFrom2026: number): number {
  return MARKET.ksaOnlineTutoringUsd2026 * (1 + MARKET.ksaOnlineTutoringCagr) ** yearsFrom2026 * MARKET.usdSar;
}
