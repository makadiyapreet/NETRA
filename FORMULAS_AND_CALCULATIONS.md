# 📐 NETRA — Core Formulas & Calculations (Judge-Ready Quick Reference)

> **Judge Tip:** This sheet explains all formulas in **plain, simple English** with quick examples so you can answer any judge or evaluator question in 10 seconds.

---

## 1. Rolling Z-Score (Spike & Trend Detection)
* **File:** [`ingestion/trending/spike_detector.py`](file:///Users/makadiyapreet/CODES/Projects/NETRA/ingestion/trending/spike_detector.py)
* **What to tell Judges:** *"We compare the post volume right now against the normal rolling average. If it is 3 times higher than normal variation, it's an abnormal spike."*

### Simple Formula
$$\text{Z-Score} = \frac{\text{Current Count} - \text{Past Average}}{\text{Normal Variation (Standard Deviation)}}$$

* **Average ($\mu$):** Average number of posts per minute over the past hour.
* **Variation ($\sigma$):** How much the volume normally fluctuates.
* **Rule:** If $\text{Z-Score} \ge 3.0 \rightarrow$ **Spike Alert Triggered!**

### Quick Numbers Example:
* Normal average = **10 posts/min**
* Normal fluctuation = **±5 posts**
* Sudden surge right now = **40 posts/min**
* $\text{Z-Score} = \frac{40 - 10}{5} = \mathbf{6.0} \rightarrow$ **Severity 4 Spike Alert**

### Severity Scale
* $\text{Z-Score} \ge 7.0 \rightarrow$ **Severity 5** (Critical / Viral Outbreak)
* $\text{Z-Score} \ge 6.0 \rightarrow$ **Severity 4** (Major Spike)
* $\text{Z-Score} \ge 5.0 \rightarrow$ **Severity 3** (High Attention)
* $\text{Z-Score} \ge 4.0 \rightarrow$ **Severity 2** (Moderate Surge)
* $\text{Z-Score} \ge 3.0 \rightarrow$ **Severity 1** (Early Warning)

---

## 2. Bot Likelihood Score (0.0 to 1.0)
* **File:** [`network_analysis/bot_detection/heuristic_scorer.py`](file:///Users/makadiyapreet/CODES/Projects/NETRA/network_analysis/bot_detection/heuristic_scorer.py)
* **What to tell Judges:** *"We combine 4 behavioral red flags using a weighted sum. Score above 0.70 means the account is likely a bot."*

### Simple Formula
$$\text{Bot Score} = (0.30 \times \text{Account Age}) + (0.25 \times \text{Follower Ratio}) + (0.25 \times \text{Posting Frequency}) + (0.20 \times \text{Engagement Anomaly})$$

### The 4 Red Flags (Normalized 0 to 1):
1. **Account Age ($30\%$):** Brand new account ($<7$ days old) $\rightarrow$ High Suspicion ($0.9$). Old account ($>1$ year) $\rightarrow$ Safe ($0.1$).
2. **Follower Ratio ($25\%$):** Following thousands of people but having almost zero followers $\rightarrow$ Suspicious.
3. **Posting Frequency ($25\%$):** Spamming $>20$ to $50$ posts per day $\rightarrow$ Likely automated.
4. **Engagement Anomaly ($20\%$):** Post has hundreds of retweets/shares but zero likes/comments $\rightarrow$ Artificial boosting.

* **Threshold:** Score $> 0.70 \rightarrow$ Flagged as **Automated Bot Account**.

---

## 3. Near-Duplicate Text Detection (MinHash & Jaccard)
* **File:** [`network_analysis/bot_detection/near_duplicate.py`](file:///Users/makadiyapreet/CODES/Projects/NETRA/network_analysis/bot_detection/near_duplicate.py)
* **What to tell Judges:** *"We slice text into 5-character chunks and check how many chunks overlap. If two posts match 80% or more, they belong to the same copy-paste campaign."*

### Simple Formula
$$\text{Text Match (Jaccard)} = \frac{\text{Overlapping 5-letter Chunks}}{\text{Total Unique 5-letter Chunks}}$$

* **Fast Matching (MinHash LSH):** Uses 128 hash fingerprints so we can compare millions of posts in milliseconds.
* **Threshold:** If $\text{Text Match} \ge 0.80$ ($80\%$), the posts are grouped into a **Duplicate Cluster**.

---

## 4. Coordinated Campaign Score (CIB Score)
* **File:** [`network_analysis/graph/community_detection.py`](file:///Users/makadiyapreet/CODES/Projects/NETRA/network_analysis/graph/community_detection.py)
* **What to tell Judges:** *"We detect account clusters using Louvain graph algorithms. If a group has high bot scores and repeatedly shares identical text, we flag it as an organized astroturfing campaign."*

### Simple Formula
$$\text{Coordination Score} = (0.40 \times \text{Average Bot Score}) + (0.35 \times \text{Duplicate Message Density}) + (0.25 \times \text{Group Size})$$

* **Duplicate Density:** How many accounts in the group copy-pasted the exact same message.
* **Group Size:** Larger groups get higher priority.
* **Alert Trigger:** Score $\ge 0.60 \rightarrow$ Triggers **Coordinated Inauthentic Campaign Alert**.

---

## 5. Viral Spread Graph Analyzer
* **File:** [`api-gateway/src/routes/network.ts`](file:///Users/makadiyapreet/CODES/Projects/NETRA/api-gateway/src/routes/network.ts)
* **What to tell Judges:** *"Give it any Post ID. It traces back to who created it (Patient Zero) and maps every account that spread similar words."*

### Simple Formula
$$\text{Word Overlap} = \frac{\text{Common Words between both posts}}{\text{Total Words in the original post}}$$

* **Rule:** If $\text{Word Overlap} > 40\%$, that user is linked as a **Spreader**.
* **What it outputs:**
  1. **Seed Node (Red):** The original post.
  2. **Author Node (Blue):** Patient Zero (who started it).
  3. **Spreader Nodes (Yellow):** Accounts amplifying the post.
  4. **Total Spreaders Count:** Number of external amplifiers.

---

## 6. AI Prediction Uncertainty (Entropy)
* **File:** [`nlp_engine/inference/uncertainty_sampler.py`](file:///Users/makadiyapreet/CODES/Projects/NETRA/nlp_engine/inference/uncertainty_sampler.py)
* **What to tell Judges:** *"If the AI is unsure or torn 50-50 between two categories, it doesn't guess — it routes the post to a human police analyst."*

### Simple Formula
$$\text{Uncertainty (Entropy)} = \text{How evenly the AI's probabilities are split across categories}$$

* **Certain:** AI says $95\%$ Violence, $5\%$ others $\rightarrow$ Low Entropy ($0.2$) $\rightarrow$ Auto-classified.
* **Uncertain:** AI says $35\%$ Fake News, $35\%$ Inflammatory, $30\%$ Neutral $\rightarrow$ High Entropy ($>1.0$).
* **Rule:** If $\text{Confidence} < 50\%$ OR $\text{Entropy} > 1.0 \rightarrow$ **Send to Human Review**.

---

## 7. Threat Severity Calculation (1 to 5)
* **File:** [`nlp_engine/inference/inference_service.py`](file:///Users/makadiyapreet/CODES/Projects/NETRA/nlp_engine/inference/inference_service.py)
* **What to tell Judges:** *"Each threat category has a base severity level. If the AI is more than 90% sure, we give it a +1 severity boost."*

### Simple Formula
$$\text{Severity} = \text{Base Severity} + (1 \text{ if AI Confidence} > 90\%)$$

* **Base Levels:**
  * $\text{Neutral} = \mathbf{1}$
  * $\text{FakeNews} = \mathbf{2}$
  * $\text{Inflammatory} = \mathbf{3}$
  * $\text{IncitementToViolence} = \mathbf{4}$
* **Max Level:** Capped at **Severity 5** (Critical Emergency).

---

## 8. Sentiment Intensity (0.0 to 1.0)
* **File:** [`nlp_engine/models/sentiment_model.py`](file:///Users/makadiyapreet/CODES/Projects/NETRA/nlp_engine/models/sentiment_model.py)
* **What to tell Judges:** *"Our Indic multilingual model assigns a probability to Positive, Negative, and Neutral. The highest probability is our intensity score."*

### Simple Formula
$$\text{Sentiment Intensity} = \max(\text{Positive \%}, \text{Negative \%}, \text{Neutral \%})$$

* **Example:** Post scores $88\%$ Negative, $8\%$ Neutral, $4\%$ Positive $\rightarrow$ Sentiment is **Negative** with intensity **0.88**.

---

## 9. Multimodal Meme Verification (CLIP Cosine Match)
* **File:** [`bonus_multimodal/image_text_consistency.py`](file:///Users/makadiyapreet/CODES/Projects/NETRA/bonus_multimodal/image_text_consistency.py)
* **What to tell Judges:** *"We compare the OCR text extracted from the meme against what is actually visible in the photo using OpenAI CLIP."*

### Simple Formula
$$\text{Consistency Score} = \text{Match between Image Meaning and Text Meaning} \quad (-1.0 \text{ to } +1.0)$$

* **Rule:** If $\text{Consistency Score} < 0.15 \rightarrow$ The text directly contradicts the photo $\rightarrow$ **Flagged as Out-of-Context Misinformation**.

---

## 10. Neutral False Positive Rate (FPR)
* **File:** [`nlp_engine/models/evaluate.py`](file:///Users/makadiyapreet/CODES/Projects/NETRA/nlp_engine/models/evaluate.py)
* **What to tell Judges:** *"To prevent false alarm fatigue for police officers, fewer than 10% of harmless normal posts can be mistakenly flagged as threats."*

### Simple Formula
$$\text{False Positive Rate} = \frac{\text{Harmless Neutral posts mistakenly flagged as threats}}{\text{Total Neutral posts tested}}$$

* **NETRA Target:** $\text{FPR} < 10\%$ ($0.10$). **Status: PASSING**.

---

## 11. Tamper-Evident Evidence Hash Chain (SHA-256)
* **File:** [`reporting/evidence_chain.py`](file:///Users/makadiyapreet/CODES/Projects/NETRA/reporting/evidence_chain.py)
* **What to tell Judges:** *"Like a mini-blockchain, every alert record contains the digital fingerprint of the previous record. If anyone edits a post in the database, the chain breaks immediately in court."*

### Simple Formula
$$\text{New Block Hash} = \text{SHA-256}(\text{Previous Block Hash} + \text{Current Evidence Data})$$

* **Chain Verification:** `verify_chain()` scans from record #1 to the end. If any hash doesn't match $\rightarrow$ Tampering detected!
