"""
Tests for language identification module.

Tests the heuristic script detection (no model downloads needed)
and verifies correct language mapping for various scripts.
"""

import pytest
import sys
from pathlib import Path

# Ensure imports work
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


class TestScriptDetection:
    """Test Unicode script detection (fast, no model needed)."""

    def _get_identifier(self):
        from nlp_engine.preprocessing.language_id import LanguageIdentifier
        # Use heuristic-only mode for tests (no model downloads)
        return LanguageIdentifier(use_indiclid=False, use_fasttext=False)

    def test_gujarati_script(self):
        """Gujarati text should be detected as 'gujarati' script."""
        identifier = self._get_identifier()
        text = "ગુજરાતમાં કોમી તણાવની ગંભીર ઘટના"
        assert identifier.detect_script(text) == "gujarati"

    def test_devanagari_script(self):
        """Hindi/Devanagari text should be detected as 'devanagari' script."""
        identifier = self._get_identifier()
        text = "दिल्ली में आज सड़कों पर भारी ट्रैफिक"
        assert identifier.detect_script(text) == "devanagari"

    def test_latin_script(self):
        """English text should be detected as 'latin' script."""
        identifier = self._get_identifier()
        text = "India economy shows strong growth in Q2 2026"
        assert identifier.detect_script(text) == "latin"

    def test_mixed_script(self):
        """Mixed Devanagari + Latin should be detected as 'mixed'."""
        identifier = self._get_identifier()
        text = "बहुत अच्छा weather today in Delhi city"
        assert identifier.detect_script(text) == "mixed"

    def test_empty_text(self):
        """Empty text should return 'unknown'."""
        identifier = self._get_identifier()
        assert identifier.detect_script("") == "unknown"
        assert identifier.detect_script("   ") == "unknown"


class TestLanguageDetection:
    """Test end-to-end language detection with heuristics."""

    def _get_identifier(self):
        from nlp_engine.preprocessing.language_id import LanguageIdentifier
        return LanguageIdentifier(use_indiclid=False, use_fasttext=False)

    def test_gujarati_detection(self):
        """Gujarati text should be identified as 'gu'."""
        identifier = self._get_identifier()
        text = "ગુજરાતમાં કોમી તણાવની ગંભીર ઘટના. પોલીસ મૌન છે."
        result = identifier.detect(text)
        assert result.language == "gu"
        assert result.confidence > 0.5
        assert result.script == "native"

    def test_hindi_detection(self):
        """Hindi text should be identified as 'hi'."""
        identifier = self._get_identifier()
        text = "दिल्ली में आज सड़कों पर भारी ट्रैफिक. मेट्रो ले लो भाइयों."
        result = identifier.detect(text)
        assert result.language == "hi"
        assert result.confidence > 0.5
        assert result.script == "native"

    def test_english_detection(self):
        """English text should be identified as 'en'."""
        identifier = self._get_identifier()
        text = "India economy shows strong growth in Q2 2026. Manufacturing leads."
        result = identifier.detect(text)
        assert result.language == "en"
        assert result.confidence > 0.0

    def test_language_hint_used(self):
        """When a language hint is provided, it should be used."""
        identifier = self._get_identifier()
        text = "Bhai ye government ka naya scheme dekha?"
        result = identifier.detect(text, language_hint="mixed")
        assert result.language == "mixed"
        assert result.confidence >= 0.8  # Hint gets baseline confidence

    def test_empty_text_returns_default(self):
        """Empty text should return default language."""
        identifier = self._get_identifier()
        result = identifier.detect("")
        assert result.language == "en"
        assert result.confidence == 0.0

    def test_detect_language_convenience_function(self):
        """Test the module-level convenience function."""
        from nlp_engine.preprocessing.language_id import detect_language

        result = detect_language("ગુજરાત")
        assert result.language == "gu"


class TestLanguageResult:
    """Test LanguageResult dataclass."""

    def test_result_is_immutable(self):
        """LanguageResult should be frozen (immutable)."""
        from nlp_engine.preprocessing.language_id import LanguageResult

        result = LanguageResult(
            language="hi", confidence=0.9, script="native", raw_scores={"hi": 0.9}
        )
        with pytest.raises(AttributeError):
            result.language = "en"  # type: ignore
