#!/usr/bin/env python3
"""
NETRA — Full Demo & Verification Script

Run this to check EVERYTHING works end-to-end without needing
Kafka, Neo4j, or GPU. It exercises every module in fixture mode.

Usage:
    python run_demo.py

What it does (in order):
  1. Validates schemas + fixture data
  2. Runs language detection on all 30 sample posts
  3. Runs transliteration on Romanized text
  4. Runs bot scoring on all accounts
  5. Runs near-duplicate detection
  6. Runs threat classification (mock if no model downloaded)
  7. Runs sentiment analysis (mock if no model downloaded)
  8. Generates alerts for high-confidence threats
  9. Writes output files to fixtures/
 10. Prints a full summary dashboard
"""

import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

# ── Setup paths ─────────────────────────────────────────────────────────────
PROJECT_ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(PROJECT_ROOT))

os.environ.setdefault("MODE", "fixture")

# ── Colors ──────────────────────────────────────────────────────────────────
GREEN = "\033[92m"
YELLOW = "\033[93m"
RED = "\033[91m"
CYAN = "\033[96m"
BOLD = "\033[1m"
RESET = "\033[0m"

def header(title):
    print(f"\n{BOLD}{CYAN}{'═' * 70}{RESET}")
    print(f"{BOLD}{CYAN}  {title}{RESET}")
    print(f"{BOLD}{CYAN}{'═' * 70}{RESET}\n")

def ok(msg):
    print(f"  {GREEN}✅ {msg}{RESET}")

def warn(msg):
    print(f"  {YELLOW}⚠️  {msg}{RESET}")

def fail(msg):
    print(f"  {RED}❌ {msg}{RESET}")

def info(msg):
    print(f"  {msg}")


# ════════════════════════════════════════════════════════════════════════════
# STEP 1: Validate Schemas & Fixtures
# ════════════════════════════════════════════════════════════════════════════

header("STEP 1: Schema & Fixture Validation")

schemas_dir = PROJECT_ROOT / "shared" / "schemas"
schema_files = ["post_schema.json", "threat_classification_schema.json", "alert_schema.json", "network_service_api.json"]

for sf in schema_files:
    path = schemas_dir / sf
    if path.exists():
        with open(path) as f:
            json.load(f)
        ok(f"{sf} — valid JSON schema")
    else:
        fail(f"{sf} — MISSING")

# Load fixture posts
posts_path = PROJECT_ROOT / "fixtures" / "sample_posts.json"
with open(posts_path) as f:
    posts = json.load(f)

ok(f"sample_posts.json — {len(posts)} posts loaded")

# Validate each post
required_fields = ["post_id", "platform", "author_id", "author_handle", "text", "created_at",
                    "hashtags", "mentions", "media_urls", "engagement_counts", "raw_payload"]
rp_fields = ["account_created_at", "follower_count", "following_count", "post_count"]
platforms = set()
lang_hints = set()
errors = 0

for p in posts:
    for f in required_fields:
        if f not in p:
            fail(f"Post {p.get('post_id','?')} missing: {f}")
            errors += 1
    for f in rp_fields:
        if f not in p.get("raw_payload", {}):
            fail(f"Post {p.get('post_id','?')} missing raw_payload.{f}")
            errors += 1
    platforms.add(p["platform"])
    lang_hints.add(p.get("language_hint"))

if errors == 0:
    ok(f"All {len(posts)} posts pass field validation")
info(f"  Platforms: {sorted(platforms)}")
info(f"  Language hints: {sorted(str(l) for l in lang_hints)}")

# Schema validation with jsonschema
try:
    from jsonschema import validate
    with open(schemas_dir / "post_schema.json") as f:
        post_schema = json.load(f)
    for p in posts:
        validate(instance=p, schema=post_schema)
    ok(f"All {len(posts)} posts validate against post_schema.json")
except ImportError:
    warn("jsonschema not installed — skipping deep validation (pip install jsonschema)")
except Exception as e:
    fail(f"Schema validation error: {e}")


# ════════════════════════════════════════════════════════════════════════════
# STEP 2: Language Detection
# ════════════════════════════════════════════════════════════════════════════

header("STEP 2: Language Detection (all 30 posts)")

