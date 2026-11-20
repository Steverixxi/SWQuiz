// Thin client for the local SWQuiz server. A native app can implement the same
// functions on top of src/core directly.

async function req(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data;
}

export const api = {
  dashboard: () => req('GET', '/api/dashboard'),
  exam: (id) => req('GET', `/api/exams/${encodeURIComponent(id)}`),
  questions: (id) => req('GET', `/api/exams/${encodeURIComponent(id)}/questions`),
  next: ({ exam = 'all', chapter, exclude } = {}) => {
    const p = new URLSearchParams({ exam });
    if (chapter) p.set('chapter', chapter);
    if (exclude) p.set('exclude', exclude);
    return req('GET', `/api/study/next?${p}`);
  },
  review: (cardId, rating, ms) => req('POST', '/api/review', { cardId, rating, ms }),
  undo: () => req('POST', '/api/undo'),
  settings: () => req('GET', '/api/settings'),
  saveSettings: (s) => req('PUT', '/api/settings', s),
  note: (examId, file) => fetch(`/exams/${encodeURIComponent(examId)}/${file}`).then((r) => r.text()),
  asset: (examId, file) => `/exams/${encodeURIComponent(examId)}/${file}`,
};
