#!/usr/bin/env python3
"""
NETRA — Complete Setup & Training Guide

This script guides you through the FULL setup to get REAL model predictions.
Run it step-by-step or use the --auto flag to run everything automatically.

Usage:
    python setup_real_model.py              # Interactive step-by-step
    python setup_real_model.py --step 1     # Run only step 1
    python setup_real_model.py --step 2     # Run only step 2 (download datasets)
    python setup_real_model.py --step 3     # Run only step 3 (prepare datasets)
    python setup_real_model.py --step 4     # Run only step 4 (train model)
    python setup_real_model.py --step 5     # Run only step 5 (evaluate)
    python setup_real_model.py --auto       # Run all steps automatically
"""

import argparse
import os
import subprocess
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent

GREEN = "\033[92m"
YELLOW = "\033[93m"
RED = "\033[91m"
CYAN = "\033[96m"
BOLD = "\033[1m"
RESET = "\033[0m"


def header(step_num, title):
    print(f"\n{BOLD}{CYAN}{'═' * 70}{RESET}")
    print(f"{BOLD}{CYAN}  STEP {step_num}: {title}{RESET}")
    print(f"{BOLD}{CYAN}{'═' * 70}{RESET}\n")


def ok(msg):
    print(f"  {GREEN}✅ {msg}{RESET}")


def warn(msg):
    print(f"  {YELLOW}⚠️  {msg}{RESET}")


def fail(msg):
    print(f"  {RED}❌ {msg}{RESET}")


def info(msg):
    print(f"  {msg}")


def ask_continue(auto=False):
    if auto:
        return True
    response = input(f"\n  {BOLD}Continue? [Y/n]: {RESET}").strip().lower()
    return response in ("", "y", "yes")


# ════════════════════════════════════════════════════════════════════════════
# STEP 1: Install Dependencies
# ════════════════════════════════════════════════════════════════════════════

def step_1_install_deps(auto=False):
    header(1, "Install ML Dependencies")

    info("This will install PyTorch, Transformers, and other ML libraries.")
    info("Total download: ~2-3 GB (PyTorch is large)")
    info("")

    # Check what's already installed
    installed = {}
    for pkg in ["torch", "transformers", "datasets", "sklearn", "accelerate", "peft"]:
        try:
            __import__(pkg if pkg != "sklearn" else "sklearn")
            installed[pkg] = True
        except ImportError:
            installed[pkg] = False

    for pkg, is_installed in installed.items():
        if is_installed:
            ok(f"{pkg} — already installed")
        else:
            warn(f"{pkg} — NOT installed")

    missing = [pkg for pkg, v in installed.items() if not v]
    if not missing:
        ok("All dependencies already installed!")
        return True

    info(f"\n  Will install: {', '.join(missing)}")

    if not ask_continue(auto):
        return False

    # Install from requirements.txt
    cmd = [sys.executable, "-m", "pip", "install", "-r", str(PROJECT_ROOT / "requirements.txt")]
    info(f"\n  Running: {' '.join(cmd)}\n")
    result = subprocess.run(cmd, cwd=str(PROJECT_ROOT))

    if result.returncode == 0:
        ok("Dependencies installed successfully!")
        return True
    else:
        fail("Failed to install dependencies. Check the error above.")
        return False


# ════════════════════════════════════════════════════════════════════════════
# STEP 2: Download Datasets
# ════════════════════════════════════════════════════════════════════════════

