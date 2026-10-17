"""Authorship of each source file, shared by the search engine and the
constellation builder."""
import os

# Source file -> author. book_table.csv maps every book label onto these
# files, so this is the complete authorship mapping for the corpus.
FILE_AUTHORS = {
    "a_travelers_narrative": "‘Abdu’l‑Bahá",
    "bahai_administration": "Shoghi Effendi",
    "citadel_of_faith": "Shoghi Effendi",
    "epistle-to-the-son-of-the-wolf": "Bahá’u’lláh",
    "from_the_letter_ba_to_the_letter_ha": "Bahá’u’lláh",
    "gems-of-divine-mysteries": "Bahá’u’lláh",
    "gleanings": "Bahá’u’lláh",
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


def author_for_file(path):
    stem = os.path.splitext(os.path.basename(str(path)))[0]
    return FILE_AUTHORS.get(stem, "Bahá’u’lláh")
