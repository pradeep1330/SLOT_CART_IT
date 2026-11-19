from datetime import date, datetime, timedelta
from typing import Literal, Optional
from fastapi import HTTPException, status

from config import (
    IST,
    SLOT_DEFINITIONS,
    SLOT_MAP,
    FILLING_FAST_THRESHOLD,
    MAX_RESCHEDULES,
    RESCHEDULE_CUTOFF_HOURS,
    BOOKING_HORIZON_DAYS,
    DEFAULT_SLOT_CAPACITY,
    now_ist,
    today_ist,
    format_display_date,
    get_next_n_dates,
)
from database import get_slot_capacity_collection, ensure_slots_for_date
from schemas import (
    SlotItemResponse,
    DaySlotsResponse,
    DayWeekSummary,
    WeekSlotsResponse,
    ValidateRescheduleResponse,
)


def _slot_start_datetime_ist(date_str: str, start_hour: int, start_minute: int = 0) -> datetime:
    """Construct timezone-aware IST datetime for a slot start."""
    d = date.fromisoformat(date_str)
    return datetime(d.year, d.month, d.day, start_hour, start_minute, tzinfo=IST)


def _is_slot_past(date_str: str, start_hour: int) -> bool:
    """Return True if the slot start time has already passed in IST."""
    slot_dt = _slot_start_datetime_ist(date_str, start_hour)
    return now_ist() >= slot_dt


def _compute_status(capacity: int, booked: int) -> Literal["available", "filling_fast", "full"]:
    """Compute canonical slot status based on booked/capacity ratio."""
    if capacity <= 0 or booked >= capacity:
        return "full"
    ratio = booked / capacity
    if ratio >= FILLING_FAST_THRESHOLD:
        return "filling_fast"
    return "available"


def _build_slot_item(doc: dict, slot_def: dict, date_str: str) -> SlotItemResponse:
    capacity = int(doc.get("capacity", DEFAULT_SLOT_CAPACITY))
    booked = int(doc.get("booked", 0))
    remaining = max(0, capacity - booked)
    utilization_pct = round((booked / capacity) * 100, 1) if capacity > 0 else 100.0
    slot_status = _compute_status(capacity, booked)
    is_past = _is_slot_past(date_str, slot_def["start_hour"])
    is_bookable = (slot_status != "full") and (not is_past)

    return SlotItemResponse(
        slot_id=slot_def["slot_id"],
        label=slot_def["label"],
        start_time=slot_def["start_time"],
        end_time=slot_def["end_time"],
        start_hour=slot_def["start_hour"],
        end_hour=slot_def["end_hour"],
        capacity=capacity,
        booked=booked,
        remaining=remaining,
        utilization_pct=utilization_pct,
        status=slot_status,
        is_past=is_past,
        is_bookable=is_bookable,
        recommended=False,
        recommended_reason=None,
    )


def _pick_recommended_slot(slots: list[SlotItemResponse]) -> tuple[Optional[str], Optional[str]]:
    """
    Pick the least-loaded upcoming (bookable) slot.
    Tie-breaker: earliest start_hour so customer gets the soonest reliable window.
    """
    candidates = [s for s in slots if s.is_bookable]
    if not candidates:
        return None, None

    best = min(
        candidates,
        key=lambda s: (
            (s.booked / s.capacity) if s.capacity > 0 else 1.0,
            s.booked,
            s.start_hour,
        ),
    )

    if best.booked == 0:
        reason = (
            f"Best availability ({best.remaining}/{best.capacity} spots open) "
            f"— lowest load for on-time delivery."
        )
    else:
        reason = (
            f"Least crowded upcoming window ({best.booked}/{best.capacity} booked) "
            f"— highest on-time arrival reliability."
        )

    best.recommended = True
    best.recommended_reason = reason
    return best.slot_id, reason


def _validate_date_within_horizon(date_str: str, allow_past_read: bool = False) -> date:
    """Ensure requested date is within allowed booking window (today..today+6)."""
    target = date.fromisoformat(date_str)
    today = today_ist()
    max_date = today + timedelta(days=BOOKING_HORIZON_DAYS - 1)

    if not allow_past_read and target < today:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Delivery date cannot be in the past.",
        )
    if target > max_date + timedelta(days=7):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Delivery date is outside the supported window (next {BOOKING_HORIZON_DAYS} days).",
        )
    return target


