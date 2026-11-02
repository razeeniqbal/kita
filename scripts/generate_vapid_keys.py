"""Print a new VAPID key pair for web push, ready to paste into backend/.env and Vercel.

Usage (from the repo root, with the backend's packages installed):
    python scripts/generate_vapid_keys.py

Keep VAPID_PRIVATE_KEY secret. Changing the pair later means every device has to turn
notifications on again.
"""
import base64

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec


def b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


key = ec.generate_private_key(ec.SECP256R1())
private = key.private_numbers().private_value.to_bytes(32, "big")
public = key.public_key().public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
print(f"VAPID_PUBLIC_KEY={b64url(public)}")
print(f"VAPID_PRIVATE_KEY={b64url(private)}")
