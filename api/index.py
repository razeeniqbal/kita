"""Vercel Python function: serves the FastAPI app for every /api/* request (see vercel.json).

The backend lives in backend/app; this file only puts it on the import path."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from app.main import app  # noqa: E402,F401  (Vercel looks for `app`)
