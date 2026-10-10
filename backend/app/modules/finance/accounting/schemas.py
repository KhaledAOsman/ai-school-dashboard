from __future__ import annotations

from datetime import date
from decimal import Decimal

from pydantic import BaseModel, Field, field_validator


class JournalLineIn(BaseModel):
    account_code: str = Field(min_length=1, max_length=20)
    debit: Decimal = Field(default=Decimal("0"), ge=0, max_digits=14, decimal_places=2)
    credit: Decimal = Field(default=Decimal("0"), ge=0, max_digits=14, decimal_places=2)
    memo: str | None = Field(default=None, max_length=500)
    party: str | None = Field(default=None, max_length=200)


class JournalCreateRequest(BaseModel):
    entry_date: date
    memo: str = Field(min_length=1, max_length=1000)
    reference: str | None = Field(default=None, max_length=100)
    lines: list[JournalLineIn] = Field(min_length=2, max_length=60)

    @field_validator("lines")
    @classmethod
    def _each_line_one_sided(cls, lines: list[JournalLineIn]):
        for l in lines:
            if (l.debit > 0) == (l.credit > 0):
                raise ValueError("كل سطر لازم يكون مدين أو دائن (واحد فقط وبقيمة أكبر من صفر)")
        return lines


class JournalVoidRequest(BaseModel):
    reason: str = Field(min_length=1, max_length=500)