def get_day_slots(pincode: str, date_str: str) -> DaySlotsResponse:
    """Fetch all 5 slots for a pincode & date with statuses and recommendation."""
    target_date = _validate_date_within_horizon(date_str, allow_past_read=True)

    # Auto-seed if within upcoming horizon
    today = today_ist()
    if today <= target_date <= today + timedelta(days=BOOKING_HORIZON_DAYS):
        ensure_slots_for_date(pincode, date_str)

    col = get_slot_capacity_collection()
    docs = {
        doc["slot_id"]: doc
        for doc in col.find({"pincode": pincode, "date": date_str})
    }

    slots: list[SlotItemResponse] = []
    for slot_def in SLOT_DEFINITIONS:
        doc = docs.get(
            slot_def["slot_id"],
            {"capacity": DEFAULT_SLOT_CAPACITY, "booked": 0},
        )
        slots.append(_build_slot_item(doc, slot_def, date_str))

    rec_id, rec_reason = _pick_recommended_slot(slots)

    return DaySlotsResponse(
        pincode=pincode,
        date=date_str,
        display_date=format_display_date(target_date),
        recommended_slot_id=rec_id,
        recommended_reason=rec_reason,
        slots=slots,
    )


def get_week_slots(pincode: str) -> WeekSlotsResponse:
    """Return a 7-day availability summary starting from today (IST)."""
    dates = get_next_n_dates(BOOKING_HORIZON_DAYS)
    today = today_ist()

    for d in dates:
        ensure_slots_for_date(pincode, d.isoformat())

    date_strs = [d.isoformat() for d in dates]
    col = get_slot_capacity_collection()
    cursor = col.find({"pincode": pincode, "date": {"$in": date_strs}})

    docs_by_date: dict[str, dict[str, dict]] = {ds: {} for ds in date_strs}
    for doc in cursor:
        ds = doc["date"]
        if ds in docs_by_date:
            docs_by_date[ds][doc["slot_id"]] = doc

    day_summaries: list[DayWeekSummary] = []
    for d in dates:
        ds = d.isoformat()
        slot_items = [
            _build_slot_item(
                docs_by_date[ds].get(
                    slot_def["slot_id"],
                    {"capacity": DEFAULT_SLOT_CAPACITY, "booked": 0},
                ),
                slot_def,
                ds,
            )
            for slot_def in SLOT_DEFINITIONS
        ]
        rec_id, _ = _pick_recommended_slot(slot_items)

        bookable_slots = [s for s in slot_items if s.is_bookable]
        total_cap = sum(s.capacity for s in slot_items)
        total_booked = sum(s.booked for s in slot_items)

        if len(bookable_slots) == 0:
            day_status: Literal["available", "filling_fast", "full"] = "full"
        elif total_cap > 0 and (total_booked / total_cap) >= FILLING_FAST_THRESHOLD:
            day_status = "filling_fast"
        else:
            day_status = "available"

        day_summaries.append(
            DayWeekSummary(
                date=ds,
                day_name=d.strftime("%a"),
                day_number=str(d.day),
                month_short=d.strftime("%b"),
                display_date=format_display_date(d),
                is_today=(d == today),
                total_capacity=total_cap,
                total_booked=total_booked,
                available_slots_count=len(bookable_slots),
                status=day_status,
                recommended_slot_id=rec_id,
            )
        )

    return WeekSlotsResponse(pincode=pincode, days=day_summaries)


def book_slot_atomic(pincode: str, date_str: str, slot_id: str) -> SlotItemResponse:
    """
    Atomically increment booked count only if booked < capacity using MongoDB $expr.
    Prevents overbooking under concurrent checkout requests.
    """
    _validate_date_within_horizon(date_str, allow_past_read=False)
    slot_def = SLOT_MAP[slot_id]

    if _is_slot_past(date_str, slot_def["start_hour"]):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Selected delivery slot has already started or passed. Please pick an upcoming slot.",
        )

    ensure_slots_for_date(pincode, date_str)
    col = get_slot_capacity_collection()
    now_iso = now_ist().isoformat()

    result = col.update_one(
        {
            "pincode": pincode,
            "date": date_str,
            "slot_id": slot_id,
            "$expr": {"$lt": ["$booked", "$capacity"]},
        },
        {
            "$inc": {"booked": 1},
            "$set": {"updated_at": now_iso},
        },
    )

    if result.modified_count == 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Selected delivery slot is full. Please choose another available time window.",
        )

    updated_doc = col.find_one({"pincode": pincode, "date": date_str, "slot_id": slot_id})
    return _build_slot_item(updated_doc, slot_def, date_str)


