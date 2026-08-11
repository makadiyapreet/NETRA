import os
import json
import time
import logging
import requests
from dataclasses import dataclass
from typing import Optional, Dict, Any
from pathlib import Path

logger = logging.getLogger(__name__)

# Configure a separate logger for zeroshot stats
zeroshot_logger = logging.getLogger("zeroshot_stats")
zeroshot_logger.setLevel(logging.INFO)
log_path = Path(__file__).parent.parent.parent / "zeroshot_classification.log"
fh = logging.FileHandler(log_path)
fh.setFormatter(logging.Formatter('%(asctime)s - %(message)s'))
zeroshot_logger.addHandler(fh)

@dataclass
class ZeroShotResult:
    threat_category: Optional[str]
    threat_confidence: float
    sentiment: str
    sentiment_intensity: float
    reasoning: str
    model_version: str
    error: Optional[str] = None

class ZeroShotClassifier:
    """
    Zero-Shot LLM classifier utilizing Sarvam AI as the primary path and Groq as the fallback.
    Honest reporting: this uses prompting instead of fine-tuning, as fine-tuning is pending.
    """
    def __init__(self):
        self.sarvam_api_key = os.getenv("SARVAM_API_KEY")
        self.groq_api_key = os.getenv("GROQ_API_KEY")
        self.is_loaded = True  # Mock 'loaded' state for inference_service
        
        # Taxonomy Definitions
        self.taxonomy = (
            "Taxonomy:\n"
            "- Inflammatory: raises communal tension/hostility without direct violence call.\n"
            "- IncitementToViolence: explicit call for physical action against a specific target.\n"
            "- FakeNews: unverified alarming claim designed to spread rapidly.\n"
            "- Neutral: factual, no threat."
        )

        self.system_prompt = (
            "You are an expert multilingual threat intelligence analyst. Classify the following social media post "
            "according to the exact taxonomy provided below. The post may be in Gujarati, Hindi, Hinglish, or English.\n\n"
            f"{self.taxonomy}\n\n"
            "You MUST respond ONLY with a valid, parsable JSON object containing exactly these fields:\n"
            "{\n"
            '  "threat_category": "<one of: Inflammatory, IncitementToViolence, FakeNews, Neutral>",\n'
            '  "threat_confidence": <float between 0.0 and 1.0>,\n'
            '  "sentiment": "<one of: positive, negative, neutral>",\n'
            '  "sentiment_intensity": <float between 0.0 and 1.0>,\n'
            '  "reasoning": "<one sentence explaining the classification>"\n'
            "}"
        )

    def _call_sarvam(self, text: str, language: str) -> Optional[Dict[str, Any]]:
        if not self.sarvam_api_key:
            raise ValueError("SARVAM_API_KEY missing")
            
        url = "https://api.sarvam.ai/v1/chat/completions"
        headers = {
            "api-subscription-key": self.sarvam_api_key,
            "Content-Type": "application/json"
        }
        
        user_prompt = f"Detected Language: {language}\nPost Text: {text}"
        
        payload = {
            "model": "sarvam-105b",
            "messages": [
                {"role": "system", "content": self.system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            "temperature": 0.1,
            "response_format": {"type": "json_object"}
        }

        # 1 retry only — Sarvam often times out, so fail fast to reach Groq
        for attempt in range(2):
            try:
                start_time = time.time()
                response = requests.post(url, json=payload, headers=headers, timeout=3)
                latency = time.time() - start_time
                
                if response.status_code == 200:
                    result = response.json()
                    content = result['choices'][0]['message']['content']
                    parsed = json.loads(content)
                    
                    # Validate schema
                    if "threat_category" in parsed and "threat_confidence" in parsed:
                        return parsed, latency
                
                # If 429 or 5xx, retry
                if response.status_code == 429 or response.status_code >= 500:
                    time.sleep(2 ** attempt)
                    continue
                    
                raise Exception(f"Sarvam API Error: {response.status_code} - {response.text}")
            except Exception as e:
                if attempt == 1:
                    raise e
                time.sleep(2 ** attempt)
                
        raise Exception("Sarvam call failed after retries")

    def _call_groq(self, text: str, language: str) -> Optional[Dict[str, Any]]:
        if not self.groq_api_key:
            raise ValueError("GROQ_API_KEY missing")
            
        url = "https://api.groq.com/openai/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {self.groq_api_key}",
            "Content-Type": "application/json"
        }
        
        user_prompt = f"Detected Language: {language}\nPost Text: {text}"
        
        # Choosing llama-3.1-8b-instant or mixtral as they handle multilingual well.
        payload = {
            "model": "llama-3.1-8b-instant",
            "messages": [
                {"role": "system", "content": self.system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            "temperature": 0.1,
            "response_format": {"type": "json_object"}
        }

        for attempt in range(3):
            try:
                start_time = time.time()
                response = requests.post(url, json=payload, headers=headers, timeout=8)
                latency = time.time() - start_time
                
                if response.status_code == 200:
                    result = response.json()
                    content = result['choices'][0]['message']['content']
                    parsed = json.loads(content)
                    
                    if "threat_category" in parsed and "threat_confidence" in parsed:
                        return parsed, latency
                        
                if response.status_code == 429 or response.status_code >= 500:
                    time.sleep(2 ** attempt)
                    continue
                    
                raise Exception(f"Groq API Error: {response.status_code} - {response.text}")
            except Exception as e:
                if attempt == 2:
                    raise e
                time.sleep(2 ** attempt)
                
        raise Exception("Groq call failed after retries")

    def predict(self, text: str, language: str = "unknown", post_id: str = "unknown") -> ZeroShotResult:
        sarvam_error = None
        
        # DIRECT PATH: Use Groq only (Sarvam bypassed — it consistently times out)
        # To re-enable Sarvam as primary, set USE_SARVAM_PRIMARY=true in .env
        use_sarvam = os.getenv("USE_SARVAM_PRIMARY", "false").lower() == "true"
        
        if use_sarvam and self.sarvam_api_key:
            try:
                parsed, latency = self._call_sarvam(text, language)
                zeroshot_logger.info(json.dumps({
                    "post_id": post_id,
                    "provider": "sarvam",
                    "status": "success",
                    "latency_sec": round(latency, 3)
                }))
                return ZeroShotResult(
                    threat_category=parsed.get("threat_category", "Neutral"),
                    threat_confidence=float(parsed.get("threat_confidence", 0.0)),
                    sentiment=parsed.get("sentiment", "neutral"),
                    sentiment_intensity=float(parsed.get("sentiment_intensity", 0.0)),
                    reasoning=parsed.get("reasoning", ""),
                    model_version="sarvam-zeroshot"
                )
            except Exception as e:
                sarvam_error = str(e)
                logger.warning(f"WARNING: Sarvam classification failed (reason: {sarvam_error}) — falling back to Groq for post_id={post_id}")
                zeroshot_logger.info(json.dumps({
                    "post_id": post_id,
                    "provider": "sarvam",
                    "status": "failed",
                    "error": sarvam_error
                }))

        # FALLBACK PATH: Groq
        try:
            parsed, latency = self._call_groq(text, language)
            zeroshot_logger.info(json.dumps({
                "post_id": post_id,
                "provider": "groq",
                "status": "success",
                "latency_sec": round(latency, 3)
            }))
            return ZeroShotResult(
                threat_category=parsed.get("threat_category", "Neutral"),
                threat_confidence=float(parsed.get("threat_confidence", 0.0)),
                sentiment=parsed.get("sentiment", "neutral"),
                sentiment_intensity=float(parsed.get("sentiment_intensity", 0.0)),
                reasoning=parsed.get("reasoning", ""),
                model_version="sarvam-fallback-groq-llama3.1"
            )
        except Exception as e:
            groq_error = str(e)
            logger.error(f"ERROR: Both Sarvam and Groq classification failed for post_id={post_id}. Sarvam: {sarvam_error}, Groq: {groq_error}")
            zeroshot_logger.info(json.dumps({
                "post_id": post_id,
                "provider": "groq",
                "status": "failed",
                "error": groq_error
            }))
            
            # FAIL CASE: Return None category to signal failure upstream without crashing
            return ZeroShotResult(
                threat_category=None,
                threat_confidence=0.0,
                sentiment="neutral",
                sentiment_intensity=0.0,
                reasoning="",
                model_version="failed-zeroshot",
                error=f"Both providers failed. Sarvam: {sarvam_error}, Groq: {groq_error}"
            )
