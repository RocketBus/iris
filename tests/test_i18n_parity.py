"""Structural guards for the i18n string tables.

The narrative formats strings by key with named placeholders, so a key
missing from one language is a runtime KeyError and a placeholder missing
from one language is a runtime format error — neither is caught by any
other test. These guards fail before a report does.

The last test is a wording guard for Absolute Rule #4 (metrics are
hypotheses): the three stabilization strings must not infer durability from
persistence. Rewording them is a deliberate act — update that test in the
same change.

Runnable as a plain script: `python tests/test_i18n_parity.py`.
"""

import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from iris.i18n import get_strings

_LANGS = ("en", "pt-br")
_PLACEHOLDER = re.compile(r"\{(\w+)\}")


def _placeholders(text: str) -> set[str]:
    return set(_PLACEHOLDER.findall(text))


def test_every_language_has_the_same_keys() -> None:
    key_sets = {lang: set(get_strings(lang)) for lang in _LANGS}
    reference = key_sets["en"]
    for lang, keys in key_sets.items():
        missing = reference - keys
        extra = keys - reference
        assert not missing, f"{lang} is missing keys: {sorted(missing)}"
        assert not extra, f"{lang} has extra keys: {sorted(extra)}"


def test_every_key_has_the_same_placeholders_in_every_language() -> None:
    en = get_strings("en")
    mismatches = []
    for lang in _LANGS[1:]:
        other = get_strings(lang)
        for key, text in en.items():
            if not isinstance(text, str) or not isinstance(other.get(key), str):
                continue
            if _placeholders(text) != _placeholders(other[key]):
                mismatches.append((key, lang, _placeholders(text), _placeholders(other[key])))
    assert not mismatches, f"placeholder drift: {mismatches}"


def test_stabilization_findings_format_in_every_language() -> None:
    # The keys rewritten to drop the durability over-inference must still
    # accept exactly the arguments narrative.py passes them.
    for lang in _LANGS:
        s = get_strings(lang)
        assert s["finding_stabilization_high"].format(ratio="85%")
        assert s["finding_stabilization_low"].format(ratio="40%", unstable_pct="60%")
        assert s["trend_finding_stabilization_up"].format(delta="3", recent=30, baseline=90)
        assert s["explain_intent_stability_body"].format(
            feat_ratio="80%", fix_ratio="60%", refactor_ratio="90%",
        )


def test_stabilization_findings_do_not_claim_durability() -> None:
    # Persistence is not evidence of correctness; the wording must not imply it.
    for lang in _LANGS:
        s = get_strings(lang)
        for key in ("finding_stabilization_high", "trend_finding_stabilization_up",
                    "explain_intent_stability_body"):
            assert "durable" not in s[key].lower(), (lang, key)
            assert "durável" not in s[key].lower(), (lang, key)
            assert "duráveis" not in s[key].lower(), (lang, key)


if __name__ == "__main__":
    tests = [fn for name, fn in globals().items() if name.startswith("test_")]
    failed = 0
    for fn in tests:
        try:
            fn()
            print(f"ok  {fn.__name__}")
        except AssertionError as exc:
            failed += 1
            print(f"FAIL {fn.__name__}: {exc}")
    if failed:
        print(f"\n{failed} failure(s)")
        sys.exit(1)
    print(f"\n{len(tests)} tests passed")
