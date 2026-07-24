"""
Sarvam-based threat classifier for the 4-class taxonomy.

Provides an alternative to IndicBERT for benchmarking purposes.
Uses Sarvam AI's open-source models (Apache-2.0 licensed).

Model hierarchy (smallest → largest):
  1. sarvamai/sarvam-m  (Mistral-based, ~7B params) — default, tractable on single GPU
  2. sarvamai/sarvam-30b (MoE, 30B params) — requires ~20GB+ VRAM
  3. sarvamai/sarvam-105b (MoE, 105B params) — requires multi-GPU setup

This module uses text-generation + prompt-based classification rather than
sequence classification, since decoder models work best with prompting.
For efficient fine-tuning, uses LoRA via the peft library.
"""

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass
from typing import Optional

logger = logging.getLogger(__name__)

THREAT_LABELS = ("Inflammatory", "IncitementToViolence", "FakeNews", "Neutral")


@dataclass(frozen=True)
class ClassificationResult:
    """Result of threat classification."""

    threat_category: str
    threat_confidence: float
    all_scores: dict[str, float]


# Classification prompt template
_CLASSIFICATION_PROMPT = """You are a content moderation system analyzing social media posts for threats.
Classify the following post into EXACTLY ONE of these categories:
- Neutral: factual statements, no emotional charge, no target, no call to action
- FakeNews: urgent/alarming unverified claims, ALL-CAPS urgency markers, designed to spread rapidly
- Inflammatory: raises communal tension and in-group/out-group hostility without direct violence
- IncitementToViolence: specific actionable target, location/time, explicit call for physical action

Post: "{text}"

Respond with ONLY a JSON object: {{"category": "<one of Neutral|FakeNews|Inflammatory|IncitementToViolence>", "confidence": <0.0-1.0>}}"""


class SarvamClassifier:
    """
    Sarvam model-based threat classifier using prompt-based classification.

    This classifier uses text generation to classify posts, which is more
    natural for large decoder models. Fine-tuning is done via LoRA.
    """

    def __init__(
        self,
        model_path: str = "sarvamai/sarvam-m",
        device: Optional[str] = None,
        load_in_4bit: bool = True,
    ):
        self.model_path = model_path
        self.device = device  # Let accelerate handle device mapping for large models
        self.load_in_4bit = load_in_4bit
        self._model = None
        self._tokenizer = None
        self._loaded = False

    def load(self) -> None:
        """Load model and tokenizer with optional 4-bit quantization."""
        if self._loaded:
            return

        try:
            import torch
            from transformers import AutoTokenizer, AutoModelForCausalLM

            logger.info(f"Loading Sarvam model from {self.model_path}")

            self._tokenizer = AutoTokenizer.from_pretrained(
                self.model_path, trust_remote_code=True
            )

            load_kwargs: dict = {"trust_remote_code": True}

            if self.load_in_4bit:
                try:
                    from transformers import BitsAndBytesConfig

                    load_kwargs["quantization_config"] = BitsAndBytesConfig(
                        load_in_4bit=True,
                        bnb_4bit_compute_dtype=torch.float16,
                        bnb_4bit_quant_type="nf4",
                    )
                    load_kwargs["device_map"] = "auto"
                    logger.info("Using 4-bit quantization")
                except ImportError:
                    logger.warning(
                        "bitsandbytes not available, loading in full precision. "
                        "This may require significant VRAM."
                    )
                    if self.device:
                        load_kwargs["device_map"] = self.device
                    else:
                        load_kwargs["device_map"] = "auto"
            else:
                load_kwargs["device_map"] = self.device or "auto"
                load_kwargs["torch_dtype"] = torch.float16

            self._model = AutoModelForCausalLM.from_pretrained(
                self.model_path, **load_kwargs
            )
            self._model.eval()
            self._loaded = True
            logger.info("Sarvam model loaded")

        except Exception as e:
            logger.error(
                f"Failed to load Sarvam model '{self.model_path}': {e}\n"
                "Ensure you have sufficient VRAM. For sarvam-m (~7B), need ~6GB with 4-bit.\n"
                "For sarvam-30b, need ~20GB+. For sarvam-105b, need multi-GPU."
            )
            raise

    def _parse_response(self, response: str) -> ClassificationResult:
        """Parse the model's JSON response into a ClassificationResult."""
        # Try to extract JSON from the response
        json_match = re.search(r"\{[^}]+\}", response)
        if json_match:
            try:
                parsed = json.loads(json_match.group())
                category = parsed.get("category", "Neutral")
                confidence = float(parsed.get("confidence", 0.5))

                # Validate category
                if category not in THREAT_LABELS:
                    # Fuzzy match
                    for label in THREAT_LABELS:
                        if label.lower() in category.lower():
                            category = label
                            break
                    else:
                        category = "Neutral"
                        confidence = 0.3

                confidence = max(0.0, min(1.0, confidence))

                return ClassificationResult(
                    threat_category=category,
                    threat_confidence=confidence,
                    all_scores={category: confidence},
                )
            except (json.JSONDecodeError, ValueError):
                pass

        # Fallback: look for category keywords in the response
        response_lower = response.lower()
        for label in THREAT_LABELS:
            if label.lower() in response_lower:
                return ClassificationResult(
                    threat_category=label,
                    threat_confidence=0.5,
                    all_scores={label: 0.5},
                )

        return ClassificationResult(
            threat_category="Neutral",
            threat_confidence=0.3,
            all_scores={"Neutral": 0.3},
        )

    def predict(self, text: str) -> ClassificationResult:
        """Classify a single text using prompt-based generation."""
        results = self.predict_batch([text])
        return results[0]

    def predict_batch(self, texts: list[str]) -> list[ClassificationResult]:
        """Classify a batch of texts."""
        if not self._loaded:
            self.load()

        assert self._tokenizer is not None
        assert self._model is not None

        import torch

        results: list[ClassificationResult] = []

        for text in texts:
            prompt = _CLASSIFICATION_PROMPT.format(text=text[:1000])  # Truncate long texts

            inputs = self._tokenizer(
                prompt, return_tensors="pt", truncation=True, max_length=2048
            )

            # Move to same device as model
            if hasattr(self._model, "device"):
                inputs = {k: v.to(self._model.device) for k, v in inputs.items()}

            with torch.no_grad():
                outputs = self._model.generate(
                    **inputs,
                    max_new_tokens=100,
                    temperature=0.1,
                    do_sample=False,
                    pad_token_id=self._tokenizer.eos_token_id,
                )

            # Decode only the generated tokens (not the prompt)
            generated = outputs[0][inputs["input_ids"].shape[1] :]
            response = self._tokenizer.decode(generated, skip_special_tokens=True)

            results.append(self._parse_response(response))

        return results

    def get_model_version(self) -> str:
        """Return a version string for this model."""
        return f"sarvam-{self.model_path.split('/')[-1]}"

    @property
    def is_loaded(self) -> bool:
        return self._loaded
