"""Offline builder for the constellation map static assets.

Run this LOCALLY, never on the server:

    venv_precompute\\Scripts\\python.exe constellation_builder.py

It reads the existing vector database, projects every sentence embedding down to
two dimensions, derives a topic label for each KMeans cluster, and writes a set
of small static files into frontend/public/constellation/.

The Flask server does no part of this work at runtime - it only gains a
``PointId`` passthrough so search results can be located on the prebuilt map.
"""

import argparse
import json
import os
import re

import numpy as np
import pandas as pd
from sklearn.feature_extraction.text import CountVectorizer, TfidfVectorizer

CLUSTER_DIR = "vectordb_SBERT_sentence_100c"
BOOK_TABLE = "book_table.csv"
OUT_DIR = os.path.join("frontend", "public", "constellation")
COORD_CACHE = os.path.join(CLUSTER_DIR, "constellation_coords.npy")

# Source file -> author. book_table.csv maps all 297 book labels onto these 35
# files, so this is the complete authorship mapping for the corpus.
FILE_AUTHORS = {
    "a_travelers_narrative": "‘Abdu’l‑Bahá",
    "bahai_administration": "Shoghi Effendi",
    "citadel_of_faith": "Shoghi Effendi",
    "epistle-to-the-son-of-the-wolf": "Bahá’u’lláh",
    "from_the_letter_ba_to_the_letter_ha": "Bahá’u’lláh",
    "gems-of-divine-mysteries": "Bahá’u’lláh",
    "god_passes_by": "Shoghi Effendi",
    "hidden-words-arabic": "Bahá’u’lláh",
    "hidden-words-persian": "Bahá’u’lláh",
    "kitab-i-aqdas": "Bahá’u’lláh",
    "kitab-i-aqdas-q-and-a-combined": "Bahá’u’lláh",
    "kitab-i-aqdas-notes": "Universal House of Justice",
    "kitab-i-iqan-part1": "Bahá’u’lláh",
    "kitab-i-iqan-part2": "Bahá’u’lláh",
    "light_of_the_world": "‘Abdu’l‑Bahá",
    "memorials_of_the_faithful": "‘Abdu’l‑Bahá",
    "paris_talks": "‘Abdu’l‑Bahá",
    "prayers_and_meditation_by_bahaullah": "Bahá’u’lláh",
    "promulagation_of_world_peace": "‘Abdu’l‑Bahá",
    "rashh-i-ama": "Bahá’u’lláh",
    "secret_of_divine_civilization": "‘Abdu’l‑Bahá",
    "selections_from_the_writings_of_abdulbaha": "‘Abdu’l‑Bahá",
    "selections_from_the_writings_of_the_bab": "The Báb",
    "seven_valleys": "Bahá’u’lláh",
    "some_answered_questions": "‘Abdu’l‑Bahá",
    "tablet_to_dr_auguste_forel": "‘Abdu’l‑Bahá",
    "tablets_of_the_divine_plan": "‘Abdu’l‑Bahá",
    "tablets_to_the_hague": "‘Abdu’l‑Bahá",
    "tablets-of-bahaullah": "Bahá’u’lláh",
    "the_advent_of_divine_justice": "Shoghi Effendi",
    "the_decisive_hour": "Shoghi Effendi",
    "the_promised_day_is_come": "Shoghi Effendi",
    "the_world_order_of_bahaullah": "Shoghi Effendi",
    "twelve_table_talks": "‘Abdu’l‑Bahá",
    "will_and_testament_of_abdulbaha": "‘Abdu’l‑Bahá",
}

# Star colours, tuned to read clearly against a dark sky.
AUTHOR_COLORS = {
    "Bahá’u’lláh": "#FFCE73",
    "The Báb": "#FF92AE",
    "‘Abdu’l‑Bahá": "#79E0DC",
    "Shoghi Effendi": "#B3A4FF",
    "Universal House of Justice": "#9BE3A5",
}
AUTHOR_ORDER = [
    "Bahá’u’lláh",
    "The Báb",
    "‘Abdu’l‑Bahá",
    "Shoghi Effendi",
    "Universal House of Justice",
]

