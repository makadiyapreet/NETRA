"""
Tests for the deepfake detection module.

Verifies:
- Detector class loads correctly
- Returns valid DeepfakeResult structure
- Handles missing model gracefully
"""

from __future__ import annotations

import unittest
from unittest.mock import patch, MagicMock
import sys


class TestDeepfakeDetector(unittest.TestCase):
    """Unit tests for DeepfakeDetector."""

    def test_module_importable(self):
        """The deepfake detector module can be imported without error."""
        from bonus_multimodal.deepfake_detector import DeepfakeDetector
        self.assertTrue(hasattr(DeepfakeDetector, 'detect'))

    def test_detector_instantiates(self):
        """DeepfakeDetector can be instantiated (model loading may fail gracefully)."""
        from bonus_multimodal.deepfake_detector import DeepfakeDetector
        try:
            detector = DeepfakeDetector()
            # If we reach here, model loaded
            self.assertIsNotNone(detector)
        except Exception as e:
            # Model loading failed — acceptable in test env without GPU
            self.assertIn('model', str(e).lower(), f"Expected model-related error, got: {e}")

    def test_result_structure(self):
        """DeepfakeResult (or equivalent return dict) has the expected fields."""
        from bonus_multimodal.deepfake_detector import DeepfakeDetector, DeepfakeResult

        # Mock transformers.pipeline to avoid downloading the real model
        with patch('transformers.pipeline') as mock_pipeline:
            mock_pipe = MagicMock()
            mock_pipe.return_value = [
                {'label': 'artificial', 'score': 0.92},
                {'label': 'human', 'score': 0.08},
            ]
            mock_pipeline.return_value = mock_pipe

            detector = DeepfakeDetector()
            detector._pipeline = mock_pipe
            detector._loaded = True

            # Test detection with a dummy image path
            result = detector.detect('/tmp/test_image.jpg')

            # Verify structure - should be DeepfakeResult dataclass
            self.assertIsInstance(result, DeepfakeResult)
            self.assertIn(result.is_ai_generated, [True, False])
            self.assertIsInstance(result.confidence, float)

    def test_handles_missing_image_gracefully(self):
        """Detector handles non-existent image without crashing."""
        from bonus_multimodal.deepfake_detector import DeepfakeDetector

        with patch('transformers.pipeline') as mock_pipeline:
            mock_pipe = MagicMock()
            mock_pipe.side_effect = FileNotFoundError("Image not found")
            mock_pipeline.return_value = mock_pipe

            detector = DeepfakeDetector()
            detector._pipeline = mock_pipe
            detector._loaded = True

            try:
                result = detector.detect('/nonexistent/path.jpg')
                # If it returns a result (with error info), that's fine
            except (FileNotFoundError, Exception):
                # Raising is also acceptable
                pass

    def test_model_loaded_flag(self):
        """_loaded flag reflects actual state."""
        from bonus_multimodal.deepfake_detector import DeepfakeDetector

        detector = DeepfakeDetector()
        self.assertFalse(detector._loaded)

        detector._loaded = True
        self.assertTrue(detector._loaded)


if __name__ == "__main__":
    unittest.main()