from nlp_engine.preprocessing.language_id import LanguageIdentifier

lang_id = LanguageIdentifier(use_indiclid=False, use_fasttext=False)

lang_results = {}
for p in posts:
    result = lang_id.detect(p["text"], p.get("language_hint"))
    lang_results[p["post_id"]] = result

# Summary
lang_counts = {}
for r in lang_results.values():
    lang_counts[r.language] = lang_counts.get(r.language, 0) + 1

ok(f"Detected languages for {len(lang_results)} posts")
for lang, count in sorted(lang_counts.items()):
    info(f"    {lang}: {count} posts")

# Show a few examples
info("")
info(f"  {'Post ID':<22} {'Hint':<8} {'Detected':<10} {'Conf':<8} {'Script'}")
info(f"  {'─'*22} {'─'*8} {'─'*10} {'─'*8} {'─'*8}")
for p in posts[:8]:
    r = lang_results[p["post_id"]]
    hint = p.get("language_hint") or "—"
    info(f"  {p['post_id']:<22} {hint:<8} {r.language:<10} {r.confidence:<8.2f} {r.script}")
info(f"  ... ({len(posts) - 8} more)")


# ════════════════════════════════════════════════════════════════════════════
# STEP 3: Transliteration
# ════════════════════════════════════════════════════════════════════════════

header("STEP 3: Transliteration (Romanized → Native Script)")

from nlp_engine.preprocessing.transliteration import Transliterator

xlit = Transliterator()

# Pick Romanized Hindi/Gujarati posts
romanized_posts = [p for p in posts if p.get("language_hint") in ("hi", "mixed") and
                   lang_results.get(p["post_id"]) and
                   lang_results[p["post_id"]].script in ("roman", "mixed")]

if not romanized_posts:
    # Manually test with a sample
    romanized_posts = [{"post_id": "demo", "text": "Bhai ye government ka naya scheme dekha kya?", "language_hint": "hi"}]

for p in romanized_posts[:3]:
    r = xlit.transliterate(p["text"][:100], p.get("language_hint", "hi"))
    info(f"  Original : {r.original[:80]}")
    info(f"  Output   : {r.transliterated[:80]}")
    info(f"  Engine   : {'AI4Bharat XlitEngine' if xlit.is_available else 'Not loaded (install ai4bharat-transliteration)'}")
    info(f"  Stats    : {r.tokens_transliterated} transliterated, {r.tokens_preserved} preserved")
    info("")

if xlit.is_available:
    ok("Transliteration engine loaded and working")
else:
    warn("Transliteration engine not installed — text passes through unchanged")
    warn("Install with: pip install ai4bharat-transliteration")


# ════════════════════════════════════════════════════════════════════════════
# STEP 4: Bot Scoring (all accounts)
# ════════════════════════════════════════════════════════════════════════════

header("STEP 4: Bot-Likelihood Scoring")

from network_analysis.bot_detection.heuristic_scorer import compute_bot_score

seen_accounts = set()
bot_scores = []

for p in posts:
    aid = p["author_id"]
    if aid in seen_accounts:
        continue
    seen_accounts.add(aid)

    result = compute_bot_score(
        account_id=aid,
        raw_payload=p.get("raw_payload", {}),
        engagement_counts=p.get("engagement_counts"),
    )
    bot_scores.append(result)

ok(f"Scored {len(bot_scores)} unique accounts")

# Sort by likelihood descending
bot_scores.sort(key=lambda x: x.bot_likelihood, reverse=True)

info("")
info(f"  {'Account ID':<28} {'Bot Score':<12} {'Age':<8} {'F-Ratio':<10} {'Freq':<8} {'Engage'}")
info(f"  {'─'*28} {'─'*12} {'─'*8} {'─'*10} {'─'*8} {'─'*8}")
for bs in bot_scores[:10]:
    s = bs.signals
    info(f"  {bs.account_id:<28} {bs.bot_likelihood:<12.4f} {s.get('account_age',0):<8.3f} "
         f"{s.get('follower_ratio',0):<10.3f} {s.get('posting_frequency',0):<8.3f} "
         f"{s.get('engagement_anomaly',0):<8.3f}")

high_risk = [bs for bs in bot_scores if bs.bot_likelihood > 0.6]
ok(f"{len(high_risk)} accounts flagged as likely bots (score > 0.6)")


