"""
Video frame analysis for multimodal threat detection.

Extracts keyframes from short video clips (≤60 seconds) using OpenCV,
then runs existing OCR + CLIP consistency checks per frame.

This addresses the PS bonus point: "image/video meme analysis for misinformation."

Usage:
    from bonus_multimodal.video_frame_analysis import VideoFrameAnalyzer
    analyzer = VideoFrameAnalyzer()
    result = analyzer.analyze_video("/path/to/clip.mp4")
"""

from __future__ import annotations

import logging
import tempfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

# Maximum video duration in seconds (YouTube Shorts / Reels)
MAX_VIDEO_DURATION_SECONDS = 60
# Extract 1 frame per second
FRAME_INTERVAL_SECONDS = 1.0


@dataclass(frozen=True)
class FrameResult:
    """Analysis result for a single video frame."""

    frame_index: int
    timestamp_sec: float
    ocr_text: str
    ocr_confidence: float
    clip_similarity: float
    is_consistent: bool


@dataclass(frozen=True)
class VideoAnalysisResult:
    """Aggregated result from analyzing a video clip."""

    video_path: str
    duration_seconds: float
    frames_analyzed: int
    frame_results: list[FrameResult]
    aggregate_ocr_text: str  # Combined OCR text from all frames
    average_consistency: float
    has_inconsistency: bool  # True if any frame flagged
    has_text_content: bool  # True if OCR found meaningful text
    skipped_reason: Optional[str] = None  # Set if video was skipped


