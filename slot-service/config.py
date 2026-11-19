import os
from datetime import datetime, date, timedelta
from zoneinfo import ZoneInfo
from dotenv import load_dotenv

load_dotenv()

IST = ZoneInfo("Asia/Kolkata")

MONGO_URI: str = os.getenv("MONGO_URI", "mongodb://localhost:27017")
MONGO_DB_NAME: str = os.getenv("MONGO_DB_NAME", "slotkart")
INTERNAL_API_KEY: str = os.getenv("INTERNAL_API_KEY", "")
DEFAULT_SLOT_CAPACITY: int = int(os.getenv("DEFAULT_SLOT_CAPACITY", "5"))
PORT: int = int(os.getenv("PORT", "8000"))

SEED_PINCODES: list[str] = [
    p.strip()
    for p in os.getenv("SEED_PINCODES", "302001,302017,324001").split(",")
    if p.strip()
]

# Business Rules
MAX_RESCHEDULES: int = 2
RESCHEDULE_CUTOFF_HOURS: float = 3.0
FILLING_FAST_THRESHOLD: float = 0.70  # >= 70% booked
BOOKING_HORIZON_DAYS: int = 7

# Canonical 2-hour delivery time slots (IST)
SLOT_DEFINITIONS: list[dict] = [
    {
        "slot_id": "SLOT_10_12",
        "label": "10:00 AM - 12:00 PM",
        "start_time": "10:00",
        "end_time": "12:00",
        "start_hour": 10,
        "end_hour": 12,
    },
    {
        "slot_id": "SLOT_12_14",
        "label": "12:00 PM - 2:00 PM",
        "start_time": "12:00",
        "end_time": "14:00",
        "start_hour": 12,
        "end_hour": 14,
    },
    {
        "slot_id": "SLOT_14_16",
        "label": "2:00 PM - 4:00 PM",
        "start_time": "14:00",
        "end_time": "16:00",
        "start_hour": 14,
        "end_hour": 16,
    },
    {
        "slot_id": "SLOT_16_18",
        "label": "4:00 PM - 6:00 PM",
        "start_time": "16:00",
        "end_time": "18:00",
        "start_hour": 16,
        "end_hour": 18,
    },
    {
        "slot_id": "SLOT_18_20",
        "label": "6:00 PM - 8:00 PM",
        "start_time": "18:00",
        "end_time": "20:00",
        "start_hour": 18,
        "end_hour": 20,
    },
]

SLOT_MAP: dict[str, dict] = {s["slot_id"]: s for s in SLOT_DEFINITIONS}


def now_ist() -> datetime:
    """Return current timezone-aware datetime in Asia/Kolkata (IST)."""
    return datetime.now(IST)


def today_ist() -> date:
    """Return today's date in Asia/Kolkata (IST)."""
    return now_ist().date()


def format_display_date(date_obj: date) -> str:
    """Format date as 'Friday, 14 Nov' (cross-platform without leading zero)."""
    return f"{date_obj.strftime('%A')}, {date_obj.day} {date_obj.strftime('%b')}"


def get_next_n_dates(days: int = BOOKING_HORIZON_DAYS) -> list[date]:
    """Return a list of dates starting from today in IST."""
    start = today_ist()
    return [start + timedelta(days=offset) for offset in range(days)]
