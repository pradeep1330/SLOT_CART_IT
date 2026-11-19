import re
from datetime import date, datetime
from typing import Literal, Optional
from pydantic import BaseModel, Field, field_validator

from config import SLOT_MAP

PINCODE_REGEX = re.compile(r"^\d{6}$")
DATE_REGEX = re.compile(r"^\d{4}-\d{2}-\d{2}$")
TIME_24H_REGEX = re.compile(r"^([01]\d|2[0-3]):([0-5]\d)$")


def validate_pincode_value(value: str) -> str:
    cleaned = value.strip()
    if not PINCODE_REGEX.match(cleaned):
        raise ValueError("Pincode must be a valid 6-digit Indian postal code.")
    return cleaned


def validate_date_value(value: str) -> str:
    cleaned = value.strip()
    if not DATE_REGEX.match(cleaned):
        raise ValueError("Date must be in YYYY-MM-DD format.")
    try:
        date.fromisoformat(cleaned)
    except ValueError as exc:
        raise ValueError("Invalid calendar date.") from exc
    return cleaned


def validate_slot_id_value(value: str) -> str:
    cleaned = value.strip().upper()
    if cleaned not in SLOT_MAP:
        allowed = ", ".join(SLOT_MAP.keys())
        raise ValueError(f"Invalid slot_id. Must be one of: {allowed}")
    return cleaned


# --- Request Models ---


class SlotActionRequest(BaseModel):
    pincode: str = Field(..., description="6-digit Indian pincode")
    date: str = Field(..., description="Delivery date in YYYY-MM-DD format (IST)")
    slot_id: str = Field(..., description="Canonical slot identifier")

    @field_validator("pincode")
    @classmethod
    def check_pincode(cls, v: str) -> str:
        return validate_pincode_value(v)

    @field_validator("date")
    @classmethod
    def check_date(cls, v: str) -> str:
        return validate_date_value(v)

    @field_validator("slot_id")
    @classmethod
    def check_slot_id(cls, v: str) -> str:
        return validate_slot_id_value(v)


class ValidateRescheduleRequest(BaseModel):
    slot_date: str = Field(..., description="Current booked slot date (YYYY-MM-DD)")
    slot_start: str = Field(
        ..., description="Current slot start time in HH:MM 24h IST format (e.g. '14:00')"
    )
    reschedule_count: int = Field(
        ..., ge=0, le=10, description="Number of times order was already rescheduled"
    )
    partner_triggered: bool = Field(
        default=False,
        description="True when delivery partner marked Customer Unavailable to allow Reschedule instead of Return",
    )

    @field_validator("slot_date")
    @classmethod
    def check_slot_date(cls, v: str) -> str:
        return validate_date_value(v)

    @field_validator("slot_start")
    @classmethod
    def check_slot_start(cls, v: str) -> str:
        cleaned = v.strip()
        # Accept HH:MM (e.g. "14:00") or canonical slot_id (e.g. "SLOT_14_16")
        if cleaned.upper() in SLOT_MAP:
            return SLOT_MAP[cleaned.upper()]["start_time"]
        if TIME_24H_REGEX.match(cleaned):
            return cleaned
        # Accept "14" -> "14:00"
        if cleaned.isdigit() and 0 <= int(cleaned) <= 23:
            return f"{int(cleaned):02d}:00"
        raise ValueError("slot_start must be in HH:MM 24-hour format (e.g. '14:00').")


class AdminCapacityUpdateRequest(BaseModel):
    pincode: str = Field(..., description="6-digit Indian pincode")
    date: str = Field(..., description="Date in YYYY-MM-DD format (IST)")
    slot_id: str = Field(..., description="Canonical slot identifier")
    capacity: int = Field(..., ge=0, le=500, description="New max order capacity for slot")

    @field_validator("pincode")
    @classmethod
    def check_pincode(cls, v: str) -> str:
        return validate_pincode_value(v)

    @field_validator("date")
    @classmethod
    def check_date(cls, v: str) -> str:
        return validate_date_value(v)

    @field_validator("slot_id")
    @classmethod
    def check_slot_id(cls, v: str) -> str:
        return validate_slot_id_value(v)


# --- Response Models ---


class SlotItemResponse(BaseModel):
    slot_id: str
    label: str
    start_time: str
    end_time: str
    start_hour: int
    end_hour: int
    capacity: int
    booked: int
    remaining: int
    utilization_pct: float
    status: Literal["available", "filling_fast", "full"]
    is_past: bool
    is_bookable: bool
    recommended: bool
    recommended_reason: Optional[str] = None


class DaySlotsResponse(BaseModel):
    pincode: str
    date: str
    display_date: str
    timezone: str = "Asia/Kolkata"
    recommended_slot_id: Optional[str] = None
    recommended_reason: Optional[str] = None
    slots: list[SlotItemResponse]


class DayWeekSummary(BaseModel):
    date: str
    day_name: str
    day_number: str
    month_short: str
    display_date: str
    is_today: bool
    total_capacity: int
    total_booked: int
    available_slots_count: int
    status: Literal["available", "filling_fast", "full"]
    recommended_slot_id: Optional[str] = None


class WeekSlotsResponse(BaseModel):
    pincode: str
    timezone: str = "Asia/Kolkata"
    days: list[DayWeekSummary]


class SlotBookingResponse(BaseModel):
    success: bool
    message: str
    slot: SlotItemResponse


class SlotReleaseResponse(BaseModel):
    success: bool
    released: bool
    message: str


class ValidateRescheduleResponse(BaseModel):
    allowed: bool
    code: Literal["ELIGIBLE", "MAX_RESCHEDULES_REACHED", "CUTOFF_PASSED"]
    reason: str
    hours_until_slot: float
    remaining_reschedules: int
    cutoff_hours: float


class HealthResponse(BaseModel):
    status: Literal["ok", "degraded"]
    service: str = "slot-service"
    database: Literal["connected", "disconnected"]
    timezone: str = "Asia/Kolkata"
    ist_now: str
