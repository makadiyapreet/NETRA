"""
Dataset preparation: loads, merges, and maps HASOC, TRAC-2, HingCorpus, and MACD
datasets onto the 4-class threat taxonomy.

Label Mapping Assumptions:
──────────────────────────
| Source     | Original Label                      | → Our Taxonomy             |
|------------|-------------------------------------|----------------------------|
| HASOC      | HATE                                | IncitementToViolence       |
| HASOC      | OFFN (Offensive)                    | Inflammatory               |
| HASOC      | PRFN (Profane)                      | Inflammatory               |
| HASOC      | NOT (Not offensive)                 | Neutral                    |
| TRAC-2     | OAG (Overtly Aggressive)            | IncitementToViolence       |
| TRAC-2     | CAG (Covertly Aggressive)           | Inflammatory               |
| TRAC-2     | NAG (Non-aggressive)                | Neutral                    |
| MACD       | 0 (Abusive)                         | Inflammatory               |
| MACD       | 1 (Non-abusive)                     | Neutral                    |
| HingCorpus | (unlabeled, used for MLM pretraining)| N/A                       |

FakeNews Note:
─────────────
None of these datasets directly contain a "FakeNews" label. FakeNews detection is
handled by a rule-based heuristic layer in the inference pipeline that checks for
urgency markers (ALL-CAPS, "BREAKING", "URGENT", "SHARE"), unverified claims, and
conspiracy language patterns. To improve FakeNews classification, supplement with
dedicated datasets (e.g., Constraint shared task, Indian Fake News Dataset from AIKosh).
"""

from __future__ import annotations

import csv
import json
import logging
import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

import pandas as pd

logger = logging.getLogger(__name__)

# ── Constants ───────────────────────────────────────────────────────────────

THREAT_LABELS = ["Inflammatory", "IncitementToViolence", "FakeNews", "Neutral"]
LABEL_TO_ID = {label: i for i, label in enumerate(THREAT_LABELS)}
ID_TO_LABEL = {i: label for i, label in enumerate(THREAT_LABELS)}

# Default paths (relative to project root)
DEFAULT_RAW_DATASETS_DIR = "raw_datasets"


@dataclass
class DatasetStats:
    """Statistics for a loaded dataset."""

    name: str
    total_samples: int
    per_class: dict[str, int] = field(default_factory=dict)
    per_language: dict[str, int] = field(default_factory=dict)
    splits: dict[str, int] = field(default_factory=dict)


# ── HASOC Loader ────────────────────────────────────────────────────────────

HASOC_LABEL_MAP = {
    # Fine-grained (sub-task B)
    "HATE": "IncitementToViolence",
    "OFFN": "Inflammatory",
    "PRFN": "Inflammatory",
    "NONE": "Neutral",
    # Coarse (sub-task A)
    "HOF": "Inflammatory",  # Default; overridden by fine-grained if available
    "NOT": "Neutral",
}


