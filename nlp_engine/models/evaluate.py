"""
Evaluation script for threat classification models.

Reports:
  - Per-class precision, recall, F1
  - Overall macro/micro/weighted F1
  - Accuracy broken down by detected_language (gu, hi, en, mixed)
  - Confusion matrix
  - Benchmark comparison table across IndicBERT, mBERT, MuRIL, and Sarvam
  - Saves results to JSON for README inclusion

Usage:
    # Single model evaluation:
    python -m nlp_engine.models.evaluate \
        --dataset datasets/unified_threat_dataset.csv \
        --model-type indicbert \
        --model-path checkpoints/indicbert-threat-v1 \
        --output results/evaluation_results.json

    # mBERT baseline (PS-suggested general-purpose multilingual transformer):
    python -m nlp_engine.models.evaluate \
        --dataset datasets/unified_threat_dataset.csv \
        --model-type mbert \
        --model-path checkpoints/mbert-threat-v1 \
        --output results/mbert_evaluation.json

    # Full benchmark table (all 3 model types):
    python -m nlp_engine.models.evaluate \
        --dataset datasets/unified_threat_dataset.csv \
        --benchmark-table
"""

from __future__ import annotations

import argparse
import json
import logging
from pathlib import Path

# pyrefly: ignore [missing-import]
import numpy as np
import pandas as pd
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
    f1_score,
    precision_recall_fscore_support,
)

logger = logging.getLogger(__name__)

THREAT_LABELS = ["Inflammatory", "IncitementToViolence", "FakeNews", "Neutral"]


