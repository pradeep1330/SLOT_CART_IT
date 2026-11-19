import hmac
from fastapi import Header, HTTPException, status

from config import INTERNAL_API_KEY


def verify_internal_key(x_internal_key: str | None = Header(default=None)) -> str:
    """
    Validate shared secret header X-Internal-Key for service-to-service auth.
    Uses constant-time comparison to prevent timing attacks.
    """
    if not INTERNAL_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Slot service internal key is not configured.",
        )

    if not x_internal_key or not hmac.compare_digest(x_internal_key, INTERNAL_API_KEY):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Unauthorized: invalid or missing X-Internal-Key header.",
        )

    return x_internal_key