def load_hasoc(
    data_dir: str | Path,
    languages: list[str] | None = None,
) -> pd.DataFrame:
    """
    Load HASOC dataset (multiple years/languages) and map to our taxonomy.

    Expected directory structure:
        data_dir/
        ├── hasoc2019/
        │   ├── hindi_train.tsv
        │   ├── hindi_test.tsv
        │   └── ...
        ├── hasoc2021/
        │   └── ...
        └── hasoc2023/
            └── gujarati_train.tsv

    HASOC datasets require registration at https://hasocfire.github.io/.
    After registration, download and extract into raw_datasets/hasoc/.

    Args:
        data_dir: Path to the HASOC data directory.
        languages: Filter to specific languages (e.g., ["hindi", "gujarati"]).

    Returns:
        DataFrame with columns: text, label, language, source_dataset, split
    """
    data_dir = Path(data_dir)
    if not data_dir.exists():
        logger.warning(
            f"HASOC directory not found: {data_dir}. "
            "Register at https://hasocfire.github.io/ to download the dataset."
        )
        return pd.DataFrame(columns=["text", "label", "language", "source_dataset", "split"])

    records: list[dict] = []
    lang_map = {"hindi": "hi", "hin": "hi", "gujarati": "gu", "guj": "gu", "english": "en", "eng": "en"}

    for year_dir in sorted(data_dir.iterdir()):
        if not year_dir.is_dir():
            continue

        for file_path in sorted(year_dir.glob("*.tsv")):
            fname = file_path.stem.lower()

            # Detect language from filename
            detected_lang = None
            for lang_key, lang_code in lang_map.items():
                if lang_key in fname:
                    detected_lang = lang_code
                    break

            if detected_lang is None:
                continue

            if languages and detected_lang not in languages:
                continue

            # Detect split from filename
            split = "train" if "train" in fname else ("test" if "test" in fname else "val")

            try:
                df = pd.read_csv(file_path, sep="\t", quoting=csv.QUOTE_NONE, on_bad_lines="skip")

                # HASOC files have varying column names
                text_col = None
                label_col = None
                for col in df.columns:
                    cl = col.lower().strip()
                    if cl in ("text", "tweet", "comment"):
                        text_col = col
                    elif cl in ("task_1", "task1", "label", "sub_task_a", "task_a"):
                        label_col = col

                if text_col is None or label_col is None:
                    logger.warning(f"Could not identify text/label columns in {file_path}")
                    continue

                # Also check for fine-grained labels (sub-task B)
                fine_col = None
                for col in df.columns:
                    cl = col.lower().strip()
                    if cl in ("task_2", "task2", "sub_task_b", "task_b"):
                        fine_col = col

                for _, row in df.iterrows():
                    text = str(row[text_col]).strip()
                    if not text or text == "nan":
                        continue

                    raw_label = str(row[label_col]).strip().upper()

                    # Prefer fine-grained label if available
                    if fine_col and pd.notna(row.get(fine_col)):
                        fine_label = str(row[fine_col]).strip().upper()
                        mapped = HASOC_LABEL_MAP.get(fine_label)
                        if mapped:
                            raw_label = fine_label

                    mapped_label = HASOC_LABEL_MAP.get(raw_label, None)
                    if mapped_label is None:
                        logger.debug(f"Unknown HASOC label '{raw_label}' in {file_path}")
                        continue

                    records.append({
                        "text": text,
                        "label": mapped_label,
                        "language": detected_lang,
                        "source_dataset": f"hasoc_{year_dir.name}",
                        "split": split,
                    })

            except Exception as e:
                logger.warning(f"Error loading {file_path}: {e}")

    logger.info(f"Loaded {len(records)} samples from HASOC")
    return pd.DataFrame(records)


# ── TRAC-2 Loader ──────────────────────────────────────────────────────────

TRAC2_LABEL_MAP = {
    "OAG": "IncitementToViolence",
    "CAG": "Inflammatory",
    "NAG": "Neutral",
}


def load_trac2(data_dir: str | Path) -> pd.DataFrame:
    """
    Load TRAC-2 dataset from GitHub (kmi-linguistics/trac-2).

    Expected directory structure:
        data_dir/
        ├── hindi/
        │   ├── agr_hi_train.csv
        │   └── agr_hi_dev.csv
        ├── eng/
        │   └── ...
        └── ben/
            └── ...

    Args:
        data_dir: Path to the TRAC-2 data directory.

    Returns:
        DataFrame with columns: text, label, language, source_dataset, split
    """
    data_dir = Path(data_dir)
    if not data_dir.exists():
        logger.warning(
            f"TRAC-2 directory not found: {data_dir}. "
            "Clone from: git clone https://github.com/kmi-linguistics/trac-2"
        )
        return pd.DataFrame(columns=["text", "label", "language", "source_dataset", "split"])

    records: list[dict] = []
    lang_map = {"hindi": "hi", "hin": "hi", "hi": "hi", "eng": "en", "en": "en", "ben": "bn"}

    for csv_file in data_dir.rglob("*.csv"):
        fname = csv_file.stem.lower()

        # Detect language
        detected_lang = "hi"  # Default to Hindi
        for lang_key, lang_code in lang_map.items():
            if lang_key in fname or lang_key in str(csv_file.parent.name).lower():
                detected_lang = lang_code
                break

        # Only load Hindi and English
        if detected_lang not in ("hi", "en"):
            continue

        split = "train" if "train" in fname else ("val" if "dev" in fname else "test")

        try:
            df = pd.read_csv(csv_file)

            text_col = None
            label_col = None
            for col in df.columns:
                cl = col.lower().strip()
                if "text" in cl or "tweet" in cl or cl == "text":
                    text_col = col
                elif "label" in cl or "sub_task" in cl or cl in ("aggression", "task"):
                    label_col = col

            if text_col is None or label_col is None:
                # Try positional (TRAC-2 sometimes uses column indices)
                if len(df.columns) >= 2:
                    text_col = df.columns[-2]
                    label_col = df.columns[-1]
                else:
                    continue

            for _, row in df.iterrows():
                text = str(row[text_col]).strip()
                raw_label = str(row[label_col]).strip().upper()

                mapped_label = TRAC2_LABEL_MAP.get(raw_label)
                if mapped_label is None:
                    continue

                records.append({
                    "text": text,
                    "label": mapped_label,
                    "language": detected_lang,
                    "source_dataset": "trac2",
                    "split": split,
                })

        except Exception as e:
            logger.warning(f"Error loading TRAC-2 file {csv_file}: {e}")

    logger.info(f"Loaded {len(records)} samples from TRAC-2")
    return pd.DataFrame(records)


