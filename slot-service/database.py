import logging
from datetime import date, datetime
from pymongo import MongoClient, ASCENDING, UpdateOne
from pymongo.collection import Collection
from pymongo.database import Database
from pymongo.errors import PyMongoError

from config import (
    MONGO_URI,
    MONGO_DB_NAME,
    DEFAULT_SLOT_CAPACITY,
    SEED_PINCODES,
    SLOT_DEFINITIONS,
    BOOKING_HORIZON_DAYS,
    get_next_n_dates,
    now_ist,
)

logger = logging.getLogger("slot-service.database")

_client: MongoClient | None = None
_db: Database | None = None


def connect_db() -> Database:
    """Initialize PyMongo client, verify connection, and ensure indexes."""
    global _client, _db
    if _db is not None:
        return _db

    _client = MongoClient(
        MONGO_URI,
        serverSelectionTimeoutMS=5000,
        connectTimeoutMS=5000,
        socketTimeoutMS=10000,
    )
    _db = _client[MONGO_DB_NAME]

    # Verify connectivity on startup
    _client.admin.command("ping")
    logger.info("Connected to MongoDB database '%s'", MONGO_DB_NAME)

    ensure_indexes(_db)
    return _db


def close_db() -> None:
    """Gracefully close PyMongo client."""
    global _client, _db
    if _client is not None:
        _client.close()
        _client = None
        _db = None
        logger.info("Closed MongoDB connection")


def get_db() -> Database:
    """Return active database handle, connecting lazily if needed."""
    if _db is None:
        return connect_db()
    return _db


def get_slot_capacity_collection() -> Collection:
    """Return the slot_capacity collection owned by the Python service."""
    return get_db()["slot_capacity"]


def ensure_indexes(db: Database) -> None:
    """Create compound unique index on (pincode, date, slot_id) and query indexes."""
    col = db["slot_capacity"]
    col.create_index(
        [("pincode", ASCENDING), ("date", ASCENDING), ("slot_id", ASCENDING)],
        unique=True,
        name="idx_pincode_date_slot_unique",
    )
    col.create_index(
        [("date", ASCENDING), ("pincode", ASCENDING)],
        name="idx_date_pincode",
    )
    logger.info("Ensured indexes on slot_capacity collection")


def ensure_slots_for_date(pincode: str, date_str: str) -> None:
    """Idempotently create all 5 slot_capacity documents for a (pincode, date)."""
    col = get_slot_capacity_collection()
    now_iso = now_ist().isoformat()

    ops = [
        UpdateOne(
            {
                "pincode": pincode,
                "date": date_str,
                "slot_id": slot["slot_id"],
            },
            {
                "$setOnInsert": {
                    "pincode": pincode,
                    "date": date_str,
                    "slot_id": slot["slot_id"],
                    "capacity": DEFAULT_SLOT_CAPACITY,
                    "booked": 0,
                    "created_at": now_iso,
                    "updated_at": now_iso,
                }
            },
            upsert=True,
        )
        for slot in SLOT_DEFINITIONS
    ]

    if ops:
        col.bulk_write(ops, ordered=False)


def seed_initial_capacity() -> int:
    """Auto-create capacity documents for next 7 days for default pincodes (idempotent)."""
    col = get_slot_capacity_collection()
    dates = get_next_n_dates(BOOKING_HORIZON_DAYS)
    now_iso = now_ist().isoformat()

    ops: list[UpdateOne] = []
    for pincode in SEED_PINCODES:
        for d in dates:
            date_str = d.isoformat()
            for slot in SLOT_DEFINITIONS:
                ops.append(
                    UpdateOne(
                        {
                            "pincode": pincode,
                            "date": date_str,
                            "slot_id": slot["slot_id"],
                        },
                        {
                            "$setOnInsert": {
                                "pincode": pincode,
                                "date": date_str,
                                "slot_id": slot["slot_id"],
                                "capacity": DEFAULT_SLOT_CAPACITY,
                                "booked": 0,
                                "created_at": now_iso,
                                "updated_at": now_iso,
                            }
                        },
                        upsert=True,
                    )
                )

    if not ops:
        return 0

    result = col.bulk_write(ops, ordered=False)
    created = result.upserted_count
    logger.info(
        "Startup slot capacity seed complete for pincodes %s (%d new docs created, %d total ensured)",
        SEED_PINCODES,
        created,
        len(ops),
    )
    return created


def ping_db() -> bool:
    """Check if MongoDB is reachable."""
    try:
        db = get_db()
        db.command("ping")
        return True
    except PyMongoError:
        return False