def release_slot_atomic(pincode: str, date_str: str, slot_id: str) -> bool:
    """Safely decrement booked count without ever going below 0."""
    col = get_slot_capacity_collection()
    now_iso = now_ist().isoformat()

    result = col.update_one(
        {
            "pincode": pincode,
            "date": date_str,
            "slot_id": slot_id,
            "booked": {"$gt": 0},
        },
        {
            "$inc": {"booked": -1},
            "$set": {"updated_at": now_iso},
        },
    )
    return result.modified_count == 1


def validate_reschedule_rules(
    slot_date: str,
    slot_start: str,
    reschedule_count: int,
    partner_triggered: bool = False,
) -> ValidateRescheduleResponse:
    """
    Enforce smart delivery reschedule policy (IST):
    - Max 2 reschedules per order.
    - Must be requested at least 3 hours before slot start (bypassed only when
      delivery partner triggers 'Reschedule instead of Return' after a missed attempt).
    """
    hour_str, min_str = slot_start.split(":")
    slot_dt = _slot_start_datetime_ist(slot_date, int(hour_str), int(min_str))
    delta_hours = (slot_dt - now_ist()).total_seconds() / 3600.0
    remaining = max(0, MAX_RESCHEDULES - reschedule_count)

    if reschedule_count >= MAX_RESCHEDULES:
        return ValidateRescheduleResponse(
            allowed=False,
            code="MAX_RESCHEDULES_REACHED",
            reason=f"Maximum reschedule limit reached ({MAX_RESCHEDULES} of {MAX_RESCHEDULES} reschedules used).",
            hours_until_slot=round(delta_hours, 2),
            remaining_reschedules=0,
            cutoff_hours=RESCHEDULE_CUTOFF_HOURS,
        )

    if not partner_triggered and delta_hours < RESCHEDULE_CUTOFF_HOURS:
        if delta_hours <= 0:
            msg = "Cannot reschedule because this delivery slot has already started or passed."
        else:
            msg = (
                f"Rescheduling is only allowed at least {int(RESCHEDULE_CUTOFF_HOURS)} hours "
                f"before the delivery slot starts ({round(delta_hours, 1)}h remaining)."
            )
        return ValidateRescheduleResponse(
            allowed=False,
            code="CUTOFF_PASSED",
            reason=msg,
            hours_until_slot=round(delta_hours, 2),
            remaining_reschedules=remaining,
            cutoff_hours=RESCHEDULE_CUTOFF_HOURS,
        )

    return ValidateRescheduleResponse(
        allowed=True,
        code="ELIGIBLE",
        reason=(
            "Partner-requested reschedule approved — pick a new convenient slot."
            if partner_triggered
            else f"Eligible to reschedule ({remaining} reschedule(s) remaining)."
        ),
        hours_until_slot=round(delta_hours, 2),
        remaining_reschedules=remaining,
        cutoff_hours=RESCHEDULE_CUTOFF_HOURS,
    )


