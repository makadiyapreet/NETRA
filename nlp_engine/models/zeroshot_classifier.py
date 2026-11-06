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
        self.groq_api_key_2 = os.getenv("GROQ_API_KEY_2")
        self._groq_keys = [k for k in [self.groq_api_key, self.groq_api_key_2] if k]
        self._groq_key_index = 0  # Round-robin index
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
        if not self._groq_keys:
            raise ValueError("GROQ_API_KEY missing")
            
        url = "https://api.groq.com/openai/v1/chat/completions"
        user_prompt = f"Detected Language: {language}\nPost Text: {text}"
        
        # qwen/qwen3.8-27b handles multilingual well (Hindi, Gujarati, Hinglish).
        payload = {
            "model": "qwen/qwen3.8-27b",
            "messages": [
                {"role": "system", "content": self.system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            "temperature": 0.1,
            "response_format": {"type": "json_object"}
        }

        # Try each key with retries — rotates on 429 rate limit
        keys_tried = 0
        last_error = None
        while keys_tried < len(self._groq_keys):
            current_key = self._groq_keys[self._groq_key_index]
            headers = {
                "Authorization": f"Bearer {current_key}",
                "Content-Type": "application/json"
            }
            
            for attempt in range(2):  # 2 retries per key
                try:
                    start_time = time.time()
                    response = requests.post(url, json=payload, headers=headers, timeout=30)
                    latency = time.time() - start_time
                    
                    if response.status_code == 200:
                        return json.loads(response.json()['choices'][0]['message']['content']), latency
                    
                    if response.status_code == 429:
                        # Rate limited — rotate to next key
                        logger.warning(f"Groq key #{self._groq_key_index + 1} rate-limited, trying next key...")
                        self._groq_key_index = (self._groq_key_index + 1) % len(self._groq_keys)
                        break  # Break retry loop to try next key
                        
                    if response.status_code >= 500:
                        time.sleep(2 ** attempt)
                        continue
                        
                    raise Exception(f"Groq API Error: {response.status_code} - {response.text}")
                except Exception as e:
                    last_error = e
                    if attempt == 1:
                        break
                    time.sleep(1)
            
            keys_tried += 1
        
        # All keys exhausted
        raise Exception(f"Groq call failed after trying {len(self._groq_keys)} key(s): {last_error}")

    def _heuristic_classify(self, text: str, language: str) -> ZeroShotResult:
        """
        Robust keyword-based heuristic classifier.
        Used as fallback when LLM APIs (Groq/Sarvam) are rate-limited or unavailable.
        Covers English, Hindi, Gujarati, and Hinglish threat keywords.
        """
        text_lower = text.lower()
        
        # ── Violence / Incitement keywords ──
        violence_keywords = [
            # English
            'kill', 'murder', 'attack', 'destroy', 'riot', 'bomb', 'weapon',
            'shoot', 'stab', 'burn', 'lynch', 'mob violence', 'bloodshed',
            'slaughter', 'massacre', 'terrorist', 'terrorism', 'jihad',
            'war', 'assault', 'beat', 'stone pelting', 'arson',
            # Hindi
            'मारो', 'काटो', 'जलाओ', 'हिंसा', 'दंगा', 'हथियार', 'बम',
            'गोली', 'हमला', 'तबाह', 'उड़ा दो', 'खत्म करो', 'मार डालो',
            'आतंक', 'जिहाद', 'फांसी', 'सजा दो', 'पत्थरबाजी',
            # Gujarati
            'મારો', 'કાપો', 'બાળો', 'હિંસા', 'દંગા', 'હથિયાર',
            'હુમલો', 'તબાહ', 'ઉડાવી', 'ખતમ', 'મારી નાખો',
            # Hinglish
            'maaro', 'kaato', 'jalaao', 'danga', 'hamla', 'bomb blast',
            'maar do', 'khatam karo', 'udaa do', 'goli maaro',
        ]
        
        # ── Inflammatory / Hate speech keywords ──
        inflammatory_keywords = [
            # English
            'hate', 'hatred', 'disgusting', 'scum', 'vermin', 'filth',
            'traitor', 'anti-national', 'go back', 'leave india',
            'enemy', 'communal', 'bigot', 'fanatic', 'extremist',
            'intolerance', 'boycott', 'ban', 'shame', 'disgrace',
            # Hindi
            'नफरत', 'घृणा', 'गद्दार', 'देशद्रोही', 'भगाओ', 'निकालो',
            'शर्म', 'कलंक', 'बहिष्कार', 'विरोध', 'जहर', 'भड़काऊ',
            'सांप्रदायिक', 'कट्टर', 'उग्रवाद',
            # Gujarati
            'નફરત', 'ગદ્દાર', 'દેશદ્રોહી', 'ભગાડો', 'કાઢો',
            'શરમ', 'બહિષ્કાર', 'વિરોધ', 'ઝેર', 'ભડકાઉ',
            'સાંપ્રદાયિક', 'કટ્ટર',
            # Hinglish
            'nafrat', 'gaddar', 'deshdroh', 'bhagao', 'nikalo',
            'boycott karo', 'shame on', 'anti national',
        ]
        
        # ── Fake news keywords ──
        fakenews_keywords = [
            # English
            'fake', 'hoax', 'false', 'misleading', 'conspiracy', 'rumor',
            'rumour', 'unverified', 'debunked', 'propaganda', 'fabricated',
            'manipulated', 'doctored', 'photoshopped', 'deepfake',
            'breaking news', 'secret exposed', 'truth revealed', 'cover up',
            'they dont want you to know', 'exposed', 'shocking truth',
            'viral', 'forwarded', 'share before deleted',
            # Hindi
            'अफवाह', 'झूठ', 'फर्जी', 'फेक', 'भ्रामक', 'षड्यंत्र',
            'प्रचार', 'साजिश', 'खुलासा', 'सच्चाई',
            'शेयर करो', 'वायरल', 'फॉरवर्ड',
            # Gujarati
            'અફવા', 'જૂઠ', 'ફર્જી', 'ફેક', 'ભ્રામક', 'ષડયંત્ર',
            'પ્રચાર', 'સાજિશ', 'ખુલાસો',
            'શેર કરો', 'વાયરલ', 'ફોરવર્ડ',
            # Hinglish
            'afwah', 'jhooth', 'farzi', 'fake news', 'share karo',
            'forward karo', 'viral ho raha', 'sach samne aaya',
        ]
        
        # Score each category
        violence_score = sum(1 for kw in violence_keywords if kw in text_lower)
        inflammatory_score = sum(1 for kw in inflammatory_keywords if kw in text_lower)
        fakenews_score = sum(1 for kw in fakenews_keywords if kw in text_lower)
        
        # Determine category
        max_score = max(violence_score, inflammatory_score, fakenews_score)
        
        if max_score == 0:
            category = "Neutral"
            confidence = 0.65
            sentiment = "neutral"
            reasoning = "No threat-related keywords detected in the post content."
        elif violence_score == max_score:
            category = "IncitementToViolence"
            confidence = min(0.95, 0.70 + violence_score * 0.05)
            sentiment = "negative"
            reasoning = f"Detected {violence_score} violence-related keyword(s) in the post."
        elif inflammatory_score == max_score:
            category = "Inflammatory"
            confidence = min(0.92, 0.68 + inflammatory_score * 0.05)
            sentiment = "negative"
            reasoning = f"Detected {inflammatory_score} inflammatory/hate speech keyword(s) in the post."
        else:
            category = "FakeNews"
            confidence = min(0.90, 0.65 + fakenews_score * 0.05)
            sentiment = "negative"
            reasoning = f"Detected {fakenews_score} misinformation-related keyword(s) in the post."
        
        return ZeroShotResult(
            threat_category=category,
            threat_confidence=round(confidence, 4),
            sentiment=sentiment,
            sentiment_intensity=round(confidence * 0.8, 4),
            reasoning=reasoning,
            model_version="heuristic-multilingual-v2"
        )

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
                model_version="sarvam-fallback-groq-qwen3.8"
            )
        except Exception as e:
            groq_error = str(e)
            logger.warning(f"WARNING: Groq failed for post_id={post_id} — using heuristic classifier. Error: {groq_error}")
            zeroshot_logger.info(json.dumps({
                "post_id": post_id,
                "provider": "groq",
                "status": "failed",
                "error": groq_error
            }))
            
            # FALLBACK: Use robust keyword-based heuristic classifier
            # instead of returning ClassificationFailed
            heuristic_result = self._heuristic_classify(text, language)
            zeroshot_logger.info(json.dumps({
                "post_id": post_id,
                "provider": "heuristic",
                "status": "success",
                "category": heuristic_result.threat_category
            }))
            return heuristic_result

