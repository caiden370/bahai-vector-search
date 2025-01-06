# bahai-vector-search % python engine.py --k 10 --n 2 --model_name word2vec --cluster_dir word2vec_embeddings
# python engine.py --k 10 --n 2 --model_name all-MiniLM-L6-v2 --cluster_dir sentencetransformer-embeddings
import os
import argparse
import numpy as np
import pandas as pd
from sklearn.metrics.pairwise import cosine_similarity
from sentence_transformers import SentenceTransformer
from word2vec import BahaiWord2Vec
import torch
import json
import numpy as np
import heapq
from sklearn.metrics.pairwise import cosine_similarity

def load_centroids(centroids_path):
    return np.load(centroids_path)

def load_cluster_embeddings(cluster_dir, cluster_ids):
    embeddings_list = []
    data_frames = []
    for cluster_id in cluster_ids:
        embeddings_path = os.path.join(cluster_dir, f'cluster_{cluster_id}_embeddings.npy')
        data_path = os.path.join(cluster_dir, f'cluster_{cluster_id}.csv')

        if os.path.exists(embeddings_path) and os.path.exists(data_path):
            cluster_embeddings = np.load(embeddings_path)
            cluster_data = pd.read_csv(data_path)

            embeddings_list.append(cluster_embeddings)
            data_frames.append(cluster_data)
        else:
            print(f"Cluster files for cluster {cluster_id} not found.")

    if embeddings_list:
        embeddings = np.vstack(embeddings_list)
        data = pd.concat(data_frames, ignore_index=True)
    else:
        embeddings = np.array([])
        data = pd.DataFrame()

    # filtered_df = data[~data['Section'].str.contains('header', case=False, na=False)]
    # filtered_df = filtered_df[~data['Section'].str.contains('title', case=False, na=False)]
    # filtered_embeddings = embeddings[filtered_df.index]
    filtered_df = data
    filtered_embeddings = embeddings

    # return embeddings, data
    return filtered_embeddings, filtered_df


def find_nearest_neighbors_optimized(query_embedding, embeddings, k):
    # Compute cosine similarities for all embeddings
    similarities = cosine_similarity([query_embedding], embeddings)[0]
    
    # Use a heap to maintain the top-k highest similarities
    # Convert similarities to negative to use a min-heap for max similarity
    heap = []
    for idx, similarity in enumerate(similarities):
        if len(heap) < k:
            heapq.heappush(heap, (similarity, idx))  # Push (similarity, index) onto the heap
        else:
            heapq.heappushpop(heap, (similarity, idx))  # Push and pop in a single step

    # Extract the top-k indices and their corresponding similarities
    top_k = heapq.nlargest(k, heap)  # Get k largest elements from the heap
    top_k_indices = [item[1] for item in top_k]
    top_k_similarities = [item[0] for item in top_k]
    
    # Sort results by similarity in descending order
    sorted_results = sorted(zip(top_k_indices, top_k_similarities), key=lambda x: -x[1])
    top_k_indices = [item[0] for item in sorted_results]
    top_k_similarities = [item[1] for item in sorted_results]
    
    return top_k_indices, top_k_similarities


def find_nearest_neighbors(query_embedding, embeddings, k):
    similarities = cosine_similarity([query_embedding], embeddings)[0]
    # similarities = torch.cosine_similarity(torch.tensor(query_embedding), torch.tensor(embeddings), dim=1)[0]
    top_k_indices = np.argsort(similarities)[-k:][::-1]
    top_k_similarities = similarities[top_k_indices]
    return top_k_indices, top_k_similarities

def query(model, query, centroids, n, cluster_dir, k):
    # Encode the query
    query_embedding = np.array(model.encode(query))

    # Find the n closest centroids
    centroid_similarities = cosine_similarity([query_embedding], centroids)[0]
    # centroid_similarities = torch.cosine_similarity(torch.tensor(query_embedding), torch.tensor(centroids), dim=1)[0]
    top_n_centroid_indices = np.argsort(centroid_similarities)[-n:][::-1]

    # Load embeddings and data for the selected clusters
    embeddings, data = load_cluster_embeddings(f"{cluster_dir}/clusters", top_n_centroid_indices)

    if embeddings.size == 0:
        print("No embeddings found in the selected clusters.")
        return

    # Find the k nearest neighbors in the selected clusters
    top_k_indices, similarities = find_nearest_neighbors_optimized(query_embedding, embeddings, k)

    # Retrieve and display the results
    results = data.iloc[top_k_indices].copy()
    results['Similarity'] = similarities  

    print(f'\n{"-"*80}\nTop {k} results:\n{"-"*80}\n')

    for idx, row in results.iterrows():
        print(f"Similarity: {row['Similarity']:.4f}")
        print(f"Text: {row['Text']}")
        print(f"Section: {row['Section']}")
        print(f"Book: {row['Book']}")
        print('-' * 80) 


