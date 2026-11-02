"""Web push: send notifications to the devices in kita.push_subscriptions.

Changes are queued while a request runs (see crud.log) and sent by get_db once the handler
has committed, so a rolled-back change never notifies anyone."""
import datetime as dt
import json
import logging
import uuid
from dataclasses import dataclass
from urllib.parse import urlsplit

import requests
from pywebpush import WebPushException, webpush
from sqlalchemy import delete, select, update
from sqlalchemy.engine import Connection

from app.config import get_settings
from app.tables import planning_events, push_subscriptions, workspaces

logger = logging.getLogger("kita")
PENDING = "kita.push_pending"

# Push services the browsers use. Subscriptions pointing anywhere else are refused, so the
# server never posts to an address a client made up.
PUSH_HOSTS = ("fcm.googleapis.com", "updates.push.services.mozilla.com", "push.apple.com",
              "notify.windows.com", "push.services.mozilla.com")

# Which page a change opens, by the activity log's entity type.
PAGE = {"task": "checklist", "expense": "budget", "hantaran": "hantaran", "hantaran_item": "hantaran",
        "calendar_item": "calendar", "guest": "guests", "vendor_booking": "vendors", "note": "notes",
        "document": "documents"}
MODE_LABEL = {"TUNANG": "Tunang", "PERKAHWINAN": "Perkahwinan"}


@dataclass(frozen=True)
class Change:
    workspace_id: uuid.UUID
    actor_user_id: uuid.UUID
    actor_slot: int
    event_id: uuid.UUID | None
    action: str
    entity_type: str
    summary: str


def configured() -> bool:
    s = get_settings()
    return bool(s.vapid_public_key and s.vapid_private_key)


def allowed_endpoint(endpoint: str) -> bool:
    parts = urlsplit(endpoint)
    host = (parts.hostname or "").lower()
    return parts.scheme == "https" and any(host == h or host.endswith("." + h) for h in PUSH_HOSTS)


def worth_telling(action: str, summary: str) -> bool:
    """Additions, completions, payments and moves. Routine edits and deletions stay quiet."""
    if action in ("planning_event.created", "budget_category.created"):
        return False
    return (action.endswith(".created") or action in ("task.moved", "guest.copied")
            or (action == "task.updated" and summary.startswith("completed")))


def queue(db: Connection, change: Change) -> None:
    if worth_telling(change.action, change.summary):
        db.info.setdefault(PENDING, []).append(change)


def flush(db: Connection) -> None:
    """Send what the request queued: one notification to the partner's devices, describing the
    first change (a task move logs twice; a burst of edits shouldn't buzz twice)."""
    pending = db.info.pop(PENDING, [])
    if not pending or not configured():
        return
    change = pending[0]
    try:
        subs = db.execute(select(push_subscriptions).where(
            push_subscriptions.c.workspace_id == change.workspace_id,
            push_subscriptions.c.user_id != change.actor_user_id,
            push_subscriptions.c.partner_updates.is_(True))).all()
        if not subs:
            return
        ws = db.execute(select(workspaces).where(workspaces.c.id == change.workspace_id)).one()
        name = (ws.partner_1_name if change.actor_slot == 1 else ws.partner_2_name) or "Your partner"
        mode = None
        if change.event_id is not None:
            mode = db.execute(select(planning_events.c.mode).where(planning_events.c.id == change.event_id)).scalar()
        page = PAGE.get(change.entity_type, "")
        url = f"/{mode.lower()}/{page}".rstrip("/") if mode else "/activity"
        send(db, subs, {
            "title": f"kita. · {MODE_LABEL[mode]}" if mode else "kita.",
            "body": f"{name} {change.summary}",
            "url": url,
            "tag": f"{change.entity_type}-{change.event_id}",
        })
    except Exception:  # A failed notification must never turn a saved change into an error.
        logger.exception("Could not send partner notification")


def send(db: Connection, subs, payload: dict) -> int:
    """Push `payload` to each subscription row. Drops devices the push service says are gone.
    Returns how many were delivered to the push service."""
    settings = get_settings()
    sent, gone, delivered = 0, [], []
    for sub in subs:
        try:
            webpush(
                {"endpoint": sub.endpoint, "keys": {"p256dh": sub.p256dh, "auth": sub.auth}},
                data=json.dumps(payload),
                vapid_private_key=settings.vapid_private_key,
                vapid_claims={"sub": settings.vapid_subject},   # pywebpush adds aud/exp to this dict
                ttl=12 * 60 * 60,
                timeout=5,
            )
            sent += 1
            delivered.append(sub.id)
        except WebPushException as exc:
            code = exc.response.status_code if exc.response is not None else None
            if code in (404, 410):
                gone.append(sub.id)
            else:
                logger.warning("Push to %s failed: %s", urlsplit(sub.endpoint).hostname, code or exc)
        except requests.RequestException as exc:
            logger.warning("Push to %s failed: %s", urlsplit(sub.endpoint).hostname, type(exc).__name__)
    if gone:
        db.execute(delete(push_subscriptions).where(push_subscriptions.c.id.in_(gone)))
    if delivered:
        db.execute(update(push_subscriptions).where(push_subscriptions.c.id.in_(delivered))
                   .values(last_sent_at=dt.datetime.now(dt.UTC)))
    if gone or delivered:
        db.commit()
    return sent

