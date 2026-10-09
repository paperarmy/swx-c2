// 화면 표시 형식. 저장·계산은 UTC, 표시만 KST(CLAUDE.md).
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

export function fmtKst(isoUtc) {
  if (!isoUtc) return '-';
  const d = new Date(Date.parse(isoUtc) + KST_OFFSET_MS).toISOString();
  return `${d.slice(0, 10)} ${d.slice(11, 16)} KST`;
}

export const ROLE_LABEL = { user: '사용자', admin: '관리자' };
export const STATUS_LABEL = { pending: '승인 대기', active: '승인', suspended: '정지' };

export const MODE_LABEL = { live: '실시간', fallback: '저장 데이터', replay: '재현' };

// 단계 표시: 색만으로 구분하지 않도록 단계 글자를 함께 쓴다(PRD 6.2).
export function levelChip(level, rules, attrs = {}) {
  const lv = level ?? 0;
  return el('span', { ...attrs, class: `chip lv${lv} ${attrs.class ?? ''}`.trim() }, rules.levels[lv]);
}

// 요소 생성 도우미. 텍스트는 textContent로만 넣는다(HTML 삽입 금지).
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  for (const c of children) node.append(c instanceof Node ? c : String(c ?? ''));
  return node;
}
