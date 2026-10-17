"""Import Gleanings from the Writings of Bahá'u'lláh into the text databases.

Source: gleanings.json from the `bahaiwritings` npm package
(https://github.com/bahaidev/bahaiwritings), rows of [section_number, html].

    python import_gleanings.py path/to/gleanings.json

Writes database/gleanings.csv (one row per paragraph), the matching
sentence_database/gleanings.csv (one row per sentence) and appends the book
labels to book_table.csv. Re-running it replaces its own output.
"""
import html
import json
import re
import sys

import pandas as pd

TITLE = "Gleanings from the Writings of Bahá’u’lláh"
PARAGRAPH_FILE = "database/gleanings.csv"
SENTENCE_FILE = "sentence_database/gleanings.csv"
BOOK_TABLE = "book_table.csv"

# Split after terminal punctuation (and any closing quote) when the next
# sentence starts with a capital or an opening quote. Sentences stay literal
# substrings of their paragraph, which the constellation highlighter relies on.
SENTENCE_BREAK = re.compile(r"(?<=[.!?])[”’\"]?\s+(?=[“‘\"A-Z])")


def roman(n):
    out = ""
    for value, numeral in [(100, "C"), (90, "XC"), (50, "L"), (40, "XL"), (10, "X"),
                           (9, "IX"), (5, "V"), (4, "IV"), (1, "I")]:
        while n >= value:
            out += numeral
            n -= value
    return out


def paragraphs(markup):
    for chunk in re.split(r"</p>", markup):
        text = html.unescape(re.sub(r"<[^>]+>", "", chunk)).strip()
        if text:
            yield re.sub(r"\s+", " ", text)


def split_sentences(text):
    sentences, start = [], 0
    for match in SENTENCE_BREAK.finditer(text):
        sentences.append(text[start:match.end()].strip())
        start = match.end()
    sentences.append(text[start:].strip())
    return [s for s in sentences if s]


def main(source):
    rows = json.load(open(source, encoding="utf-8"))["data"]

    paragraph_rows = [{"Text": TITLE, "Section": "title", "Book": TITLE}]
    for number, markup in rows:
        book = f"{TITLE} | {roman(number)}"
        paragraph_rows.append({"Text": roman(number), "Section": f"header-{number}", "Book": book})
        for p, text in enumerate(paragraphs(markup), start=1):
            paragraph_rows.append({"Text": text, "Section": f"G{number}P{p}", "Book": book})

    sentence_rows = []
    for row in paragraph_rows:
        is_body = not (row["Section"] == "title" or row["Section"].startswith("header"))
        for sentence in (split_sentences(row["Text"]) if is_body else [row["Text"]]):
            sentence_rows.append({"Sentence": sentence, **row})

    pd.DataFrame(paragraph_rows).to_csv(PARAGRAPH_FILE)
    pd.DataFrame(sentence_rows, columns=["Sentence", "Text", "Section", "Book"]).to_csv(SENTENCE_FILE)

    table = pd.read_csv(BOOK_TABLE, index_col=0)
    table = table[table["file"] != PARAGRAPH_FILE]
    books = pd.DataFrame({"book": list(dict.fromkeys(r["Book"] for r in paragraph_rows)),
                          "file": PARAGRAPH_FILE})
    pd.concat([table, books], ignore_index=True).to_csv(BOOK_TABLE)

    print(f"{len(rows)} sections, {len(paragraph_rows)} paragraphs, {len(sentence_rows)} sentences")


if __name__ == "__main__":
    main(sys.argv[1])