# ════════════════════════════════════════════════════════════════════════════
# STEP 5: Near-Duplicate Detection
# ════════════════════════════════════════════════════════════════════════════

header("STEP 5: Near-Duplicate Detection (MinHash LSH)")

try:
    from network_analysis.bot_detection.near_duplicate import find_duplicates

    dup_result = find_duplicates(posts, threshold=0.7)
    ok(f"Scanned {dup_result.total_posts} posts")

    if dup_result.clusters:
        ok(f"Found {len(dup_result.clusters)} duplicate cluster(s):")
        for cluster in dup_result.clusters:
            info(f"    Cluster {cluster.cluster_id}: {len(cluster.post_ids)} posts, "
                 f"similarity={cluster.similarity:.3f}")
            info(f"      Posts: {', '.join(cluster.post_ids[:5])}")
            info(f"      Authors: {', '.join(list(set(cluster.author_ids))[:5])}")
            info(f"      Text: \"{cluster.representative_text[:80]}...\"")
    else:
        info("  No duplicate clusters found (posts are sufficiently unique)")

    info(f"  Duplicate posts: {dup_result.duplicate_posts} | Unique: {dup_result.unique_posts}")

except ImportError:
    warn("datasketch not installed — skipping (pip install datasketch)")


# ════════════════════════════════════════════════════════════════════════════
# STEP 6 & 7: Threat Classification + Sentiment
# ════════════════════════════════════════════════════════════════════════════

header("STEP 6: Threat Classification + Sentiment Analysis")

model_loaded = False

# Try to load real models — only use if a fine-tuned checkpoint exists
# (base MuRIL/IndicBERT without fine-tuning has a random head → useless predictions)
checkpoint_dir = PROJECT_ROOT / "checkpoints" / "indicbert-threat-v1"
try:
    if checkpoint_dir.exists() and (checkpoint_dir / "config.json").exists():
        from nlp_engine.models.indicbert_classifier import IndicBERTClassifier
        classifier = IndicBERTClassifier(model_path=str(checkpoint_dir))
        classifier.load()
        model_loaded = True
        ok(f"Threat classifier loaded ({classifier.model_path}) — running REAL classification")
    else:
        info("  No fine-tuned checkpoint found — using mock heuristic for demo")
        info(f"  (Train with: python -m nlp_engine.models.train_indicbert)")
except Exception as e:
    warn(f"Threat classifier not available ({type(e).__name__}) — using MOCK classification")
    warn("To use real model: pip install torch transformers && train the model")

sentiment_loaded = False
try:
    from nlp_engine.models.sentiment_model import SentimentModel
    sentiment_model = SentimentModel()
    sentiment_model.load()
    sentiment_loaded = True
    ok("Sentiment model loaded — running REAL sentiment analysis")
except Exception as e:
    warn(f"Sentiment model not available ({type(e).__name__}) — using MOCK sentiment")

# Classify all posts
import uuid
classifications = []
alerts = []
now = datetime.now(timezone.utc).isoformat()

