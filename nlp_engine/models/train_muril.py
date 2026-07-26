"""
Fine-tuning script for MuRIL (google/muril-base-cased) on the 4-class threat
classification task.

MuRIL is pre-trained on 17 Indian languages + transliterated text, making it
well-suited for code-mixed Hinglish and Romanized Indic social media content.

Usage:
    python -m nlp_engine.models.train_muril \
        --dataset datasets/unified_threat_dataset.csv \
        --output-dir checkpoints/muril-threat-v1 \
        --epochs 5 \
        --batch-size 32
"""

from __future__ import annotations

import argparse
import logging
import os
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import torch
from sklearn.utils.class_weight import compute_class_weight

logger = logging.getLogger(__name__)

THREAT_LABELS = ["Inflammatory", "IncitementToViolence", "FakeNews", "Neutral"]
LABEL_TO_ID = {label: i for i, label in enumerate(THREAT_LABELS)}


def compute_metrics(eval_pred):
    """Compute metrics for the HuggingFace Trainer."""
    from sklearn.metrics import accuracy_score, f1_score, precision_score, recall_score

    logits, labels = eval_pred
    predictions = np.argmax(logits, axis=-1)

    return {
        "accuracy": accuracy_score(labels, predictions),
        "f1_macro": f1_score(labels, predictions, average="macro", zero_division=0),
        "f1_weighted": f1_score(labels, predictions, average="weighted", zero_division=0),
        "precision_macro": precision_score(labels, predictions, average="macro", zero_division=0),
        "recall_macro": recall_score(labels, predictions, average="macro", zero_division=0),
    }


class WeightedCrossEntropyTrainer:
    """Custom Trainer with class-weighted loss to handle label imbalance."""

    def __init__(self, class_weights: torch.Tensor, **kwargs):
        from transformers import Trainer

        self.class_weights = class_weights

        class _WCETrainer(Trainer):
            def __init__(self_inner, *args, class_weights=None, **kw):
                super().__init__(*args, **kw)
                self_inner._class_weights = class_weights

            def compute_loss(self_inner, model, inputs, return_outputs=False, **kwargs):
                labels = inputs.pop("labels")
                outputs = model(**inputs)
                logits = outputs.logits

                weight = self_inner._class_weights.to(logits.device)
                loss = torch.nn.functional.cross_entropy(logits, labels, weight=weight)

                return (loss, outputs) if return_outputs else loss

        self._trainer_cls = _WCETrainer
        self._class_weights = class_weights

    def create(self, **trainer_kwargs):
        return self._trainer_cls(class_weights=self._class_weights, **trainer_kwargs)