# Devotional vocabulary is so evenly spread through the corpus that it swamps
# any distinctiveness score; drop it so cluster labels describe what actually
# separates one region of the map from another.
EXTRA_STOPWORDS = {
    "god", "lord", "thee", "thou", "thy", "thine", "ye", "hath", "doth", "unto",
    "shall", "may", "must", "upon", "hence", "therefore", "verily", "said",
    "say", "saith", "man", "men", "one", "thing", "things", "great", "greater",
    "greatest", "let", "us", "thereof", "whoso", "art", "wert", "hast", "didst",
    "day", "days", "world", "people", "peoples", "name", "names", "words",
    "word", "written", "book", "books", "yea", "nay", "every", "cause",
    "power", "divine", "holy", "blessed", "exalted", "glory", "praise",
    "hero", "unto", "whom", "whose", "thus", "yet", "even", "also", "made",
    "make", "given", "give", "come", "came", "shalt", "wilt", "canst", "dost",
    "hadst", "wouldst", "couldst", "shouldst", "mayest", "doeth", "knoweth",
    "othe", "ofthe", "tothe",
}

# Archaic conjugations (-eth / -est) are a stylistic fingerprint of the
# translations, not a topic, and they dominate any raw frequency ranking.
ARCHAIC = re.compile(r"(eth|est)$", re.IGNORECASE)


def author_for_file(path):
    stem = os.path.splitext(os.path.basename(str(path)))[0]
    return FILE_AUTHORS.get(stem, "Bahá’u’lláh")


def load_corpus():
    """Concatenate every cluster in id order, defining the global PointId space."""
    clusters_path = os.path.join(CLUSTER_DIR, "clusters")
    frames, embeddings, cluster_ids = [], [], []

    cluster_id = 0
    while True:
        csv_path = os.path.join(clusters_path, f"cluster_{cluster_id}.csv")
        npy_path = os.path.join(clusters_path, f"cluster_{cluster_id}_embeddings.npy")
        if not (os.path.exists(csv_path) and os.path.exists(npy_path)):
            break

        frame = pd.read_csv(csv_path)
        vectors = np.load(npy_path)
        if len(frame) != len(vectors):
            raise RuntimeError(
                f"cluster {cluster_id}: {len(frame)} rows but {len(vectors)} vectors"
            )

        frames.append(frame)
        embeddings.append(vectors)
        cluster_ids.append(np.full(len(frame), cluster_id, dtype=np.int32))
        cluster_id += 1

    if not frames:
        raise RuntimeError(f"no clusters found under {clusters_path}")

    data = pd.concat(frames, ignore_index=True)
    data["Cluster"] = np.concatenate(cluster_ids)
    return data, np.vstack(embeddings).astype(np.float32), cluster_id


def stamp_point_ids(n_clusters, data):
    """Write PointId back into the cluster CSVs.

    This is what lets /query return a map position for each hit without the
    server computing anything.
    """
    clusters_path = os.path.join(CLUSTER_DIR, "clusters")
    offset = 0
    for cluster_id in range(n_clusters):
        csv_path = os.path.join(clusters_path, f"cluster_{cluster_id}.csv")
        frame = pd.read_csv(csv_path)
        frame["PointId"] = np.arange(offset, offset + len(frame), dtype=np.int64)
        frame.to_csv(csv_path, index=False)
        offset += len(frame)

    if offset != len(data):
        raise RuntimeError(f"stamped {offset} ids for {len(data)} rows")
    return offset


def project(embeddings, seed, reuse):
    """Reduce to 2-D, reusing a cached projection when one is available.

    UMAP is the slow part of this script; caching lets topic labelling be
    re-tuned in seconds.
    """
    if reuse and os.path.exists(COORD_CACHE):
        coords = np.load(COORD_CACHE)
        if len(coords) == len(embeddings):
            print(f"reusing cached projection from {COORD_CACHE}")
            return coords
        print("cached projection has the wrong length; reprojecting")

    import umap

    reducer = umap.UMAP(
        n_components=2,
        n_neighbors=25,
        min_dist=0.25,
        metric="cosine",
        random_state=seed,
        verbose=True,
    )
    coords = reducer.fit_transform(embeddings).astype(np.float32)
    np.save(COORD_CACHE, coords)
    return coords