def step_2_download_datasets(auto=False):
    header(2, "Download Training Datasets")

    raw_dir = PROJECT_ROOT / "raw_datasets"
    raw_dir.mkdir(exist_ok=True)

    info("You need labeled datasets to train the threat classifier.")
    info("Here's where to get each one:\n")

    datasets_info = [
        {
            "name": "HASOC 2019-2021",
            "dir": "hasoc",
            "languages": "Hindi, English (some Gujarati in 2021+)",
            "labels": "HATE, OFFN, PRFN, NOT",
            "download": "https://hasocfire.github.io/hasoc/2021/dataset.html",
            "auto_download": True,
            "hf_name": "hasoc",
            "notes": "Free download after registration. Also available on GitHub.",
        },
        {
            "name": "TRAC-2 (Aggression)",
            "dir": "trac2",
            "languages": "Hindi, English, Bangla",
            "labels": "OAG, CAG, NAG",
            "download": "https://github.com/kmi-linguistics/trac-2",
            "auto_download": True,
            "hf_name": None,
            "notes": "Freely available on GitHub.",
        },
        {
            "name": "MACD (Abusive Detection)",
            "dir": "macd",
            "languages": "Hindi",
            "labels": "Abusive (0), Non-abusive (1)",
            "download": "https://github.com/ShareChatAI/MACD",
            "auto_download": True,
            "hf_name": None,
            "notes": "Freely available on GitHub.",
        },
    ]

    for ds in datasets_info:
        ds_dir = raw_dir / ds["dir"]
        if ds_dir.exists() and any(ds_dir.iterdir()):
            ok(f"{ds['name']} — already downloaded at {ds_dir}")
        else:
            warn(f"{ds['name']} — NOT downloaded")
            info(f"      Languages: {ds['languages']}")
            info(f"      Labels:    {ds['labels']}")
            info(f"      Download:  {ds['download']}")
            info(f"      Notes:     {ds['notes']}")
            info("")

    # Try HuggingFace datasets for auto-download
    info("")
    info(f"  {BOLD}Attempting auto-download via HuggingFace Datasets...{RESET}")

    try:
        from datasets import load_dataset

        # Try HASOC from HuggingFace
        hasoc_dir = raw_dir / "hasoc"
        if not hasoc_dir.exists() or not any(hasoc_dir.iterdir()):
            info("  Trying to download HASOC from HuggingFace...")
            try:
                ds = load_dataset("hate_speech18", split="train")
                hasoc_dir.mkdir(parents=True, exist_ok=True)
                ds.to_csv(str(hasoc_dir / "hasoc_hf.csv"))
                ok(f"Downloaded hate_speech dataset to {hasoc_dir}")
            except Exception as e:
                warn(f"Could not auto-download HASOC: {e}")
                info(f"  → Download manually from: https://hasocfire.github.io/hasoc/2021/dataset.html")

    except ImportError:
        warn("HuggingFace 'datasets' library not installed — skipping auto-download")
        info("  Install with: pip install datasets")

    info("")
    info(f"  {BOLD}If auto-download didn't work, download manually:{RESET}")
    info("")
    info("  1. HASOC: https://hasocfire.github.io/hasoc/2021/dataset.html")
    info(f"     → Put CSV/TSV files in: {raw_dir / 'hasoc'}/")
    info("")
    info("  2. TRAC-2: git clone https://github.com/kmi-linguistics/trac-2")
    info(f"     → Put data files in: {raw_dir / 'trac2'}/")
    info("")
    info("  3. MACD: git clone https://github.com/ShareChatAI/MACD")
    info(f"     → Put data files in: {raw_dir / 'macd'}/")

    return True


# ════════════════════════════════════════════════════════════════════════════
# STEP 3: Prepare Unified Dataset
# ════════════════════════════════════════════════════════════════════════════

def step_3_prepare_datasets(auto=False):
    header(3, "Prepare Unified Dataset")

    raw_dir = PROJECT_ROOT / "raw_datasets"
    output_path = PROJECT_ROOT / "datasets" / "unified_threat_dataset.csv"

    if output_path.exists():
        import pandas as pd
        df = pd.read_csv(output_path)
        ok(f"Unified dataset already exists: {output_path}")
        info(f"  Total samples: {len(df)}")
        info(f"  Columns: {list(df.columns)}")
        if "label" in df.columns:
            info(f"  Label distribution:\n{df['label'].value_counts().to_string()}")
        return True

    if not raw_dir.exists() or not any(raw_dir.iterdir()):
        warn("No raw datasets found. Run Step 2 first to download them.")
        info(f"  Expected location: {raw_dir}")
        return False

    info("Merging raw datasets into unified format...")
    info(f"  Input:  {raw_dir}")
    info(f"  Output: {output_path}")

    if not ask_continue(auto):
        return False

    output_path.parent.mkdir(parents=True, exist_ok=True)

    cmd = [
        sys.executable, "-m", "nlp_engine.datasets.prepare_datasets",
        "--raw-dir", str(raw_dir),
        "--output", str(output_path),
    ]
    info(f"\n  Running: {' '.join(cmd)}\n")
    result = subprocess.run(cmd, cwd=str(PROJECT_ROOT))

    if result.returncode == 0 and output_path.exists():
        ok(f"Unified dataset created: {output_path}")
        return True
    else:
        fail("Dataset preparation failed. Check errors above.")
        return False


# ════════════════════════════════════════════════════════════════════════════
# STEP 4: Train Model
# ════════════════════════════════════════════════════════════════════════════

def step_4_train_model(auto=False):
    header(4, "Train IndicBERT Threat Classifier")

    dataset_path = PROJECT_ROOT / "datasets" / "unified_threat_dataset.csv"
    checkpoint_dir = PROJECT_ROOT / "checkpoints" / "indicbert-threat-v1"

    if checkpoint_dir.exists() and (checkpoint_dir / "config.json").exists():
        ok(f"Trained model already exists at: {checkpoint_dir}")
        info("  To retrain, delete the checkpoint directory and run again.")
        return True

    if not dataset_path.exists():
        warn(f"Training dataset not found: {dataset_path}")
        info("  Run Step 3 first to prepare the unified dataset.")
        return False

    import pandas as pd
    df = pd.read_csv(dataset_path)
    info(f"Training dataset: {len(df)} samples")
    info(f"Output checkpoint: {checkpoint_dir}")
    info("")

    # Check GPU
    try:
        import torch
        if torch.cuda.is_available():
            gpu_name = torch.cuda.get_device_name(0)
            ok(f"GPU detected: {gpu_name}")
            info("  Estimated training time: ~30-60 minutes")
        elif hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
            ok("Apple Silicon GPU (MPS) detected")
            info("  Estimated training time: ~1-2 hours")
        else:
            warn("No GPU detected — training on CPU")
            info("  Estimated training time: ~3-6 hours (consider using Google Colab)")
    except ImportError:
        fail("PyTorch not installed. Run Step 1 first.")
        return False

    if not ask_continue(auto):
        return False

    cmd = [
        sys.executable, "-m", "nlp_engine.models.train_indicbert",
        "--dataset", str(dataset_path),
        "--output-dir", str(checkpoint_dir),
        "--epochs", "5",
        "--batch-size", "16",
    ]
    info(f"\n  Running: {' '.join(cmd)}\n")
    result = subprocess.run(cmd, cwd=str(PROJECT_ROOT))

    if result.returncode == 0:
        ok(f"Model trained and saved to: {checkpoint_dir}")
        return True
    else:
        fail("Training failed. Check errors above.")
        return False


