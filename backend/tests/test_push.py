"""Web push helpers. No database needed: these run without Docker."""
import base64
import json
import os
from types import SimpleNamespace
from unittest.mock import MagicMock

import http_ece
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from pywebpush import WebPushException, webpush

from app import push


def b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


@pytest.mark.parametrize("endpoint, ok", [
    ("https://fcm.googleapis.com/fcm/send/abc", True),
    ("https://web.push.apple.com/QGx", True),
    ("https://updates.push.services.mozilla.com/wpush/v2/x", True),
    ("https://wns2-sg2p.notify.windows.com/w/?token=x", True),
    ("http://fcm.googleapis.com/fcm/send/abc", False),
    ("https://evil.example/fcm.googleapis.com", False),
    ("https://fcm.googleapis.com.evil.example/x", False),
    ("https://169.254.169.254/latest", False),
])
def test_only_known_push_services_are_accepted(endpoint, ok):
    assert push.allowed_endpoint(endpoint) is ok


@pytest.mark.parametrize("action, summary, tell", [
    ("task.created", "added task “Cincin”", True),
    ("task.updated", "completed “Cincin”", True),
    ("task.updated", "set “Cincin” to in progress", False),
    ("task.deleted", "deleted task “Cincin”", False),
    ("payment.created", "recorded RM 100", True),
    ("task.moved", "moved “Cincin” from Tunang to Perkahwinan", True),
    ("budget_category.created", "added budget category “Misc”", False),
])
def test_partner_hears_about_additions_and_completions_only(action, summary, tell):
    assert push.worth_telling(action, summary) is tell


def test_payload_is_encrypted_for_the_device_and_signed_with_vapid():
    device = ec.generate_private_key(ec.SECP256R1())
    device_public = device.public_key().public_bytes(serialization.Encoding.X962,
                                                     serialization.PublicFormat.UncompressedPoint)
    auth = os.urandom(16)
    server = ec.generate_private_key(ec.SECP256R1())
    server_private = b64url(server.private_numbers().private_value.to_bytes(32, "big"))

    session = MagicMock()
    session.post.return_value = SimpleNamespace(status_code=201, text="", headers={})
    webpush({"endpoint": "https://fcm.googleapis.com/fcm/send/x", "keys": {"p256dh": b64url(device_public), "auth": b64url(auth)}},
            data=json.dumps({"title": "kita.", "body": "hi"}), vapid_private_key=server_private,
            vapid_claims={"sub": "https://kita.madebyrazeen.com"}, ttl=60, requests_session=session)

    _, kwargs = session.post.call_args
    assert kwargs["headers"]["Authorization"].startswith("vapid t=")
    plain = http_ece.decrypt(kwargs["data"], private_key=device, auth_secret=auth, version="aes128gcm")
    assert json.loads(plain) == {"title": "kita.", "body": "hi"}


def test_devices_the_push_service_has_forgotten_are_removed(monkeypatch):
    def gone(*args, **kwargs):
        raise WebPushException("Gone", response=SimpleNamespace(status_code=410, text="", headers={}))

    monkeypatch.setattr(push, "webpush", gone)
    db = MagicMock()
    sub = SimpleNamespace(id="s1", endpoint="https://fcm.googleapis.com/fcm/send/x", p256dh="k", auth="a")
    assert push.send(db, [sub], {"title": "t"}) == 0
    statement = str(db.execute.call_args_list[0].args[0])
    assert statement.startswith("DELETE FROM kita.push_subscriptions")
    db.commit.assert_called_once()