def get_utilization_analytics(pincode: Optional[str] = None, days: int = 7) -> dict:
    """Aggregate slot utilization per day, per time window, and per pincode for Admin charts."""
    clamped_days = max(1, min(days, 14))
    dates = get_next_n_dates(clamped_days)
    date_strs = [d.isoformat() for d in dates]

    col = get_slot_capacity_collection()
    query: dict = {"date": {"$in": date_strs}}
    if pincode:
        query["pincode"] = pincode

    docs = list(col.find(query))

    by_date_map = {
        d.isoformat(): {
            "date": d.isoformat(),
            "display_date": format_display_date(d),
            "short_label": f"{d.strftime('%a')} {d.day}",
            "total_capacity": 0,
            "total_booked": 0,
        }
        for d in dates
    }

    by_slot_map = {
        s["slot_id"]: {
            "slot_id": s["slot_id"],
            "label": s["label"],
            "short_label": f"{s['start_hour']}-{s['end_hour']}h",
            "total_capacity": 0,
            "total_booked": 0,
        }
        for s in SLOT_DEFINITIONS
    }

    by_pincode_map: dict[str, dict] = {}

    total_capacity = 0
    total_booked = 0
    full_slots_count = 0
    filling_fast_count = 0

    for doc in docs:
        cap = int(doc.get("capacity", 0))
        booked = int(doc.get("booked", 0))
        ds = doc["date"]
        sid = doc["slot_id"]
        pin = doc["pincode"]

        total_capacity += cap
        total_booked += booked

        st = _compute_status(cap, booked)
        if st == "full":
            full_slots_count += 1
        elif st == "filling_fast":
            filling_fast_count += 1

        if ds in by_date_map:
            by_date_map[ds]["total_capacity"] += cap
            by_date_map[ds]["total_booked"] += booked

        if sid in by_slot_map:
            by_slot_map[sid]["total_capacity"] += cap
            by_slot_map[sid]["total_booked"] += booked

        if pin not in by_pincode_map:
            by_pincode_map[pin] = {
                "pincode": pin,
                "total_capacity": 0,
                "total_booked": 0,
            }
        by_pincode_map[pin]["total_capacity"] += cap
        by_pincode_map[pin]["total_booked"] += booked

    by_date = []
    for item in by_date_map.values():
        pct = round((item["total_booked"] / item["total_capacity"]) * 100, 1) if item["total_capacity"] > 0 else 0.0
        by_date.append({**item, "utilization_pct": pct})

    by_slot = []
    for item in by_slot_map.values():
        pct = round((item["total_booked"] / item["total_capacity"]) * 100, 1) if item["total_capacity"] > 0 else 0.0
        by_slot.append({**item, "utilization_pct": pct})

    by_pincode = []
    for item in sorted(by_pincode_map.values(), key=lambda x: x["pincode"]):
        pct = round((item["total_booked"] / item["total_capacity"]) * 100, 1) if item["total_capacity"] > 0 else 0.0
        by_pincode.append({**item, "utilization_pct": pct})

    peak_slot = max(by_slot, key=lambda x: (x["total_booked"], x["utilization_pct"]), default=None)
    overall_pct = round((total_booked / total_capacity) * 100, 1) if total_capacity > 0 else 0.0

    return {
        "timezone": "Asia/Kolkata",
        "filter_pincode": pincode,
        "days": clamped_days,
        "summary": {
            "total_capacity": total_capacity,
            "total_booked": total_booked,
            "overall_utilization_pct": overall_pct,
            "full_slots_count": full_slots_count,
            "filling_fast_count": filling_fast_count,
            "peak_slot_id": peak_slot["slot_id"] if peak_slot else None,
            "peak_slot_label": peak_slot["label"] if peak_slot else None,
        },
        "by_date": by_date,
        "by_slot": by_slot,
        "by_pincode": by_pincode,
    }


def update_admin_capacity(pincode: str, date_str: str, slot_id: str, capacity: int) -> SlotItemResponse:
    """Admin updates max capacity for a specific (pincode, date, slot_id)."""
    ensure_slots_for_date(pincode, date_str)
    col = get_slot_capacity_collection()

    existing = col.find_one({"pincode": pincode, "date": date_str, "slot_id": slot_id})
    current_booked = int(existing.get("booked", 0)) if existing else 0

    if capacity < current_booked:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot set capacity ({capacity}) lower than already booked orders ({current_booked}).",
        )

    now_iso = now_ist().isoformat()
    col.update_one(
        {"pincode": pincode, "date": date_str, "slot_id": slot_id},
        {
            "$set": {
                "capacity": capacity,
                "updated_at": now_iso,
            }
        },
        upsert=True,
    )

    updated = col.find_one({"pincode": pincode, "date": date_str, "slot_id": slot_id})
    return _build_slot_item(updated, SLOT_MAP[slot_id], date_str)
