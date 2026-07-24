"""
Custom spaCy pipeline components for NETRA preprocessing.

Wraps language_id.py and transliteration.py as spaCy pipeline components
so tokenization/normalization is consistent and reusable across all three
classifier backends (IndicBERT, mBERT, Sarvam).

The PS's own suggested tools include spaCy + spacy-transformers as the NLP
pipeline framework. We use spaCy.blank("xx") as the multilingual base since
the actual NLP (language ID, transliteration, classification) is handled by
dedicated models — spaCy provides the consistent pipeline wrapper.

Usage:
    nlp = create_nlp_pipeline()
    doc = nlp("ये government बहुत अच्छा काम कर रही है")
    print(doc._.detected_language)     # "mixed"
    print(doc._.transliterated_text)   # native-script version
    print(doc._.language_confidence)   # 0.85
"""

from __future__ import annotations

import logging
from typing import Optional

import spacy
from spacy.language import Language
from spacy.tokens import Doc, Span, Token

from nlp_engine.preprocessing.language_id import LanguageIdentifier, LanguageResult
from nlp_engine.preprocessing.transliteration import Transliterator

logger = logging.getLogger(__name__)

# ── Register custom extensions ──────────────────────────────────────────────

# Doc-level extensions
if not Doc.has_extension("detected_language"):
    Doc.set_extension("detected_language", default="en")
if not Doc.has_extension("language_confidence"):
    Doc.set_extension("language_confidence", default=0.0)
if not Doc.has_extension("language_script"):
    Doc.set_extension("language_script", default="unknown")
if not Doc.has_extension("language_raw_scores"):
    Doc.set_extension("language_raw_scores", default={})
if not Doc.has_extension("transliterated_text"):
    Doc.set_extension("transliterated_text", default="")
if not Doc.has_extension("tokens_transliterated"):
    Doc.set_extension("tokens_transliterated", default=0)
if not Doc.has_extension("tokens_preserved"):
    Doc.set_extension("tokens_preserved", default=0)


# ── Language ID Component ───────────────────────────────────────────────────


@Language.factory(
    "netra_language_id",
    default_config={
        "use_indiclid": False,
        "use_fasttext": False,
        "language_hint_attr": None,
    },
)
def create_language_id_component(
    nlp: Language,
    name: str,
    use_indiclid: bool,
    use_fasttext: bool,
    language_hint_attr: Optional[str],
):
    """Factory for the NETRA language identification pipeline component."""
    return LanguageIDComponent(
        use_indiclid=use_indiclid,
        use_fasttext=use_fasttext,
        language_hint_attr=language_hint_attr,
    )


class LanguageIDComponent:
    """
    spaCy pipeline component for language identification.

    Detects the language of each document and stores the result on custom
    Doc extensions:
      - doc._.detected_language  → "gu" | "hi" | "en" | "mixed"
      - doc._.language_confidence → 0.0 – 1.0
      - doc._.language_script    → "native" | "roman" | "mixed" | "unknown"
      - doc._.language_raw_scores → dict of all language scores
    """

    def __init__(
        self,
        use_indiclid: bool = False,
        use_fasttext: bool = False,
        language_hint_attr: Optional[str] = None,
    ):
        self._identifier = LanguageIdentifier(
            use_indiclid=use_indiclid,
            use_fasttext=use_fasttext,
        )
        self._language_hint_attr = language_hint_attr

    def __call__(self, doc: Doc) -> Doc:
        """Run language identification on the document."""
        # Extract language hint from doc context if available
        language_hint = None
        if self._language_hint_attr and hasattr(doc, "_"):
            language_hint = getattr(doc._, self._language_hint_attr, None)

        result: LanguageResult = self._identifier.detect(
            doc.text, language_hint=language_hint
        )

        doc._.detected_language = result.language
        doc._.language_confidence = result.confidence
        doc._.language_script = result.script
        doc._.language_raw_scores = result.raw_scores

        return doc


# ── Transliteration Component ──────────────────────────────────────────────


@Language.factory(
    "netra_transliterate",
    default_config={
        "transliterate_roman_only": True,
    },
)
def create_transliteration_component(
    nlp: Language,
    name: str,
    transliterate_roman_only: bool,
):
    """Factory for the NETRA transliteration pipeline component."""
    return TransliterationComponent(
        transliterate_roman_only=transliterate_roman_only,
    )


class TransliterationComponent:
    """
    spaCy pipeline component for transliterating Romanized Indic text.

    Reads the detected language from doc._.detected_language (set by the
    netra_language_id component) and transliterates Romanized Hindi/Gujarati
    tokens to native script.

    Stores results on:
      - doc._.transliterated_text   → full transliterated text
      - doc._.tokens_transliterated → count of transliterated tokens
      - doc._.tokens_preserved      → count of preserved (English/native) tokens
    """

    def __init__(self, transliterate_roman_only: bool = True):
        self._transliterator = Transliterator()
        self._transliterate_roman_only = transliterate_roman_only

    def __call__(self, doc: Doc) -> Doc:
        """Run transliteration on the document."""
        lang = doc._.detected_language
        script = doc._.language_script

        # Only transliterate if:
        # 1. Language is Hindi or Gujarati (or mixed)
        # 2. Text contains Roman script (if transliterate_roman_only is set)
        should_transliterate = lang in ("hi", "gu", "mixed")
        if self._transliterate_roman_only and script == "native":
            should_transliterate = False

        if should_transliterate:
            # Default to Hindi if mixed; transliteration target
            target_lang = lang if lang in ("hi", "gu") else "hi"
            result = self._transliterator.transliterate(doc.text, target_lang)
            doc._.transliterated_text = result.transliterated
            doc._.tokens_transliterated = result.tokens_transliterated
            doc._.tokens_preserved = result.tokens_preserved
        else:
            # No transliteration needed — use original text
            doc._.transliterated_text = doc.text
            doc._.tokens_transliterated = 0
            doc._.tokens_preserved = len(doc)

        return doc


# ── Pipeline Factory ────────────────────────────────────────────────────────


def create_nlp_pipeline(
    use_indiclid: bool = False,
    use_fasttext: bool = False,
) -> Language:
    """
    Create a spaCy NLP pipeline with NETRA preprocessing components.

    The pipeline uses spaCy.blank("xx") as the multilingual base, then
    adds our custom language ID and transliteration components. This
    provides a consistent preprocessing interface that all classifier
    backends (IndicBERT, mBERT, Sarvam) share.

    Args:
        use_indiclid: Whether to load the IndicLID-BERT model for language ID.
        use_fasttext: Whether to load the fastText lid.176 model as fallback.

    Returns:
        A spaCy Language pipeline with netra_language_id and netra_transliterate
        components registered and active.

    Example:
        nlp = create_nlp_pipeline()
        doc = nlp("ગુજરાતમાં નવી હોસ્પિટલ ખુલી")
        assert doc._.detected_language == "gu"
        assert doc._.transliterated_text == doc.text  # Already native script
    """
    nlp = spacy.blank("xx")  # Multilingual blank model — no downloads needed

    nlp.add_pipe(
        "netra_language_id",
        config={
            "use_indiclid": use_indiclid,
            "use_fasttext": use_fasttext,
            "language_hint_attr": None,
        },
    )

    nlp.add_pipe(
        "netra_transliterate",
        config={
            "transliterate_roman_only": True,
        },
    )

    logger.info(
        f"NETRA spaCy pipeline created: {nlp.pipe_names} "
        f"(indiclid={use_indiclid}, fasttext={use_fasttext})"
    )
    return nlp
