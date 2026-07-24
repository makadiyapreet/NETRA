# Bias Review Notes — NETRA Threat Classifier

## Purpose

This document flags potential biases in the merged training dataset (HASOC, TRAC-2, 
MACD) that could cause the threat classifier to **over-flag** or **under-flag** content 
from specific communities, dialects, or viewpoints. Per the master solution doc's Risk 
section, an unbalanced dataset is cheaper to catch during training than after deployment.

---

## 1. Language Bias

| Dataset | Hindi | English | Gujarati | Hinglish |
|---------|-------|---------|----------|----------|
| HASOC   | ✅    | ✅      | ⚠️ 2021+ | ❌      |
| TRAC-2  | ✅    | ✅      | ❌       | ❌      |
| MACD    | ✅    | ❌      | ❌       | ❌      |

> [!WARNING]
> **Gujarati is severely underrepresented.** HASOC only started including Gujarati in 
> 2021 and the volume is much smaller than Hindi/English. This means the classifier will 
> likely have lower accuracy on Gujarati text. Mitigation: augment with AIKosh Gujarati 
> datasets and consider active-learning rounds specifically targeting Gujarati posts.

> [!WARNING]
> **Hinglish (code-mixed) has no dedicated training data.** The classifier relies on 
> transliteration to convert Romanized Hindi/Gujarati to native script before classifying. 
> If transliteration quality is poor, code-mixed posts may be systematically misclassified. 
> Mitigation: manually label 200-500 Hinglish posts via Doccano for fine-tuning.

---

## 2. Community / Religion Bias

> [!CAUTION]
> **HASOC and TRAC-2 both over-sample communal/religious hate speech** as their positive 
> class. This means the classifier may learn superficial associations (e.g., specific 
> religious terms → "hate") rather than actual intent. Known risks:
> 
> - **Muslim-associated terms** (Urdu loan words, specific names) may be over-represented 
>   in the "HATE/OAG" class, causing **false positives on neutral Urdu/Islamic content**.
> - **Hindu-associated terms** may similarly be over-flagged if they appear frequently in 
>   inflammatory contexts in the training data.
> - **Caste-related terms** in Hindi may be labeled inconsistently across datasets.

### Mitigation Strategies
1. Run `evaluate.py` with `--per-community-breakdown` flag (when available) to check if 
   specific religious/community terms are disproportionately flagged.
2. Add a "Neutral but contains religious terms" test set to measure false-positive rate 
   on religious content specifically.
3. Use the uncertainty sampler to route borderline religious-content predictions for 
   human review before deployment.

---

## 3. Political Bias

> [!IMPORTANT]
> The training datasets were collected during specific political events (elections, 
> protests, policy debates). This introduces **temporal political bias**:
> 
> - Content critical of the ruling party during data collection may be over-represented 
>   in the "Inflammatory" class.
> - Opposition-party rhetoric may be under-represented.
> - Government policy announcements that triggered heated debate may cause the classifier 
>   to flag legitimate political criticism as inflammatory.

### Mitigation
- Ensure training data spans multiple time periods and political contexts.
- Add politically neutral "factual criticism" examples to the Neutral class.
- Document the data collection time window in the evaluation report.

---

## 4. Class Imbalance

| Class | Expected % in Training | Risk |
|-------|----------------------|------|
| Neutral | ~50-60% | Under-flagging of actual threats |
| Inflammatory | ~20-25% | Reasonable |
| IncitementToViolence | ~5-10% | Very small class → model may miss rare patterns |
| FakeNews | ~5% (heuristic only) | **No direct labeled data** — relies on rule-based heuristic |

> [!WARNING]
> **FakeNews has zero labeled training data** from HASOC/TRAC-2/MACD. The current 
> FakeNews detection is entirely rule-based (urgency markers, conspiracy patterns). This 
> is the weakest category and will likely have the lowest precision. Supplement with the 
> Constraint shared task dataset or Indian Fake News datasets from AIKosh.

> [!WARNING]
> **IncitementToViolence is very small** (~5-10% of training data). The model may 
> struggle to distinguish it from Inflammatory. The class-weighted loss in 
> `train_indicbert.py` partially mitigates this, but more labeled data would help.

---

## 5. False-Positive Risk on Neutral Content

The constraint specification explicitly requires tracking the **false-positive rate on 
Neutral-labeled content** — i.e., how often genuinely neutral posts get wrongly flagged as 
one of the 3 threat categories. This is critical because:

- An **over-sensitive classifier causes analyst alert fatigue** just as much as one that 
  misses real threats.
- In a multilingual setting, neutral content in underrepresented languages (Gujarati, 
  Hinglish) is more likely to be misclassified.

`evaluate.py` reports this metric as `neutral_false_positive_rate` — the percentage of 
Neutral-labeled test posts that the model incorrectly classifies as Inflammatory, 
IncitementToViolence, or FakeNews.

**Target:** Neutral false-positive rate should be < 10%. If it exceeds 15%, the model 
needs rebalancing or additional Neutral training data.

---

## 6. Recommendations Before Deployment

1. **Run `evaluate.py`** with the full test set and review per-language accuracy. If 
   Gujarati accuracy is >10% lower than Hindi, add more Gujarati training data.
2. **Manually review** 50 randomly sampled predictions from each language to catch 
   systematic errors not visible in aggregate metrics.
3. **Add adversarial examples**: neutral posts that contain religious/political terms but 
   are factual — the classifier should NOT flag these.
4. **Deploy with human-in-the-loop**: use the uncertainty sampler to route low-confidence 
   predictions for manual review, especially in the first 2 weeks.
5. **Monitor false-positive rate in production**: track analyst dismissal rate on alerts 
   — if analysts dismiss >20% of alerts, the classifier is too sensitive.

---

## Status

| Check | Status |
|-------|--------|
| Language coverage reviewed | ✅ Documented above |
| Community bias flagged | ✅ Documented above |
| Class imbalance analyzed | ✅ Documented above |
| FakeNews gap identified | ✅ Documented above |
| False-positive metric added | ✅ In evaluate.py |
| Per-language accuracy | ✅ In evaluate.py |
| Adversarial test set | ⬜ TBD — create before hackathon demo |
| Active-learning for Gujarati | ⬜ TBD — requires Doccano setup |
