import React from 'react';

/**
 * Splits a paragraph around one sentence and wraps that sentence in a <mark>.
 *
 * Used by both the reading pane and the map banner so a result highlights the
 * exact sentence that matched, not the whole surrounding paragraph.
 *
 * Returns the untouched paragraph when the sentence cannot be located, so a
 * mismatch degrades to plain text rather than losing content.
 */
export function highlightSentence(text, sentence) {
  if (!text || !sentence) return text;

  const trimmed = String(sentence).trim();
  if (trimmed.length < 3) return text;

  let start = text.indexOf(trimmed);
  let length = trimmed.length;

  if (start < 0) {
    // Whitespace often differs between the indexed sentence and the rendered
    // paragraph (line wraps, non-breaking spaces), so retry on a normalised
    // copy and map the hit back onto the original string.
    const found = findLoose(text, trimmed);
    if (!found) return text;
    start = found.start;
    length = found.length;
  }

  return [
    text.slice(0, start),
    <mark className="highlight-sentence" key="sentence">
      {text.slice(start, start + length)}
    </mark>,
    text.slice(start + length),
  ];
}

/** Whitespace-insensitive substring search that reports original-string offsets. */
function findLoose(text, sentence) {
  const map = [];
  let normalized = '';
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (/\s/.test(ch)) {
      if (normalized.endsWith(' ')) continue;
      normalized += ' ';
    } else {
      normalized += ch;
    }
    map.push(i);
  }

  const target = sentence.replace(/\s+/g, ' ');
  const at = normalized.indexOf(target);
  if (at < 0) return null;

  const start = map[at];
  const endIndex = at + target.length - 1;
  const end = map[Math.min(endIndex, map.length - 1)];
  return { start, length: end - start + 1 };
}
