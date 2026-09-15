"""Business-calendar helpers shared by AI date validation.

The data engine follows China Standard Time and only exposes complete data
through yesterday. Keeping this rule server-side prevents model or host
timezone differences from leaking today's partial data into an audience.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone


BUSINESS_TIMEZONE = timezone(timedelta(hours=8), name="Asia/Shanghai")


def business_today() -> date:
    return datetime.now(BUSINESS_TIMEZONE).date()


def latest_selectable_date() -> date:
    return business_today() - timedelta(days=1)


def _same_day_previous_year(value: date) -> date:
    """Return the prior-year counterpart, clamping leap day to February 28."""

    try:
        return value.replace(year=value.year - 1)
    except ValueError:
        return value.replace(year=value.year - 1, day=28)


def resolve_business_period(
    period: str,
    *,
    cutoff: date | None = None,
) -> tuple[date, date]:
    """Resolve a named rolling period against the latest complete data day.

    ``cutoff`` is injectable for regression tests and historical reconstruction.
    In production it defaults to yesterday in the business timezone.
    """

    normalized = str(period or "").strip().lower().replace("-", "_")
    end = cutoff or latest_selectable_date()
    if normalized == "ytd":
        return end.replace(month=1, day=1), end
    if normalized == "previous_ytd":
        previous_end = _same_day_previous_year(end)
        return previous_end.replace(month=1, day=1), previous_end
    if normalized == "mtd":
        return end.replace(day=1), end
    if normalized == "previous_mtd":
        previous_end = _same_day_previous_year(end)
        return previous_end.replace(day=1), previous_end
    raise ValueError(f"不支持的业务周期：{period}")
