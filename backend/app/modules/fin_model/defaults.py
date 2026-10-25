"""
Default assumptions of the investor financial model (base case).

Every number here is a *starting point* for the financial analyst, not a
fact: each one is editable from the Assumptions page, and the fields listed
in ``AUTO_FIELDS`` are replaced by the platform's own actual data
(calibration.py) until the analyst switches them to manual.

Units: money in SAR, rates as fractions (0.25 = 25 %), months as
"YYYY-MM". Prices are what the customer pays (VAT-inclusive once the
company is VAT registered).
"""
from __future__ import annotations

import copy

# calendar-month seasonality of the marketing budget (1 = normal month).
# Saudi school calendar: summer holiday (Jun-Aug) is the main expansion
# season (x2), with smaller peaks before the autumn / winter / Eid breaks.
SEASONALITY = {
    "1": 1.2, "2": 1.0, "3": 1.3, "4": 1.0, "5": 1.5, "6": 2.0,
    "7": 2.0, "8": 1.5, "9": 1.1, "10": 1.0, "11": 1.3, "12": 1.2,
}

DEFAULT_ASSUMPTIONS: dict = {
    "general": {
        "start_month": "2026-10",
        "horizon_months": 60,
        "weeks_per_month": 4.345,
    },
    # ------------------------------------------------------------ markets
    # Marketing funnels. Every "funnel" revenue stream draws its new
    # customers from one market's funnel, in proportion to its share.
    "markets": [
        {
            "id": "ksa",
            "name_ar": "السعودية",
            "name_en": "Saudi Arabia",
            "start_month": "2026-10",
            # base monthly ad budget per model year (before seasonality)
            "budget_by_year": [15000, 20000, 28000, 35000, 42000],
            "seasonality": dict(SEASONALITY),
            "cpl": 46.0,                # cost per paid (ad) lead, SAR
            "organic_share": 0.25,      # share of all leads that come free (direct visits, referrals, organic social)
            "organic_share_target": 0.35,
            "cpl_growth_yoy": 0.05,     # ad prices inflate each year
            "lead_to_trial": 0.31,      # leads that book the free trial lecture
            "lead_to_trial_target": 0.38,
            "show_rate": 0.60,          # booked trials actually attended
            "show_rate_target": 0.70,
            "trial_to_paid": 0.074,     # attended trials that subscribe
            "trial_to_paid_target": 0.25,
            "ramp_months": 12,          # months to reach the targets
            "trial_cost": 15.0,         # teacher fee per booked trial (paid even on no-show)
        },
        {
            "id": "gcc",
            "name_ar": "الخليج",
            "name_en": "GCC",
            "start_month": "2027-09",
            "budget_by_year": [0, 10000, 18000, 25000, 30000],
            "seasonality": dict(SEASONALITY),
            "cpl": 55.0,
            "organic_share": 0.10,
            "organic_share_target": 0.25,
            "cpl_growth_yoy": 0.05,
            "lead_to_trial": 0.30,
            "lead_to_trial_target": 0.36,
            "show_rate": 0.60,
            "show_rate_target": 0.70,
            "trial_to_paid": 0.12,
            "trial_to_paid_target": 0.22,
            "ramp_months": 12,
            "trial_cost": 15.0,
        },
    ],
    # ---------------------------------------------------- revenue streams
    # driver "funnel": new customers come from a market's ad funnel (share = part of that funnel)
    # driver "growth": new enrolments start at `initial_monthly` and grow monthly (B2B, programs)
    "streams": [
        {
            "id": "core_b2c",
            "name_ar": "الاشتراك الأساسي (أفراد - السعودية)",
            "name_en": "Core subscription (B2C - KSA)",
            "enabled": True,
            "suggested": False,
            "driver": "funnel",
            "market": "ksa",
            "funnel_share": 0.85,
            "start_month": "2026-10",
            "list_price": 850.0,
            "avg_discount": 0.25,
            "lessons": 12,
            "lessons_per_week": 2,
            "group_size": 1,
            "teacher_cost_per_lesson": 15.0,
            "commission_per_enrolment": 50.0,
            "renewal_rate": 0.083,
            # a levelled curriculum (level 1, 2, 3 ...) is what turns one purchase into several
            "renewal_rate_target": 0.60,
            "renewal_ramp_months": 12,
            "payment_lag_months": 0,
            "uses_gateway": True,
            "launch_cost": 0.0,
        },
        {
            "id": "curriculum",
            "name_ar": "كورسات البرمجة للمناهج السعودية (مجموعات صغيرة)",
            "name_en": "Saudi-curriculum coding courses (small groups)",
            "enabled": True,
            "suggested": False,
            "driver": "funnel",
            "market": "ksa",
            "funnel_share": 0.15,
            "start_month": "2027-01",
            "list_price": 450.0,
            "avg_discount": 0.10,
            "lessons": 8,
            "lessons_per_week": 2,
            "group_size": 4,
            "teacher_cost_per_lesson": 20.0,
            "commission_per_enrolment": 30.0,
            "renewal_rate": 0.35,
            "renewal_rate_target": 0.50,
            "renewal_ramp_months": 12,
            "payment_lag_months": 0,
            "uses_gateway": True,
            "launch_cost": 15000.0,
        },
        {
            "id": "schools",
            "name_ar": "المدارس والشركات والشراكات (خصم 50%)",
            "name_en": "Schools, companies & partnerships (50% off)",
            "enabled": True,
            "suggested": False,
            "driver": "growth",
            "start_month": "2027-03",
            "initial_monthly": 20,
            "monthly_growth": 0.12,
            "max_monthly": 400,
            # school year only: no new school enrolments in Jun-Aug
            "active_months": [1, 2, 3, 4, 5, 9, 10, 11, 12],
            "list_price": 850.0,
            "avg_discount": 0.50,
            "lessons": 12,
            "lessons_per_week": 2,
            # schools enrol whole classes: one teacher runs a small online class
            "group_size": 5,
            "teacher_cost_per_lesson": 15.0,
            "commission_per_enrolment": 0.0,
            "renewal_rate": 0.40,
            "renewal_rate_target": 0.60,
            "renewal_ramp_months": 12,
            "payment_lag_months": 2,
            "uses_gateway": False,
            "launch_cost": 10000.0,
        },
        {
            "id": "nsma",
            "name_ar": "برنامج أولمبياد البرمجة NSMA (السعودية)",
            "name_en": "NSMA programming olympiad program (KSA)",
            "enabled": True,
            "suggested": False,
            "driver": "growth",
            "start_month": "2027-01",
            "initial_monthly": 15,
            "monthly_growth": 0.04,
            "max_monthly": 150,
            # preparation season before the national rounds
            "active_months": [9, 10, 11, 12, 1, 2],
            "list_price": 1500.0,
            "avg_discount": 0.10,
            "lessons": 24,
            "lessons_per_week": 2,
            "group_size": 4,
            "teacher_cost_per_lesson": 40.0,
            "commission_per_enrolment": 50.0,
            "renewal_rate": 0.0,
            "renewal_rate_target": 0.0,
            "renewal_ramp_months": 12,
            "payment_lag_months": 0,
            "uses_gateway": True,
            "launch_cost": 20000.0,
        },
        {
            "id": "gcc_b2c",
            "name_ar": "الاشتراك الأساسي (أفراد - الخليج)",
            "name_en": "Core subscription (B2C - GCC)",
            "enabled": True,
            "suggested": False,
            "driver": "funnel",
            "market": "gcc",
            "funnel_share": 1.0,
            "start_month": "2027-09",
            "list_price": 1050.0,
            "avg_discount": 0.25,
            "lessons": 12,
            "lessons_per_week": 2,
            "group_size": 1,
            "teacher_cost_per_lesson": 15.0,
            "commission_per_enrolment": 50.0,
            "renewal_rate": 0.30,
            "renewal_rate_target": 0.55,
            "renewal_ramp_months": 12,
            "payment_lag_months": 0,
            "uses_gateway": True,
            "launch_cost": 25000.0,
        },
        {
            "id": "summer_camp",
            "name_ar": "المعسكرات الصيفية المكثفة (مقترح)",
            "name_en": "Intensive summer camps (suggested)",
            "enabled": True,
            "suggested": True,
            "driver": "growth",
            "start_month": "2027-06",
            "initial_monthly": 30,
            "monthly_growth": 0.10,
            "max_monthly": 400,
            "active_months": [6, 7, 8],
            "list_price": 1200.0,
            "avg_discount": 0.15,
            "lessons": 16,
            "lessons_per_week": 4,
            "group_size": 6,
            "teacher_cost_per_lesson": 25.0,
            "commission_per_enrolment": 30.0,
            "renewal_rate": 0.0,
            "renewal_rate_target": 0.0,
            "renewal_ramp_months": 12,
            "payment_lag_months": 0,
            "uses_gateway": True,
            "launch_cost": 10000.0,
        },
        {
            "id": "platform_license",
            "name_ar": "ترخيص المنصة والمحتوى للمدارس - سنوي (مقترح)",
            "name_en": "Annual platform & content license for schools (suggested)",
            "enabled": False,
            "suggested": True,
            "driver": "growth",
            "start_month": "2028-09",
            "initial_monthly": 1,
            "monthly_growth": 0.05,
            "max_monthly": 10,
            "active_months": [8, 9, 10, 1, 2],
            "list_price": 30000.0,
            "avg_discount": 0.0,
            "lessons": 0,
            "lessons_per_week": 1,
            "service_months": 12,
            "group_size": 1,
            "teacher_cost_per_lesson": 0.0,
            "commission_per_enrolment": 1500.0,
            "renewal_rate": 0.0,
            "renewal_rate_target": 0.0,
            "renewal_ramp_months": 12,
            "payment_lag_months": 2,
            "uses_gateway": False,
            "launch_cost": 30000.0,
        },
    ],
    # ---------------------------------------------------------- pricing / tax
    "tax": {
        "vat_rate": 0.15,
        # "auto": register the month after trailing-12-month taxable sales pass
        # the mandatory threshold; "month": from vat_from_month; "never"
        "vat_mode": "auto",
        "vat_threshold": 375000.0,
        "vat_from_month": "2027-06",
        "zakat_rate": 0.025,
        "zakat_pay_lag_months": 4,  # paid 4 months after the model year closes
    },
    "payments": {
        "gateway_fee_pct": 0.025,
        "gateway_fee_fixed": 1.0,
    },
    # ---------------------------------------------------------------- team
    "team": {
        # current fixed team (monthly salaries) - replaced by the staff list in Finance
        "base_payroll": 4800.0,
        "base_headcount": 5,
        "annual_raise": 0.10,
        "raise_month": 1,          # calendar month when raises apply
        "employer_oncost": 0.0,    # GOSI / insurance on top of salary (0 for remote contractors)
        "intl_transfer_fee_pct": 0.015,  # bank fees on salaries paid abroad
        # capacity-driven hiring
        "cs_students_per_agent": 120,
        "cs_salary": 1200.0,
        "cs_current_agents": 2,
        "teacher_capacity_lessons": 70,   # lessons per teacher per month (60-80)
        "teachers_per_supervisor": 20,
        "supervisor_salary": 3000.0,
        "teacher_onboarding_cost": 300.0,
        "ad_spend_per_media_buyer": 60000.0,
        "media_buyer_salary": 2500.0,
        "media_buyers_current": 1,
        # planned hires (suggested plan; edit freely)
        "hires": [
            {"role_ar": "مسؤول مبيعات المدارس والشراكات", "role_en": "Schools & partnerships sales", "month": "2027-02", "salary": 4000.0, "count": 1},
            {"role_ar": "مدير عمليات", "role_en": "Operations manager", "month": "2027-04", "salary": 5000.0, "count": 1},
            {"role_ar": "محاسب (دوام جزئي)", "role_en": "Accountant (part-time)", "month": "2027-06", "salary": 2500.0, "count": 1},
            {"role_ar": "مسؤول التوسع الخليجي", "role_en": "GCC expansion lead", "month": "2027-08", "salary": 6000.0, "count": 1},
        ],
    },
    # --------------------------------------------------------- other opex
    "opex": [
        {"id": "content", "name_ar": "تطوير المحتوى التعليمي", "name_en": "Curriculum & content development", "monthly": 4000.0, "start_month": "2026-10", "end_month": None, "growth_yoy": 0.15},
        {"id": "tools", "name_ar": "الأدوات والاشتراكات (زوم، الذكاء الاصطناعي، الاتصالات)", "name_en": "Tools & subscriptions (Zoom, AI, telecom)", "monthly": 600.0, "start_month": "2026-10", "end_month": None, "growth_yoy": 0.30},
        {"id": "marketing_content", "name_ar": "إنتاج مواد تسويقية", "name_en": "Marketing content production", "monthly": 1500.0, "start_month": "2026-10", "end_month": None, "growth_yoy": 0.20},
        {"id": "legal", "name_ar": "التراخيص والمحاسب القانوني والرسوم الحكومية", "name_en": "Licences, auditor & government fees", "monthly": 1200.0, "start_month": "2027-01", "end_month": None, "growth_yoy": 0.05},
        {"id": "accreditation", "name_ar": "الاعتمادات (STEM وغيرها)", "name_en": "Accreditations (STEM etc.)", "monthly": 250.0, "start_month": "2026-10", "end_month": None, "growth_yoy": 0.0},
    ],
    # --------------------------------------------------------------- capex
    "capex": [
        {"name_ar": "تطوير منصة تعليمية خاصة (LMS + تطبيق)", "name_en": "Own learning platform (LMS + app)", "month": "2027-02", "amount": 60000.0, "life_months": 36},
    ],
    # ----------------------------------------------------------- financing
    "financing": {
        "opening_cash": 3460.0,          # replaced by actual cash (funding + collections - expenses)
        "owner_invested_to_date": 72942.0,
        "loan_mode": "auto",             # auto = sized from the cash trough; manual = loan_amount
        "loan_amount": 300000.0,
        "loan_rounding": 50000.0,
        "cash_buffer_months": 3,         # keep this many months of fixed costs as a cushion
        "loan_draw_month": "2026-11",
        "loan_rate": 0.10,               # annual profit rate (SAIBOR + bank margin)
        "loan_tenor_months": 72,
        "loan_grace_months": 24,         # profit-only months before principal repayments
        "loan_upfront_fee": 0.02,        # arrangement + Kafalah guarantee fee
        "equity_injections": [],         # [{"month": "2027-01", "amount": 0}]
    },
    # ------------------------------------------------------------ valuation
    "valuation": {
        "discount_rate": 0.25,           # early-stage edtech required return
        "terminal_method": "multiple",   # multiple | gordon
        "exit_revenue_multiple": 2.0,
        "terminal_growth": 0.04,
    },
    # ------------------------------------------------------------ scenarios
    # multipliers applied on top of the base assumptions
    "scenarios": {
        "conservative": {"conversion": 0.8, "cpl": 1.2, "renewal": 0.8, "growth_volume": 0.6, "price": 1.0, "delay_months": 3},
        "base": {"conversion": 1.0, "cpl": 1.0, "renewal": 1.0, "growth_volume": 1.0, "price": 1.0, "delay_months": 0},
        "optimistic": {"conversion": 1.2, "cpl": 0.9, "renewal": 1.15, "growth_volume": 1.3, "price": 1.0, "delay_months": 0},
    },
    # assumption paths that follow the platform's actual data automatically
    "auto_fields": [
        "markets.ksa.cpl",
        "markets.ksa.organic_share",
        "markets.ksa.lead_to_trial",
        "markets.ksa.show_rate",
        "markets.ksa.trial_to_paid",
        "streams.core_b2c.avg_discount",
        "streams.core_b2c.renewal_rate",
        "team.base_payroll",
        "team.base_headcount",
        "financing.opening_cash",
        "financing.owner_invested_to_date",
    ],
}


def default_assumptions() -> dict:
    return copy.deepcopy(DEFAULT_ASSUMPTIONS)
