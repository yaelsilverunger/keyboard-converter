const { convert, hasHebrew } = require('./converter');

const inputEl  = document.getElementById('input');
const outputEl = document.getElementById('output');
const autoLabel = document.getElementById('auto-label');
const copyBtn  = document.getElementById('copy-btn');
const swapBtn  = document.getElementById('swap-btn');
const dirBtns  = document.querySelectorAll('.dir-btn');

let direction = 'auto';

function updateOutput() {
  const text = inputEl.value;
  if (!text.trim()) {
    outputEl.value = '';
    autoLabel.textContent = '';
    return;
  }

  let effectiveDir = direction;
  if (direction === 'auto') {
    effectiveDir = hasHebrew(text) ? 'heb-to-eng' : 'eng-to-heb';
    autoLabel.textContent = effectiveDir === 'heb-to-eng'
      ? 'Detected: Hebrew typed, converting to English'
      : 'Detected: English typed, converting to Hebrew';
  } else {
    autoLabel.textContent = '';
  }

  outputEl.value = convert(text, effectiveDir);
}

dirBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    dirBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    direction = btn.dataset.dir;
    updateOutput();
  });
});

inputEl.addEventListener('input', updateOutput);

copyBtn.addEventListener('click', () => {
  if (!outputEl.value) return;
  navigator.clipboard.writeText(outputEl.value).then(() => {
    copyBtn.textContent = 'Copied!';
    setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1500);
  });
});

swapBtn.addEventListener('click', () => {
  if (!outputEl.value) return;
  inputEl.value = outputEl.value;
  updateOutput();
});

document.querySelector('[data-dir="auto"]').classList.add('active');