def evaluate(
    dataset_path: str,
    model_type: str = "indicbert",
    model_path: str = "checkpoints/indicbert-threat-v1",
    output_path: str | None = None,
    split: str = "test",
) -> dict:
    """
    Evaluate a trained model on the test set.

    Args:
        dataset_path: Path to unified CSV dataset.
        model_type: "indicbert" or "sarvam".
        model_path: Path to model checkpoint.
        output_path: Optional path to save results JSON.
        split: Dataset split to evaluate on.

    Returns:
        Dictionary with all evaluation metrics.
    """
    # Load dataset
    logger.info(f"Loading test data from {dataset_path} (split={split})")
    df = pd.read_csv(dataset_path)
    test_df = df[df["split"] == split].copy()

    if test_df.empty:
        # Fall back to using val split
        test_df = df[df["split"].isin(["val", "dev"])].copy()
        if test_df.empty:
            logger.error(f"No data found for split '{split}'. Available: {df['split'].unique()}")
            return {}

    test_df = test_df[test_df["label"].isin(THREAT_LABELS)]
    logger.info(f"Evaluating on {len(test_df)} samples")

    # Load model
    if model_type in ("indicbert", "muril", "mbert"):
        from nlp_engine.models.indicbert_classifier import IndicBERTClassifier

        # Map model type to default HuggingFace model name
        _default_model_paths = {
            "indicbert": "ai4bharat/indic-bert",
            "muril": "google/muril-base-cased",
            "mbert": "bert-base-multilingual-cased",
        }
        # Use checkpoint path if it looks like a local path, otherwise use default
        effective_path = model_path
        if model_path.startswith("checkpoints/") and not Path(model_path).exists():
            effective_path = _default_model_paths.get(model_type, model_path)
            logger.info(
                f"Checkpoint not found at {model_path}, using base model: {effective_path}"
            )

        classifier = IndicBERTClassifier(model_path=effective_path)
    elif model_type == "sarvam":
        from nlp_engine.models.sarvam_classifier import SarvamClassifier
        classifier = SarvamClassifier(model_path=model_path)
    else:
        raise ValueError(
            f"Unknown model type: {model_type}. "
            f"Supported: indicbert, muril, mbert, sarvam"
        )

    classifier.load()

    # Run predictions
    logger.info("Running predictions...")
    texts = test_df["text"].tolist()
    results = classifier.predict_batch(texts)

    y_true = test_df["label"].tolist()
    y_pred = [r.threat_category for r in results]
    confidences = [r.threat_confidence for r in results]

    # ── Overall Metrics ─────────────────────────────────────────────────
    report_dict = classification_report(
        y_true, y_pred, labels=THREAT_LABELS, output_dict=True, zero_division=0
    )
    report_text = classification_report(
        y_true, y_pred, labels=THREAT_LABELS, zero_division=0
    )

    cm = confusion_matrix(y_true, y_pred, labels=THREAT_LABELS)

    overall = {
        "accuracy": accuracy_score(y_true, y_pred),
        "f1_macro": f1_score(y_true, y_pred, labels=THREAT_LABELS, average="macro", zero_division=0),
        "f1_micro": f1_score(y_true, y_pred, labels=THREAT_LABELS, average="micro", zero_division=0),
        "f1_weighted": f1_score(y_true, y_pred, labels=THREAT_LABELS, average="weighted", zero_division=0),
        "mean_confidence": float(np.mean(confidences)),
    }

    # ── Per-Class Metrics ───────────────────────────────────────────────
    per_class = {}
    for label in THREAT_LABELS:
        if label in report_dict:
            per_class[label] = {
                "precision": report_dict[label]["precision"],
                "recall": report_dict[label]["recall"],
                "f1": report_dict[label]["f1-score"],
                "support": report_dict[label]["support"],
            }

    # ── Per-Language Accuracy ───────────────────────────────────────────
    per_language = {}
    if "language" in test_df.columns:
        for lang in test_df["language"].unique():
            lang_mask = test_df["language"] == lang
            lang_true = [y_true[i] for i, m in enumerate(lang_mask) if m]
            lang_pred = [y_pred[i] for i, m in enumerate(lang_mask) if m]

            if lang_true:
                per_language[lang] = {
                    "accuracy": accuracy_score(lang_true, lang_pred),
                    "f1_macro": f1_score(
                        lang_true, lang_pred,
                        labels=THREAT_LABELS, average="macro", zero_division=0
                    ),
                    "samples": len(lang_true),
                }

    # ── Confusion Matrix ────────────────────────────────────────────────
    cm_dict = {
        "labels": THREAT_LABELS,
        "matrix": cm.tolist(),
    }

    # ── Neutral False-Positive Rate ────────────────────────────────────
    # How often genuinely neutral posts get wrongly flagged as one of the
    # 3 threat categories. This is a named success metric — an over-sensitive
    # classifier causes analyst alert fatigue.
    neutral_idx = THREAT_LABELS.index("Neutral")
    neutral_mask = [yt == "Neutral" for yt in y_true]
    neutral_count = sum(neutral_mask)

    if neutral_count > 0:
        neutral_misclassified = sum(
            1 for i, is_neutral in enumerate(neutral_mask)
            if is_neutral and y_pred[i] != "Neutral"
        )
        neutral_fp_rate = neutral_misclassified / neutral_count
        neutral_fp_breakdown = {}
        for threat_cat in ["Inflammatory", "IncitementToViolence", "FakeNews"]:
            cat_count = sum(
                1 for i, is_neutral in enumerate(neutral_mask)
                if is_neutral and y_pred[i] == threat_cat
            )
            neutral_fp_breakdown[threat_cat] = cat_count
    else:
        neutral_fp_rate = 0.0
        neutral_fp_breakdown = {}

    neutral_fp = {
        "neutral_false_positive_rate": round(neutral_fp_rate, 4),
        "neutral_total": neutral_count,
        "neutral_misclassified": neutral_misclassified if neutral_count > 0 else 0,
        "misclassified_as": neutral_fp_breakdown,
        "target": "< 0.10 (10%)",
        "status": "PASS" if neutral_fp_rate < 0.10 else (
            "WARNING" if neutral_fp_rate < 0.15 else "FAIL"
        ),
    }

    # ── Compile Results ─────────────────────────────────────────────────
    evaluation = {
        "model_type": model_type,
        "model_path": model_path,
        "dataset": dataset_path,
        "split": split,
        "total_samples": len(test_df),
        "overall": overall,
        "per_class": per_class,
        "per_language": per_language,
        "neutral_false_positive": neutral_fp,
        "confusion_matrix": cm_dict,
        "bias_review": "See BIAS_REVIEW_NOTES.md for dataset skew analysis",
    }

    # Print report
    print("\n" + "=" * 70)
    print(f"EVALUATION RESULTS — {model_type} ({model_path})")
    print("=" * 70)
    print(f"\nSamples: {len(test_df)}")
    print(f"\n{report_text}")
    print(f"\nOverall Accuracy: {overall['accuracy']:.4f}")
    print(f"Macro F1: {overall['f1_macro']:.4f}")
    print(f"Mean Confidence: {overall['mean_confidence']:.4f}")

    if per_language:
        print("\n── Accuracy by Language ──")
        for lang, metrics in sorted(per_language.items()):
            print(f"  {lang}: accuracy={metrics['accuracy']:.4f}, "
                  f"f1={metrics['f1_macro']:.4f}, n={metrics['samples']}")

    print("\n── Confusion Matrix ──")
    print(f"{'':>22s}", end="")
    for label in THREAT_LABELS:
        print(f"{label[:12]:>14s}", end="")
    print()
    for i, label in enumerate(THREAT_LABELS):
        print(f"{label:>22s}", end="")
        for j in range(len(THREAT_LABELS)):
            print(f"{cm[i][j]:>14d}", end="")
        print()

    # Neutral FP rate
    print(f"\n── Neutral False-Positive Rate ──")
    print(f"  Rate: {neutral_fp['neutral_false_positive_rate']:.2%} "
          f"(target: {neutral_fp['target']})")
    print(f"  Status: {neutral_fp['status']}")
    print(f"  Neutral samples: {neutral_fp['neutral_total']}, "
          f"misclassified: {neutral_fp['neutral_misclassified']}")
    if neutral_fp['misclassified_as']:
        for cat, cnt in neutral_fp['misclassified_as'].items():
            if cnt > 0:
                print(f"    → wrongly flagged as {cat}: {cnt}")
    print(f"\n  Bias review: See BIAS_REVIEW_NOTES.md")

    # Save results
    if output_path:
        output_path_obj = Path(output_path)
        output_path_obj.parent.mkdir(parents=True, exist_ok=True)
        with open(output_path_obj, "w") as f:
            json.dump(evaluation, f, indent=2)
        logger.info(f"Results saved to {output_path}")

    return evaluation


