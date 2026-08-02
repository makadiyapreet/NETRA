import os
import json
import logging
from datetime import datetime
from pathlib import Path
from collections import defaultdict
from nlp_engine.models.zeroshot_classifier import ZeroShotClassifier
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent

def calculate_metrics(y_true, y_pred, labels):
    metrics = {}
    for label in labels:
        tp = sum(1 for t, p in zip(y_true, y_pred) if t == label and p == label)
        fp = sum(1 for t, p in zip(y_true, y_pred) if t != label and p == label)
        fn = sum(1 for t, p in zip(y_true, y_pred) if t == label and p != label)

        precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
        recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
        f1 = 2 * (precision * recall) / (precision + recall) if (precision + recall) > 0 else 0.0

        metrics[label] = {
            "precision": precision,
            "recall": recall,
            "f1": f1,
            "support": sum(1 for t in y_true if t == label)
        }
    return metrics

def run_evaluation():
    posts_path = PROJECT_ROOT / "fixtures" / "sample_posts.json"
    ground_truth_path = PROJECT_ROOT / "fixtures" / "sample_classified_output.json"
    report_path = PROJECT_ROOT / "KPI_REPORT_ZEROSHOT.md"

    # Check for API keys
    sarvam_key = os.getenv("SARVAM_API_KEY")
    groq_key = os.getenv("GROQ_API_KEY")

    if not sarvam_key and not groq_key:
        logger.info("API keys missing. Generating pending report.")
        report_content = (
            "# Zero-Shot Classification KPI Report\n\n"
            "> [!WARNING]\n"
            "> **NOT YET RUN — PENDING API KEYS**\n"
            "> The evaluation script was executed, but neither `SARVAM_API_KEY` nor `GROQ_API_KEY` "
            "were provided in the `.env` file. We refuse to fabricate plausible results. "
            "Please provide valid API keys and re-run `python -m nlp_engine.models.evaluate_zeroshot` "
            "to generate actual metrics.\n\n"
            "## Baseline Note\n"
            "The baseline ground truth (`fixtures/sample_classified_output.json`) was originally generated "
            "synthetically by a mock heuristic model (`mock-heuristic-v0.1.0`), not by human labelers. "
            "This will be taken into account when interpreting the final metrics.\n"
        )
        with open(report_path, "w") as f:
            f.write(report_content)
        return

    logger.info("Starting Zero-Shot Evaluation...")
    classifier = ZeroShotClassifier()

    with open(posts_path, "r") as f:
        posts = json.load(f)
    
    with open(ground_truth_path, "r") as f:
        gt_data = json.load(f)
        
    gt_map = {item["post_id"]: item["threat_category"] for item in gt_data}

    y_true = []
    y_pred = []
    provider_stats = defaultdict(int)

    for post in posts:
        post_id = post["post_id"]
        if post_id not in gt_map:
            continue
            
        gt_label = gt_map[post_id]
        y_true.append(gt_label)

        result = classifier.predict(post["text"], post.get("language_hint", "unknown"), post_id)
        
        # Track providers based on model_version string or error state
        if result.error:
            provider_stats["failed"] += 1
            y_pred.append("ClassificationFailed")
        elif "sarvam-zeroshot" in result.model_version:
            provider_stats["sarvam"] += 1
            y_pred.append(result.threat_category)
        elif "groq" in result.model_version:
            provider_stats["groq"] += 1
            y_pred.append(result.threat_category)
        else:
            provider_stats["unknown"] += 1
            y_pred.append(result.threat_category)

    labels = ["Inflammatory", "IncitementToViolence", "FakeNews", "Neutral"]
    metrics = calculate_metrics(y_true, y_pred, labels)

    # Compute overall accuracy
    correct = sum(1 for t, p in zip(y_true, y_pred) if t == p)
    total = len(y_true)
    accuracy = correct / total if total > 0 else 0.0

    # Macro-averaged precision/recall/F1
    macro_precision = sum(m["precision"] for m in metrics.values()) / len(metrics) if metrics else 0
    macro_recall = sum(m["recall"] for m in metrics.values()) / len(metrics) if metrics else 0
    macro_f1 = sum(m["f1"] for m in metrics.values()) / len(metrics) if metrics else 0

    # Build confusion matrix
    confusion_matrix = []
    for actual in labels:
        for predicted in labels:
            count = sum(1 for t, p in zip(y_true, y_pred) if t == actual and p == predicted)
            confusion_matrix.append({"actual": actual, "predicted": predicted, "count": count})

    # ── Write JSON report (machine-readable, for dashboard) ──────────
    json_report_path = PROJECT_ROOT / "nlp_engine" / "eval_results.json"
    json_report = {
        "status": "completed",
        "timestamp": datetime.now().isoformat(),
        "model": "zeroshot-llm",
        "model_version": "groq-llama-3.1-8b / sarvam-translate",
        "total_samples": total,
        "accuracy": round(accuracy, 4),
        "precision": round(macro_precision, 4),
        "recall": round(macro_recall, 4),
        "f1": round(macro_f1, 4),
        "per_class": {label: {
            "precision": round(m["precision"], 4),
            "recall": round(m["recall"], 4),
            "f1": round(m["f1"], 4),
            "support": m["support"],
        } for label, m in metrics.items()},
        "confusion_matrix": confusion_matrix,
        "provider_stats": dict(provider_stats),
        "baseline_note": "Ground truth labels from mock-heuristic-v0.1.0 (synthetic, not human-labeled)",
    }

    with open(json_report_path, "w") as f:
        json.dump(json_report, f, indent=2)
    logger.info(f"JSON eval results written to {json_report_path}")

    # ── Write Markdown report ────────────────────────────────────────
    report_content = "# Zero-Shot Classification KPI Report\n\n"
    report_content += "## Overview\n"
    report_content += "This report details the real-world performance of the zero-shot LLM classification path (Sarvam primary, Groq fallback) against the fixture dataset.\n\n"
    
    report_content += "> [!CAUTION]\n"
    report_content += "> **Synthetic Baseline:** The ground truth labels used for this evaluation (`fixtures/sample_classified_output.json`) were generated by the legacy `mock-heuristic-v0.1.0` model. They are not true human-assigned labels. Therefore, these metrics reflect alignment with the heuristic model rather than absolute human accuracy.\n\n"

    report_content += f"## Overall Metrics\n"
    report_content += f"- **Accuracy:** {accuracy:.3f} ({correct}/{total})\n"
    report_content += f"- **Macro Precision:** {macro_precision:.3f}\n"
    report_content += f"- **Macro Recall:** {macro_recall:.3f}\n"
    report_content += f"- **Macro F1:** {macro_f1:.3f}\n\n"

    report_content += "## Provider Usage Statistics\n"
    report_content += f"- **Sarvam AI (Primary):** {provider_stats['sarvam']} posts\n"
    report_content += f"- **Groq (Fallback):** {provider_stats['groq']} posts\n"
    report_content += f"- **Failed (Both APIs down):** {provider_stats['failed']} posts\n\n"

    report_content += "## Per-Class Performance Metrics\n"
    report_content += "| Threat Category | Precision | Recall | F1-Score | Support |\n"
    report_content += "|---|---|---|---|---|\n"
    
    for label in labels:
        m = metrics[label]
        report_content += f"| {label} | {m['precision']:.3f} | {m['recall']:.3f} | {m['f1']:.3f} | {m['support']} |\n"

    with open(report_path, "w") as f:
        f.write(report_content)
    
    logger.info(f"Evaluation complete. Report written to {report_path}")

if __name__ == "__main__":
    run_evaluation()

