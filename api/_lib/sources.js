// 원천 API 주소(PRD 3.1)와 호출 도우미. 원천 주소는 이 파일에서만 관리한다.
// api/ 아래라도 _로 시작하는 폴더는 Vercel이 서버 함수로 만들지 않는다.

const NOAA = 'https://services.swpc.noaa.gov';
const GFZ = 'https://kp.gfz.de/app/json/';
const KASI = 'https://apis.data.go.kr/B090041/openapi/service/RiseSetInfoService/getLCRiseSetInfo';

export const SOURCES = {
  D1: `${NOAA}/products/noaa-scales.json`,
  D2: `${NOAA}/products/noaa-planetary-k-index.json`,
  D3: `${NOAA}/products/noaa-planetary-k-index-forecast.json`,
  D4: `${NOAA}/json/goes/primary/xrays-1-day.json`,
  D5: `${NOAA}/json/goes/primary/integral-protons-1-day.json`,
  D6: `${NOAA}/json/planetary_k_index_1m.json`,
  D13: `${NOAA}/products/alerts.json`,
};

// GFZ Kp·SN·Fobs(D8, D10, D11). 시각은 ISO 8601 UTC.
export function gfzUrl(index, startUtc, endUtc) {
  return `${GFZ}?start=${startUtc}&end=${endUtc}&index=${index}`;
}

// 한국천문연구원 위치별 출몰시각(D7). dnYn=Y는 위경도를 십진수로 넘긴다는 뜻.
export function kasiUrl(dateKst, lat, lon, serviceKey) {
  const params = new URLSearchParams({
    locdate: dateKst.replaceAll('-', ''),
    latitude: String(lat),
    longitude: String(lon),
    dnYn: 'Y',
    ServiceKey: serviceKey,
  });
  return `${KASI}?${params}`;
}

async function request(url, { timeoutMs = 5000, fetchImpl = fetch } = {}) {
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res;
}

export async function fetchJson(url, opts) {
  return (await request(url, opts)).json();
}

export async function fetchText(url, opts) {
  return (await request(url, opts)).text();
}
