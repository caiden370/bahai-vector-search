# python vectordb_creator.py --model_name bge-small --database_dir sentence_database --out_dir vectordb_bge_small_100c --k 100
import os
import glob
import pandas as pd
import numpy as np
from sklearn.cluster import KMeans
import argparse

# Fragments left by splitting on "." after abbreviations ("Mrs.", "D.C.") or
# before closing quotes; they match nothing useful and crowd out real results.
MIN_WORDS = 4


def load_sentences(database_dir):
    csv_files = sorted(glob.glob(os.path.join(database_dir, '*.csv')))
    data = pd.concat([pd.read_csv(file, index_col=0) for file in csv_files], ignore_index=True)
    data = data[data['Sentence'].fillna('').str.split().str.len() >= MIN_WORDS]
    data = data.drop_duplicates(subset=['Sentence', 'Book'])
    return data.reset_index(drop=True)


def encode_onnx(model, sentences, batch_size=64):
    # Batch similar lengths together to keep padding small
    order = np.argsort([len(s) for s in sentences])
    embeddings = np.zeros((len(sentences), 384), dtype=np.float32)
    for start in range(0, len(order), batch_size):
        batch = order[start:start + batch_size]
        embeddings[batch] = model.encode_batch([sentences[i] for i in batch])
    return embeddings


def create_database(model_name, database_dir, out_dir, k=10):

    # Get the textual data
    data = load_sentences(database_dir)
    sentences = data['Sentence'].astype(str).tolist()

    # Initialize the model and generate embeddings for each sentence
    if model_name == 'bge-small':
        from onnx_encoder import OnnxEncoder
        embeddings = encode_onnx(OnnxEncoder('onnx_model'), sentences)
    else:
        from sentence_transformers import SentenceTransformer
        embeddings = SentenceTransformer(model_name).encode(sentences)

    # Perform k-means clustering
    kmeans = KMeans(n_clusters=k, random_state=42)
    kmeans.fit(embeddings)
    labels = kmeans.labels_

    # Add the cluster labels to the dataframe
    data['Cluster'] = labels

    # Create a directory to store cluster files
    output_dir = f'{out_dir}/clusters'
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)

    # Save embeddings and data for each cluster
    for cluster_id in range(k):
        cluster_data = data[data['Cluster'] == cluster_id]
        cluster_embeddings = embeddings[labels == cluster_id]

        # Save cluster data to CSV
        cluster_data.to_csv(f'{output_dir}/cluster_{cluster_id}.csv', index=False)

        # Save embeddings to a NumPy file
        np.save(f'{output_dir}/cluster_{cluster_id}_embeddings.npy', cluster_embeddings)

    # Save centroid embeddings to a separate file
    centroids = kmeans.cluster_centers_
    np.save(f'{out_dir}/centroids_embeddings.npy', centroids)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Embed and cluster the sentence database.')
    parser.add_argument('--model_name', type=str, default='bge-small')
    parser.add_argument('--database_dir', type=str, default='sentence_database')
    parser.add_argument('--out_dir', type=str, default='vectordb_bge_small_100c')
    parser.add_argument('--k', type=int, default=100)
    args = parser.parse_args()
    create_database(args.model_name, args.database_dir, args.out_dir, args.k)
