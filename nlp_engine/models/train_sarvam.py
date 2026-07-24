"""
LoRA/QLoRA fine-tuning script for Sarvam models on the 4-class threat task.

Uses parameter-efficient fine-tuning (PEFT) since full fine-tuning of
decoder models is prohibitively expensive.

Usage:
    python -m nlp_engine.models.train_sarvam \
        --dataset datasets/unified_threat_dataset.csv \
        --output-dir checkpoints/sarvam-threat-v1 \
        --epochs 3
"""

from __future__ import annotations

import argparse
import json
import logging
import os
from pathlib import Path

import numpy as np
import pandas as pd
import torch

logger = logging.getLogger(__name__)

THREAT_LABELS = ["Inflammatory", "IncitementToViolence", "FakeNews", "Neutral"]

# Prompt template for training
_TRAIN_PROMPT_TEMPLATE = (
    "Classify this social media post into one of: Neutral, FakeNews, Inflammatory, "
    "IncitementToViolence.\n\nPost: \"{text}\"\n\nCategory: {label}"
)
_INFERENCE_PROMPT_TEMPLATE = (
    "Classify this social media post into one of: Neutral, FakeNews, Inflammatory, "
    "IncitementToViolence.\n\nPost: \"{text}\"\n\nCategory:"
)


def train(
    dataset_path: str,
    output_dir: str = "checkpoints/sarvam-threat-v1",
    model_name: str = "sarvamai/sarvam-m",
    epochs: int = 3,
    batch_size: int = 4,
    learning_rate: float = 2e-4,
    lora_rank: int = 16,
    lora_alpha: int = 32,
    max_length: int = 512,
    seed: int = 42,
    load_in_4bit: bool = True,
):
    """
    Fine-tune a Sarvam model with LoRA for threat classification.

    Args:
        dataset_path: Path to unified CSV dataset.
        output_dir: Directory to save LoRA adapter weights.
        model_name: HuggingFace model identifier.
        epochs: Number of training epochs.
        batch_size: Training batch size (keep small due to model size).
        learning_rate: LoRA learning rate (higher than full fine-tuning).
        lora_rank: LoRA rank (lower = fewer parameters, faster).
        lora_alpha: LoRA alpha scaling factor.
        max_length: Max token length.
        seed: Random seed.
        load_in_4bit: Use QLoRA (4-bit quantization) if available.
    """
    from datasets import Dataset
    from transformers import (
        AutoTokenizer,
        AutoModelForCausalLM,
        TrainingArguments,
        Trainer,
    )

    try:
        from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training, TaskType
    except ImportError:
        logger.error("peft library required for LoRA training. Install: pip install peft")
        raise

    torch.manual_seed(seed)
    np.random.seed(seed)

    # Load dataset
    logger.info(f"Loading dataset from {dataset_path}")
    df = pd.read_csv(dataset_path)
    df = df[df["label"].isin(THREAT_LABELS)].copy()

    # Format as prompts
    df["prompt"] = df.apply(
        lambda row: _TRAIN_PROMPT_TEMPLATE.format(text=row["text"][:800], label=row["label"]),
        axis=1,
    )

    train_df = df[df["split"] == "train"]
    val_df = df[df["split"].isin(["val", "dev"])]

    if val_df.empty:
        from sklearn.model_selection import train_test_split
        train_df, val_df = train_test_split(train_df, test_size=0.15, random_state=seed)

    logger.info(f"Train: {len(train_df)}, Val: {len(val_df)}")

    # Tokenizer
    tokenizer = AutoTokenizer.from_pretrained(model_name, trust_remote_code=True)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    # Model
    load_kwargs = {"trust_remote_code": True}
    if load_in_4bit:
        try:
            from transformers import BitsAndBytesConfig
            load_kwargs["quantization_config"] = BitsAndBytesConfig(
                load_in_4bit=True,
                bnb_4bit_compute_dtype=torch.float16,
                bnb_4bit_quant_type="nf4",
                bnb_4bit_use_double_quant=True,
            )
            load_kwargs["device_map"] = "auto"
        except ImportError:
            logger.warning("bitsandbytes not available, training in full precision")
            load_kwargs["torch_dtype"] = torch.float16
            load_kwargs["device_map"] = "auto"
    else:
        load_kwargs["torch_dtype"] = torch.float16
        load_kwargs["device_map"] = "auto"

    logger.info(f"Loading base model: {model_name}")
    model = AutoModelForCausalLM.from_pretrained(model_name, **load_kwargs)

    if load_in_4bit:
        try:
            model = prepare_model_for_kbit_training(model)
        except Exception as e:
            logger.warning(f"prepare_model_for_kbit_training failed: {e}")

    # LoRA config
    lora_config = LoraConfig(
        task_type=TaskType.CAUSAL_LM,
        r=lora_rank,
        lora_alpha=lora_alpha,
        lora_dropout=0.1,
        target_modules=["q_proj", "k_proj", "v_proj", "o_proj"],
        bias="none",
    )

    model = get_peft_model(model, lora_config)
    trainable_params = sum(p.numel() for p in model.parameters() if p.requires_grad)
    total_params = sum(p.numel() for p in model.parameters())
    logger.info(
        f"LoRA: {trainable_params:,} trainable params / {total_params:,} total "
        f"({100 * trainable_params / total_params:.2f}%)"
    )

    # Tokenize
    def tokenize_fn(examples):
        tokenized = tokenizer(
            examples["prompt"],
            padding="max_length",
            truncation=True,
            max_length=max_length,
        )
        tokenized["labels"] = tokenized["input_ids"].copy()
        return tokenized

    train_ds = Dataset.from_pandas(train_df[["prompt"]]).map(tokenize_fn, batched=True)
    val_ds = Dataset.from_pandas(val_df[["prompt"]]).map(tokenize_fn, batched=True)

    # Training
    training_args = TrainingArguments(
        output_dir=output_dir,
        num_train_epochs=epochs,
        per_device_train_batch_size=batch_size,
        per_device_eval_batch_size=batch_size,
        learning_rate=learning_rate,
        warmup_ratio=0.1,
        weight_decay=0.01,
        eval_strategy="epoch",
        save_strategy="epoch",
        logging_steps=20,
        save_total_limit=2,
        seed=seed,
        fp16=True,
        gradient_accumulation_steps=4,
        report_to="none",
    )

    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=train_ds,
        eval_dataset=val_ds,
    )

    logger.info("Starting LoRA fine-tuning...")
    trainer.train()

    # Save LoRA adapter (not full model weights)
    model.save_pretrained(output_dir)
    tokenizer.save_pretrained(output_dir)
    logger.info(f"LoRA adapter saved to {output_dir}")


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")

    parser = argparse.ArgumentParser(description="Fine-tune Sarvam model with LoRA")
    parser.add_argument("--dataset", required=True, help="Path to unified CSV dataset")
    parser.add_argument("--output-dir", default="checkpoints/sarvam-threat-v1")
    parser.add_argument("--model", default="sarvamai/sarvam-m")
    parser.add_argument("--epochs", type=int, default=3)
    parser.add_argument("--batch-size", type=int, default=4)
    parser.add_argument("--lr", type=float, default=2e-4)
    parser.add_argument("--lora-rank", type=int, default=16)
    parser.add_argument("--seed", type=int, default=42)

    args = parser.parse_args()
    train(
        dataset_path=args.dataset,
        output_dir=args.output_dir,
        model_name=args.model,
        epochs=args.epochs,
        batch_size=args.batch_size,
        learning_rate=args.lr,
        lora_rank=args.lora_rank,
        seed=args.seed,
    )
