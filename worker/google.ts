type GoogleCredentials = {
  client_email: string;
  private_key: string;
  token_uri?: string;
};

export type GoogleEnv = {
  GOOGLE_CREDENTIALS_JSON: string;
  GOOGLE_SHEET_ID: string;
  GOOGLE_CALENDAR_ID: string;
};

type CalendarEvent = {
  id?: string; status?: string; summary?: string; location?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
};

const encoder = new TextEncoder();
let tokenCache: { token: string; expiresAt: number } | null = null;

function base64Url(data: Uint8Array | string) {
  const bytes = typeof data === "string" ? encoder.encode(data) : data;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function accessToken(env: GoogleEnv) {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) return tokenCache.token;
  const credentials = JSON.parse(env.GOOGLE_CREDENTIALS_JSON) as GoogleCredentials;
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64Url(JSON.stringify({
    iss: credentials.client_email,
    scope: "https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/calendar.readonly",
    aud: credentials.token_uri || "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }));
  const pem = credentials.private_key.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, "");
  const raw = Uint8Array.from(atob(pem), (char) => char.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", raw, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, encoder.encode(`${header}.${claim}`));
  const assertion = `${header}.${claim}.${base64Url(new Uint8Array(signature))}`;
  const response = await fetch(credentials.token_uri || "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  if (!response.ok) throw new Error(`Google 登入失敗 (${response.status})`);
  const result = await response.json() as { access_token: string; expires_in: number };
  tokenCache = { token: result.access_token, expiresAt: Date.now() + result.expires_in * 1000 };
  return result.access_token;
}

async function googleFetch(env: GoogleEnv, url: string, init?: RequestInit) {
  const token = await accessToken(env);
  const response = await fetch(url, { ...init, headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...(init?.headers || {}) } });
  if (!response.ok) throw new Error(`Google API 錯誤 (${response.status}): ${await response.text()}`);
  return response;
}

function rowsToObjects(values: string[][] = []) {
  const [headers = [], ...rows] = values;
  return rows.filter((row) => row.some(Boolean)).map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] || ""])));
}

function taipeiDay(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function taipeiTime(date: Date) {
  return new Intl.DateTimeFormat("zh-TW", { timeZone: "Asia/Taipei", hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
}

export async function getBootstrap(env: GoogleEnv) {
  const token = await accessToken(env);
  const sheetRanges = ["學員資料!A1:L", "上課紀錄!A1:M", "課程方案!A1:I"];
  const sheetsUrl = new URL(`https://sheets.googleapis.com/v4/spreadsheets/${env.GOOGLE_SHEET_ID}/values:batchGet`);
  sheetRanges.forEach((range) => sheetsUrl.searchParams.append("ranges", range));
  const start = new Date(); start.setDate(start.getDate() - 7);
  const end = new Date(); end.setDate(end.getDate() + 60);
  const calendarUrl = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(env.GOOGLE_CALENDAR_ID)}/events`);
  calendarUrl.searchParams.set("singleEvents", "true");
  calendarUrl.searchParams.set("orderBy", "startTime");
  calendarUrl.searchParams.set("timeMin", start.toISOString());
  calendarUrl.searchParams.set("timeMax", end.toISOString());
  calendarUrl.searchParams.set("maxResults", "500");
  const [sheetResponse, calendarResponse] = await Promise.all([
    fetch(sheetsUrl, { headers: { authorization: `Bearer ${token}` } }),
    fetch(calendarUrl, { headers: { authorization: `Bearer ${token}` } }),
  ]);
  if (!sheetResponse.ok) throw new Error(`無法讀取試算表 (${sheetResponse.status})`);
  if (!calendarResponse.ok) throw new Error(`無法讀取行事曆 (${calendarResponse.status})`);
  const sheetData = await sheetResponse.json() as { valueRanges?: Array<{ values?: string[][] }> };
  const calendarData = await calendarResponse.json() as { items?: CalendarEvent[] };
  const students = rowsToObjects(sheetData.valueRanges?.[0]?.values);
  const records = rowsToObjects(sheetData.valueRanges?.[1]?.values);
  const packages = rowsToObjects(sheetData.valueRanges?.[2]?.values);
  const recordBookingIds = new Set(records.map((record) => record["預約ID"]));
  const bookings = (calendarData.items || []).filter((event) => event.status !== "cancelled").map((event) => {
    const title = String(event.summary || "未命名學員");
    const student = title.split("｜")[0].trim();
    const profile = students.find((item) => item["姓名"] === student);
    const start = event.start?.dateTime || event.start?.date;
    const finish = event.end?.dateTime || event.end?.date;
    return {
      id: event.id,
      student,
      coach: title.includes("｜") ? title.split("｜")[1].replace("皮拉提斯", "").trim() : "ANITA",
      location: event.location || "Le Gin 松南店",
      start,
      end: finish,
      date: taipeiDay(new Date(start)),
      time: `${taipeiTime(new Date(start))}–${taipeiTime(new Date(finish))}`,
      type: profile?.["學員階段"] === "正課" ? "正課" : profile?.["學員階段"] === "體驗課" ? "體驗課" : "待分類",
      status: new Date(finish).getTime() < Date.now() ? "已完成" : "已預約",
      record: recordBookingIds.has(event.id),
    };
  });
  return { bookings, students, records, packages, today: taipeiDay() };
}

export async function appendRecord(env: GoogleEnv, body: Record<string, unknown>) {
  const now = new Date().toISOString();
  const values = [[
    crypto.randomUUID(), body.bookingId || "", body.studentId || "", body.student || "", body.date || "",
    body.beforePain ?? "", body.beforeCondition || "", body.focus || "", body.content || "", body.afterPain ?? "",
    body.observation || "", body.nextPlan || "", now,
  ]];
  const range = encodeURIComponent("上課紀錄!A:M");
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${env.GOOGLE_SHEET_ID}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
  await googleFetch(env, url, { method: "POST", body: JSON.stringify({ values }) });
  return { ok: true, createdAt: now };
}