for p in posts:
    # Language
    lr = lang_results.get(p["post_id"])
    detected_lang = lr.language if lr else (p.get("language_hint") or "en")

    # Threat classification
    if model_loaded:
        cls_result = classifier.predict(p["text"])
        threat_cat = cls_result.threat_category
        threat_conf = cls_result.threat_confidence
    else:
        # Mock: use simple heuristic based on text content
        text_raw = p["text"]
        text_lower = text_raw.lower()
        if any(w in text_raw for w in ["URGENT", "BREAKING", "SHARE KARO", "!!!"]) or \
           any(w in text_lower for w in ["chip", "ज़हर", "share karo", "wake up", "फैलाओ"]):
            threat_cat = "FakeNews"
            threat_conf = 0.75
        elif any(w in text_lower for w in ["maar", "जलाओ", "मारो", "ખતમ", "sabak", "सबक सिखाओ", "attack"]):
            threat_cat = "IncitementToViolence"
            threat_conf = 0.85
        elif any(w in text_lower for w in ["तनाव", "ભડકાવ", "tension", "communal", "उकसा",
                                           "कोमी", "કોમી", "भड़का", "danga", "rift"]):
            threat_cat = "Inflammatory"
            threat_conf = 0.70
        else:
            threat_cat = "Neutral"
            threat_conf = 0.65

    # Sentiment
    if sentiment_loaded:
        sent_result = sentiment_model.predict(p["text"])
        sentiment = sent_result.sentiment
        sent_intensity = sent_result.sentiment_intensity
    else:
        if threat_cat in ("IncitementToViolence", "Inflammatory"):
            sentiment = "negative"
            sent_intensity = 0.75
        elif threat_cat == "FakeNews":
            sentiment = "negative"
            sent_intensity = 0.6
        else:
            sentiment = "neutral"
            sent_intensity = 0.4

    cls_output = {
        "post_id": p["post_id"],
        "threat_category": threat_cat,
        "threat_confidence": round(threat_conf, 4),
        "sentiment": sentiment,
        "sentiment_intensity": round(sent_intensity, 4),
        "detected_language": detected_lang,
        "model_version": f"{classifier.model_path}-v0.1.0-dev" if model_loaded else "mock-heuristic-v0.1.0",
        "classified_at": now,
    }
    classifications.append(cls_output)

    # Generate alert
    if threat_cat != "Neutral" and threat_conf >= 0.7:
        severity = {"Inflammatory": 3, "FakeNews": 3, "IncitementToViolence": 5}.get(threat_cat, 2)
        if threat_conf > 0.9:
            severity = min(severity + 1, 5)

        alert = {
            "alert_id": f"alert-{uuid.uuid4().hex[:12]}",
            "post_id": p["post_id"],
            "threat_category": threat_cat,
            "severity": severity,
            "triggering_reason": f"Post classified as {threat_cat} with {threat_conf:.0%} confidence.",
            "bot_cluster_id": None,
            "created_at": now,
        }
        alerts.append(alert)

# Summary
cat_counts = {}
for c in classifications:
    cat = c["threat_category"]
    cat_counts[cat] = cat_counts.get(cat, 0) + 1

ok(f"Classified {len(classifications)} posts")
info("")
info(f"  {'Category':<25} {'Count':<8}")
info(f"  {'─'*25} {'─'*8}")
for cat in ["Neutral", "FakeNews", "Inflammatory", "IncitementToViolence"]:
    count = cat_counts.get(cat, 0)
    info(f"  {cat:<25} {count}")

info("")
info(f"  {'Post ID':<22} {'Category':<25} {'Conf':<8} {'Sentiment':<12} {'Lang'}")
info(f"  {'─'*22} {'─'*25} {'─'*8} {'─'*12} {'─'*6}")
for c in classifications[:12]:
    info(f"  {c['post_id']:<22} {c['threat_category']:<25} {c['threat_confidence']:<8.3f} "
         f"{c['sentiment']:<12} {c['detected_language']}")
if len(classifications) > 12:
    info(f"  ... ({len(classifications) - 12} more)")


# ════════════════════════════════════════════════════════════════════════════
# STEP 8: Alert Generation
# ════════════════════════════════════════════════════════════════════════════

header("STEP 8: Alert Generation")

ok(f"Generated {len(alerts)} alerts")
info("")
if alerts:
    info(f"  {'Alert ID':<28} {'Post ID':<22} {'Category':<25} {'Sev'}")
    info(f"  {'─'*28} {'─'*22} {'─'*25} {'─'*4}")
    for a in alerts[:10]:
        info(f"  {a['alert_id']:<28} {a['post_id']:<22} {a['threat_category']:<25} {a['severity']}")
else:
    info("  No alerts generated (all posts below threshold)")


# ════════════════════════════════════════════════════════════════════════════
# STEP 9: Write Output Files
# ════════════════════════════════════════════════════════════════════════════

header("STEP 9: Write Output Files (Fixture Mode)")

fixtures_dir = PROJECT_ROOT / "fixtures"
fixtures_dir.mkdir(exist_ok=True)

cls_path = fixtures_dir / "sample_classified_output.json"
with open(cls_path, "w") as f:
    json.dump(classifications, f, indent=2)
ok(f"Wrote {len(classifications)} classifications → {cls_path.name}")

alerts_path = fixtures_dir / "sample_alerts_output.json"
with open(alerts_path, "w") as f:
    json.dump(alerts, f, indent=2)
