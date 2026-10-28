"""
cache.py – Short-lived cache for AI answers.

Doc requirement:
"Cost control: cap tokens per answer, cache answers per (org_id, question, context hash) for a short time."
"""

from __future__ import annotations

import hashlib
import json
import time
from typing import Optional, Dict, Tuple

from app.config import get_settings
from app.schemas import AiAnswer

_ANSWER_CACHE: Dict[str, Tuple[float, AiAnswer]] = {}


def _make_cache_key(org_id: str, question: str, context: Optional[dict]) -> str:
    ctx_str = json.dumps(context or {}, sort_keys=True, default=str)
    raw = f"{org_id}:{question.strip().lower()}:{ctx_str}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def get_cached_answer(org_id: str, question: str, context: Optional[dict]) -> Optional[AiAnswer]:
    """Retrieve answer from cache if not expired."""
    cfg = get_settings()
    key = _make_cache_key(org_id, question, context)
    entry = _ANSWER_CACHE.get(key)
    if not entry:
        return None

    timestamp, answer = entry
    if time.time() - timestamp > cfg.EOA_CACHE_TTL_S:
        del _ANSWER_CACHE[key]
        return None

    return answer


def set_cached_answer(org_id: str, question: str, context: Optional[dict], answer: AiAnswer) -> None:
    """Store answer in cache."""
    key = _make_cache_key(org_id, question, context)
    _ANSWER_CACHE[key] = (time.time(), answer)


def clear_cache() -> None:
    """Clear in-memory answer cache."""
    _ANSWER_CACHE.clear()