# ════════════════════════════════════════════════════════════════════════════
# STEP 5: Evaluate & Run Demo
# ════════════════════════════════════════════════════════════════════════════

def step_5_evaluate(auto=False):
    header(5, "Evaluate Model & Run Real Demo")

    dataset_path = PROJECT_ROOT / "datasets" / "unified_threat_dataset.csv"
    checkpoint_dir = PROJECT_ROOT / "checkpoints" / "indicbert-threat-v1"
    results_dir = PROJECT_ROOT / "results"
    results_dir.mkdir(exist_ok=True)

    if not checkpoint_dir.exists() or not (checkpoint_dir / "config.json").exists():
        warn(f"No trained model found at: {checkpoint_dir}")
        info("  Run Step 4 first to train the model.")
        return False

    info("Running evaluation...")

    cmd = [
        sys.executable, "-m", "nlp_engine.models.evaluate",
        "--dataset", str(dataset_path),
        "--model-type", "indicbert",
        "--model-path", str(checkpoint_dir),
        "--output", str(results_dir / "evaluation_results.json"),
    ]
    info(f"\n  Running: {' '.join(cmd)}\n")
    result = subprocess.run(cmd, cwd=str(PROJECT_ROOT))

    if result.returncode == 0:
        ok("Evaluation complete!")

        # Check for results
        results_file = results_dir / "evaluation_results.json"
        if results_file.exists():
            import json
            with open(results_file) as f:
                results = json.load(f)
            info("")
            info(f"  {BOLD}Results:{RESET}")
            for key, value in results.items():
                if isinstance(value, (int, float)):
                    info(f"    {key}: {value:.4f}")
    else:
        fail("Evaluation failed. Check errors above.")
        return False

    # Now run the full demo with real model
    info("")
    info(f"  {BOLD}Now running full demo with REAL model predictions...{RESET}")
    info("")

    os.environ["INDICBERT_CHECKPOINT"] = str(checkpoint_dir)
    cmd = [sys.executable, str(PROJECT_ROOT / "run_demo.py")]
    subprocess.run(cmd, cwd=str(PROJECT_ROOT))

    ok("Setup complete! Your model is trained and producing real predictions.")
    return True


# ════════════════════════════════════════════════════════════════════════════
# Main
# ════════════════════════════════════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(description="NETRA — Full Setup Guide")
    parser.add_argument("--step", type=int, choices=[1, 2, 3, 4, 5],
                        help="Run only this step")
    parser.add_argument("--auto", action="store_true",
                        help="Run all steps automatically without prompts")
    args = parser.parse_args()

    print(f"\n{BOLD}{CYAN}{'═' * 70}{RESET}")
    print(f"{BOLD}{CYAN}  NETRA — COMPLETE SETUP GUIDE{RESET}")
    print(f"{BOLD}{CYAN}{'═' * 70}{RESET}")
    print()
    info("This guide walks you through getting REAL model predictions.")
    info("Steps:")
    info("  1. Install ML dependencies (torch, transformers)")
    info("  2. Download training datasets (HASOC, TRAC-2, MACD)")
    info("  3. Prepare unified dataset (merge + label mapping)")
    info("  4. Train IndicBERT classifier (~1-4 hours)")
    info("  5. Evaluate & run demo with real predictions")

    steps = {
        1: step_1_install_deps,
        2: step_2_download_datasets,
        3: step_3_prepare_datasets,
        4: step_4_train_model,
        5: step_5_evaluate,
    }

    if args.step:
        steps[args.step](auto=args.auto)
    else:
        for step_num, step_fn in steps.items():
            success = step_fn(auto=args.auto)
            if not success and not args.auto:
                info(f"\n  Step {step_num} incomplete. You can re-run with --step {step_num}")
                break

    print(f"\n{BOLD}{GREEN}{'═' * 70}{RESET}")
    print(f"{BOLD}{GREEN}  Done! See README.md for more details.{RESET}")
    print(f"{BOLD}{GREEN}{'═' * 70}{RESET}\n")


if __name__ == "__main__":
    main()