# ── MACD Loader ─────────────────────────────────────────────────────────────

MACD_LABEL_MAP = {
    0: "Inflammatory",   # Abusive
    "0": "Inflammatory",
    1: "Neutral",        # Non-abusive
    "1": "Neutral",
    "abusive": "Inflammatory",
    "non-abusive": "Neutral",
}


def load_macd(data_dir: str | Path) -> pd.DataFrame:
    """
    Load MACD (Multilingual Abusive Comment Detection) dataset.

    Source: https://github.com/ShareChatAI/MACD

    Expected directory structure:
        data_dir/
        └── dataset/
            ├── hindi_train.csv
            ├── hindi_val.csv
            ├── hindi_test.csv
            └── ...

    Args:
        data_dir: Path to the MACD data directory.

    Returns:
        DataFrame with columns: text, label, language, source_dataset, split
    """
    data_dir = Path(data_dir)
    if not data_dir.exists():
        logger.warning(
            f"MACD directory not found: {data_dir}. "
            "Clone from: git clone https://github.com/ShareChatAI/MACD"
        )
        return pd.DataFrame(columns=["text", "label", "language", "source_dataset", "split"])

    records: list[dict] = []

    # Search in dataset/ subdirectory and root
    search_dirs = [data_dir / "dataset", data_dir]

    for search_dir in search_dirs:
        if not search_dir.exists():
            continue

        for csv_file in search_dir.glob("*.csv"):
            fname = csv_file.stem.lower()

            # Only load Hindi (primary target language)
            if "hindi" not in fname and "hi" not in fname:
                continue

            split = "train" if "train" in fname else ("val" if "val" in fname else "test")

            try:
                df = pd.read_csv(csv_file)

                # MACD typically has 'text' and 'label' columns
                text_col = None
                label_col = None
                for col in df.columns:
                    cl = col.lower().strip()
                    if cl in ("text", "comment", "sentence"):
                        text_col = col
                    elif cl in ("label", "class", "category"):
                        label_col = col

                if text_col is None or label_col is None:
                    if len(df.columns) >= 2:
                        text_col = df.columns[0]
                        label_col = df.columns[1]
                    else:
                        continue

                for _, row in df.iterrows():
                    text = str(row[text_col]).strip()
                    raw_label = row[label_col]

                    mapped_label = MACD_LABEL_MAP.get(raw_label)
                    if mapped_label is None:
                        mapped_label = MACD_LABEL_MAP.get(str(raw_label).strip().lower())
                    if mapped_label is None:
                        continue

                    records.append({
                        "text": text,
                        "label": mapped_label,
                        "language": "hi",
                        "source_dataset": "macd",
                        "split": split,
                    })

            except Exception as e:
                logger.warning(f"Error loading MACD file {csv_file}: {e}")

    logger.info(f"Loaded {len(records)} samples from MACD")
    return pd.DataFrame(records)


# ── AIKosh Stub ─────────────────────────────────────────────────────────────

