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

# calendar-month seasonality of free trial lectures (1 = normal month). The
# engine rescales it to average 1, so a year always has 12 x the monthly figure.
# Saudi school calendar: summer holiday (Jun-Aug) is the main expansion
# season (x2), with smaller peaks before the autumn / winter / Eid breaks.
SEASONALITY = {
    "1": 1.2, "2": 1.0, "3": 1.3, "4": 1.0, "5": 1.5, "6": 2.0,
    "7": 2.0, "8": 1.5, "9": 1.1, "10": 1.0, "11": 1.3, "12": 1.2,
}

# bump with a one-time conversion in service.upgrade() when plan policy changes
SCHEMA = 5

DEFAULT_ASSUMPTIONS: dict = {
    "schema": SCHEMA,
    "general": {
        "start_month": "2026-10",
        "horizon_months": 60,
        "weeks_per_month": 4.345,
        # revenue is the subscriptions paid in the period ("billing");
        # "delivery" recognises it as lessons are taught instead
        "revenue_basis": "billing",
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
            # free trial lectures given per month (yearly average) - the volume driver.
            # Ad spend is derived: trials / lead_to_trial = leads; paid leads x cost per lead.
            "trials_by_year": [200, 350, 500, 650, 800],
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
            "start_month": "2028-10",
            "trials_by_year": [0, 0, 150, 220, 300],
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
            "category": "b2c",
            "name_ar": "الاشتراك الأساسي (أفراد - السعودية)",
            "name_en": "Core subscription (B2C - KSA)",
            "enabled": True,
            "suggested": False,
            "driver": "funnel",
            "market": "ksa",
            "funnel_share": 1.0,
            "start_month": "2026-10",
            "list_price": 850.0,
            "avg_discount": 0.30,       # discount applied (B2C maximum 30 %)
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
            "id": "schools",
            "category": "b2b",
            "name_ar": "الشراكات المؤسسية: المدارس والجمعيات والشركات",
            "name_en": "Partnerships: schools, associations & companies",
            "enabled": True,
            "suggested": False,
            "driver": "growth",
            # partnerships start with the second model year
            "start_month": "2027-10",
            "initial_monthly": 20,
            "monthly_growth": 0.12,
            "max_monthly": 400,
            # school year only: no new school enrolments in Jun-Aug
            "active_months": [1, 2, 3, 4, 5, 9, 10, 11, 12],
            "list_price": 850.0,
            "avg_discount": 0.50,
            "lessons": 12,
            "lessons_per_week": 2,
            # institutional students also take one-to-one lectures; no marketing cost
            "group_size": 1,
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
            "id": "gcc_b2c",
            "category": "b2c",
            "name_ar": "الاشتراك الأساسي (أفراد - الخليج)",
            "name_en": "Core subscription (B2C - GCC)",
            "enabled": True,
            "suggested": False,
            "driver": "funnel",
            "market": "gcc",
            "funnel_share": 1.0,
            "start_month": "2028-10",
            "list_price": 1050.0,
            "avg_discount": 0.30,
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
            "id": "platform_license",
            "category": "b2b",
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
        # salaried teams: monthly cost in each model year (actual salaries today, raises included).
        # Set by management; the teams do not grow automatically with volume.
        "marketing_team_monthly_by_year": [4000.0, 4500.0, 5000.0, 5500.0, 6000.0],
        "cs_monthly_by_year": [4000.0, 5000.0, 6000.0, 7000.0, 8000.0],
        "quality_monthly_by_year": [1500.0, 2000.0, 3000.0, 4000.0, 5000.0],
        "admin_payroll": 0.0,             # other salaried staff today
        "base_headcount": 5,
        "annual_raise": 0.10,      # applies to planned hires and other staff
        "raise_month": 1,          # calendar month when raises apply
        "employer_oncost": 0.0,    # GOSI / insurance on top of salary (0 for remote contractors)
        "intl_transfer_fee_pct": 0.015,  # bank fees on salaries paid abroad
        # teachers: paid per lecture, no salary. One teacher gives 60-80 lectures a month.
        "teacher_capacity_lessons": 70,
        "teacher_onboarding_cost": 300.0,
        # planned hires (suggested plan; edit freely). category: marketing | cs | content | quality | admin
        "hires": [
            {"role_ar": "مسؤول مبيعات المدارس والشراكات", "role_en": "Schools & partnerships sales lead", "month": "2027-08", "salary": 4000.0, "count": 1, "category": "marketing"},
        ],
    },
    # --------------------------------------------------------- other opex
    "opex": [
        {"id": "content", "category": "content", "name_ar": "فريق تطوير المحتوى والمناهج", "name_en": "Content & curriculum development team", "monthly": 6000.0, "start_month": "2026-10", "end_month": None, "growth_yoy": 0.15},
        {"id": "tools", "category": "tools", "name_ar": "الاشتراكات الشهرية (منصات الحصص، أدوات الذكاء الاصطناعي، الاتصالات)", "name_en": "Monthly subscriptions (lesson platforms, AI tools, telecom)", "monthly": 800.0, "start_month": "2026-10", "end_month": None, "growth_yoy": 0.30},
        {"id": "marketing_content", "category": "marketing_extra", "name_ar": "المؤثرون ومحتوى UGC والإنتاج التسويقي", "name_en": "Influencers, UGC & marketing production", "monthly": 3000.0, "start_month": "2026-10", "end_month": None, "growth_yoy": 0.25},
        {"id": "legal", "category": "admin", "name_ar": "التراخيص والمحاسب القانوني والرسوم الحكومية", "name_en": "Licences, auditor & government fees", "monthly": 500.0, "start_month": "2027-01", "end_month": None, "growth_yoy": 0.05},
        {"id": "accreditation", "category": "admin", "name_ar": "الاعتمادات (STEM وغيرها)", "name_en": "Accreditations (STEM etc.)", "monthly": 150.0, "start_month": "2026-10", "end_month": None, "growth_yoy": 0.0},
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
        "loan_rate": 0.0,                # interest-free financing (set a rate here if the lender charges one)
        "loan_tenor_months": 84,
        "loan_grace_months": 30,         # profit-only months before principal repayments (break-even is in year 3)
        "loan_upfront_fee": 0.0,         # one-off arrangement / guarantee fee, if any
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
        "conservative": {"trials_volume": 0.85, "conversion": 0.8, "cpl": 1.2, "renewal": 0.8, "growth_volume": 0.6, "price": 1.0, "delay_months": 3},
        "base": {"trials_volume": 1.0, "conversion": 1.0, "cpl": 1.0, "renewal": 1.0, "growth_volume": 1.0, "price": 1.0, "delay_months": 0},
        "optimistic": {"trials_volume": 1.15, "conversion": 1.2, "cpl": 0.9, "renewal": 1.15, "growth_volume": 1.3, "price": 1.0, "delay_months": 0},
    },
    # assumption paths that follow the platform's actual data automatically
    "auto_fields": [
        "markets.ksa.cpl",
        "markets.ksa.organic_share",
        "markets.ksa.lead_to_trial",
        "markets.ksa.show_rate",
        "markets.ksa.trial_to_paid",
        "streams.core_b2c.renewal_rate",
        "team.base_headcount",
        "financing.opening_cash",
        "financing.owner_invested_to_date",
    ],
}


def default_assumptions() -> dict:
    return copy.deepcopy(DEFAULT_ASSUMPTIONS)
