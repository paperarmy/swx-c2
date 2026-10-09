// 탭4 장애 원인 판별(PRD 6장) — 순수 함수. 질문·점수·판정 기준은 rules.diagnosis에서 읽는다.

// answers: { 질문id: 'yes' | 'no' | 'unknown' } → { score, answered, verdict, reasons }
export function diagnose(answers, rules) {
  const cfg = rules.diagnosis;
  let score = 0;
  let answered = 0;
  const reasons = [];
  for (const q of cfg.questions) {
    const a = answers[q.id];
    if (a !== 'yes' && a !== 'no') continue;
    answered++;
    const s = q.score[a] ?? 0;
    score += s;
    if (s !== 0) reasons.push({ id: q.id, delta: s, text: `${a === 'yes' ? '예' : '아니오'}: ${q.why}`, source: q.source ?? null });
  }
  const verdict = answered === 0 ? null : cfg.verdicts.find((v) => score >= v.minScore);
  return { score, answered, verdict, reasons };
}

// 현재 데이터로 답을 제안한다(사용자가 바꿀 수 있음). 반환: { 질문id: { answer, text } }
export function suggestAnswers(state) {
  const hints = {};
  if (state?.korea) {
    hints.daytime = { answer: state.korea.isDaytime ? 'yes' : 'no', text: `현재 한반도 ${state.korea.isDaytime ? '주간' : '야간'}` };
  }
  if (state?.scales) {
    const events = [];
    if ((state.scales.R ?? 0) >= 1) events.push(`X선 ${state.metrics?.xrayClass ?? ''}(R${state.scales.R})`);
    if (state.srb?.active) events.push('태양전파폭발 경보');
    if ((state.scales.G ?? 0) >= 1) events.push(`지자기폭풍 G${state.scales.G}`);
    hints.event = events.length
      ? { answer: 'yes', text: `현재 진행 중: ${events.join(', ')}` }
      : { answer: 'no', text: '현재 진행 중인 우주기상 사건 없음' };
  }
  return hints;
}
