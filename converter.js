'use strict';

// Standard Israeli Hebrew keyboard layout.
// Maps: character produced by Hebrew layout -> character the same physical key produces in English.
const HEBREW_TO_ENGLISH = {
  '/': 'q', "'": 'w', 'ק': 'e', 'ר': 'r', 'א': 't',
  'ט': 'y', 'ו': 'u', 'ן': 'i', 'ם': 'o', 'פ': 'p',
  'ש': 'a', 'ד': 's', 'ג': 'd', 'כ': 'f', 'ע': 'g',
  'י': 'h', 'ח': 'j', 'ל': 'k', 'ך': 'l', 'ף': ';',
  'ז': 'z', 'ס': 'x', 'ב': 'c', 'ה': 'v', 'נ': 'b',
  'מ': 'n', 'צ': 'm', 'ת': ',', 'ץ': '.', '.': '/'
};

const ENGLISH_TO_HEBREW = {};
for (const [heb, eng] of Object.entries(HEBREW_TO_ENGLISH)) {
  ENGLISH_TO_HEBREW[eng] = heb;
  if (/[a-z]/.test(eng)) ENGLISH_TO_HEBREW[eng.toUpperCase()] = heb;
}

function hasHebrew(text) {
  return /[\u05D0-\u05EA]/.test(text);
}

function convert(text, direction = 'auto') {
  if (!text) return '';
  text = String(text); // guard against non-string clipboard values
  let dir = direction;
  if (dir === 'auto') dir = hasHebrew(text) ? 'heb-to-eng' : 'eng-to-heb';
  const map = dir === 'heb-to-eng' ? HEBREW_TO_ENGLISH : ENGLISH_TO_HEBREW;
  return text.split('').map(ch => map[ch] ?? ch).join('');
}

module.exports = { convert, hasHebrew, HEBREW_TO_ENGLISH, ENGLISH_TO_HEBREW };
