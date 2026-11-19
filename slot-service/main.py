import logging
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import Depends, FastAPI, HTTPException, Query, Request, status
from fastapi.responses import JSONResponse

from config import now_ist, today_ist
from database import connect_db, close_db, seed_initial_capacity, ping_db
from schemas import (
    SlotActionRequest,
    ValidateRescheduleRequest,
    AdminCapacityUpdateRequest,
    DaySlotsResponse,
    WeekSlotsResponse,
    SlotBookingResponse,
    SlotReleaseResponse,
    ValidateRescheduleResponse,
    SlotItemResponse,
    HealthResponse,
    validate_pincode_value,
    validate_date_value,
)
from security import verify_internal_key
from services import (
    get_day_slots,
    get_week_slots,
    book_slot_atomic,
    release_slot_atomic,
    validate_reschedule_rules,
    get_utilization_analytics,
    update_admin_capacity,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("slot-service")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """Connect to MongoDB and idempotently seed 7-day slot capacity on startup."""
    try:
        connect_db()
        seed_initial_capacity()
    except Exception as exc:
        logger.error("Startup initialization warning: %s", exc)
    yield
    close_db()


app = FastAPI(
    title="SlotKart Smart Delivery Slot Engine",
    version="1.0.0",
    description="Python FastAPI microservice owning delivery slot capacity, atomic booking, recommendations, and reschedule rules.",
    lifespan=lifespan,
)


@app.exception_handler(Exception)
async def global_exception_handler(_request: Request, exc: Exception):
    logger.exception("Unhandled error in slot-service: %s", exc)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "Internal error in Smart Delivery Slot Engine."},
    )


@app.get("/health", response_model=HealthResponse, tags=["System"])
def health_check():
    """Public health check endpoint for Railway and Express monitoring."""
    db_ok = ping_db()
    payload = HealthResponse(
        status="ok" if db_ok else "degraded",
        database="connected" if db_ok else "disconnected",
        ist_now=now_ist().isoformat(),
    )
    if not db_ok:
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content=payload.model_dump(),
        )
    return payload


@app.get(
    "/slots",
    response_model=DaySlotsResponse,
    dependencies=[Depends(verify_internal_key)],
    tags=["Slots"],
)
def fetch_day_slots(
    pincode: str = Query(..., description="6-digit Indian pincode"),
    date: Optional[str] = Query(
        default=None, description="Date in YYYY-MM-DD (IST). Defaults to today."
    ),
):
    """Return all 5 delivery slots for a pincode & date with statuses and recommended slot."""
    try:
        clean_pincode = validate_pincode_value(pincode)
        clean_date = validate_date_value(date) if date else today_ist().isoformat()
    except ValueError as err:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(err)
        ) from err

    return get_day_slots(clean_pincode, clean_date)


@app.get(
    "/slots/week",
    response_model=WeekSlotsResponse,
    dependencies=[Depends(verify_internal_key)],
    tags=["Slots"],
)
def fetch_week_slots(
    pincode: str = Query(..., description="6-digit Indian pincode"),
):
    """Return 7-day slot availability summary for a pincode (IST)."""
    try:
        clean_pincode = validate_pincode_value(pincode)
    except ValueError as err:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(err)
        ) from err

    return get_week_slots(clean_pincode)


@app.post(
    "/slots/book",
    response_model=SlotBookingResponse,
    dependencies=[Depends(verify_internal_key)],
    tags=["Slots"],
)
def book_slot(payload: SlotActionRequest):
    """Atomically reserve one spot in a delivery slot using MongoDB $expr conditional update."""
    slot_item = book_slot_atomic(payload.pincode, payload.date, payload.slot_id)
    return SlotBookingResponse(
        success=True,
        message=f"Reserved delivery slot {slot_item.label} on {payload.date}.",
        slot=slot_item,
    )


@app.post(
    "/slots/release",
    response_model=SlotReleaseResponse,
    dependencies=[Depends(verify_internal_key)],
    tags=["Slots"],
)
def release_slot(payload: SlotActionRequest):
    """Safely release a booked spot (never decrements below 0)."""
    released = release_slot_atomic(payload.pincode, payload.date, payload.slot_id)
    return SlotReleaseResponse(
        success=True,
        released=released,
        message="Slot capacity released." if released else "Slot was already at 0 booked.",
    )


@app.post(
    "/slots/validate-reschedule",
    response_model=ValidateRescheduleResponse,
    dependencies=[Depends(verify_internal_key)],
    tags=["Slots"],
)
def validate_reschedule(payload: ValidateRescheduleRequest):
    """Validate max 2 reschedules and 3-hour IST cutoff before slot starts."""
    return validate_reschedule_rules(
        slot_date=payload.slot_date,
        slot_start=payload.slot_start,
        reschedule_count=payload.reschedule_count,
        partner_triggered=payload.partner_triggered,
    )


@app.get(
    "/analytics/utilization",
    dependencies=[Depends(verify_internal_key)],
    tags=["Analytics"],
)
def analytics_utilization(
    pincode: Optional[str] = Query(default=None, description="Optional 6-digit pincode filter"),
    days: int = Query(default=7, ge=1, le=14, description="Number of upcoming days to aggregate"),
):
    """Return slot utilization breakdown by day, time window, and pincode for Admin dashboard."""
    clean_pincode = None
    if pincode:
        try:
            clean_pincode = validate_pincode_value(pincode)
        except ValueError as err:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail=str(err)
            ) from err

    return get_utilization_analytics(pincode=clean_pincode, days=days)


@app.put(
    "/admin/capacity",
    response_model=SlotItemResponse,
    dependencies=[Depends(verify_internal_key)],
    tags=["Admin"],
)
def admin_update_capacity(payload: AdminCapacityUpdateRequest):
    """Update max capacity for a specific (pincode, date, slot_id)."""
    return update_admin_capacity(
        pincode=payload.pincode,
        date_str=payload.date,
        slot_id=payload.slot_id,
        capacity=payload.capacity,
    )