ok(f"Wrote {len(alerts)} alerts → {alerts_path.name}")

# Uncertain posts (confidence < 0.5)
uncertain = [c for c in classifications if c["threat_confidence"] < 0.5]
uncertain_path = fixtures_dir / "uncertain_posts.json"
with open(uncertain_path, "w") as f:
    json.dump(uncertain, f, indent=2)
ok(f"Wrote {len(uncertain)} uncertain posts → {uncertain_path.name}")

# Bot scores
bot_scores_output = [
    {"account_id": bs.account_id, "bot_likelihood": bs.bot_likelihood, "signals": bs.signals}
    for bs in bot_scores
]
bot_path = fixtures_dir / "sample_bot_scores.json"
with open(bot_path, "w") as f:
    json.dump(bot_scores_output, f, indent=2)
ok(f"Wrote {len(bot_scores_output)} bot scores → {bot_path.name}")

# Validate output against schemas
try:
    from jsonschema import validate as jvalidate
    with open(schemas_dir / "threat_classification_schema.json") as f:
        cls_schema = json.load(f)
    with open(schemas_dir / "alert_schema.json") as f:
        alert_schema = json.load(f)

    for c in classifications:
        jvalidate(instance=c, schema=cls_schema)
    ok("All classifications validate against threat_classification_schema.json")

    for a in alerts:
        jvalidate(instance=a, schema=alert_schema)
    ok("All alerts validate against alert_schema.json")
except ImportError:
    warn("jsonschema not installed — output not validated")


# ════════════════════════════════════════════════════════════════════════════
# STEP 10: Summary Dashboard
# ════════════════════════════════════════════════════════════════════════════

header("FINAL SUMMARY")

info(f"  {BOLD}Input{RESET}")
info(f"    Posts processed:      {len(posts)}")
info(f"    Platforms:            {', '.join(sorted(platforms))}")
info(f"    Languages:            {', '.join(f'{k}={v}' for k,v in sorted(lang_counts.items()))}")
info("")
info(f"  {BOLD}Classification{RESET}")
info(f"    Model used:           {classifier.model_path + ' (real)' if model_loaded else 'Mock heuristic'}")
info(f"    Sentiment model:      {'XLM-RoBERTa (real)' if sentiment_loaded else 'Mock heuristic'}")
for cat in ["Neutral", "FakeNews", "Inflammatory", "IncitementToViolence"]:
    info(f"    {cat}:{' ' * (25 - len(cat))}{cat_counts.get(cat, 0)}")
info("")
info(f"  {BOLD}Bot Detection{RESET}")
info(f"    Accounts scored:      {len(bot_scores)}")
info(f"    High-risk (>0.6):     {len(high_risk)}")
try:
    info(f"    Duplicate clusters:   {len(dup_result.clusters)}")
except NameError:
    info(f"    Duplicate clusters:   (datasketch not installed)")
info("")
info(f"  {BOLD}Alerts{RESET}")
info(f"    Total alerts:         {len(alerts)}")
sev_counts = {}
for a in alerts:
    sev_counts[a["severity"]] = sev_counts.get(a["severity"], 0) + 1
for sev in sorted(sev_counts.keys()):
    info(f"    Severity {sev}:           {sev_counts[sev]}")
info("")
info(f"  {BOLD}Output Files{RESET}")
info(f"    fixtures/sample_classified_output.json  ({len(classifications)} records)")
info(f"    fixtures/sample_alerts_output.json       ({len(alerts)} records)")
info(f"    fixtures/uncertain_posts.json            ({len(uncertain)} records)")
info(f"    fixtures/sample_bot_scores.json          ({len(bot_scores_output)} records)")

print(f"\n{BOLD}{GREEN}{'═' * 70}{RESET}")
print(f"{BOLD}{GREEN}  ✅ DEMO COMPLETE — All outputs written to fixtures/{RESET}")
print(f"{BOLD}{GREEN}{'═' * 70}{RESET}")

if not model_loaded:
    print(f"\n{YELLOW}  💡 To use REAL model predictions instead of mock:{RESET}")
    print(f"     pip install torch transformers")
    print(f"     # Then re-run: python run_demo.py")
    print()
