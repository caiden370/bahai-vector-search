"""
One-time script to export all-MiniLM-L6-v2 to ONNX format.
Run this locally (requires torch + sentence-transformers installed).
The output onnx_model/ directory should be committed/deployed.
"""
import os
import torch
from sentence_transformers import SentenceTransformer
from transformers import AutoTokenizer

MODEL_NAME = "all-MiniLM-L6-v2"
OUTPUT_DIR = "onnx_model"

os.makedirs(OUTPUT_DIR, exist_ok=True)

# Load the model
model = SentenceTransformer(MODEL_NAME)
transformer = model[0].auto_model
tokenizer = AutoTokenizer.from_pretrained(f"sentence-transformers/{MODEL_NAME}")

# Save tokenizer (needed at inference time)
tokenizer.save_pretrained(OUTPUT_DIR)

# Create dummy inputs
dummy_input = tokenizer("This is a test sentence", return_tensors="pt")
input_ids = dummy_input["input_ids"]
attention_mask = dummy_input["attention_mask"]
token_type_ids = dummy_input.get("token_type_ids", torch.zeros_like(input_ids))

# Export to ONNX
torch.onnx.export(
    transformer,
    (input_ids, attention_mask, token_type_ids),
    os.path.join(OUTPUT_DIR, "model.onnx"),
    input_names=["input_ids", "attention_mask", "token_type_ids"],
    output_names=["last_hidden_state"],
    dynamic_axes={
        "input_ids": {0: "batch_size", 1: "sequence_length"},
        "attention_mask": {0: "batch_size", 1: "sequence_length"},
        "token_type_ids": {0: "batch_size", 1: "sequence_length"},
        "last_hidden_state": {0: "batch_size", 1: "sequence_length"},
    },
    opset_version=14,
)

print(f"Model exported to {OUTPUT_DIR}/model.onnx")
print(f"Tokenizer saved to {OUTPUT_DIR}/")

# Verify the export produces matching embeddings
import numpy as np
import onnxruntime as ort

session = ort.InferenceSession(os.path.join(OUTPUT_DIR, "model.onnx"))
test_sentence = "The earth is but one country, and mankind its citizens."

# Original embedding
original_emb = model.encode(test_sentence)

# ONNX embedding
inputs = tokenizer(test_sentence, return_tensors="np", padding=True, truncation=True, max_length=256)
onnx_inputs = {
    "input_ids": inputs["input_ids"],
    "attention_mask": inputs["attention_mask"],
    "token_type_ids": inputs.get("token_type_ids", np.zeros_like(inputs["input_ids"])),
}
outputs = session.run(None, onnx_inputs)
token_embeddings = outputs[0]
# Mean pooling
mask = inputs["attention_mask"][..., np.newaxis]
onnx_emb = (token_embeddings * mask).sum(axis=1) / mask.sum(axis=1)
onnx_emb = onnx_emb[0]
# Normalize
onnx_emb = onnx_emb / np.linalg.norm(onnx_emb)

cos_sim = np.dot(original_emb, onnx_emb) / (np.linalg.norm(original_emb) * np.linalg.norm(onnx_emb))
print(f"Cosine similarity between PyTorch and ONNX: {cos_sim:.6f}")
assert cos_sim > 0.999, f"Embeddings diverged! cos_sim={cos_sim}"
print("Verification passed — embeddings match.")
