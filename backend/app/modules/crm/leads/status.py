"""
The customer's CURRENT status, as customer service actually sees it.

A lead's `stage` column also keeps historical values (confirmed_whatsapp,
confirmed_call, zoom_sent, attendance_recorded ...) that are no longer
separate steps in the UI. For filtering, tabs and badges everything is
folded into the statuses below - one per real situation:

    new / contacted / not_answered        العملاء المحتملون
    awaiting_attendance                   محجوز - بانتظار الحضور
    not_attended                          لم يحضر
    attended                              تم الحضور (stage interested)
    report_sent / follow_up               تم إرسال التقرير / متابعة
    converted                             مشترك
    lost / not_interested                 مفقود / غير مهتم

The SQL expression (status_expr) and the Python helper (display_status)
implement the same rule, so a lead's badge always matches the tab it is
counted in.
"""
from __future__ import annotations

from sqlalchemy import and_, case, exists, or_

from app.modules.crm.leads.models import BOOKINGS_GROUP_STAGES, Booking, Lead, LeadStage

STATUSES: tuple[str, ...] = (
    "new", "contacted", "not_answered",
    "awaiting_attendance", "not_attended", "attended",
    "report_sent", "follow_up", "converted", "lost", "not_interested",
)

_LEGACY_NOT_ATTENDED = LeadStage.ATTENDANCE_RECORDED.value


def display_status(lead: Lead) -> str:
    stage = lead.stage
    if stage in BOOKINGS_GROUP_STAGES:
        bookings = list(lead.bookings or [])
        pending = any(b.attended is None for b in bookings)
        missed = any(b.attended is False for b in bookings)
        if stage == _LEGACY_NOT_ATTENDED or (missed and not pending):
            return "not_attended"
        return "awaiting_attendance"
    if stage == LeadStage.INTERESTED.value:
        return "attended"
    return stage


def status_expr():
    pending = exists().where(Booking.lead_id == Lead.id, Booking.attended.is_(None))
    missed = exists().where(Booking.lead_id == Lead.id, Booking.attended.is_(False))
    in_bookings = Lead.stage.in_(BOOKINGS_GROUP_STAGES)
    return case(
        (and_(in_bookings, or_(Lead.stage == _LEGACY_NOT_ATTENDED, and_(missed, ~pending))), "not_attended"),
        (in_bookings, "awaiting_attendance"),
        (Lead.stage == LeadStage.INTERESTED.value, "attended"),
        else_=Lead.stage,
    )