class VideoFrameAnalyzer:
    """
    Analyzes video clips for multimodal threat indicators.

    Workflow:
    1. Open video with OpenCV, check duration (skip if >60s).
    2. Extract 1 keyframe per second.
    3. For each frame: run Tesseract OCR + CLIP consistency check.
    4. Aggregate results and flag inconsistencies.
    """

    def __init__(self, max_duration: float = MAX_VIDEO_DURATION_SECONDS):
        self.max_duration = max_duration
        self._ocr_extractor = None
        self._clip_checker = None

    def _ensure_models(self) -> None:
        """Lazy-load OCR and CLIP models."""
        if self._ocr_extractor is None:
            from bonus_multimodal.ocr_extraction import extract_text_from_image

            self._ocr_extractor = extract_text_from_image

        if self._clip_checker is None:
            from bonus_multimodal.image_text_consistency import ImageTextChecker

            self._clip_checker = ImageTextChecker()
            try:
                self._clip_checker.load()
            except Exception as e:
                logger.warning(f"CLIP model unavailable: {e}")
                self._clip_checker = None

    def analyze_video(
        self,
        video_path: str,
        caption_text: str = "",
        frame_interval: float = FRAME_INTERVAL_SECONDS,
    ) -> VideoAnalysisResult:
        """
        Analyze a video clip for multimodal threat indicators.

        Args:
            video_path: Path to video file (.mp4, .webm, .mov, .avi).
            caption_text: Post caption text for CLIP consistency checking.
            frame_interval: Seconds between extracted frames (default 1.0).

        Returns:
            VideoAnalysisResult with per-frame and aggregated analysis.
        """
        try:
            import cv2
        except ImportError:
            logger.error("OpenCV (cv2) not installed. Install with: pip install opencv-python-headless")
            return VideoAnalysisResult(
                video_path=video_path,
                duration_seconds=0,
                frames_analyzed=0,
                frame_results=[],
                aggregate_ocr_text="",
                average_consistency=0,
                has_inconsistency=False,
                has_text_content=False,
                skipped_reason="OpenCV not installed",
            )

        # Open video
        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            return VideoAnalysisResult(
                video_path=video_path,
                duration_seconds=0,
                frames_analyzed=0,
                frame_results=[],
                aggregate_ocr_text="",
                average_consistency=0,
                has_inconsistency=False,
                has_text_content=False,
                skipped_reason=f"Could not open video: {video_path}",
            )

        fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
        frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        duration = frame_count / fps

        # Check duration limit
        if duration > self.max_duration:
            cap.release()
            return VideoAnalysisResult(
                video_path=video_path,
                duration_seconds=duration,
                frames_analyzed=0,
                frame_results=[],
                aggregate_ocr_text="",
                average_consistency=0,
                has_inconsistency=False,
                has_text_content=False,
                skipped_reason=f"Video too long ({duration:.1f}s > {self.max_duration}s limit)",
            )

        self._ensure_models()

        frame_results: list[FrameResult] = []
        all_ocr_texts: list[str] = []
        frame_index = 0

        # Extract frames at specified interval
        with tempfile.TemporaryDirectory() as tmpdir:
            current_time = 0.0

            while current_time < duration:
                frame_pos = int(current_time * fps)
                cap.set(cv2.CAP_PROP_POS_FRAMES, frame_pos)
                ret, frame = cap.read()

                if not ret:
                    break

                # Save frame to temp file
                frame_path = Path(tmpdir) / f"frame_{frame_index:04d}.png"
                cv2.imwrite(str(frame_path), frame)

                # Run OCR
                ocr_text = ""
                ocr_confidence = 0.0
                try:
                    if self._ocr_extractor:
                        ocr_result = self._ocr_extractor(str(frame_path))
                        ocr_text = ocr_result.text if ocr_result else ""
                        ocr_confidence = ocr_result.confidence if ocr_result else 0.0
                except Exception as e:
                    logger.debug(f"OCR failed for frame {frame_index}: {e}")

                # Run CLIP consistency check
                clip_similarity = 1.0
                is_consistent = True
                try:
                    if self._clip_checker and (caption_text or ocr_text):
                        check_text = caption_text or ocr_text
                        consistency_result = self._clip_checker.check(
                            str(frame_path), check_text
                        )
                        clip_similarity = consistency_result.similarity_score
                        is_consistent = consistency_result.is_consistent
                except Exception as e:
                    logger.debug(f"CLIP check failed for frame {frame_index}: {e}")

                result = FrameResult(
                    frame_index=frame_index,
                    timestamp_sec=current_time,
                    ocr_text=ocr_text.strip(),
                    ocr_confidence=ocr_confidence,
                    clip_similarity=clip_similarity,
                    is_consistent=is_consistent,
                )
                frame_results.append(result)

                if ocr_text.strip():
                    all_ocr_texts.append(ocr_text.strip())

                frame_index += 1
                current_time += frame_interval

        cap.release()

        # Aggregate results
        aggregate_ocr = " | ".join(dict.fromkeys(all_ocr_texts))  # Deduplicated
        avg_consistency = (
            sum(r.clip_similarity for r in frame_results) / len(frame_results)
            if frame_results
            else 0.0
        )
        has_inconsistency = any(not r.is_consistent for r in frame_results)
        has_text = bool(aggregate_ocr.strip())

        return VideoAnalysisResult(
            video_path=video_path,
            duration_seconds=duration,
            frames_analyzed=len(frame_results),
            frame_results=frame_results,
            aggregate_ocr_text=aggregate_ocr,
            average_consistency=avg_consistency,
            has_inconsistency=has_inconsistency,
            has_text_content=has_text,
        )


def analyze_video_url(url: str, caption_text: str = "") -> VideoAnalysisResult:
    """
    Download a video from URL and analyze it.

    Convenience function for integration with the inference pipeline.
    """
    import tempfile
    import requests

    analyzer = VideoFrameAnalyzer()

    try:
        with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tmp:
            response = requests.get(url, stream=True, timeout=30)
            response.raise_for_status()

            for chunk in response.iter_content(chunk_size=8192):
                tmp.write(chunk)

            tmp_path = tmp.name

        return analyzer.analyze_video(tmp_path, caption_text=caption_text)
    except Exception as e:
        logger.error(f"Failed to download/analyze video from {url}: {e}")
        return VideoAnalysisResult(
            video_path=url,
            duration_seconds=0,
            frames_analyzed=0,
            frame_results=[],
            aggregate_ocr_text="",
            average_consistency=0,
            has_inconsistency=False,
            has_text_content=False,
            skipped_reason=f"Download failed: {e}",
        )
