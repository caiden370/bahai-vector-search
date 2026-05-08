"""
Lightweight ONNX-based sentence encoder.
Drop-in replacement for SentenceTransformer with an encode() method.
Uses ~50MB RAM instead of ~700MB for torch + sentence-transformers.
"""
import numpy as np
import onnxruntime as ort
from tokenizers import Tokenizer


class OnnxEncoder:
    def __init__(self, model_dir="onnx_model"):
        self.session = ort.InferenceSession(
            f"{model_dir}/model.onnx",
            providers=["CPUExecutionProvider"],
        )
        self.tokenizer = Tokenizer.from_file(f"{model_dir}/tokenizer.json")
        self.tokenizer.enable_truncation(max_length=256)
        self.tokenizer.enable_padding()

    def encode(self, text):
        """Encode a single string and return a normalized 384-dim numpy vector."""
        encoded = self.tokenizer.encode(text)
        input_ids = np.array([encoded.ids], dtype=np.int64)
        attention_mask = np.array([encoded.attention_mask], dtype=np.int64)
        token_type_ids = np.array([encoded.type_ids], dtype=np.int64)

        outputs = self.session.run(
            None,
            {
                "input_ids": input_ids,
                "attention_mask": attention_mask,
                "token_type_ids": token_type_ids,
            },
        )
        token_embeddings = outputs[0]  # (1, seq_len, 384)

        # Mean pooling
        mask = attention_mask[..., np.newaxis]  # (1, seq_len, 1)
        pooled = (token_embeddings * mask).sum(axis=1) / mask.sum(axis=1)
        embedding = pooled[0]

        # L2 normalize
        embedding = embedding / np.linalg.norm(embedding)
        return embedding
