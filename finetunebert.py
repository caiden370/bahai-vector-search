import os
import pandas as pd
import numpy as np
from sentence_transformers import SentenceTransformer, losses, InputExample
from torch.utils.data import DataLoader
import torch


def combine_data():
    gen_queries_file = os.path.join('finetune_data', 'generated_queries.csv')
    gen_questions_file = os.path.join('finetune_data', 'generated_questions4.csv')
    gen_topics_file = os.path.join('finetune_data', 'generated_topics3.csv')

    data_queries = pd.read_csv(gen_queries_file, index_col=0).to_numpy()
    data_questions = pd.read_csv(gen_questions_file, index_col=0).to_numpy()
    data_topics = pd.read_csv(gen_topics_file, index_col=0).to_numpy()

    all_examples = []
    for row in data_queries:
        all_examples.append([row[0], row[1]])
    for row in data_questions:
        all_examples.append([row[0], row[1]])
    for row in data_topics:
        all_examples.append([row[0], row[1]])

    np.random.shuffle(all_examples)

    train_examples = [
        InputExample(texts=[str(query), str(paragraph)], label=1)
        for query, paragraph in all_examples
    ]
    return train_examples


def train(train_examples):
    # Check if GPU is available and set the device
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Using device: {device}")

    # Load the model and move it to the GPU if available
    model = SentenceTransformer('all-MiniLM-L6-v2', device=device)

    # Create DataLoader
    train_dataloader = DataLoader(train_examples, shuffle=True, batch_size=32)

    # Define loss function
    train_loss = losses.CosineSimilarityLoss(model)

    # Train the model
    model.fit(
        train_objectives=[(train_dataloader, train_loss)],
        epochs=5,
        show_progress_bar=True,
        output_path='fine_tuned_model'
    )

    # Save the fine-tuned model
    model.save('finetunebert_synthetic_dataset_e5/')


# Main function to run the training
if __name__ == "__main__":
    train_examples = combine_data()
    train(train_examples)
