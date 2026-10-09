// 용어 도움말 툴팁(PRD 6.4). data-tip 속성이 있는 요소에 마우스를 올리거나 키보드 초점을 주면 설명을 띄운다.
// 표·스크롤 영역에 잘리지 않도록 화면 고정(fixed) 상자 하나를 위치만 옮겨 쓴다.

let box = null;

function place(target) {
  const r = target.getBoundingClientRect();
  box.textContent = target.dataset.tip;
  box.hidden = false;
  const bw = box.offsetWidth;
  const bh = box.offsetHeight;
  const left = Math.max(8, Math.min(r.left, window.innerWidth - bw - 8));
  const below = r.bottom + 8;
  const top = below + bh > window.innerHeight - 8 ? Math.max(8, r.top - bh - 8) : below;
  box.style.left = `${left}px`;
  box.style.top = `${top}px`;
}

function hide() {
  if (box) box.hidden = true;
}

export function installTooltips() {
  if (box) return;
  box = document.createElement('div');
  box.id = 'tooltip';
  box.setAttribute('role', 'tooltip');
  box.hidden = true;
  document.body.append(box);

  const show = (e) => {
    const t = e.target.closest?.('[data-tip]');
    if (t) place(t);
  };
  document.addEventListener('mouseover', show);
  document.addEventListener('focusin', show);
  document.addEventListener('mouseout', (e) => {
    if (e.target.closest?.('[data-tip]') && !e.relatedTarget?.closest?.('[data-tip]')) hide();
  });
  document.addEventListener('focusout', hide);
  document.addEventListener('scroll', hide, true);
  document.addEventListener('keydown', (e) => e.key === 'Escape' && hide());
}

// 용어 사전에서 설명 속성 만들기: el('span', tipAttrs(glossary, 'Kp'), 'Kp')
export function tipAttrs(glossary, key, extra) {
  const text = [glossary?.terms?.[key], extra].filter(Boolean).join(' ');
  return text ? { 'data-tip': text, tabindex: '0' } : {};
}
