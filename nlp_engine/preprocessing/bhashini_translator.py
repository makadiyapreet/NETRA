"""
Bhashini (ULCA) Translation & Transliteration Integration.

Integrates with India's National Language Translation Mission (Bhashini)
as a second, independent translation/transliteration path alongside
AI4Bharat Xlit and LLM-based approaches.

Bhashini is a free, publicly accessible Government of India API
(https://bhashini.gov.in/) — no paid tier required.

Usage:
    translator = BhashiniTranslator()
    result = translator.translate("Hello, how are you?", source_lang="en", target_lang="hi")
    result = translator.transliterate("namaste kaise ho", source_lang="hi", target_lang="hi")
"""

from __future__ import annotations

import logging
import os
import time
from dataclasses import dataclass, field
from typing import Optional

import requests

logger = logging.getLogger(__name__)

# ── Bhashini API Configuration ──────────────────────────────────────────────

BHASHINI_PIPELINE_URL = "https://meity-auth.ulcacontrib.org/ulca/apis/v0/model/getModelsPipeline"
BHASHINI_DEFAULT_PIPELINE_ID = "64392f96daac500b55c543cd"

# Language code mapping: NETRA internal codes → Bhashini/ULCA codes
LANG_MAP = {
    "hi": "hi",       # Hindi
    "gu": "gu",       # Gujarati
    "en": "en",       # English
    "mr": "mr",       # Marathi
    "bn": "bn",       # Bengali
    "pa": "pa",       # Punjabi
    "ta": "ta",       # Tamil
    "te": "te",       # Telugu
    "ml": "ml",       # Malayalam
    "kn": "kn",       # Kannada
    "or": "or",       # Odia
    "ur": "ur",       # Urdu
}

# Supported translation pairs (source → [targets])
# Bhashini supports English ↔ all Indian languages, and some inter-Indic pairs
SUPPORTED_PAIRS = {
    "en": ["hi", "gu", "mr", "bn", "pa", "ta", "te", "ml", "kn", "or", "ur"],
    "hi": ["en", "gu", "mr", "bn", "pa"],
    "gu": ["en", "hi"],
    "mr": ["en", "hi"],
    "bn": ["en", "hi"],
    "pa": ["en", "hi"],
}


@dataclass(frozen=True)
class BhashiniTranslationResult:
    """Result of a Bhashini translation/transliteration request."""
    original: str
    translated: str
    source_language: str
    target_language: str
    task_type: str  # "translation" or "transliteration"
    service_id: str
    latency_ms: float
    success: bool
    error: Optional[str] = None


@dataclass
class BhashiniServiceConfig:
    """Cached service configuration from Bhashini pipeline discovery."""
    callback_url: str
    service_id: str
    task_type: str
    source_lang: str
    target_lang: str
    fetched_at: float = field(default_factory=time.time)

    @property
    def is_stale(self) -> bool:
        """Service configs are cached for 1 hour."""
        return (time.time() - self.fetched_at) > 3600


