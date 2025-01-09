# Synthetic Evaluation Set | Will need to redo with redone sentence embeddings
from engine import raw_query, load_centroids
from sentence_transformers import SentenceTransformer, InputExample
from sentence_transformers.evaluation import EmbeddingSimilarityEvaluator



import pandas as pd
def get_queries_and_sentences(eval_csv):
    df = pd.read_csv(eval_csv, index_col=0)
    d_rows = df.to_numpy()
    # with open('eval.txt','r') as f:
    #     eval_text = f.read()
    # queries = eval_text.split('\n')
    rows = []
    for q, s in zip(d_rows[:,0].tolist(), d_rows[:,1].tolist()):
        # q = q.replace('*** ', '').strip()
        # if len(q) < 10:
        #     continue
        rows.append([q, s])
    return rows

def evaluate_model(model, cluster_dir, eval_csv):
    examples = get_queries_and_sentences(eval_csv)
    count = 0
    score = 0
    centroids = load_centroids(f"{cluster_dir}/centroids_embeddings.npy")
    for q, s, in examples:
        
        results = raw_query(
            model=model,
            query=str(q),
            cluster_dir=cluster_dir,
            centroids=centroids,
            n=5,
            k=20,
        )

        count += 1
        
        if count % 20 == 0:
            print(count)
            print(score)


        
        for result in results:
            if s == result['Sentence']:
                score += 1
                successful=True
                break
        
    
    return score, count


def evaluate_model_with_configs(model, cluster_dir, eval_csv, n, k):
    examples = get_queries_and_sentences(eval_csv)
    count = 0
    score = 0
    centroids = load_centroids(f"{cluster_dir}/centroids_embeddings.npy")
    for q, s, in examples:
        
        results = raw_query(
            model=model,
            query=str(q),
            cluster_dir=cluster_dir,
            centroids=centroids,
            n=n,
            k=k,
        )

        count += 1
        if count % 20 == 0:
            print(count)
            print(score)
        
        successful = False
        for result in results:
            if s == result['Sentence']:
                score += 1
                successful=True
                break
        print(successful)
    
    return score, count


def evaluate_all_configs(n_vals, k_vals):
    model = SentenceTransformer('all-MiniLM-L6-v2')
    eval_files = [
        'evaluation/generated_queries2.csv',
        'evaluation/generated_questions4.csv',
        'evaluation/generated_topics2.csv'
    ]
    for n in n_vals:
        for k in k_vals:
            with open('config_eval.txt', 'a') as f:
                f.write(f"\n{'*'*71}\nn={n}, k={k}\n")
            for eval_csv in eval_files:
                score, count = evaluate_model_with_configs(
                    model=model,
                    cluster_dir='vectordb_transformer_sentence',
                    eval_csv=eval_csv,
                    n=n,
                    k=k
                )
                with open('config_eval.txt', 'a') as f:
                    f.write(f'\n{score} {count} {score/count} {eval_csv}\n')
    
# K is the number of clusters
# M is the number of results to output
# n is the number of nearest clusters to search
def experiment_1(K, M, n_vals):
    rows = []
    model = SentenceTransformer('all-MiniLM-L6-v2')
    eval_files = [
        'evaluation/generated_queries2.csv'
    ]
    for n in n_vals:
        for eval_csv in eval_files:
            score, count = evaluate_model_with_configs(
                model=model,
                cluster_dir=f'vectordb_SBERT_sentence_{K}c',
                eval_csv=eval_csv,
                n=n,
                k=M
            )
            rows.append([K, M, n, score, count, score/count])
    df = pd.DataFrame(rows, columns=['K', 'M', 'n', 'score', 'count', 'percent'])
    df.to_csv(f'experiment-1/results_K{K}.csv')    
    return df
                    
            