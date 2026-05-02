"""Change intent model — semantic classification of commits."""

from dataclasses import dataclass
from enum import Enum

from iris.models.commit import Commit


class ChangeIntent(Enum):
    """Semantic category for a commit's engineering intent.

    Classification is heuristic-based and deterministic.
    See analysis/intent_classifier.py for rules.
    """

    FEATURE = "FEATURE"
    FIX = "FIX"
    REFACTOR = "REFACTOR"
    CONFIG = "CONFIG"
    UNKNOWN = "UNKNOWN"


@dataclass(frozen=True)
class ClassifiedCommit:
    """A commit annotated with its classified engineering intent.

    confidence_reason documents which heuristic matched,
    ensuring explainability (e.g. "prefix:feat:", "keyword:bugfix").
    """

    commit: Commit
    intent: ChangeIntent
    confidence_reason: str