def topic_labels(data, coords, n_clusters, terms_per_topic=2):
    """One short label per KMeans cluster, placed at the cluster's median point.

    Terms are ranked by ``p_cluster * log(p_cluster / p_global)`` - a
    distinctiveness score weighted by how much of the cluster the term actually
    accounts for. Plain TF-IDF ranks rare archaic conjugations at the top here;
    weighting by cluster share pushes genuinely thematic vocabulary up instead.

    Labels sit at the median of member positions rather than the projected
    centroid, which guarantees each one lands inside the blob it names and so
    works as a navigation landmark.
    """
    documents = []
    for cluster_id in range(n_clusters):
        member_text = data.loc[data["Cluster"] == cluster_id, "Sentence"]
        documents.append(" ".join(member_text.dropna().astype(str)))

    stopwords = set(TfidfVectorizer(stop_words="english").get_stop_words())
    stopwords |= EXTRA_STOPWORDS

    vectorizer = CountVectorizer(
        stop_words=sorted(stopwords),
        min_df=4,
        token_pattern=r"(?u)\b[a-zA-Z][a-zA-Z\-]{3,}\b",
    )
    counts = vectorizer.fit_transform(documents).toarray().astype(np.float64)
    vocabulary = np.array(vectorizer.get_feature_names_out())

    keep = np.array(
        [not ARCHAIC.search(term) for term in vocabulary]
    ) & (counts.sum(axis=0) >= 25)
    counts = counts[:, keep]
    vocabulary = vocabulary[keep]

    global_p = counts.sum(axis=0) / max(counts.sum(), 1.0)
    cluster_p = counts / np.maximum(counts.sum(axis=1, keepdims=True), 1.0)
    scores = cluster_p * np.log(np.maximum(cluster_p, 1e-12) / np.maximum(global_p, 1e-12))

    labels = []
    used = set()
    for cluster_id in range(n_clusters):
        member_mask = data["Cluster"].values == cluster_id
        if not member_mask.any():
            continue

        # Prefer terms not already used as another cluster's label, so adjacent
        # regions of the map don't end up with duplicate names.
        ranked = [
            vocabulary[i]
            for i in np.argsort(scores[cluster_id])[::-1][:40]
            if scores[cluster_id][i] > 0
        ]
        fresh = [term for term in ranked if term not in used]
        chosen = (fresh + ranked)[:terms_per_topic]
        if not chosen:
            continue
        used.update(chosen)

        text = " · ".join(term.capitalize() for term in chosen)
        centre = np.median(coords[member_mask], axis=0)
        labels.append(
            {
                "text": re.sub(r"\s+", " ", text).strip(),
                "x": float(centre[0]),
                "y": float(centre[1]),
                "weight": int(member_mask.sum()),
            }
        )

    labels.sort(key=lambda item: -item["weight"])
    return labels


def sentence_offsets(data):
    """Locate each sentence inside its own section text.

    The sentence is normally a literal substring of the paragraph, so a plain
    find is enough. Where it is not (stray whitespace, a trailing ellipsis) we
    fall back to matching a prefix, and finally to a zero span, which the client
    reads as "highlight the whole paragraph".
    """
    uint16_max = 65535
    spans = np.zeros((len(data), 2), dtype=np.uint16)
    exact = 0
    partial = 0

    sentences = data["Sentence"].fillna("").astype(str).to_numpy()
    texts = data["Text"].fillna("").astype(str).to_numpy()

    for i in range(len(data)):
        sentence = sentences[i].strip()
        text = texts[i]
        if not sentence or not text:
            continue

        start = text.find(sentence)
        if start >= 0:
            exact += 1
        else:
            # Try progressively shorter prefixes: the tail of a sentence is
            # what usually differs, not its opening.
            for cut in (0.75, 0.5, 0.3):
                probe = sentence[: max(20, int(len(sentence) * cut))]
                start = text.find(probe)
                if start >= 0:
                    sentence = probe
                    partial += 1
                    break

        if start < 0 or start > uint16_max or len(sentence) > uint16_max:
            continue

        spans[i] = (start, len(sentence))

    missed = len(data) - exact - partial
    print(f"  sentence spans: {exact} exact, {partial} partial, {missed} unresolved")
    return spans


