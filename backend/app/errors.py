"""Turn database rule violations into clear API errors instead of 500s."""
import logging

from fastapi import Request, status
from fastapi.responses import JSONResponse
from sqlalchemy.exc import DBAPIError, OperationalError

logger = logging.getLogger("kita")


async def database_error_handler(request: Request, exc: DBAPIError) -> JSONResponse:
    code = getattr(exc.orig, "sqlstate", None)
    message = str(exc.orig).strip().splitlines()[0] if exc.orig else ""
    if isinstance(exc, OperationalError) and code is None:
        # Could not connect at all (wrong DATABASE_URL, paused project, network). Log the reason for Vercel's logs.
        logger.error("Database unreachable on %s %s: %s", request.method, request.url.path, message)
        return JSONResponse({"detail": "kita can't reach its database right now. Please try again in a moment."},
                            status.HTTP_503_SERVICE_UNAVAILABLE)
    if code == "23514" and message.startswith("Payments of"):
        detail = ("These payments add up to more than the committed amount. "
                  "Correct the amounts, or turn on allow_overpayment for this expense.")
        return JSONResponse({"detail": detail}, status.HTTP_422_UNPROCESSABLE_ENTITY)
    if code == "23514":
        return JSONResponse({"detail": "A value is outside the allowed range."}, status.HTTP_422_UNPROCESSABLE_ENTITY)
    if code == "23502":
        return JSONResponse({"detail": "A required field cannot be empty."}, status.HTTP_422_UNPROCESSABLE_ENTITY)
    if code == "23503":
        return JSONResponse({"detail": "A linked item does not exist in this planning mode."},
                            status.HTTP_422_UNPROCESSABLE_ENTITY)
    if code == "23505":
        return JSONResponse({"detail": "That already exists."}, status.HTTP_409_CONFLICT)
    if code in ("22P02", "22007", "22008", "22003"):
        return JSONResponse({"detail": "A value has the wrong format."}, status.HTTP_422_UNPROCESSABLE_ENTITY)
    logger.exception("Database error on %s %s", request.method, request.url.path)
    return JSONResponse({"detail": "Something went wrong saving your change. Please try again."},
                        status.HTTP_500_INTERNAL_SERVER_ERROR)