def download_aikosh() -> pd.DataFrame:
    """
    Stub for downloading supplementary datasets from AIKosh.

    AIKosh (https://aikosh.indiaai.gov.in) provides free access to curated
    Indian-language datasets and a free GPU sandbox. However, it requires
    manual registration with an Indian phone number / institutional email.

    Steps to register:
    1. Visit https://aikosh.indiaai.gov.in
    2. Create an account (requires Indian institutional email or phone verification)
    3. Search for relevant datasets:
       - "Hindi hate speech"
       - "Gujarati text classification"
       - "Indian fake news"
       - "Code-mixed sentiment"
    4. Download datasets and place in raw_datasets/aikosh/
    5. Update this function to load the specific dataset format

    Raises:
        NotImplementedError: Always, until AIKosh datasets are manually downloaded.
    """
    raise NotImplementedError(
        "AIKosh datasets require manual registration at https://aikosh.indiaai.gov.in. "
        "See docstring for detailed steps. After downloading, update this function "
        "to load the specific dataset format."
    )


# ── FakeNews Heuristic Augmentation ────────────────────────────────────────

# Patterns that suggest FakeNews content (applied as a post-processing layer)
_FAKENEWS_PATTERNS = {
    "urgency_markers": [
        "BREAKING", "URGENT", "SHARE KARO", "JALDI", "फैलाओ", "ફેલાવો",
        "SHARE NOW", "MUST WATCH", "WAKE UP",
    ],
    "conspiracy_markers": [
        "global elite", "chip", "track", "agenda", "planned",
        "छुपा रहे", "plan hai", "sab jhooth",
    ],
    "unverified_claim_markers": [
        "sources say", "confirmed reports", "insider info",
        "सूत्रों के अनुसार", "पुष्टि", "CONFIRM",
    ],
}


def apply_fakenews_heuristic(
    df: pd.DataFrame,
    text_col: str = "text",
    label_col: str = "label",
    confidence_threshold: float = 0.6,
) -> pd.DataFrame:
    """
    Post-process: re-label some Inflammatory/Neutral posts as FakeNews
    if they match FakeNews heuristic patterns.

    This is a workaround for the lack of FakeNews labels in HASOC/TRAC-2/MACD.
    Only applied to training data to give the model some FakeNews examples.

    Args:
        df: DataFrame with text and label columns.
        text_col: Name of the text column.
        label_col: Name of the label column.
        confidence_threshold: Minimum pattern-match score to reclassify.

    Returns:
        DataFrame with some labels changed to FakeNews.
    """
    import re as _re

    def fakenews_score(text: str) -> float:
        text_upper = text.upper()
        score = 0.0
        total_patterns = 0

        for category, patterns in _FAKENEWS_PATTERNS.items():
            for pattern in patterns:
                total_patterns += 1
                if pattern.upper() in text_upper:
                    score += 1.0

        # Bonus for ALL-CAPS words (urgency)
        caps_words = len(_re.findall(r"\b[A-Z]{3,}\b", text))
        if caps_words >= 3:
            score += 1.0
            total_patterns += 1

        # Bonus for multiple exclamation marks
        if text.count("!!!") >= 1 or text.count("!!!") >= 1:
            score += 0.5
            total_patterns += 1

        return score / max(total_patterns, 1)

    df = df.copy()
    mask = df[label_col].isin(["Inflammatory", "Neutral"])
    fake_scores = df.loc[mask, text_col].apply(fakenews_score)
    reclassify_mask = fake_scores >= confidence_threshold

    # Limit reclassification to avoid over-labeling
    reclassify_indices = fake_scores[reclassify_mask].index
    df.loc[reclassify_indices, label_col] = "FakeNews"

    n_reclassified = len(reclassify_indices)
    logger.info(f"FakeNews heuristic reclassified {n_reclassified} samples")

    return df


# ── Main Merge Function ────────────────────────────────────────────────────

