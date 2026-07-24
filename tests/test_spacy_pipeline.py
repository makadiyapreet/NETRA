"""
Tests for the custom spaCy pipeline components.

Tests the netra_language_id and netra_transliterate components
wrapped as spaCy pipeline components. No model downloads needed —
tests use heuristic-only mode.
"""

import pytest
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


class TestSpacyPipelineCreation:
    """Test that the spaCy pipeline can be created and configured."""

    def test_create_pipeline(self):
        """create_nlp_pipeline should return a spaCy Language object."""
        from nlp_engine.preprocessing.spacy_pipeline import create_nlp_pipeline

        nlp = create_nlp_pipeline()
        assert nlp is not None
        assert "netra_language_id" in nlp.pipe_names
        assert "netra_transliterate" in nlp.pipe_names

    def test_pipeline_order(self):
        """Language ID should come before transliteration."""
        from nlp_engine.preprocessing.spacy_pipeline import create_nlp_pipeline

        nlp = create_nlp_pipeline()
        lid_idx = nlp.pipe_names.index("netra_language_id")
        xlit_idx = nlp.pipe_names.index("netra_transliterate")
        assert lid_idx < xlit_idx, (
            "netra_language_id must be before netra_transliterate"
        )


class TestLanguageIDComponent:
    """Test the netra_language_id spaCy component."""

    def _get_nlp(self):
        from nlp_engine.preprocessing.spacy_pipeline import create_nlp_pipeline
        return create_nlp_pipeline(use_indiclid=False, use_fasttext=False)

    def test_gujarati_text(self):
        """Gujarati text should be detected as 'gu'."""
        nlp = self._get_nlp()
        doc = nlp("ગુજરાતમાં કોમી તણાવની ગંભીર ઘટના")
        assert doc._.detected_language == "gu"
        assert doc._.language_confidence > 0.5
        assert doc._.language_script == "native"

    def test_hindi_text(self):
        """Hindi/Devanagari text should be detected as 'hi'."""
        nlp = self._get_nlp()
        doc = nlp("दिल्ली में आज सड़कों पर भारी ट्रैफिक")
        assert doc._.detected_language == "hi"
        assert doc._.language_confidence > 0.5
        assert doc._.language_script == "native"

    def test_english_text(self):
        """English text should be detected as 'en'."""
        nlp = self._get_nlp()
        doc = nlp("India economy shows strong growth in Q2 2026")
        assert doc._.detected_language == "en"

    def test_empty_text(self):
        """Empty text should produce a doc with default language."""
        nlp = self._get_nlp()
        doc = nlp("")
        assert doc._.detected_language == "en"
        assert doc._.language_confidence == 0.0

    def test_raw_scores_populated(self):
        """raw_scores should be a dict with at least one entry."""
        nlp = self._get_nlp()
        doc = nlp("ગુજરાતમાં નવી હોસ્પિટલ ખુલી")
        assert isinstance(doc._.language_raw_scores, dict)
        assert len(doc._.language_raw_scores) > 0


class TestTransliterationComponent:
    """Test the netra_transliterate spaCy component."""

    def _get_nlp(self):
        from nlp_engine.preprocessing.spacy_pipeline import create_nlp_pipeline
        return create_nlp_pipeline(use_indiclid=False, use_fasttext=False)

    def test_native_script_passthrough(self):
        """Text already in native script should pass through unchanged."""
        nlp = self._get_nlp()
        original = "ગુજરાતમાં નવી હોસ્પિટલ ખુલી"
        doc = nlp(original)
        # Native script text should not be transliterated
        assert doc._.transliterated_text == original

    def test_english_passthrough(self):
        """English text should pass through unchanged."""
        nlp = self._get_nlp()
        original = "India economy shows strong growth"
        doc = nlp(original)
        assert doc._.transliterated_text == original

    def test_transliterated_text_is_string(self):
        """transliterated_text should always be a string."""
        nlp = self._get_nlp()
        doc = nlp("some text here")
        assert isinstance(doc._.transliterated_text, str)

    def test_token_counts(self):
        """Token counts should be non-negative integers."""
        nlp = self._get_nlp()
        doc = nlp("ગુજરાત")
        assert isinstance(doc._.tokens_transliterated, int)
        assert isinstance(doc._.tokens_preserved, int)
        assert doc._.tokens_transliterated >= 0
        assert doc._.tokens_preserved >= 0


class TestPipelineIntegration:
    """Integration tests: full pipeline on mixed content."""

    def _get_nlp(self):
        from nlp_engine.preprocessing.spacy_pipeline import create_nlp_pipeline
        return create_nlp_pipeline(use_indiclid=False, use_fasttext=False)

    def test_process_multiple_docs(self):
        """Pipeline should handle multiple documents sequentially."""
        nlp = self._get_nlp()
        texts = [
            "ગુજરાતમાં શાંતિ",
            "दिल्ली में ट्रैफिक",
            "India election results",
        ]
        docs = list(nlp.pipe(texts))
        assert len(docs) == 3
        assert docs[0]._.detected_language == "gu"
        assert docs[1]._.detected_language == "hi"
        assert docs[2]._.detected_language == "en"

    def test_all_extensions_present(self):
        """All custom Doc extensions should be set after processing."""
        nlp = self._get_nlp()
        doc = nlp("Test text")
        expected_extensions = [
            "detected_language",
            "language_confidence",
            "language_script",
            "language_raw_scores",
            "transliterated_text",
            "tokens_transliterated",
            "tokens_preserved",
        ]
        for ext in expected_extensions:
            assert doc.has_extension(ext), f"Missing extension: {ext}"

    def test_doc_extensions_types(self):
        """Verify types of all custom extensions."""
        nlp = self._get_nlp()
        doc = nlp("ગુજરાતમાં")
        assert isinstance(doc._.detected_language, str)
        assert isinstance(doc._.language_confidence, float)
        assert isinstance(doc._.language_script, str)
        assert isinstance(doc._.language_raw_scores, dict)
        assert isinstance(doc._.transliterated_text, str)
        assert isinstance(doc._.tokens_transliterated, int)
        assert isinstance(doc._.tokens_preserved, int)
