"""Analysis context — parameters for a single Iris run."""

from dataclasses import dataclass


@dataclass(frozen=True)
class AnalysisContext:
    """Immutable context for a single analysis run."""

    repo_path: str
    repo_name: str
    days: int
    churn_days: int
    out_dir: str
    org_name: str = ""
    lang: str = "en"
