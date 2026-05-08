from flask import Flask, request, jsonify
from flask_cors import CORS
import os
from flask import send_from_directory
from onnx_encoder import OnnxEncoder
from engine import raw_query, load_centroids, get_nearby_text, get_book
import json

app = Flask(__name__, static_folder='../frontend/build', static_url_path='')
CORS(app, resources={r"/*": {"origins": "*"}})

cluster_dir = 'vectordb_SBERT_sentence_100c'
centroids = load_centroids(f"{cluster_dir}/centroids_embeddings.npy")
model = OnnxEncoder("onnx_model")

@app.route('/query', methods=['GET'])
def handle_query():
    q = request.args.get('query', '')  # Get the query from the request data
    answers = raw_query(
        model=model,
        query=q, 
        centroids=centroids,
        cluster_dir=cluster_dir,
        n=15,
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
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port)