def quantize(coords, labels):
    """Map the projection onto the Int16 grid, keeping aspect ratio.

    Bounds come from percentiles rather than min/max: UMAP always throws off a
    handful of far-flung outliers, and scaling to those would squash the entire
    corpus into a small blob in the middle of the screen. Outliers are clipped
    to the edge of the grid instead.
    """
    low = np.percentile(coords, 0.4, axis=0)
    high = np.percentile(coords, 99.6, axis=0)
    span = float(max(high[0] - low[0], high[1] - low[1])) or 1.0
    centre = (low + high) / 2.0
    limit = 32000.0

    def to_grid(points):
        scaled = (points - centre) / span * 2.0 * limit
        return np.clip(scaled, -limit, limit)

    grid = to_grid(coords)
    for label in labels:
        gx, gy = to_grid(np.array([[label["x"], label["y"]]], dtype=np.float32))[0]
        label["x"] = int(round(float(gx)))
        label["y"] = int(round(float(gy)))

    # The region the bulk of the corpus occupies. Outliers are clipped to the
    # grid edge, so measuring the point bounds on the client would just recover
    # the full grid; publishing the frame lets the default view sit snugly on
    # the stars instead.
    frame = [
        int(round((high[0] - low[0]) / span * limit)),
        int(round((high[1] - low[1]) / span * limit)),
    ]

    inside = int(np.sum(np.all(np.abs(grid) < limit, axis=1)))
    print(f"  {inside}/{len(grid)} points inside the frame")

    return np.rint(grid).astype(np.int16), limit, frame


def build(seed, skip_stamp, reproject):
    data, embeddings, n_clusters = load_corpus()
    print(f"{len(data)} points across {n_clusters} clusters")

    if not skip_stamp:
        stamp_point_ids(n_clusters, data)
        print("stamped PointId into cluster CSVs")

    coords = project(embeddings, seed, reuse=not reproject)

    labels = topic_labels(data, coords, n_clusters)
    print(f"derived {len(labels)} topic labels")

    grid, limit, frame = quantize(coords, labels)

    book_table = pd.read_csv(BOOK_TABLE, index_col=0)
    book_to_file = dict(zip(book_table["book"].astype(str), book_table["file"]))

    books = sorted(data["Book"].dropna().astype(str).unique())
    book_ids = {title: index for index, title in enumerate(books)}
    if len(books) > 65535:
        raise RuntimeError("too many books for a Uint16 book id")

    author_ids = {name: index for index, name in enumerate(AUTHOR_ORDER)}
    book_authors = []
    for title in books:
        author = author_for_file(book_to_file.get(title, ""))
        book_authors.append(author_ids[author])

    titles = data["Book"].fillna("").astype(str)
    point_books = titles.map(book_ids).fillna(0).astype(np.uint16).to_numpy()
    sections = data["Section"].fillna("").astype(str).tolist()

    # Where each star's sentence sits inside its section's paragraph. The
    # reading pane and the map banner both receive the whole paragraph, so
    # these offsets are what let them highlight the one sentence the star
    # actually represents. Two Uint16s per point rather than shipping 52k
    # sentence strings.
    sentence_spans = sentence_offsets(data)

    os.makedirs(OUT_DIR, exist_ok=True)

    # points.bin: all x, then all y, then all book ids, then sentence start and
    # length - flat typed arrays the browser can hand straight to WebGL with no
    # per-point parsing.
    with open(os.path.join(OUT_DIR, "points.bin"), "wb") as handle:
        handle.write(np.ascontiguousarray(grid[:, 0], dtype="<i2").tobytes())
        handle.write(np.ascontiguousarray(grid[:, 1], dtype="<i2").tobytes())
        handle.write(np.ascontiguousarray(point_books, dtype="<u2").tobytes())
        handle.write(np.ascontiguousarray(sentence_spans[:, 0], dtype="<u2").tobytes())
        handle.write(np.ascontiguousarray(sentence_spans[:, 1], dtype="<u2").tobytes())

    with open(os.path.join(OUT_DIR, "sections.json"), "w", encoding="utf-8") as handle:
        json.dump(sections, handle, ensure_ascii=False, separators=(",", ":"))

    meta = {
        "count": int(len(data)),
        "extent": int(limit),
        "frame": frame,
        "books": books,
        "bookAuthors": book_authors,
        "authors": [
            {"name": name, "color": AUTHOR_COLORS[name]} for name in AUTHOR_ORDER
        ],
        "topics": labels,
    }
    with open(os.path.join(OUT_DIR, "meta.json"), "w", encoding="utf-8") as handle:
        json.dump(meta, handle, ensure_ascii=False, separators=(",", ":"))

    for name in ("points.bin", "sections.json", "meta.json"):
        size = os.path.getsize(os.path.join(OUT_DIR, name))
        print(f"  {name}: {size / 1024:.0f} KB")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument(
        "--skip-stamp",
        action="store_true",
        help="leave the cluster CSVs alone (PointId already written)",
    )
    parser.add_argument(
        "--reproject",
        action="store_true",
        help="ignore the cached projection and re-run UMAP",
    )
    build(**vars(parser.parse_args()))


if __name__ == "__main__":
    main()
