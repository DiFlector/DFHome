"""Load metric comfort thresholds from SQLite (with defaults)."""
import json

from app import storage
from app.models import MetricThresholds

_DEFAULT = MetricThresholds()


async def load_metric_thresholds() -> MetricThresholds:
    raw = await storage.get("metric_thresholds")
    if not raw:
        return _DEFAULT.model_copy(deep=True)
    try:
        return MetricThresholds.model_validate(json.loads(raw))
    except Exception:
        return _DEFAULT.model_copy(deep=True)