def train(
    dataset_path: str,
    output_dir: str = "checkpoints/muril-threat-v1",
    model_name: str = "google/muril-base-cased",
    epochs: int = 5,
    batch_size: int = 32,
    learning_rate: float = 2e-5,
    warmup_ratio: float = 0.1,
    weight_decay: float = 0.01,
    max_length: int = 512,
    seed: int = 42,
):
    """
    Fine-tune MuRIL for threat classification.

    Args:
        dataset_path: Path to unified CSV (from prepare_datasets.py).
        output_dir: Directory to save the fine-tuned model.
        model_name: HuggingFace model identifier.
        epochs: Number of training epochs.
        batch_size: Training batch size.
        learning_rate: Initial learning rate.
        warmup_ratio: Fraction of steps for LR warmup.
        weight_decay: Weight decay for AdamW.
        max_length: Max token length.
        seed: Random seed.
    """
    from datasets import Dataset
    from transformers import (
        AutoTokenizer,
        AutoModelForSequenceClassification,
        TrainingArguments,
        Trainer,
        EarlyStoppingCallback,
    )

    # Set seed
    torch.manual_seed(seed)
    np.random.seed(seed)

    # Load dataset
    logger.info(f"Loading dataset from {dataset_path}")
    df = pd.read_csv(dataset_path)
    df = df[df["label"].isin(THREAT_LABELS)].copy()
    df["label_id"] = df["label"].map(LABEL_TO_ID)

    # Split
    train_df = df[df["split"] == "train"]
    val_df = df[df["split"].isin(["val", "dev"])]

    if val_df.empty:
        from sklearn.model_selection import train_test_split

        train_df, val_df = train_test_split(
            train_df, test_size=0.15, stratify=train_df["label_id"], random_state=seed
        )

    logger.info(f"Train: {len(train_df)}, Val: {len(val_df)}")
    logger.info(f"Class distribution (train): {dict(train_df['label'].value_counts())}")

    # Compute class weights
    class_weights = compute_class_weight(
        class_weight="balanced",
        classes=np.arange(len(THREAT_LABELS)),
        y=train_df["label_id"].values,
    )
    class_weights_tensor = torch.tensor(class_weights, dtype=torch.float32)
    logger.info(f"Class weights: {dict(zip(THREAT_LABELS, class_weights))}")

    # Tokenizer
    tokenizer = AutoTokenizer.from_pretrained(model_name)

    def tokenize_fn(examples):
        return tokenizer(
            examples["text"],
            padding="max_length",
            truncation=True,
            max_length=max_length,
        )

    # Create HuggingFace datasets
    train_ds = Dataset.from_pandas(
        train_df[["text", "label_id"]].rename(columns={"label_id": "labels"})
    )
    val_ds = Dataset.from_pandas(
        val_df[["text", "label_id"]].rename(columns={"label_id": "labels"})
    )

    train_ds = train_ds.map(tokenize_fn, batched=True)
    val_ds = val_ds.map(tokenize_fn, batched=True)

    # Model
    model = AutoModelForSequenceClassification.from_pretrained(
        model_name,
        num_labels=len(THREAT_LABELS),
        id2label={i: label for i, label in enumerate(THREAT_LABELS)},
        label2id=LABEL_TO_ID,
        ignore_mismatched_sizes=True,
    )

    # Training arguments
    training_args = TrainingArguments(
        output_dir=output_dir,
        num_train_epochs=epochs,
        per_device_train_batch_size=batch_size,
        per_device_eval_batch_size=batch_size * 2,
        learning_rate=learning_rate,
        warmup_ratio=warmup_ratio,
        weight_decay=weight_decay,
        eval_strategy="epoch",
        save_strategy="epoch",
        load_best_model_at_end=True,
        metric_for_best_model="f1_macro",
        greater_is_better=True,
        logging_steps=50,
        save_total_limit=3,
        seed=seed,
        fp16=torch.cuda.is_available(),
        report_to="none",
    )

    # Trainer with weighted loss
    weighted_trainer = WeightedCrossEntropyTrainer(class_weights=class_weights_tensor)
    trainer = weighted_trainer.create(
        model=model,
        args=training_args,
        train_dataset=train_ds,
        eval_dataset=val_ds,
        compute_metrics=compute_metrics,
        callbacks=[EarlyStoppingCallback(early_stopping_patience=2)],
    )

    # Train
    logger.info("Starting MuRIL fine-tuning...")
    train_result = trainer.train()
    logger.info(f"Training complete. Results: {train_result.metrics}")

    # Save best model
    trainer.save_model(output_dir)
    tokenizer.save_pretrained(output_dir)
    logger.info(f"Model saved to {output_dir}")

    # Evaluate on validation set
    eval_results = trainer.evaluate()
    logger.info(f"Validation results: {eval_results}")

    return eval_results


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")

    parser = argparse.ArgumentParser(description="Fine-tune MuRIL for threat classification")
    parser.add_argument("--dataset", required=True, help="Path to unified CSV dataset")
    parser.add_argument("--output-dir", default="checkpoints/muril-threat-v1")
    parser.add_argument("--model", default="google/muril-base-cased")
    parser.add_argument("--epochs", type=int, default=5)
    parser.add_argument("--batch-size", type=int, default=32)
    parser.add_argument("--lr", type=float, default=2e-5)
    parser.add_argument("--seed", type=int, default=42)

    args = parser.parse_args()
    train(
        dataset_path=args.dataset,
        output_dir=args.output_dir,
        model_name=args.model,
        epochs=args.epochs,
        batch_size=args.batch_size,
        learning_rate=args.lr,
        seed=args.seed,
    )
