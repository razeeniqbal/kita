"""Verify Supabase Auth access tokens sent as `Authorization: Bearer <token>`."""
import uuid
from dataclasses import dataclass
from functools import lru_cache

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.config import Settings, get_settings

bearer = HTTPBearer(auto_error=False)


@dataclass(frozen=True)
class AuthUser:
    id: uuid.UUID
    email: str | None


def _unauthorized(message: str) -> HTTPException:
    return HTTPException(status.HTTP_401_UNAUTHORIZED, message, headers={"WWW-Authenticate": "Bearer"})


@lru_cache
def _jwks_client(supabase_url: str) -> jwt.PyJWKClient:
    return jwt.PyJWKClient(f"{supabase_url.rstrip('/')}/auth/v1/.well-known/jwks.json", cache_keys=True, lifespan=3600)


def decode_token(token: str, settings: Settings) -> AuthUser:
    try:
        alg = jwt.get_unverified_header(token).get("alg")
        if alg == "HS256":
            # Legacy projects sign with a shared secret. Only accepted when that secret is configured.
            if not settings.supabase_jwt_secret:
                raise jwt.InvalidTokenError("HS256 tokens are not accepted")
            key, algorithms = settings.supabase_jwt_secret, ["HS256"]
        else:
            if not settings.supabase_url:
                raise jwt.InvalidTokenError("SUPABASE_URL is not configured")
            key = _jwks_client(settings.supabase_url).get_signing_key_from_jwt(token).key
            algorithms = ["ES256", "RS256"]
        options = {"require": ["exp", "sub"]}
        issuer = f"{settings.supabase_url.rstrip('/')}/auth/v1" if settings.supabase_url else None
        claims = jwt.decode(token, key, algorithms=algorithms, audience=settings.jwt_audience,
                            issuer=issuer, options=options)
        return AuthUser(id=uuid.UUID(claims["sub"]), email=claims.get("email"))
    except (jwt.PyJWTError, ValueError) as exc:
        raise _unauthorized("Your session has expired or is not valid. Please sign in again.") from exc


def current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    settings: Settings = Depends(get_settings),
) -> AuthUser:
    if credentials is None:
        raise _unauthorized("Please sign in.")
    return decode_token(credentials.credentials, settings)