def prepare_unified_dataset(
    raw_dir: str | Path = DEFAULT_RAW_DATASETS_DIR,
    output_path: Optional[str | Path] = None,
    apply_fakenews: bool = True,
) -> pd.DataFrame:
    """
    Load all available datasets, merge, and produce a unified training dataset.

    Args:
        raw_dir: Root directory containing dataset subdirectories.
        output_path: Optional path to save the unified CSV.
        apply_fakenews: Whether to apply FakeNews heuristic relabeling.

    Returns:
        Unified DataFrame with columns: text, label, language, source_dataset, split
    """
    raw_dir = Path(raw_dir)
    dfs: list[pd.DataFrame] = []

    # Load each dataset
    hasoc_dir = raw_dir / "hasoc"
    if hasoc_dir.exists():
        dfs.append(load_hasoc(hasoc_dir, languages=["hi", "gu", "en"]))

    trac2_dir = raw_dir / "trac-2"
    if trac2_dir.exists():
        dfs.append(load_trac2(trac2_dir))

    macd_dir = raw_dir / "macd"
    if macd_dir.exists():
        dfs.append(load_macd(macd_dir))

    # Try AIKosh (will log a warning if not available)
    try:
        dfs.append(download_aikosh())
    except NotImplementedError:
        logger.info("AIKosh datasets not available (requires manual registration)")

    if not dfs or all(df.empty for df in dfs):
        logger.warning(
            "No datasets loaded! Download at least one dataset:\n"
            "  - HASOC: https://hasocfire.github.io/\n"
            "  - TRAC-2: git clone https://github.com/kmi-linguistics/trac-2\n"
            "  - MACD: git clone https://github.com/ShareChatAI/MACD"
        )
        return pd.DataFrame(columns=["text", "label", "language", "source_dataset", "split"])

    # Merge all datasets
    unified = pd.concat([df for df in dfs if not df.empty], ignore_index=True)

    # Clean
    unified = unified.dropna(subset=["text", "label"])
    unified = unified[unified["text"].str.strip().str.len() > 0]
    unified = unified.drop_duplicates(subset=["text"], keep="first")

    # Apply FakeNews heuristic
    if apply_fakenews:
        unified = apply_fakenews_heuristic(unified)

    # Validate labels
    valid_mask = unified["label"].isin(THREAT_LABELS)
    if not valid_mask.all():
        n_invalid = (~valid_mask).sum()
        logger.warning(f"Dropping {n_invalid} samples with invalid labels")
        unified = unified[valid_mask]

    # Log statistics
    stats = DatasetStats(
        name="unified",
        total_samples=len(unified),
        per_class=unified["label"].value_counts().to_dict(),
        per_language=unified["language"].value_counts().to_dict(),
        splits=unified["split"].value_counts().to_dict(),
    )
    logger.info(f"Unified dataset: {stats.total_samples} samples")
    logger.info(f"  Per class: {stats.per_class}")
    logger.info(f"  Per language: {stats.per_language}")
    logger.info(f"  Per split: {stats.splits}")

    # Save if output path specified
    if output_path:
        output_path = Path(output_path)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        unified.to_csv(output_path, index=False)
        logger.info(f"Saved unified dataset to {output_path}")

    return unified


# ── CLI Entry Point ─────────────────────────────────────────────────────────

if __name__ == "__main__":
    import argparse
    import sys

    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")

    parser = argparse.ArgumentParser(description="Prepare unified threat classification dataset")
    parser.add_argument(
        "--raw-dir",
        default=DEFAULT_RAW_DATASETS_DIR,
        help="Root directory containing raw dataset subdirectories",
    )
    parser.add_argument(
        "--output",
        default="datasets/unified_threat_dataset.csv",
        help="Output path for the unified CSV",
    )
    parser.add_argument(
        "--no-fakenews",
        action="store_true",
        help="Disable FakeNews heuristic relabeling",
    )

    args = parser.parse_args()

    df = prepare_unified_dataset(
        raw_dir=args.raw_dir,
        output_path=args.output,
        apply_fakenews=not args.no_fakenews,
    )

    if df.empty:
        print("No data loaded. See warnings above for download instructions.", file=sys.stderr)
        sys.exit(1)

    print(f"\n✅ Dataset prepared: {len(df)} samples → {args.output}")
    print(f"   Classes: {dict(df['label'].value_counts())}")
    print(f"   Languages: {dict(df['language'].value_counts())}")