def raw_query(model, query, centroids, n, cluster_dir, k):
    # print(centroids)
    # Encode the query
    query_embedding = np.array(model.encode(query))

    # Find the n closest centroids
    centroid_similarities = cosine_similarity([query_embedding], centroids)[0]
    # centroid_similarities = torch.cosine_similarity(torch.tensor(query_embedding), torch.tensor(centroids), dim=1)[0]
    top_n_centroid_indices = np.argsort(centroid_similarities)[-n:][::-1]

    # Load embeddings and data for the selected clusters
    embeddings, data = load_cluster_embeddings(f"{cluster_dir}/clusters", top_n_centroid_indices)

    if embeddings.size == 0:
        print("No embeddings found in the selected clusters.")
        return

    # Find the k nearest neighbors in the selected clusters
    top_k_indices, similarities = find_nearest_neighbors(query_embedding, embeddings, k)

    # Retrieve and display the results
    results = data.iloc[top_k_indices].copy()
    results['Similarity'] = similarities  

    texts = []
    for idx, row in results.iterrows():
        result = {
            'Similarity':row['Similarity'],
            'Text':row['Text'],
            'Sentence':row['Sentence'],
            'Section':row['Section'],
            'Book':row['Book']
        }
        texts.append(result)
    return texts

def get_book(book_title):
    df = pd.read_csv('book_table.csv', index_col=0)
    file = df[df['book'] == book_title]['file'].iloc[0]
    df = pd.read_csv(file, index_col=0)
    return json.loads(df[df['Book'] == book_title].to_json())


def get_nearby_text(book_title, section, window=5):
    df = pd.read_csv('book_table.csv', index_col=0)
    file = df[df['book'] == book_title]['file'].iloc[0]
    df = pd.read_csv(file)
    section_idx = df[df['Section'] == section][df.columns[0]].iloc[0]
    df = df.rename(columns={df.columns[0]: "idx"})
    print(section_idx)
    return df.iloc[max(section_idx-window,0):min(section_idx+window, len(df))].to_json(), section_idx





    






# n = num centroids to search
# k = top-k similar
def run_engine(cluster_dir, model_name, n, k):

    centroids = load_centroids(f"{cluster_dir}/centroids_embeddings.npy")

    # Initialize the Sentence Transformer model
    if model_name == 'word2vec':
        model = BahaiWord2Vec()
        model.load(model_file='word2vec_models/word2vec_version1.model')
    elif model_name == 'all-MiniLM-L6-v2':
        model = SentenceTransformer('all-MiniLM-L6-v2')
    elif model_name == 'simcse':
        from simcse import SimCSE
        model = SimCSE("princeton-nlp/sup-simcse-bert-base-uncased")
    else:
        raise Exception('Invalid model_name argument')
    
    while(True):

        query_text = input("What do you want me to look for?  ")

        query(
            model=model,
            query=query_text,
            centroids=centroids,
            n=n,
            cluster_dir=cluster_dir,
            k=k
        )  



def main():
    parser = argparse.ArgumentParser(description='Find the k nearest neighbors to a query.')
    parser.add_argument('--k', type=int, default=5, help='Number of nearest neighbors to find.')
    parser.add_argument('--n', type=int, default=3, help='Number of closest centroids to consider.')
    parser.add_argument('--model_name', type=str, default='word2vec', help='Name of the Sentence Transformer model.')
    parser.add_argument('--cluster_dir', type=str, default='clusters', help='Directory containing all of the embeddings.')

    args = parser.parse_args()

    # Load centroids
    centroids = load_centroids(f"{args.cluster_dir}/centroids_embeddings.npy")

    # Initialize the Sentence Transformer model
    if args.model_name == 'word2vec':
        model = BahaiWord2Vec()
        model.load(model_file='word2vec_models/v3.model')  
    elif args.model_name == 'all-MiniLM-L6-v2':
        model = SentenceTransformer('all-MiniLM-L6-v2') 
    elif args.model_name == 'simcse':
        from simcse import SimCSE
        model = SimCSE("princeton-nlp/sup-simcse-bert-base-uncased")
    elif args.model_name == 'finetuned_bert':
        model = SentenceTransformer("fine_tuned_model/")
    else:
        raise Exception('Invalid model_name argument') 
    

    while(True):

        query_text = input("What do you want me to look for?  ")

        query(
            model=model,
            query=query_text,
            centroids=centroids,
            n=args.n,
            cluster_dir=args.cluster_dir,
            k=args.k
        )



if __name__ == '__main__':
    main()
