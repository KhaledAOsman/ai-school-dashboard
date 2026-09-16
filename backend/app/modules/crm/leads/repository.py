from __future__ import annotations

import uuid
from datetime import date

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.crm.leads.models import Lead, LeadCallAttempt, LeadStage, LeadStageEvent, LEADS_GROUP_STAGES, BOOKINGS_GROUP_STAGES


class LeadRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_by_id(self, lead_id: uuid.UUID) -> Lead | None:
        result = await self.db.execute(
            select(Lead)
            .options(selectinload(Lead.stage_events), selectinload(Lead.call_attempts))
            .where(Lead.id == lead_id)
        )
        return result.scalar_one_or_none()

    async def get_by_ids(self, lead_ids: list[uuid.UUID]) -> list[Lead]:
        """Used by bulk-assign: fetch every targeted lead in one query so
        the service can validate/update them all in a single pass."""
        result = await self.db.execute(select(Lead).where(Lead.id.in_(lead_ids)))
        return list(result.scalars().all())

    async def list_all(
        self, *, stage: str | None = None, assigned_to: uuid.UUID | None = None
    ) -> list[Lead]:
        """Kept for callers that genuinely want everything unpaginated
        (small, permission-scoped result sets). The main leads list uses
        list_paginated below instead."""
        stmt = select(Lead).order_by(Lead.created_at.desc())
        if stage:
            stmt = stmt.where(Lead.stage == stage)
        if assigned_to:
            stmt = stmt.where(Lead.assigned_to == assigned_to)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def phone_exists(self, phone: str) -> bool:
        """Used by bulk import to skip rows whose phone number is already
        in the system - the org's raw data commonly has duplicate entries
        from repeated inquiries, so import treats phone as the natural
        dedupe key rather than rejecting the whole import."""
        result = await self.db.execute(select(Lead.id).where(Lead.phone == phone).limit(1))
        return result.scalar_one_or_none() is not None

    async def list_paginated(
        self,
        *,
        page: int,
        page_size: int,
        search: str | None = None,
        stage: str | None = None,
        stages: list[str] | None = None,
        source: str | None = None,
        assigned_to: uuid.UUID | None = None,
        date_from: date | None = None,
        date_to: date | None = None,
        sort_by: str = "created_at",
        sort_dir: str = "desc",
    ) -> tuple[list[Lead], int]:
        """
        Server-side pagination, search, and filtering - this is what makes
        the leads list usable at 1000+ rows instead of shipping the whole
        table to the browser on every load. Returns (page_of_leads,
        total_matching_count) so the frontend can render "page 3 of 42".

        `stages` (a list) restricts to one of the three UI section groups
        (see LEADS_GROUP_STAGES etc in models.py) - used by the three
        separate list endpoints. `stage` (singular) narrows further within
        that group (e.g. only NOT_ANSWERED leads within group 1).
        """
        stmt = select(Lead)
        count_stmt = select(func.count(Lead.id))

        conditions = []
        if search:
            like = f"%{search}%"
            conditions.append(or_(Lead.full_name.ilike(like), Lead.phone.ilike(like)))
        if stages:
            conditions.append(Lead.stage.in_(stages))
        if stage:
            conditions.append(Lead.stage == stage)
        if source:
            conditions.append(Lead.source == source)
        if assigned_to:
            conditions.append(Lead.assigned_to == assigned_to)
        if date_from:
            conditions.append(Lead.created_at >= date_from)
        if date_to:
            conditions.append(Lead.created_at <= date_to)

        for cond in conditions:
            stmt = stmt.where(cond)
            count_stmt = count_stmt.where(cond)

        sort_column = {
            "created_at": Lead.created_at,
            "full_name": Lead.full_name,
            "stage": Lead.stage,
        }.get(sort_by, Lead.created_at)
        stmt = stmt.order_by(sort_column.desc() if sort_dir == "desc" else sort_column.asc())
        stmt = stmt.offset((page - 1) * page_size).limit(page_size)

        result = await self.db.execute(stmt)
        leads = list(result.scalars().all())

        count_result = await self.db.execute(count_stmt)
        total = count_result.scalar_one()

        return leads, total

    async def list_distinct_sources(self) -> list[str]:
        """Powers the source filter dropdown with actual values in use,
        rather than a hardcoded list."""
        result = await self.db.execute(
            select(Lead.source).where(Lead.source.is_not(None)).distinct().order_by(Lead.source)
        )
        return [r for r in result.scalars().all() if r]

    async def list_scheduled(self, *, assigned_to: uuid.UUID | None = None) -> list[Lead]:
        """
        Every lead that has reached 'booked' or a later stage (i.e. has a
        lecture_date set), for the customer-service-facing schedule view.
        Ordered by date/time so it reads like a calendar/agenda. Excludes
        lost leads but includes converted ones (their lecture already
        happened and is still useful history for today's view).
        """
        stmt = (
            select(Lead)
            .where(Lead.lecture_date.is_not(None), Lead.is_lost.is_(False))
            .order_by(Lead.lecture_date.asc(), Lead.lecture_time.asc())
        )
        if assigned_to:
            stmt = stmt.where(Lead.assigned_to == assigned_to)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    def add(self, lead: Lead) -> None:
        self.db.add(lead)

    def add_stage_event(self, event: LeadStageEvent) -> None:
        self.db.add(event)

    def add_call_attempt(self, attempt: LeadCallAttempt) -> None:
        self.db.add(attempt)

    async def get_dashboard_counts(self) -> dict[str, int]:
        """
        One round-trip covering every count the CRM dashboard needs: total
        leads, attended / did-not-attend, and count of leads currently
        sitting at the not_answered stage.
        """
        total_result = await self.db.execute(select(func.count(Lead.id)))
        total = total_result.scalar_one()

        attended_result = await self.db.execute(select(func.count(Lead.id)).where(Lead.attended.is_(True)))
        attended = attended_result.scalar_one()

        not_attended_result = await self.db.execute(select(func.count(Lead.id)).where(Lead.attended.is_(False)))
        not_attended = not_attended_result.scalar_one()

        not_answered_result = await self.db.execute(
            select(func.count(Lead.id)).where(Lead.stage == LeadStage.NOT_ANSWERED.value)
        )
        not_answered = not_answered_result.scalar_one()

        return {
            "total_leads": total,
            "attended": attended,
            "not_attended": not_attended,
            "not_answered": not_answered,
        }

    async def count_without_bookings(self) -> int:
        """Leads still in the pre-booking group (جديد / تم الاتصال /
        لم يتم الرد) - i.e. no teacher slot has ever been booked for them yet.
        Distinct from the bookings-group / interested-group leads, whose
        stage has moved on past booking regardless of how that booking
        later turned out."""
        result = await self.db.execute(select(func.count(Lead.id)).where(Lead.stage.in_(LEADS_GROUP_STAGES)))
        return result.scalar_one()

    async def count_not_interested(self) -> int:
        """Leads closed directly as غير مهتم from the leads-group booking-
        status dropdown (lives in the interested-clients group, same
        terminal-outcome bookkeeping as LOST, but a distinct stage so the
        dashboard can report it separately)."""
        result = await self.db.execute(
            select(func.count(Lead.id)).where(Lead.stage == LeadStage.NOT_INTERESTED.value)
        )
        return result.scalar_one()

    async def count_currently_booked(self) -> int:
        """Leads currently sitting anywhere in the bookings group (تم الحجز
        الموعد الموعد حتى تسجيل الحضور) - i.e. currently in the
        الحجوزات table, regardless of how far along the confirm/zoom/attendance
        steps they've gotten."""
        result = await self.db.execute(select(func.count(Lead.id)).where(Lead.stage.in_(BOOKINGS_GROUP_STAGES)))
        return result.scalar_one()
