# NETRA — GPU Model Training Runbook

> **Status:** BLOCKED — No GPU available in this environment.  
> **Unblock:** Execute the steps below on Google Colab (free T4 GPU), AIKosh, or any CUDA-capable machine.

---

## Prerequisites

1. **GPU Environment:** Google Colab (free tier gives T4), Kaggle Notebooks, or AIKosh GPU sandbox.
2. **Clone the Repository:**
   ```bash
   git clone <your-repo-url> netra && cd netra
   pip install -r requirements.txt
   pip install torch torchvision --index-url https://download.pytorch.org/whl/cu121
   ```

3. **Verify GPU:**
   ```python
   import torch
   print(torch.cuda.is_available())  # Must be True
   print(torch.cuda.get_device_name(0))  # e.g., "Tesla T4"
   ```

---

## Step 1: Prepare Unified Dataset

```bash
python -m nlp_engine.datasets.prepare_datasets \
    --output nlp_engine/datasets/unified_threat_dataset.csv
```

This merges HASOC, TRAC-2, HingCorpus, MACD, and AIKosh datasets into a single CSV with columns: `text`, `label` (one of: Inflammatory, IncitementToViolence, FakeNews, Neutral).

Expected: ~15,000–25,000 labeled samples.

---

## Step 2: Train IndicBERT

```bash
python -m nlp_engine.models.train_indicbert \
    --dataset nlp_engine/datasets/unified_threat_dataset.csv \
    --output checkpoints/indicbert-threat-v1 \
    --epochs 5 \
    --batch-size 16 \
    --learning-rate 2e-5 \
    --warmup-ratio 0.1
```

**Expected runtime:** ~20–30 minutes on T4 GPU.  
**Output:** `checkpoints/indicbert-threat-v1/` containing `pytorch_model.bin`, `config.json`, `tokenizer.json`.

---

## Step 3: Train MuRIL

```bash
python -m nlp_engine.models.train_muril \
    --dataset nlp_engine/datasets/unified_threat_dataset.csv \
    --output checkpoints/muril-threat-v1 \
    --epochs 5 \
    --batch-size 16 \
    --learning-rate 2e-5 \
    --warmup-ratio 0.1
```

**Expected runtime:** ~25–35 minutes on T4 GPU.  
**Output:** `checkpoints/muril-threat-v1/`

---

## Step 4: Train Sarvam (LoRA/QLoRA)

```bash
python -m nlp_engine.models.train_sarvam \
    --dataset nlp_engine/datasets/unified_threat_dataset.csv \
    --output checkpoints/sarvam-threat-v1 \
    --epochs 3 \
    --batch-size 8 \
    --lora-rank 16 \
    --lora-alpha 32
```

**Expected runtime:** ~15–20 minutes on T4 GPU (LoRA is efficient).  
**Output:** `checkpoints/sarvam-threat-v1/`

---

## Step 5: Run Evaluation & Benchmark

```bash
python -m nlp_engine.models.evaluate \
    --dataset nlp_engine/datasets/unified_threat_dataset.csv \
    --benchmark-table
```

This runs all 4 models (IndicBERT, MuRIL, mBERT, Sarvam) against a held-out test split and prints:

```
╔════════════════╦══════════╦═══════════╦════════╦══════╗
║ Model          ║ Accuracy ║ Precision ║ Recall ║ F1   ║
╠════════════════╬══════════╬═══════════╬════════╬══════╣
║ IndicBERT      ║  0.XX    ║   0.XX    ║  0.XX  ║ 0.XX ║
║ MuRIL          ║  0.XX    ║   0.XX    ║  0.XX  ║ 0.XX ║
║ mBERT          ║  0.XX    ║   0.XX    ║  0.XX  ║ 0.XX ║
║ Sarvam         ║  0.XX    ║   0.XX    ║  0.XX  ║ 0.XX ║
╚════════════════╩══════════╩═══════════╩════════╩══════╝
```

---

## Step 6: Update Documentation

After getting real numbers, update:
1. `KPI_REPORT.md` — Replace all "TBD" accuracy/precision/recall cells.
2. `DELIVERABLES_STATUS.md` — Mark the 3 "pending model GPU checkpoint training" items as ✅.

---

## Step 7: Deploy Checkpoints

```bash
# Copy trained checkpoints to the project
cp -r checkpoints/ /path/to/netra/checkpoints/

# Update .env to use the trained model
echo "ACTIVE_MODEL=indicbert" >> .env
echo "MODEL_VERSION=indicbert-v1.0.0" >> .env
```

---

## Google Colab One-Liner

For the fastest path, paste this into a new Colab cell:

```python
!git clone <repo-url> netra && cd netra
!pip install -r requirements.txt
!python -m nlp_engine.datasets.prepare_datasets --output nlp_engine/datasets/unified_threat_dataset.csv
!python -m nlp_engine.models.train_indicbert --dataset nlp_engine/datasets/unified_threat_dataset.csv --output checkpoints/indicbert-threat-v1 --epochs 5
!python -m nlp_engine.models.train_muril --dataset nlp_engine/datasets/unified_threat_dataset.csv --output checkpoints/muril-threat-v1 --epochs 5
!python -m nlp_engine.models.train_sarvam --dataset nlp_engine/datasets/unified_threat_dataset.csv --output checkpoints/sarvam-threat-v1 --epochs 3
!python -m nlp_engine.models.evaluate --dataset nlp_engine/datasets/unified_threat_dataset.csv --benchmark-table
```

---

*Runbook generated for NETRA ERH26_PS_05 — ready for any team member with GPU access.*