class BhashiniTranslator:
    """
    Bhashini (ULCA) Translation & Transliteration client.

    Integrates with Government of India's National Language Translation Mission
    as an independent, government-native translation path.

    Features:
    - Translation between English and 11 Indian languages
    - Transliteration (script conversion)
    - Automatic pipeline discovery and service ID caching
    - Graceful fallback when credentials are missing or API is unreachable
    """

    def __init__(self):
        self._user_id = os.environ.get("BHASHINI_USER_ID", "")
        self._api_key = os.environ.get("BHASHINI_API_KEY", "")
        self._auth_token = os.environ.get("BHASHINI_AUTH_TOKEN", "")
        self._pipeline_id = os.environ.get("BHASHINI_PIPELINE_ID", BHASHINI_DEFAULT_PIPELINE_ID)

        # Cache for discovered service configurations
        self._service_cache: dict[str, BhashiniServiceConfig] = {}
        self._available = bool(self._user_id and self._api_key)

        if self._available:
            logger.info("Bhashini translator initialized (credentials found)")
        else:
            logger.info(
                "Bhashini translator: no credentials configured. "
                "Set BHASHINI_USER_ID and BHASHINI_API_KEY in .env to enable. "
                "Register at https://bhashini.gov.in/ (free, no paid tier)."
            )

    @property
    def is_available(self) -> bool:
        """Whether Bhashini credentials are configured."""
        return self._available

    def _get_headers(self) -> dict[str, str]:
        """Build authentication headers for Bhashini API."""
        headers = {
            "Content-Type": "application/json",
            "ulcaApiKey": self._api_key,
            "userID": self._user_id,
        }
        if self._auth_token:
            headers["Authorization"] = self._auth_token
        return headers

    def _discover_service(
        self, task_type: str, source_lang: str, target_lang: str
    ) -> Optional[BhashiniServiceConfig]:
        """
        Call Bhashini getModelsPipeline to discover the service ID and callback URL
        for a given task type and language pair.

        Results are cached for 1 hour.
        """
        cache_key = f"{task_type}:{source_lang}:{target_lang}"

        # Return cached config if fresh
        cached = self._service_cache.get(cache_key)
        if cached and not cached.is_stale:
            return cached

        try:
            payload = {
                "pipelineTasks": [
                    {
                        "taskType": task_type,
                        "config": {
                            "language": {
                                "sourceLanguage": LANG_MAP.get(source_lang, source_lang),
                                "targetLanguage": LANG_MAP.get(target_lang, target_lang),
                            }
                        },
                    }
                ],
                "pipelineRequestConfig": {
                    "pipelineId": self._pipeline_id,
                },
            }

            response = requests.post(
                BHASHINI_PIPELINE_URL,
                json=payload,
                headers=self._get_headers(),
                timeout=15,
            )
            response.raise_for_status()
            data = response.json()

            # Extract callback URL and service ID from response
            pipeline_response = data.get("pipelineResponseConfig", [])
            pipeline_inference = data.get("pipelineInferenceAPIEndPoint", {})

            callback_url = pipeline_inference.get("callbackUrl", "")
            inference_key = pipeline_inference.get("inferenceApiKey", {}).get("value", "")

            # Store inference key for compute calls
            if inference_key:
                self._auth_token = inference_key

            # Get service ID from response config
            service_id = ""
            for task_config in pipeline_response:
                if task_config.get("taskType") == task_type:
                    configs = task_config.get("config", [])
                    if configs:
                        service_id = configs[0].get("serviceId", "")
                    break

            if callback_url and service_id:
                config = BhashiniServiceConfig(
                    callback_url=callback_url,
                    service_id=service_id,
                    task_type=task_type,
                    source_lang=source_lang,
                    target_lang=target_lang,
                )
                self._service_cache[cache_key] = config
                logger.info(
                    f"Bhashini service discovered: {task_type} "
                    f"{source_lang}→{target_lang} (serviceId={service_id[:12]}...)"
                )
                return config
            else:
                logger.warning(
                    f"Bhashini pipeline response missing callback_url or serviceId "
                    f"for {task_type} {source_lang}→{target_lang}"
                )
                return None

        except requests.exceptions.Timeout:
            logger.warning("Bhashini pipeline discovery timed out (15s)")
            return None
        except requests.exceptions.RequestException as e:
            logger.warning(f"Bhashini pipeline discovery failed: {e}")
            return None
        except Exception as e:
            logger.error(f"Unexpected error in Bhashini discovery: {e}")
            return None

    def _compute(
        self,
        service_config: BhashiniServiceConfig,
        text: str,
    ) -> Optional[str]:
        """
        Call the Bhashini compute endpoint to perform translation/transliteration.
        """
        try:
            payload = {
                "pipelineTasks": [
                    {
                        "taskType": service_config.task_type,
                        "config": {
                            "language": {
                                "sourceLanguage": LANG_MAP.get(
                                    service_config.source_lang, service_config.source_lang
                                ),
                                "targetLanguage": LANG_MAP.get(
                                    service_config.target_lang, service_config.target_lang
                                ),
                            },
                            "serviceId": service_config.service_id,
                        },
                    }
                ],
                "inputData": {
                    "input": [{"source": text}],
                },
            }

            headers = self._get_headers()
            if self._auth_token:
                headers["Authorization"] = self._auth_token

            response = requests.post(
                service_config.callback_url,
                json=payload,
                headers=headers,
                timeout=30,
            )
            response.raise_for_status()
            data = response.json()

            # Extract translated text from response
            pipeline_output = data.get("pipelineResponse", [])
            for task_output in pipeline_output:
                output_list = task_output.get("output", [])
                if output_list:
                    return output_list[0].get("target", "")

            return None

        except requests.exceptions.Timeout:
            logger.warning("Bhashini compute timed out (30s)")
            return None
        except requests.exceptions.RequestException as e:
            logger.warning(f"Bhashini compute failed: {e}")
            return None
        except Exception as e:
            logger.error(f"Unexpected error in Bhashini compute: {e}")
            return None

    def translate(
        self,
        text: str,
        source_lang: str = "en",
        target_lang: str = "hi",
    ) -> BhashiniTranslationResult:
        """
        Translate text between languages using Bhashini NMT models.

        Args:
            text: Input text to translate.
            source_lang: Source language code (e.g., "en", "hi", "gu").
            target_lang: Target language code.

        Returns:
            BhashiniTranslationResult with translated text and metadata.
        """
        start_ms = time.time() * 1000

        if not self._available:
            return BhashiniTranslationResult(
                original=text,
                translated=text,
                source_language=source_lang,
                target_language=target_lang,
                task_type="translation",
                service_id="",
                latency_ms=0,
                success=False,
                error="Bhashini credentials not configured (set BHASHINI_USER_ID + BHASHINI_API_KEY)",
            )

        # Check if language pair is supported
        supported_targets = SUPPORTED_PAIRS.get(source_lang, [])
        if target_lang not in supported_targets:
            return BhashiniTranslationResult(
                original=text,
                translated=text,
                source_language=source_lang,
                target_language=target_lang,
                task_type="translation",
                service_id="",
                latency_ms=0,
                success=False,
                error=f"Unsupported language pair: {source_lang}→{target_lang}",
            )

        # Discover service
        service = self._discover_service("translation", source_lang, target_lang)
        if not service:
            latency = time.time() * 1000 - start_ms
            return BhashiniTranslationResult(
                original=text,
                translated=text,
                source_language=source_lang,
                target_language=target_lang,
                task_type="translation",
                service_id="",
                latency_ms=latency,
                success=False,
                error="Failed to discover Bhashini translation service",
            )

        # Compute translation
        result = self._compute(service, text)
        latency = time.time() * 1000 - start_ms

        if result:
            return BhashiniTranslationResult(
                original=text,
                translated=result,
                source_language=source_lang,
                target_language=target_lang,
                task_type="translation",
                service_id=service.service_id,
                latency_ms=latency,
                success=True,
            )
        else:
            return BhashiniTranslationResult(
                original=text,
                translated=text,
                source_language=source_lang,
                target_language=target_lang,
                task_type="translation",
                service_id=service.service_id,
                latency_ms=latency,
                success=False,
                error="Bhashini compute returned no result",
            )

    def transliterate(
        self,
        text: str,
        source_lang: str = "en",
        target_lang: str = "hi",
    ) -> BhashiniTranslationResult:
        """
        Transliterate text between scripts using Bhashini models.

        Args:
            text: Input text to transliterate.
            source_lang: Source language code.
            target_lang: Target language code.

        Returns:
            BhashiniTranslationResult with transliterated text and metadata.
        """
        start_ms = time.time() * 1000

        if not self._available:
            return BhashiniTranslationResult(
                original=text,
                translated=text,
                source_language=source_lang,
                target_language=target_lang,
                task_type="transliteration",
                service_id="",
                latency_ms=0,
                success=False,
                error="Bhashini credentials not configured",
            )

        service = self._discover_service("transliteration", source_lang, target_lang)
        if not service:
            latency = time.time() * 1000 - start_ms
            return BhashiniTranslationResult(
                original=text,
                translated=text,
                source_language=source_lang,
                target_language=target_lang,
                task_type="transliteration",
                service_id="",
                latency_ms=latency,
                success=False,
                error="Failed to discover Bhashini transliteration service",
            )

        result = self._compute(service, text)
        latency = time.time() * 1000 - start_ms

        if result:
            return BhashiniTranslationResult(
                original=text,
                translated=result,
                source_language=source_lang,
                target_language=target_lang,
                task_type="transliteration",
                service_id=service.service_id,
                latency_ms=latency,
                success=True,
            )
        else:
            return BhashiniTranslationResult(
                original=text,
                translated=text,
                source_language=source_lang,
                target_language=target_lang,
                task_type="transliteration",
                service_id=service.service_id,
                latency_ms=latency,
                success=False,
                error="Bhashini compute returned no result",
            )

    def get_status(self) -> dict:
        """Return current status for System Health dashboard."""
        return {
            "service": "Bhashini (ULCA)",
            "provider": "Government of India — MeitY",
            "available": self._available,
            "cached_services": len(self._service_cache),
            "supported_languages": list(LANG_MAP.keys()),
            "credentials_configured": bool(self._user_id and self._api_key),
            "registration_url": "https://bhashini.gov.in/",
            "cost": "Free (Government API)",
        }


# ── Convenience singleton ───────────────────────────────────────────────────

_bhashini_instance: Optional[BhashiniTranslator] = None


def get_bhashini_translator() -> BhashiniTranslator:
    """Get or create the singleton BhashiniTranslator instance."""
    global _bhashini_instance
    if _bhashini_instance is None:
        _bhashini_instance = BhashiniTranslator()
    return _bhashini_instance
