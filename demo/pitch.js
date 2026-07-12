const slides = [...document.querySelectorAll('.slide')];
const dotsEl = document.getElementById('dots');
let i = 0;

slides.forEach((_, idx) => {
  const d = document.createElement('span');
  d.className = 'dot' + (idx === 0 ? ' active' : '');
  d.addEventListener('click', () => go(idx));
  dotsEl.appendChild(d);
});

function go(n) {
  i = (n + slides.length) % slides.length;
  slides.forEach((s, j) => s.classList.toggle('active', j === i));
  dotsEl.querySelectorAll('.dot').forEach((d, j) => d.classList.toggle('active', j === i));
}

document.getElementById('prev').onclick = () => go(i - 1);
document.getElementById('next').onclick = () => go(i + 1);
document.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowRight' || e.key === ' ') {
    e.preventDefault();
    go(i + 1);
  }
  if (e.key === 'ArrowLeft') go(i - 1);
});