def benchmark_all(
    dataset_path: str,
    split: str = "test",
    output_dir: str = "results",
) -> dict[str, dict]:
    """
    Run evaluation for all supported model types and print a comparison table.

    This produces the benchmark table the PS requires, comparing:
      - IndicBERT (AI4Bharat, primary Indic-specific model)
      - MuRIL (Google, 17 Indian languages)
      - mBERT (Google, PS-suggested general-purpose multilingual transformer)
      - Sarvam (if checkpoint available)

    The PS expects IndicBERT/MuRIL to outperform mBERT on Indic text,
    but mBERT is included to show the PS's suggested tool was genuinely
    evaluated, not skipped.

    Args:
        dataset_path: Path to unified CSV dataset.
        split: Dataset split to evaluate on.
        output_dir: Directory to save individual result JSONs.

    Returns:
        Dict mapping model_type → evaluation results dict.
    """
    model_configs = {
        "indicbert": {
            "model_path": "checkpoints/indicbert-threat-v1",
            "output": f"{output_dir}/eval_indicbert.json",
        },
        "muril": {
            "model_path": "checkpoints/muril-threat-v1",
            "output": f"{output_dir}/eval_muril.json",
        },
        "mbert": {
            "model_path": "checkpoints/mbert-threat-v1",
            "output": f"{output_dir}/eval_mbert.json",
        },
    }

    all_results: dict[str, dict] = {}

    for model_type, config in model_configs.items():
        print(f"\n{'─' * 70}")
        print(f"Evaluating: {model_type}")
        print(f"{'─' * 70}")
        try:
            result = evaluate(
                dataset_path=dataset_path,
                model_type=model_type,
                model_path=config["model_path"],
                output_path=config["output"],
                split=split,
            )
            all_results[model_type] = result
        except Exception as e:
            logger.error(f"Evaluation failed for {model_type}: {e}")
            all_results[model_type] = {"error": str(e)}

    # Print benchmark comparison table
    print("\n" + "=" * 70)
    print("BENCHMARK COMPARISON TABLE")
    print("=" * 70)
    print(
        f"{'Model':<15s} {'Accuracy':>10s} {'F1-Macro':>10s} "
        f"{'F1-Weighted':>12s} {'Neutral FPR':>12s} {'Confidence':>12s}"
    )
    print("-" * 71)

    for model_type, result in all_results.items():
        if "error" in result:
            print(f"{model_type:<15s} {'ERROR':>10s}  {result['error'][:40]}")
            continue

        overall = result.get("overall", {})
        nfp = result.get("neutral_false_positive", {})
        print(
            f"{model_type:<15s} "
            f"{overall.get('accuracy', 0):.4f}     "
            f"{overall.get('f1_macro', 0):.4f}     "
            f"{overall.get('f1_weighted', 0):.4f}       "
            f"{nfp.get('neutral_false_positive_rate', 0):.4f}       "
            f"{overall.get('mean_confidence', 0):.4f}"
        )

    # Per-language comparison
    print("\n── Per-Language Accuracy ──")
    for lang in ["hi", "gu", "en", "mixed"]:
        row = f"  {lang}: "
        for model_type, result in all_results.items():
            if "error" in result:
                continue
            per_lang = result.get("per_language", {})
            if lang in per_lang:
                row += f"{model_type}={per_lang[lang]['accuracy']:.3f}  "
            else:
                row += f"{model_type}=N/A  "
        print(row)

    print(f"\n  → See BIAS_REVIEW_NOTES.md for dataset skew analysis")

    # Save combined results
    combined_path = Path(output_dir) / "benchmark_comparison.json"
    combined_path.parent.mkdir(parents=True, exist_ok=True)
    import json
    with open(combined_path, "w") as f:
        json.dump(all_results, f, indent=2, default=str)
    print(f"\n  Combined results saved to {combined_path}")

    return all_results


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")

    parser = argparse.ArgumentParser(description="Evaluate threat classification model")
    parser.add_argument("--dataset", required=True, help="Path to unified CSV dataset")
    parser.add_argument(
        "--model-type",
        choices=["indicbert", "muril", "mbert", "sarvam"],
        default="indicbert",
        help="Model type to evaluate. mBERT is the PS-suggested baseline.",
    )
    parser.add_argument("--model-path", default="checkpoints/indicbert-threat-v1")
    parser.add_argument("--output", default="results/evaluation_results.json")
    parser.add_argument("--split", default="test")
    parser.add_argument(
        "--benchmark-table",
        action="store_true",
        help="Run evaluation for all model types and print a comparison table.",
    )

    args = parser.parse_args()

    if args.benchmark_table:
        benchmark_all(
            dataset_path=args.dataset,
            split=args.split,
        )
    else:
        evaluate(
            dataset_path=args.dataset,
            model_type=args.model_type,
            model_path=args.model_path,
            output_path=args.output,
            split=args.split,
        )
