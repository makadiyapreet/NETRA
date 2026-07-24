"""
Tests for the transliteration module.

Tests the text normalization and English-word detection heuristics
(no model download needed for these). The actual transliteration
engine tests are skipped if ai4bharat-transliteration is not installed.
"""

import pytest
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


class TestEnglishWordDetection:
    """Test the heuristic for identifying English vs Romanized Indic words."""

    def _get_transliterator(self):
        from nlp_engine.preprocessing.transliteration import Transliterator
        return Transliterator()

    def test_common_english_words(self):
        """Common English words should be identified as English."""
        t = self._get_transliterator()
        english_words = ["the", "government", "breaking", "police", "hospital"]
        for word in english_words:
            assert t._is_english_word(word), f"'{word}' should be English"

    def test_hindi_romanized_words(self):
        """Romanized Hindi words should NOT be identified as English."""
        t = self._get_transliterator()
        hindi_words = ["namaste", "kaise", "achha", "paani", "sabak"]
        for word in hindi_words:
            assert not t._is_english_word(word), f"'{word}' should not be English"

    def test_short_words_treated_as_english(self):
        """Very short words (1-2 chars) are treated as English to preserve them."""
        t = self._get_transliterator()
        assert t._is_english_word("a")
        assert t._is_english_word("ok")

    def test_english_suffixed_words(self):
        """Words with common English suffixes should be detected."""
        t = self._get_transliterator()
        assert t._is_english_word("corruption")
        assert t._is_english_word("government")
        assert t._is_english_word("breaking")


class TestNativeScriptDetection:
    """Test detection of text already in native Indic script."""

    def _get_transliterator(self):
        from nlp_engine.preprocessing.transliteration import Transliterator
        return Transliterator()

    def test_devanagari_is_native(self):
        """Devanagari text should be recognized as native script."""
        t = self._get_transliterator()
        assert t._is_native_script("दिल्ली में आज बारिश हो रही है")

    def test_gujarati_is_native(self):
        """Gujarati text should be recognized as native script."""
        t = self._get_transliterator()
        assert t._is_native_script("ગુજરાતમાં કોમી તણાવ")

    def test_latin_is_not_native(self):
        """Latin text should NOT be recognized as native script."""
        t = self._get_transliterator()
        assert not t._is_native_script("This is English text")

    def test_romanized_hindi_is_not_native(self):
        """Romanized Hindi should NOT be native script."""
        t = self._get_transliterator()
        assert not t._is_native_script("Bhai ye government ka naya scheme dekha")


class TestTransliteration:
    """Test the transliteration pipeline."""

    def _get_transliterator(self):
        from nlp_engine.preprocessing.transliteration import Transliterator
        return Transliterator()

    def test_native_text_preserved(self):
        """Text already in native script should be returned unchanged."""
        t = self._get_transliterator()
        text = "दिल्ली में आज बारिश हो रही है"
        result = t.transliterate(text, "hi")
        assert result.transliterated == text
        assert result.tokens_transliterated == 0

    def test_empty_text(self):
        """Empty text should return empty result."""
        t = self._get_transliterator()
        result = t.transliterate("", "hi")
        assert result.transliterated == ""
        assert result.tokens_transliterated == 0
        assert result.tokens_preserved == 0

    def test_result_has_original(self):
        """Result should always contain the original text."""
        t = self._get_transliterator()
        text = "namaste dosto"
        result = t.transliterate(text, "hi")
        assert result.original == text
        assert result.language == "hi"

    def test_convenience_function(self):
        """Test the module-level convenience function."""
        from nlp_engine.preprocessing.transliteration import transliterate_to_native

        result = transliterate_to_native("hello", "hi")
        assert isinstance(result, str)
        assert len(result) > 0


class TestTransliterationResult:
    """Test TransliterationResult dataclass."""

    def test_result_is_immutable(self):
        """TransliterationResult should be frozen."""
        from nlp_engine.preprocessing.transliteration import TransliterationResult

        result = TransliterationResult(
            original="test", transliterated="test",
            language="hi", tokens_transliterated=0, tokens_preserved=1,
        )
        with pytest.raises(AttributeError):
            result.language = "gu"  # type: ignore
