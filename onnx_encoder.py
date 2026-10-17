"""
Lightweight ONNX-based sentence encoder for BAAI/bge-small-en-v1.5.
Uses onnxruntime + tokenizers instead of torch + sentence-transformers, and an
INT8-quantized model (~35MB), so it fits comfortably on Render's free tier.

bge embeds a text as the normalized [CLS] token output. Search queries (but
not the passages being searched) are prefixed with an instruction.
"""
import numpy as np
import onnxruntime as ort
from tokenizers import Tokenizer

QUERY_PREFIX = "Represent this sentence for searching relevant passages: "


class OnnxEncoder:
    def __init__(self, model_dir="onnx_model", model_file="model.onnx"):
        self.session = ort.InferenceSession(
            f"{model_dir}/{model_file}",
            providers=["CPUExecutionProvider"],
        )
        self.tokenizer = Tokenizer.from_file(f"{model_dir}/tokenizer.json")
        self.tokenizer.enable_truncation(max_length=512)
        self.tokenizer.enable_padding()

    def encode_batch(self, texts):
        """Encode a list of strings into normalized 384-dim vectors."""
        encoded = self.tokenizer.encode_batch(texts)
        input_ids = np.array([e.ids for e in encoded], dtype=np.int64)
        attention_mask = np.array([e.attention_mask for e in encoded], dtype=np.int64)
        token_type_ids = np.array([e.type_ids for e in encoded], dtype=np.int64)

        outputs = self.session.run(
            None,
            {
                "input_ids": input_ids,
                "attention_mask": attention_mask,
                "token_type_ids": token_type_ids,
            },
        )
        embeddings = outputs[0][:, 0]  # [CLS] token, (batch, 384)
        return embeddings / np.linalg.norm(embeddings, axis=1, keepdims=True)

    def encode(self, text):
        """Encode a single passage."""
        return self.encode_batch([text])[0]

    def encode_query(self, text):
        """Encode a search query."""
        return self.encode(QUERY_PREFIX + text)
