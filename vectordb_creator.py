# python embedding.py --model_name all-MiniLM-L6-v2 --cluster_dir sentencetransformer-embeddings
import os
import glob
import pandas as pd
import numpy as np
from sklearn.cluster import KMeans
from sentence_transformers import SentenceTransformer
import argparse
from word2vec import BahaiWord2Vec
from google_embedding import GoogleModel

def create_database(model_name, database_dir, out_dir, k=10):
    
    # Get the textual data
    folder_path = database_dir
    csv_files = glob.glob(os.path.join(folder_path, '*.csv'))
    data_frames = []
    for file in csv_files:
        df = pd.read_csv(file, index_col=0)
        data_frames.append(df)
    data = pd.concat(data_frames, ignore_index=True)
    sentences = data[data.columns[0]].tolist()

    # Initialize the Sentence Transformer model
    if model_name == 'word2vec':
        model = BahaiWord2Vec()
        model.load(model_file='word2vec_models/v3.model')  
    elif model_name == 'all-MiniLM-L6-v2':
        model = SentenceTransformer('all-MiniLM-L6-v2') 
    elif model_name == 'simcse':
        from simcse import SimCSE
        model = SimCSE("princeton-nlp/sup-simcse-bert-base-uncased")
    elif model_name == 'finetuned_bert':
        model = SentenceTransformer("fine_tuned_model/")
    elif model_name == 'finetune_bert_full':
        model = SentenceTransformer("finetune_bert_full_dataset_1/")
    elif model_name == 'google':
        model = GoogleModel()
    else:
        try:
            model = SentenceTransformer(model_name)
        except Exception as ex:
            print(ex)

    # Generate embeddings for each sentence
    embeddings = model.encode(sentences)

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
