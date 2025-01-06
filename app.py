from flask import Flask, request, jsonify
from flask_cors import CORS
import sys
import os
from flask import send_from_directory
from sentence_transformers import SentenceTransformer
# sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from engine import raw_query, load_centroids, get_nearby_text, get_book
# from word2vec import BahaiWord2Vec
# from simcse import SimCSE
import json

app = Flask(__name__, static_folder='../frontend/build', static_url_path='')
CORS(app, resources={r"/*": {"origins": "*"}})

# cluster_dir = 'vectordb_finetunedbert_sentence'
# cluster_dir = 'vectordb_SBERT_sentence_200c'
# cluster_dir = 'vectordb_simcse_sentence_200c'
cluster_dir = 'vectordb_SBERT_sentence_100c'
centroids = load_centroids(f"{cluster_dir}/centroids_embeddings.npy")
model = SentenceTransformer('all-MiniLM-L6-v2')         
# model = SimCSE("princeton-nlp/sup-simcse-bert-base-uncased")
# model = SentenceTransformer("fine_tuned_model/")
# model = SentenceTransformer("finetune_bert_full_dataset_4/")
# model = BahaiWord2Vec()
# model.load(model_file='word2vec_models/v3.model') 

@app.route('/query', methods=['GET'])
def handle_query():
    q = request.args.get('query', '')  # Get the query from the request data
    answers = raw_query(
        model=model,
        query=q, 
        centroids=centroids,
        cluster_dir=cluster_dir,
        n=50,
        k=20,
        )
    return jsonify({"response": answers})


@app.route('/getnearbytext', methods=['GET'])
def handle_nearbytext():
    book = request.args.get('book', '')
    section = request.args.get('section', '')
    results, section_idx = get_nearby_text(
        book_title=book,
        section=section,
        window=7
    )
    return jsonify({'response': json.loads(results), 'section_idx': str(section_idx)})


@app.route('/getbook', methods=['GET'])
def handle_getbook():
    book = request.args.get('book', '')
    results = get_book(book)
    return jsonify({'response': results})


# Serve React static files
@app.route('/')
def serve():
    return send_from_directory('../frontend/build', 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    return send_from_directory('../frontend/build', path)




if __name__ == '__main__':
    app.run(port=5000)
