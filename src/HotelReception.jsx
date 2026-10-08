import React, { useState, useEffect, useMemo, useRef } from "react";
import * as XLSX from "xlsx";
import loginBg from "./assets/login-bg.jpg";

// ---- Finance (accountant role) field definitions ----
// One row per calendar day per hotel. Field keys match the finance_daily
// table columns in Supabase (see supabase/finance_setup.sql).
const FINANCE_REVENUE_FIELDS = [
  { key: "revenue_rooms", label: "الغرف" },
  { key: "revenue_coffee_shop", label: "الكوفى شوب" },
  { key: "revenue_pool_bar", label: "بار / حمام السباحة" },
  { key: "revenue_beach", label: "الشاطئ" },
  { key: "revenue_rentals", label: "إيجارات" },
  { key: "revenue_other", label: "إيرادات أخرى" },
];
const FINANCE_EXPENSE_FIELDS = [
  { key: "expense_operating", label: "مصاريف تشغيل" },
  { key: "expense_salaries", label: "مرتبات" },
  { key: "expense_partner_magdy", label: "جارى الشريك - م. مجدى" },
  { key: "expense_partner_moheb", label: "جارى الشريك - م. محب" },
  { key: "expense_partner_bola", label: "جارى الشريك - م. بولا" },
  { key: "expense_partner_kamel", label: "جارى الشريك - م. كاميل" },
  { key: "expense_bank_deposit", label: "إيداع البنك" },
  { key: "expense_staff_advances", label: "سلف الأسطاف" },
  { key: "expense_fixed", label: "مصاريف ثابتة" },
  { key: "expense_other", label: "مصاريف أخرى" },
];
const FINANCE_FIELD_KEYS = [...FINANCE_REVENUE_FIELDS, ...FINANCE_EXPENSE_FIELDS].map((f) => f.key);
function emptyFinanceForm(dateISO) {
  const base = { entry_date: dateISO || todayISO() };
  FINANCE_FIELD_KEYS.forEach((k) => (base[k] = 0));
  return base;
}
function financeCleanNumber(val) {
  // Handles blanks, stray text, and scientific notation (e.g. "1E+05")
  // the way it shows up in the accountant's Excel sheets.
  if (val === undefined || val === null || val === "") return 0;
  if (val instanceof Date) return 0;
  const n = typeof val === "number" ? val : parseFloat(String(val).replace(/,/g, "").trim());
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}
function financeRevenueTotal(row) {
  return Math.round(FINANCE_REVENUE_FIELDS.reduce((sum, f) => sum + (Number(row[f.key]) || 0), 0) * 100) / 100;
}
function financeExpenseTotal(row) {
  return Math.round(FINANCE_EXPENSE_FIELDS.reduce((sum, f) => sum + (Number(row[f.key]) || 0), 0) * 100) / 100;
}
// Alias dictionary used to auto-guess which spreadsheet column maps to which
// finance field, based on the Arabic header text actually used in the
// accountant's sheets (headers vary slightly month to month).
const FINANCE_HEADER_ALIASES = [
  { target: "entry_date", tests: ["التاريخ"] },
  { target: "revenue_rooms", tests: ["الغرف"] },
  { target: "revenue_coffee_shop", tests: ["كوفى"] },
  { target: "revenue_pool_bar", tests: ["بار", "حمام"] },
  { target: "revenue_beach", tests: ["الشاطئ", "شاطئ"] },
  { target: "revenue_rentals", tests: ["ايجار", "إيجار"] },
  { target: "revenue_other", tests: ["اخرى", "أخرى"] },
  { target: "revenue_reported_total", tests: ["اجمالى الايراد", "إجمالى الإيراد"] },
  { target: "expense_operating", tests: ["تشغيل"] },
  { target: "expense_salaries", tests: ["مرتبات"] },
  // NOTE: the old sheets store "جارى الشريك" as ONE combined column (partner
  // name written as text + one amount) rather than one column per partner,
  // so it can't be auto-mapped reliably — left out on purpose. During
  // import, either map that column manually to a single partner if the
  // whole day's amount was for one partner, or leave it ignored and split
  // it across partners by hand afterward.
  { target: "expense_bank_deposit", tests: ["ايداع البنك", "إيداع البنك"] },
  { target: "expense_staff_advances", tests: ["سلف"] },
  { target: "expense_fixed", tests: ["م. ثابته", "ثابته", "ثابتة"] },
  { target: "expense_reported_total", tests: ["اجمالى المصروفات", "إجمالى المصروفات"] },
  { target: "expense_other", tests: ["ادوات مكتبيه", "أدوات مكتبية"] },
  { target: "balance_previous", tests: ["الرصيد السابق"] },
  { target: "balance_ending", tests: ["الرصيد النهائى", "الرصيد النهائي"] },
];
function guessFinanceFieldForHeader(headerText) {
  const h = (headerText || "").replace(/\s+/g, "");
  if (!h) return "ignore";
  for (const alias of FINANCE_HEADER_ALIASES) {
    if (alias.tests.some((t) => h.includes(t.replace(/\s+/g, "")))) return alias.target;
  }
  return "ignore";
}
const FINANCE_MAP_TARGETS = [
  { value: "ignore", label: "— تجاهل —" },
  { value: "entry_date", label: "التاريخ / رقم اليوم" },
  ...FINANCE_REVENUE_FIELDS.map((f) => ({ value: f.key, label: `إيراد: ${f.label}` })),
  { value: "revenue_reported_total", label: "إجمالى الإيراد (من الشيت، للمراجعة فقط)" },
  ...FINANCE_EXPENSE_FIELDS.map((f) => ({ value: f.key, label: `مصروف: ${f.label}` })),
  { value: "expense_reported_total", label: "إجمالى المصروفات (من الشيت، للمراجعة فقط)" },
  { value: "balance_previous", label: "الرصيد السابق (مرجعي)" },
  { value: "balance_ending", label: "الرصيد النهائى (مرجعي)" },
];


const TOKENS = {
  ink: "#1B2430",
  inkSoft: "#3A4556",
  paper: "#F5EFE6",
  paperDim: "#EAE1D2",
  brass: "#B08968",
  brassDark: "#8C6A4F",
  clean: "#4A7C59",
  cleanBg: "#E4EEE3",
  dirty: "#C97B3D",
  dirtyBg: "#F6E7D6",
  occupied: "#445569",
  occupiedBg: "#E3E7ED",
  oos: "#B33F3F",
  oosBg: "#F5DEDE",
  reserved: "#2F6FED",
  reservedBg: "#E1EAFB",
};

const STATUS_META = {
  vacant_clean: { label: "Vacant · clean", color: TOKENS.clean, bg: TOKENS.cleanBg },
  vacant_dirty: { label: "Vacant · needs cleaning", color: TOKENS.dirty, bg: TOKENS.dirtyBg },
  occupied: { label: "Occupied", color: TOKENS.occupied, bg: TOKENS.occupiedBg },
  out_of_order: { label: "Out of order", color: TOKENS.oos, bg: TOKENS.oosBg },
};

const ROOM_TYPES = ["King Bed", "DBL", "TPL"];
const ROOM_RATES = { "King Bed": 500, DBL: 400, TPL: 350 }; // per person, per night
const MEAL_PLANS = ["HB", "FB", "All-inclusive"];
const MEAL_PLAN_RATES = { HB: 150, FB: 250, "All-inclusive": 400 }; // per person, per night add-on
const FREE_MEAL_PLANS = ["B.B", "B.O"]; // always no charge, not editable in Room pricing
const GUEST_MEAL_PLAN_CHOICES = [...MEAL_PLANS, ...FREE_MEAL_PLANS];
const MAINTENANCE_THRESHOLD = 3;

const BOOKING_TYPES = [
  { key: "booking", label: "Booking.com", color: "#003580", bg: "#DCE6F5" },
  { key: "airbnb", label: "Airbnb", color: "#FF385C", bg: "#FCE1E6" },
  { key: "syndicate", label: "نقابات", color: "#8C6A4F", bg: "#EFE6DB" },
  { key: "sun", label: "SUN", color: "#0F766E", bg: "#D5EEEB" },
  { key: "other", label: "Others", color: "#6B7280", bg: "#E7E9EC" },
];
const PAYMENT_METHODS = [
  { key: "online", label: "Online" },
  { key: "on_arrival", label: "الدفع عند الوصول" },
  { key: "company", label: "الدفع مع الشركة" },
];
function paymentMethodLabel(key) {
  const m = PAYMENT_METHODS.find((x) => x.key === key);
  return m ? m.label : "";
}
const BOOKING_TYPE_FILTERS = [{ key: "all", label: "All" }, ...BOOKING_TYPES];
function bookingTypeMeta(key) {
  return BOOKING_TYPES.find((t) => t.key === key) || BOOKING_TYPES[BOOKING_TYPES.length - 1];
}
// Credentials are never stored as plain text — only as a SHA-256 hash of
// "username:password". Login compares the hash of what was typed against
// these fixed hashes, so neither the username nor password appears in the
// source. See sha256Hex() below for the (dependency-free) hashing routine.
const AUTH_ANALYTICS_HASH = "f5ecaff77cd624918cbdbaa22cc62ca4ef7607a3f7c162a430f84128a256c9fb";

// ---- Supabase connection ----
// The publishable key is safe to ship in browser code (that's its whole
// purpose) — real access control happens via Row Level Security policies
// on the database side, not by hiding this key.
const SUPABASE_URL = "https://jdzlbanicwdzzsdufvxc.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_PyGbzSHX0XtPFfsYSF_ihQ_NUT4RS1U";

async function supabaseSignIn(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error_description || data.msg || `Sign-in failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data; // { access_token, refresh_token, user: {...}, ... }
}

async function supabaseRest(path, { accessToken, method = "GET", body, headers = {} } = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${accessToken || SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    const err = new Error(`Supabase error ${res.status}: ${errText}`);
    err.status = res.status;
    throw err;
  }
  if (res.status === 204) return null;
  return res.json();
}

// PATCH that fails loudly. When Row Level Security blocks an UPDATE, Supabase
// answers 200 with an empty array instead of an error, so the app used to think
// the save worked while nothing reached the database.
async function supabasePatchChecked(path, { accessToken, body, what }) {
  const rows = await supabaseRest(path, { accessToken, method: "PATCH", body });
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error(
      `${what || "Update"} was not saved to the database (0 rows changed). ` +
        `Most likely a missing UPDATE permission (RLS policy) — run supabase/edit_switch_policies.sql in the Supabase SQL editor.`
    );
  }
  return rows;
}

// How many rows we pull eagerly at login for the tables that only ever grow
// (one row per ticket / maintenance entry, forever). Reception's "recent
// tickets" list and the room-activity view only need a recent slice on first
// paint — everything older is fetched on demand, paginated, by the tab that
// actually needs it (see fetchTicketsPage below).
const INITIAL_TICKETS_LIMIT = 50;
const INITIAL_MAINTENANCE_LIMIT = 100;
const TICKETS_PAGE_SIZE = 10;

// True offset-based pagination against PostgREST (Supabase's REST layer).
// PostgREST returns the total row count in the Content-Range header when we
// ask for it via `Prefer: count=exact`, which is what lets us show
// "Page X of Y" / disable the Next button without a second round trip.
async function fetchTicketsPage({ accessToken, hotelId, rangeStart, rangeEndExclusive, page = 0, pageSize = TICKETS_PAGE_SIZE }) {
  const offset = page * pageSize;
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/tickets?hotel_id=eq.${hotelId}&ticket_date=gte.${rangeStart}&ticket_date=lt.${rangeEndExclusive}` +
      `&order=ticket_date.desc&limit=${pageSize}&offset=${offset}`,
    {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${accessToken || SUPABASE_ANON_KEY}`,
        Prefer: "count=exact",
      },
    }
  );
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Supabase error ${res.status}: ${errText}`);
  }
  const rows = await res.json();
  // Content-Range looks like "0-9/137" — the part after "/" is the total count.
  const contentRange = res.headers.get("content-range") || "";
  const total = Number(contentRange.split("/")[1]) || rows.length;
  return { rows: rows.map(mapTicketFromDb), total, page, pageSize };
}

// Lightweight aggregate for the "Tickets sold / Persons / Revenue" summary
// cards. We only ask Postgres for the two numeric columns we need to sum, for
// tickets *inside the selected range* — not the whole table, and not the
// full ticket rows. This keeps the totals accurate across the whole range
// even though the list below it is paginated 10-at-a-time.
async function fetchTicketsRangeTotals({ accessToken, hotelId, rangeStart, rangeEndExclusive }) {
  const rows = await supabaseRest(
    `tickets?hotel_id=eq.${hotelId}&ticket_date=gte.${rangeStart}&ticket_date=lt.${rangeEndExclusive}&select=persons,amount_paid`,
    { accessToken }
  );
  return (rows || []).reduce(
    (acc, r) => ({ count: acc.count + 1, persons: acc.persons + (r.persons || 0), revenue: acc.revenue + Number(r.amount_paid || 0) }),
    { count: 0, persons: 0, revenue: 0 }
  );
}

// Bookings that overlap a date window, fetched straight from Supabase instead
// of filtered out of the full (unbounded, ever-growing) bookings array. Two
// bookings "overlap" [rangeStart, rangeEndExclusive) when the booking starts
// before the window ends AND ends after the window starts — the standard
// interval-overlap test — which PostgREST expresses as two chained filters.
// This is what keeps Analytics's workload bounded by "how much happened in
// the selected range" instead of "how many bookings the hotel has ever had".
async function fetchBookingsOverlappingRange({ accessToken, hotelId, rangeStart, rangeEndExclusive, roomNumberById }) {
  const rows = await supabaseRest(
    `bookings?hotel_id=eq.${hotelId}&check_in=lt.${rangeEndExclusive}&check_out=gt.${rangeStart}&order=check_in`,
    { accessToken }
  );
  return (rows || []).map((b) => mapBookingFromDb(b, roomNumberById));
}

// Rooms checking in or checking out on one exact date, for the Today Report's
// "select a day" view. Two narrow equality filters (check_in=eq.<date> /
// check_out=eq.<date>) instead of scanning the whole bookings history — the
// query cost stays flat no matter how long the hotel has been operating.
async function fetchCheckInsOnDate({ accessToken, hotelId, date, roomNumberById }) {
  const rows = await supabaseRest(
    `bookings?hotel_id=eq.${hotelId}&check_in=eq.${date}&status=neq.cancelled&order=room_id`,
    { accessToken }
  );
  return (rows || []).map((b) => mapBookingFromDb(b, roomNumberById));
}
async function fetchCheckOutsOnDate({ accessToken, hotelId, date, roomNumberById }) {
  const rows = await supabaseRest(
    `bookings?hotel_id=eq.${hotelId}&check_out=eq.${date}&status=neq.cancelled&order=room_id`,
    { accessToken }
  );
  return (rows || []).map((b) => mapBookingFromDb(b, roomNumberById));
}

async function supabaseFunctionCall(fnName, accessToken, payload) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${fnName}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

const AUTH_SYSTEM_HASH = "aa855125071c7af31cbb1d965e9c3a241d815ae8338524df7ac6e314dc28b976";
// Hash of just the (lowercased) built-in usernames, used only to stop a manager
// from creating a new user that collides with a reserved name — without needing
// either reserved username in plain text here.
const AUTH_SYSTEM_USERNAME_HASH = "37d2eb7f48d6e9d3d01dd1540a1de9cdf0c7d1e9a9ab9e7d2805bffa4456519b";
const AUTH_ANALYTICS_USERNAME_HASH = "af3659b136f37fd9652225c0d3c594cff434b842867f419646232ac7876fdeff";

function sha256Hex(message) {
  function rightRotate(v, n) {
    return (v >>> n) | (v << (32 - n));
  }
  const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];
  let H = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ];

  const bytes = [];
  for (let i = 0; i < message.length; i++) {
    const code = message.codePointAt(i);
    if (code < 0x80) bytes.push(code);
    else if (code < 0x800) bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    else if (code < 0x10000)
      bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    else {
      bytes.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f)
      );
      i++;
    }
  }

  const bitLen = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  for (let i = 7; i >= 0; i--) bytes.push((bitLen / Math.pow(2, i * 8)) & 0xff);

  for (let chunkStart = 0; chunkStart < bytes.length; chunkStart += 64) {
    const w = new Array(64).fill(0);
    for (let i = 0; i < 16; i++) {
      w[i] =
        (bytes[chunkStart + i * 4] << 24) |
        (bytes[chunkStart + i * 4 + 1] << 16) |
        (bytes[chunkStart + i * 4 + 2] << 8) |
        bytes[chunkStart + i * 4 + 3];
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rightRotate(w[i - 15], 7) ^ rightRotate(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rightRotate(w[i - 2], 17) ^ rightRotate(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }

    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const S1 = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + K[i] + w[i]) | 0;
      const S0 = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) | 0;
      h = g;
      g = f;
      f = e;
      e = (d + temp1) | 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) | 0;
    }
    H = [H[0] + a, H[1] + b, H[2] + c, H[3] + d, H[4] + e, H[5] + f, H[6] + g, H[7] + h].map(
      (v) => v | 0
    );
  }

  return H.map((v) => (v >>> 0).toString(16).padStart(8, "0")).join("");
}

function defaultRooms() {
  const rooms = [];
  const floors = [1, 2, 3, 4];
  floors.forEach((floor) => {
    for (let i = 1; i <= 6; i++) {
      const num = `${floor}${String(i).padStart(2, "0")}`;
      const type = i <= 2 ? "King Bed" : i <= 4 ? "DBL" : "TPL";
      rooms.push({
        number: num,
        floor,
        type,
        status: "vacant_clean",
        notes: "",
        rate: ROOM_RATES[type],
        maintenanceBaseline: 0,
        lastCleanedDate: null,
      });
    }
  });
  return rooms;
}

function occupancyOptionsForType(type) {
  if (type === "King Bed") return [1, 2];
  if (type === "DBL") return [1, 2, 3];
  if (type === "TPL") return [1, 2, 3];
  return [1];
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function rangesOverlap(startA, endA, startB, endB) {
  return startA < endB && startB < endA;
}

function findConflict(allBookings, roomNumber, checkIn, checkOut, excludeBookingId) {
  if (!roomNumber) return undefined; // booking with no room yet never clashes
  return allBookings.find(
    (b) =>
      b.roomNumber === roomNumber &&
      b.id !== excludeBookingId &&
      (b.status === "reserved" || b.status === "checked_in") &&
      rangesOverlap(checkIn, checkOut, b.checkIn, b.checkOut)
  );
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function addDaysISO(iso, days) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function startOfMonthISO() {
  return todayISO().slice(0, 8) + "01";
}

function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function overlapNights(rangeStart, rangeEndExclusive, bookingStart, bookingEnd) {
  const start = rangeStart > bookingStart ? rangeStart : bookingStart;
  const end = rangeEndExclusive < bookingEnd ? rangeEndExclusive : bookingEnd;
  if (end <= start) return 0;
  return Math.round((new Date(end + "T00:00:00") - new Date(start + "T00:00:00")) / 86400000);
}

function monthLabel(year, month) {
  return new Date(year, month, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

function MonthCalendar({ year, month, onMonthChange, highlightedDates, todayIso, onDayClick, selectedDate, legendLabel, rangeStart, rangeEnd, showLegend = true }) {
  const pad = (n) => String(n).padStart(2, "0");
  const isoFor = (d) => `${year}-${pad(month + 1)}-${pad(d)}`;
  const numDays = new Date(year, month + 1, 0).getDate();
  const startWeekday = new Date(year, month, 1).getDay();
  const CHECKOUT_COLOR = "#C97B3D";

  const cells = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= numDays; d++) cells.push(d);

  const goPrev = () => {
    if (month === 0) onMonthChange(year - 1, 11);
    else onMonthChange(year, month - 1);
  };
  const goNext = () => {
    if (month === 11) onMonthChange(year + 1, 0);
    else onMonthChange(year, month + 1);
  };
  const navBtnStyle = {
    width: 28,
    height: 28,
    borderRadius: "50%",
    border: `1px solid ${TOKENS.paperDim}`,
    background: "#fff",
    color: TOKENS.inkSoft,
    cursor: "pointer",
    fontSize: "0.9rem",
    lineHeight: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };

  return (
    <div
      style={{
        background: "#fff",
        border: `1px solid ${TOKENS.paperDim}`,
        borderRadius: 16,
        padding: "1rem 1.1rem 0.9rem",
        maxWidth: 340,
        boxShadow: "0 2px 10px rgba(27,36,48,0.06)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <button type="button" onClick={goPrev} style={navBtnStyle}>‹</button>
        <div style={{ fontFamily: "Fraunces, serif", fontSize: "1rem", fontWeight: 600 }}>{monthLabel(year, month)}</div>
        <button type="button" onClick={goNext} style={navBtnStyle}>›</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 6 }}>
        {WEEKDAY_LABELS.map((d, i) => (
          <div key={i} style={{ textAlign: "center", fontSize: "0.62rem", color: TOKENS.inkSoft, fontWeight: 700, letterSpacing: "0.04em" }}>
            {d}
          </div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
        {cells.map((d, i) => {
          if (d === null) return <div key={i} />;
          const iso = isoFor(d);
          const isReserved = highlightedDates.has(iso);
          const isToday = iso === todayIso;
          const isSelected = iso === selectedDate;
          const isCheckIn = rangeStart && iso === rangeStart;
          const isCheckOut = rangeEnd && iso === rangeEnd;
          const clickable = !!onDayClick;
          let bg = "transparent";
          let fg = TOKENS.ink;
          let label = isReserved ? "Reserved — click to view" : undefined;
          if (isCheckIn) {
            bg = TOKENS.reserved;
            fg = "#fff";
            label = "Check-in";
          } else if (isCheckOut) {
            bg = CHECKOUT_COLOR;
            fg = "#fff";
            label = "Check-out";
          } else if (isReserved) {
            bg = TOKENS.reserved;
            fg = "#fff";
          }
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "2px 0" }}>
              <button
                type="button"
                onClick={clickable ? () => onDayClick(iso) : undefined}
                disabled={!clickable}
                title={label}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: "50%",
                  border: isSelected ? `2px solid ${TOKENS.brassDark}` : isToday ? `1px solid ${TOKENS.brass}` : "1px solid transparent",
                  background: bg,
                  color: fg,
                  fontSize: "0.74rem",
                  fontWeight: bg !== "transparent" || isToday ? 700 : 400,
                  cursor: clickable ? "pointer" : "default",
                  padding: 0,
                }}
              >
                {d}
              </button>
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginTop: 12, paddingTop: 10, borderTop: `1px solid ${TOKENS.paperDim}`, fontSize: "0.68rem", color: TOKENS.inkSoft }}>
        {!showLegend ? null : (rangeStart !== undefined || rangeEnd !== undefined) ? (
          <>
            <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: TOKENS.reserved, display: "inline-block" }} />
              Check-in
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: CHECKOUT_COLOR, display: "inline-block" }} />
              Check-out
            </span>
          </>
        ) : (
          <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: TOKENS.reserved, display: "inline-block" }} />
            {legendLabel || "Reserved"}
          </span>
        )}
        {onDayClick && <span style={{ marginLeft: "auto" }}>Click a day for details</span>}
      </div>
    </div>
  );
}

function fmtMoney(n) {
  return `EGP ${Math.round(n).toLocaleString()}`;
}

function getRoomRate(room, roomRates) {
  return (roomRates && roomRates[room.type] != null ? roomRates[room.type] : room.rate) || 0;
}

function mealPlanSurcharge(mealPlans, mealPlanRates) {
  if (!mealPlans || !mealPlans.length) return 0;
  const rates = mealPlanRates || MEAL_PLAN_RATES;
  return mealPlans.reduce((sum, plan) => sum + (rates[plan] || 0), 0);
}

const FONT_LINK = "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=Inter:wght@400;500;600&display=swap";

// ---- Supabase row <-> local UI object mapping ----
// Room-switch reasons are stored inside the guest's `notes` column, one line per
// switch:  [switch:<bookingId>] 2026-10-03 · Room 201 → 105 · reason
// Everything else in `notes` is the guest's normal free-text note.
const SWITCH_NOTE_RE = /^\[switch:([^\]]+)\]\s*(.*)$/;
const TAG_NOTE_RE = /^\[tag:([a-z_]+)\]\s*$/;
function splitGuestNotes(notes) {
  const plain = [];
  const switches = {};
  const tags = [];
  String(notes || "")
    .split("\n")
    .forEach((line) => {
      const m = line.match(SWITCH_NOTE_RE);
      const t = line.match(TAG_NOTE_RE);
      if (m) (switches[m[1]] = switches[m[1]] || []).push(m[2]);
      else if (t) tags.push(t[1]);
      else if (line.trim()) plain.push(line);
    });
  return { plain: plain.join("\n"), switches, tags };
}
// Guest tags (vip, blacklisted) live in the same notes column, one "[tag:x]" line each.
function setGuestTags(notes, tags) {
  const kept = String(notes || "")
    .split("\n")
    .filter((l) => !TAG_NOTE_RE.test(l));
  const base = kept.join("\n").replace(/\s+$/, "");
  const lines = tags.map((t) => `[tag:${t}]`).join("\n");
  return [base, lines].filter(Boolean).join("\n");
}
function appendSwitchNote(notes, bookingId, text) {
  const base = String(notes || "").replace(/\s+$/, "");
  const line = `[switch:${bookingId}] ${text.replace(/\s*\n\s*/g, " ")}`;
  return base ? `${base}\n${line}` : line;
}

// Check-in is only allowed from the check-in date up to (not including) the check-out date.
function checkInBlockReason(b, today = todayISO()) {
  if (today < b.checkIn) return `Check-in not allowed before ${fmtDateY(b.checkIn)}`;
  if (today > b.checkOut) return "This reservation has expired";
  if (today === b.checkOut) return "This reservation ends today — it can't be checked in on its check-out date";
  return null;
}

function roomLabel(n) {
  return n ? `Room ${n}` : "No room yet";
}

function mapRoomFromDb(r) {
  return {
    id: r.id,
    number: r.number,
    floor: r.floor,
    type: r.type,
    status: r.status,
    notes: r.notes || "",
    maintenanceBaseline: r.maintenance_baseline || 0,
    lastCleanedDate: r.last_cleaned_date,
  };
}
function mapGuestFromDb(g) {
  return {
    id: g.id,
    name: g.name,
    phone: g.phone || "",
    email: g.email || "",
    nationalId: g.national_id || "",
    notes: g.notes || "",
  };
}
function mapBookingFromDb(b, roomNumberById) {
  return {
    id: b.id,
    roomId: b.room_id,
    roomNumber: roomNumberById[b.room_id] || "",
    guestId: b.guest_id,
    checkIn: b.check_in,
    checkOut: b.check_out,
    partySize: b.persons,
    persons: b.persons,
    mealPlans: b.meal_plans || [],
    status: b.status,
    bookingType: b.booking_type || "booking",
    paymentMethod: b.payment_method || "",
    discountPercent: Number(b.discount) || 0,
    totalAmount: Number(b.total_amount) || 0,
    createdBy: b.created_by,
  };
}
function mapTicketFromDb(t) {
  return {
    id: t.id,
    persons: t.persons,
    amountPaid: Number(t.amount_paid),
    date: t.ticket_date,
    notes: t.notes || "",
    createdBy: t.created_by,
  };
}
function mapMaintenanceFromDb(m, roomNumberById) {
  return { id: m.id, roomNumber: roomNumberById[m.room_id] || "", date: m.logged_date };
}

function HotelReceptionApp({ role, username, supabaseSession, onLogout }) {
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rooms, setRooms] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [guests, setGuests] = useState([]);
  const [maintenanceLog, setMaintenanceLog] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [roomRates, setRoomRates] = useState(ROOM_RATES);
  const [mealPlanRates, setMealPlanRates] = useState(MEAL_PLAN_RATES);
  const [extraUsers, setExtraUsers] = useState([]);
  const [tab, setTab] = useState("rooms");
  const [managerTab, setManagerTab] = useState("home");
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [showNewBooking, setShowNewBooking] = useState(false);
  const [showNewGuest, setShowNewGuest] = useState(false);
  const [guestSearch, setGuestSearch] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = FONT_LINK;
    document.head.appendChild(link);
    return () => document.head.removeChild(link);
  }, []);

  useEffect(() => {
    (async () => {
      if (supabaseSession) {
        try {
          const token = supabaseSession.access_token;
          const hid = supabaseSession.hotelId;
          const [roomRows, guestRows, bookingRows, ticketRows, maintRows, roomRateRows, mealRateRows] = await Promise.all([
            supabaseRest(`rooms?hotel_id=eq.${hid}&order=number`, { accessToken: token }),
            supabaseRest(`guests?hotel_id=eq.${hid}&order=name`, { accessToken: token }),
            supabaseRest(`bookings?hotel_id=eq.${hid}&order=check_in`, { accessToken: token }),
            // Bounded on purpose: the manager/reception tabs only ever show a handful of
            // recent tickets on first paint (see TicketsTab). Historical ranges beyond this
            // window are fetched on demand by TicketRecordsTab/AnalyticsDashboard instead of
            // pulling the entire, ever-growing tickets table on every login.
            supabaseRest(`tickets?hotel_id=eq.${hid}&order=ticket_date.desc&limit=${INITIAL_TICKETS_LIMIT}`, { accessToken: token }),
            supabaseRest(`maintenance_log?hotel_id=eq.${hid}&order=logged_date.desc&limit=${INITIAL_MAINTENANCE_LIMIT}`, { accessToken: token }),
            supabaseRest(`room_rates?hotel_id=eq.${hid}`, { accessToken: token }),
            supabaseRest(`meal_plan_rates?hotel_id=eq.${hid}`, { accessToken: token }),
          ]);
          const roomsMapped = (roomRows || []).map(mapRoomFromDb);
          const roomNumberById = {};
          roomsMapped.forEach((r) => { roomNumberById[r.id] = r.number; });
          setRooms(roomsMapped.length ? roomsMapped : defaultRooms());
          setGuests((guestRows || []).map(mapGuestFromDb));
          setBookings((bookingRows || []).map((b) => mapBookingFromDb(b, roomNumberById)));
          setTickets((ticketRows || []).map(mapTicketFromDb));
          setMaintenanceLog((maintRows || []).map((m) => mapMaintenanceFromDb(m, roomNumberById)));
          const rr = {};
          (roomRateRows || []).forEach((x) => { rr[x.room_type] = Number(x.rate); });
          setRoomRates(Object.keys(rr).length ? rr : ROOM_RATES);
          const mr = {};
          (mealRateRows || []).forEach((x) => { mr[x.plan] = Number(x.rate); });
          setMealPlanRates(Object.keys(mr).length ? mr : MEAL_PLAN_RATES);
        } catch (e) {
          setError("Couldn't load data from Supabase — check your connection and refresh.");
        } finally {
          setLoaded(true);
        }
        return;
      }
      try {
        const result = await window.storage.get("hotel-app-state", true);
        if (result && result.value) {
          const data = JSON.parse(result.value);
          setRooms(data.rooms && data.rooms.length ? data.rooms : defaultRooms());
          setBookings(data.bookings || []);
          setGuests(data.guests || []);
          setMaintenanceLog(data.maintenanceLog || []);
          setTickets(data.tickets || []);
          setRoomRates(data.roomRates && Object.keys(data.roomRates).length ? data.roomRates : ROOM_RATES);
          setMealPlanRates(data.mealPlanRates && Object.keys(data.mealPlanRates).length ? data.mealPlanRates : MEAL_PLAN_RATES);
          setExtraUsers(data.extraUsers || []);
        } else {
          setRooms(defaultRooms());
        }
      } catch (e) {
        setRooms(defaultRooms());
      } finally {
        setLoaded(true);
      }
    })();
  }, [supabaseSession]);

  const flashError = (msg) => {
    setError(msg);
    setTimeout(() => setError(""), 5000);
  };

  const persist = async (next) => {
    setSaving(true);
    try {
      await window.storage.set(
        "hotel-app-state",
        JSON.stringify({
          rooms: next.rooms ?? rooms,
          bookings: next.bookings ?? bookings,
          guests: next.guests ?? guests,
          maintenanceLog: next.maintenanceLog ?? maintenanceLog,
          tickets: next.tickets ?? tickets,
          roomRates: next.roomRates ?? roomRates,
          mealPlanRates: next.mealPlanRates ?? mealPlanRates,
          extraUsers: next.extraUsers ?? extraUsers,
        }),
        true
      );
    } catch (e) {
      setError("Couldn't save — your last change may not persist.");
      setTimeout(() => setError(""), 4000);
    } finally {
      setSaving(false);
    }
  };

  const updateRooms = (next) => {
    setRooms(next);
    persist({ rooms: next });
  };
  const updateBookings = (next) => {
    setBookings(next);
    persist({ bookings: next });
  };
  const updateGuests = (next) => {
    setGuests(next);
    persist({ guests: next });
  };
  const updateRoomRates = async (next) => {
    if (supabaseSession) {
      try {
        const rows = Object.entries(next).map(([room_type, rate]) => ({
          hotel_id: supabaseSession.hotelId,
          room_type,
          rate: Number(rate) || 0,
        }));
        await supabaseRest("room_rates", {
          accessToken: supabaseSession.access_token,
          method: "POST",
          body: rows,
          headers: { Prefer: "resolution=merge-duplicates,return=representation" },
        });
        setRoomRates(next);
      } catch (e) {
        flashError(`Couldn't save room rates: ${e.message}`);
      }
      return;
    }
    setRoomRates(next);
    persist({ roomRates: next });
  };
  const updateMealPlanRates = async (next) => {
    if (supabaseSession) {
      try {
        const rows = Object.entries(next).map(([plan, rate]) => ({
          hotel_id: supabaseSession.hotelId,
          plan,
          rate: Number(rate) || 0,
        }));
        await supabaseRest("meal_plan_rates", {
          accessToken: supabaseSession.access_token,
          method: "POST",
          body: rows,
          headers: { Prefer: "resolution=merge-duplicates,return=representation" },
        });
        setMealPlanRates(next);
      } catch (e) {
        flashError(`Couldn't save meal plan rates: ${e.message}`);
      }
      return;
    }
    setMealPlanRates(next);
    persist({ mealPlanRates: next });
  };

  // Real path: a manager signed in with a Supabase account creates a real
  // Supabase Auth user + `staff` row via the create-staff-user Edge Function.
  const addUser = async (email, password, displayName, userRole) => {
    if (!supabaseSession) {
      return {
        ok: false,
        error: "You're signed in with a local/demo account, so new users can't be saved to Supabase. Sign in with a real Supabase manager account to add staff.",
      };
    }
    if (!email.trim() || !password || !displayName.trim()) {
      return { ok: false, error: "Email, password, and display name are required." };
    }
    try {
      await supabaseFunctionCall("create-staff-user", supabaseSession.access_token, {
        email: email.trim(),
        password,
        displayName: displayName.trim(),
        role: userRole === "analyst" ? "analyst" : userRole === "accountant" ? "accountant" : userRole === "manager" ? "manager" : "reception",
      });
      await loadStaffList();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  };

  const deleteUser = async (userId, { deleteAuthUser = false } = {}) => {
    if (!supabaseSession) return;
    try {
      await supabaseFunctionCall("delete-staff-user", supabaseSession.access_token, {
        userId,
        deleteAuthUser,
      });
      await loadStaffList();
    } catch (e) {
      setError(`Couldn't remove user: ${e.message}`);
      setTimeout(() => setError(""), 4000);
    }
  };

  // Pulls the real list of staff at this hotel from Supabase (RLS makes sure
  // this only ever returns people at the caller's own hotel).
  const loadStaffList = async () => {
    if (!supabaseSession) return;
    try {
      const rows = await supabaseRest(
        `staff?select=user_id,display_name,role&hotel_id=eq.${supabaseSession.hotelId}`,
        { accessToken: supabaseSession.access_token }
      );
      setExtraUsers(
        (rows || [])
          .filter((r) => r.user_id !== supabaseSession.user.id)
          .map((r) => ({ id: r.user_id, username: r.display_name, role: r.role }))
      );
    } catch (e) {
      // Non-fatal — the Users tab will just show an empty/stale list.
    }
  };

  useEffect(() => {
    if (supabaseSession) loadStaffList();
  }, [supabaseSession]);

  const deleteTicket = async (id) => {
    if (supabaseSession) {
      try {
        await supabaseRest(`tickets?id=eq.${id}`, { accessToken: supabaseSession.access_token, method: "DELETE" });
        setTickets((ts) => ts.filter((t) => t.id !== id));
      } catch (e) {
        flashError(`Couldn't delete ticket: ${e.message}`);
      }
      return;
    }
    const next = tickets.filter((t) => t.id !== id);
    setTickets(next);
    persist({ tickets: next });
  };

  const setRoomStatus = async (number, status, notes) => {
    if (supabaseSession) {
      const room = rooms.find((r) => r.number === number);
      if (!room) return;
      try {
        const body = { status };
        if (notes !== undefined) body.notes = notes;
        await supabaseRest(`rooms?id=eq.${room.id}`, { accessToken: supabaseSession.access_token, method: "PATCH", body });
        setRooms((rs) => rs.map((r) => (r.number === number ? { ...r, status, notes: notes !== undefined ? notes : r.notes } : r)));
        if (selectedRoom && selectedRoom.number === number) {
          setSelectedRoom((s) => ({ ...s, status, notes: notes !== undefined ? notes : s.notes }));
        }
      } catch (e) {
        flashError(`Couldn't update room: ${e.message}`);
      }
      return;
    }
    const next = rooms.map((r) =>
      r.number === number ? { ...r, status, notes: notes !== undefined ? notes : r.notes } : r
    );
    updateRooms(next);
    if (selectedRoom && selectedRoom.number === number) {
      setSelectedRoom({ ...selectedRoom, status, notes: notes !== undefined ? notes : selectedRoom.notes });
    }
  };

  const postponeMaintenance = async (number) => {
    const currentCount = bookings.filter((b) => b.roomNumber === number && b.status === "checked_out").length;
    if (supabaseSession) {
      const room = rooms.find((r) => r.number === number);
      if (!room) return;
      try {
        await supabaseRest(`rooms?id=eq.${room.id}`, {
          accessToken: supabaseSession.access_token,
          method: "PATCH",
          body: { maintenance_baseline: currentCount },
        });
        const [inserted] = await supabaseRest("maintenance_log", {
          accessToken: supabaseSession.access_token,
          method: "POST",
          body: {
            hotel_id: supabaseSession.hotelId,
            room_id: room.id,
            logged_date: todayISO(),
            created_by: supabaseSession.user.id,
          },
        });
        setRooms((rs) => rs.map((r) => (r.number === number ? { ...r, maintenanceBaseline: currentCount } : r)));
        setMaintenanceLog((ml) => [...ml, { id: inserted.id, roomNumber: number, date: inserted.logged_date }]);
        if (selectedRoom && selectedRoom.number === number) {
          setSelectedRoom((s) => ({ ...s, maintenanceBaseline: currentCount }));
        }
      } catch (e) {
        flashError(`Couldn't log maintenance: ${e.message}`);
      }
      return;
    }
    const nextRooms = rooms.map((r) => (r.number === number ? { ...r, maintenanceBaseline: currentCount } : r));
    const nextLog = [...maintenanceLog, { id: uid(), roomNumber: number, date: todayISO() }];
    setRooms(nextRooms);
    setMaintenanceLog(nextLog);
    persist({ rooms: nextRooms, maintenanceLog: nextLog });
    if (selectedRoom && selectedRoom.number === number) {
      setSelectedRoom({ ...selectedRoom, maintenanceBaseline: currentCount });
    }
  };

  const markCleanedToday = async (number) => {
    if (supabaseSession) {
      const room = rooms.find((r) => r.number === number);
      if (!room) return;
      try {
        await supabaseRest(`rooms?id=eq.${room.id}`, {
          accessToken: supabaseSession.access_token,
          method: "PATCH",
          body: { last_cleaned_date: todayISO() },
        });
        setRooms((rs) => rs.map((r) => (r.number === number ? { ...r, lastCleanedDate: todayISO() } : r)));
      } catch (e) {
        flashError(`Couldn't update cleaning log: ${e.message}`);
      }
      return;
    }
    const next = rooms.map((r) => (r.number === number ? { ...r, lastCleanedDate: todayISO() } : r));
    updateRooms(next);
  };

  const activeBookingForRoom = (number) =>
    bookings.find((b) => b.roomNumber === number && b.status === "checked_in");

  const guestName = (guestId) => guests.find((g) => g.id === guestId)?.name || "Unknown guest";

  const checkIn = async (bookingId) => {
    const booking = bookings.find((b) => b.id === bookingId);
    if (!booking) return;
    const blockedReason = checkInBlockReason(booking);
    if (blockedReason) {
      flashError(blockedReason);
      return;
    }
    if (!booking.roomNumber) {
      flashError("Choose a room for this booking first (Edit), then check in.");
      return;
    }
    if (supabaseSession) {
      try {
        await supabaseRest(`bookings?id=eq.${bookingId}`, {
          accessToken: supabaseSession.access_token,
          method: "PATCH",
          body: { status: "checked_in" },
        });
        const room = rooms.find((r) => r.number === booking.roomNumber);
        if (room) {
          await supabaseRest(`rooms?id=eq.${room.id}`, {
            accessToken: supabaseSession.access_token,
            method: "PATCH",
            body: { status: "occupied" },
          });
        }
        setBookings((bs) => bs.map((b) => (b.id === bookingId ? { ...b, status: "checked_in" } : b)));
        setRooms((rs) => rs.map((r) => (r.number === booking.roomNumber ? { ...r, status: "occupied" } : r)));
      } catch (e) {
        flashError(`Couldn't check in: ${e.message}`);
      }
      return;
    }
    const nextBookings = bookings.map((b) =>
      b.id === bookingId ? { ...b, status: "checked_in" } : b
    );
    const nextRooms = rooms.map((r) =>
      r.number === booking.roomNumber ? { ...r, status: "occupied" } : r
    );
    setBookings(nextBookings);
    setRooms(nextRooms);
    persist({ bookings: nextBookings, rooms: nextRooms });
  };

  const checkOut = async (bookingId) => {
    const booking = bookings.find((b) => b.id === bookingId);
    if (!booking) return;
    if (supabaseSession) {
      try {
        await supabaseRest(`bookings?id=eq.${bookingId}`, {
          accessToken: supabaseSession.access_token,
          method: "PATCH",
          body: { status: "checked_out" },
        });
        const room = rooms.find((r) => r.number === booking.roomNumber);
        if (room) {
          await supabaseRest(`rooms?id=eq.${room.id}`, {
            accessToken: supabaseSession.access_token,
            method: "PATCH",
            body: { status: "vacant_dirty" },
          });
        }
        setBookings((bs) => bs.map((b) => (b.id === bookingId ? { ...b, status: "checked_out" } : b)));
        setRooms((rs) => rs.map((r) => (r.number === booking.roomNumber ? { ...r, status: "vacant_dirty" } : r)));
      } catch (e) {
        flashError(`Couldn't check out: ${e.message}`);
      }
      return;
    }
    const nextBookings = bookings.map((b) =>
      b.id === bookingId ? { ...b, status: "checked_out" } : b
    );
    const nextRooms = rooms.map((r) =>
      r.number === booking.roomNumber ? { ...r, status: "vacant_dirty" } : r
    );
    setBookings(nextBookings);
    setRooms(nextRooms);
    persist({ bookings: nextBookings, rooms: nextRooms });
  };

  const cancelBooking = async (bookingId) => {
    if (supabaseSession) {
      try {
        await supabaseRest(`bookings?id=eq.${bookingId}`, {
          accessToken: supabaseSession.access_token,
          method: "PATCH",
          body: { status: "cancelled" },
        });
        setBookings((bs) => bs.map((b) => (b.id === bookingId ? { ...b, status: "cancelled" } : b)));
      } catch (e) {
        flashError(`Couldn't cancel booking: ${e.message}`);
      }
      return;
    }
    const nextBookings = bookings.map((b) =>
      b.id === bookingId ? { ...b, status: "cancelled" } : b
    );
    updateBookings(nextBookings);
  };

  // Edit a reservation / in-house stay: booking fields + the guest's own data.
  const updateBooking = async (bookingId, fields, guestPatch) => {
    const booking = bookings.find((b) => b.id === bookingId);
    if (!booking) return;
    const newRoomNumber = fields.roomNumber !== undefined ? fields.roomNumber : booking.roomNumber;
    const merged = { ...booking, ...fields, roomNumber: newRoomNumber, roomId: (rooms.find((r) => r.number === newRoomNumber) || {}).id || null, partySize: fields.persons ?? booking.persons };
    if (supabaseSession) {
      try {
        const token = supabaseSession.access_token;
        if (guestPatch) {
          await supabasePatchChecked(`guests?id=eq.${booking.guestId}`, {
            accessToken: token,
            what: "Guest data",
            body: {
              name: guestPatch.name,
              phone: guestPatch.phone || null,
              email: guestPatch.email || null,
              national_id: guestPatch.nationalId || null,
            },
          });
          setGuests((gs) => gs.map((g) => (g.id === booking.guestId ? { ...g, ...guestPatch } : g)));
        }
        const body = {
          check_in: merged.checkIn,
          check_out: merged.checkOut,
          persons: merged.persons,
          meal_plans: merged.mealPlans || [],
          booking_type: merged.bookingType,
          payment_method: merged.paymentMethod || null,
          discount: merged.discountPercent || 0,
          total_amount: merged.totalAmount || 0,
        };
        if (newRoomNumber !== booking.roomNumber) {
          const room = rooms.find((r) => r.number === newRoomNumber);
          body.room_id = room ? room.id : null;
        }
        await supabasePatchChecked(`bookings?id=eq.${bookingId}`, { accessToken: token, body, what: "Booking changes" });
        setBookings((bs) => bs.map((b) => (b.id === bookingId ? merged : b)));
      } catch (e) {
        flashError(`Couldn't save changes: ${e.message}`);
      }
      return;
    }
    const nextGuests = guestPatch ? guests.map((g) => (g.id === booking.guestId ? { ...g, ...guestPatch } : g)) : guests;
    const nextBookings = bookings.map((b) => (b.id === bookingId ? merged : b));
    setGuests(nextGuests);
    setBookings(nextBookings);
    persist({ guests: nextGuests, bookings: nextBookings });
  };

  // Move an in-house guest to another room: old room -> dirty, new room -> occupied.
  const switchRoom = async (bookingId, newRoomNumber, newPersons, reason) => {
    const booking = bookings.find((b) => b.id === bookingId);
    if (!booking || booking.status !== "checked_in" || booking.roomNumber === newRoomNumber) return;
    const oldRoom = rooms.find((r) => r.number === booking.roomNumber);
    const newRoom = rooms.find((r) => r.number === newRoomNumber);
    if (!newRoom) return;
    const persons = newPersons || booking.persons;
    const guest = guests.find((g) => g.id === booking.guestId);
    const noteText = `${todayISO()} · Room ${booking.roomNumber} → ${newRoomNumber} · ${(reason || "").trim()}`;
    const newGuestNotes = guest ? appendSwitchNote(guest.notes, bookingId, noteText) : null;
    if (supabaseSession) {
      try {
        const token = supabaseSession.access_token;
        await supabasePatchChecked(`bookings?id=eq.${bookingId}`, {
          accessToken: token,
          what: "Room switch (booking)",
          body: { room_id: newRoom.id, persons },
        });
        await supabasePatchChecked(`rooms?id=eq.${newRoom.id}`, { accessToken: token, what: "New room status", body: { status: "occupied" } });
        if (oldRoom) {
          await supabasePatchChecked(`rooms?id=eq.${oldRoom.id}`, { accessToken: token, what: "Old room status", body: { status: "vacant_dirty" } });
        }
        setBookings((bs) =>
          bs.map((b) => (b.id === bookingId ? { ...b, roomId: newRoom.id, roomNumber: newRoomNumber, persons, partySize: persons } : b))
        );
        if (guest) {
          try {
            await supabasePatchChecked(`guests?id=eq.${guest.id}`, {
              accessToken: token,
              what: "Switch reason (guest note)",
              body: { notes: newGuestNotes },
            });
            setGuests((gs) => gs.map((g) => (g.id === guest.id ? { ...g, notes: newGuestNotes } : g)));
          } catch (e) {
            flashError(`Room switched, but the reason wasn't saved: ${e.message}`);
          }
        }
        setRooms((rs) =>
          rs.map((r) =>
            r.number === newRoomNumber ? { ...r, status: "occupied" } : r.number === booking.roomNumber ? { ...r, status: "vacant_dirty" } : r
          )
        );
      } catch (e) {
        flashError(`Couldn't switch room: ${e.message}`);
      }
      return;
    }
    const nextBookings = bookings.map((b) =>
      b.id === bookingId ? { ...b, roomNumber: newRoomNumber, persons, partySize: persons } : b
    );
    const nextRooms = rooms.map((r) =>
      r.number === newRoomNumber ? { ...r, status: "occupied" } : r.number === booking.roomNumber ? { ...r, status: "vacant_dirty" } : r
    );
    const nextGuests = guest ? guests.map((g) => (g.id === guest.id ? { ...g, notes: newGuestNotes } : g)) : guests;
    setBookings(nextBookings);
    setRooms(nextRooms);
    setGuests(nextGuests);
    persist({ bookings: nextBookings, rooms: nextRooms, guests: nextGuests });
  };

  const updateGuestTags = async (guestId, tags) => {
    const guest = guests.find((g) => g.id === guestId);
    if (!guest) return;
    const notes = setGuestTags(guest.notes, tags);
    if (supabaseSession) {
      try {
        await supabasePatchChecked(`guests?id=eq.${guestId}`, {
          accessToken: supabaseSession.access_token,
          what: "Guest status",
          body: { notes },
        });
        setGuests((gs) => gs.map((g) => (g.id === guestId ? { ...g, notes } : g)));
      } catch (e) {
        flashError(`Couldn't save guest status: ${e.message}`);
      }
      return;
    }
    updateGuests(guests.map((g) => (g.id === guestId ? { ...g, notes } : g)));
  };

  const deleteBookingRecord = async (bookingId) => {
    if (supabaseSession) {
      try {
        await supabaseRest(`bookings?id=eq.${bookingId}`, { accessToken: supabaseSession.access_token, method: "DELETE" });
        setBookings((bs) => bs.filter((b) => b.id !== bookingId));
      } catch (e) {
        flashError(`Couldn't delete booking: ${e.message}`);
      }
      return;
    }
    const nextBookings = bookings.filter((b) => b.id !== bookingId);
    updateBookings(nextBookings);
  };

  const addGuest = async (g) => {
    if (supabaseSession) {
      try {
        const [inserted] = await supabaseRest("guests", {
          accessToken: supabaseSession.access_token,
          method: "POST",
          body: {
            hotel_id: supabaseSession.hotelId,
            name: g.name,
            phone: g.phone || null,
            email: g.email || null,
            national_id: g.nationalId || null,
            notes: g.notes || "",
          },
        });
        setGuests((gs) => [...gs, mapGuestFromDb(inserted)]);
      } catch (e) {
        flashError(`Couldn't save guest: ${e.message}`);
      }
      return;
    }
    updateGuests([...guests, g]);
  };

  const reserveRoom = async ({ roomNumber, guestId, newGuest, checkIn: ci, checkOut: co, checkInNow, persons, mealPlans, bookingType, paymentMethod, discountPercent, totalAmount }) => {
    if (supabaseSession) {
      try {
        let finalGuestId = guestId;
        if (!finalGuestId && newGuest) {
          const [insertedGuest] = await supabaseRest("guests", {
            accessToken: supabaseSession.access_token,
            method: "POST",
            body: {
              hotel_id: supabaseSession.hotelId,
              name: newGuest.name,
              phone: newGuest.phone || null,
              email: newGuest.email || null,
              national_id: newGuest.nationalId || null,
              notes: newGuest.notes || "",
            },
          });
          finalGuestId = insertedGuest.id;
          setGuests((gs) => [...gs, mapGuestFromDb(insertedGuest)]);
        }
        const room = rooms.find((r) => r.number === roomNumber);
        const [insertedBooking] = await supabaseRest("bookings", {
          accessToken: supabaseSession.access_token,
          method: "POST",
          body: {
            hotel_id: supabaseSession.hotelId,
            room_id: room ? room.id : null,
            guest_id: finalGuestId,
            check_in: ci,
            check_out: co,
            persons: persons || 1,
            meal_plans: mealPlans || [],
            status: checkInNow ? "checked_in" : "reserved",
            booking_type: bookingType || "booking",
            payment_method: paymentMethod || null,
            discount: discountPercent || 0,
            total_amount: totalAmount || 0,
            created_by: supabaseSession.user.id,
          },
        });
        setBookings((bs) => [...bs, mapBookingFromDb(insertedBooking, room ? { [room.id]: roomNumber } : {})]);
        if (checkInNow && room) {
          await supabaseRest(`rooms?id=eq.${room.id}`, {
            accessToken: supabaseSession.access_token,
            method: "PATCH",
            body: { status: "occupied" },
          });
          setRooms((rs) => rs.map((r) => (r.number === roomNumber ? { ...r, status: "occupied" } : r)));
          if (selectedRoom && selectedRoom.number === roomNumber) {
            setSelectedRoom((s) => ({ ...s, status: "occupied" }));
          }
        }
        return true;
      } catch (e) {
        flashError(`Couldn't save booking: ${e.message}`);
        return false;
      }
    }
    let nextGuests = guests;
    let finalGuestId = guestId;
    if (!finalGuestId && newGuest) {
      finalGuestId = uid();
      nextGuests = [...guests, { id: finalGuestId, ...newGuest }];
    }
    const booking = {
      id: uid(),
      roomNumber,
      guestId: finalGuestId,
      checkIn: ci,
      checkOut: co,
      partySize: persons || 1,
      persons: persons || 1,
      mealPlans: mealPlans || [],
      status: checkInNow ? "checked_in" : "reserved",
      bookingType: bookingType || "booking",
      paymentMethod: paymentMethod || "",
      discountPercent: discountPercent || 0,
      totalAmount: totalAmount || 0,
      createdBy: username,
    };
    const nextBookings = [...bookings, booking];
    const nextRooms = checkInNow
      ? rooms.map((r) => (r.number === roomNumber ? { ...r, status: "occupied" } : r))
      : rooms;
    setGuests(nextGuests);
    setBookings(nextBookings);
    setRooms(nextRooms);
    persist({ guests: nextGuests, bookings: nextBookings, rooms: nextRooms });
    if (selectedRoom && selectedRoom.number === roomNumber && checkInNow) {
      setSelectedRoom({ ...selectedRoom, status: "occupied" });
    }
    return true;
  };

  const roomsNeedingCleaning = useMemo(
    () => rooms.filter((r) => r.status === "vacant_dirty"),
    [rooms]
  );

  const checkoutCounts = useMemo(() => {
    const c = {};
    bookings.forEach((b) => {
      if (b.status !== "checked_out") return;
      c[b.roomNumber] = (c[b.roomNumber] || 0) + 1;
    });
    return c;
  }, [bookings]);

  const roomsNeedingMaintenance = useMemo(
    () => rooms.filter((r) => (checkoutCounts[r.number] || 0) - (r.maintenanceBaseline || 0) >= MAINTENANCE_THRESHOLD),
    [rooms, checkoutCounts]
  );

  const upcomingBookings = useMemo(
    () =>
      bookings
        .filter((b) => b.status === "reserved" || b.status === "checked_in")
        .sort((a, b) => a.checkIn.localeCompare(b.checkIn)),
    [bookings]
  );

  const filteredGuests = useMemo(() => {
    const q = guestSearch.trim().toLowerCase();
    if (!q) return guests;
    return guests.filter(
      (g) =>
        g.name.toLowerCase().includes(q) ||
        (g.phone || "").toLowerCase().includes(q) ||
        (g.email || "").toLowerCase().includes(q) ||
        (g.nationalId || "").toLowerCase().includes(q)
    );
  }, [guests, guestSearch]);

  const counts = useMemo(() => {
    const c = { vacant_clean: 0, vacant_dirty: 0, occupied: 0, out_of_order: 0 };
    rooms.forEach((r) => (c[r.status] = (c[r.status] || 0) + 1));
    return c;
  }, [rooms]);

  if (!loaded) {
    return (
      <div style={{ fontFamily: "Inter, sans-serif", padding: "3rem", textAlign: "center", color: TOKENS.inkSoft }}>
        Loading the desk…
      </div>
    );
  }

  if (role === "manager") {
    return (
      <div
        style={{
          fontFamily: "Inter, sans-serif",
          background: TOKENS.paper,
          minHeight: "100vh",
          color: TOKENS.ink,
        }}
      >
        <header
          style={{
            background: TOKENS.ink,
            color: TOKENS.paper,
            padding: "1.25rem 1.5rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "0.75rem",
          }}
        >
          <div
            onClick={() => setManagerTab("home")}
            style={{ display: "flex", alignItems: "baseline", gap: "0.75rem", cursor: "pointer" }}
          >
            <span style={{ fontFamily: "Fraunces, serif", fontSize: "1.5rem", fontWeight: 600, letterSpacing: "0.01em" }}>
              Geisum Hotel
            </span>
            <span style={{ fontSize: "0.75rem", color: TOKENS.brass, letterSpacing: "0.08em", textTransform: "uppercase" }}>
              Manager console
            </span>
          </div>
          <button
            onClick={onLogout}
            style={{
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.2)",
              borderRadius: 8,
              padding: "0.4rem 0.8rem",
              color: TOKENS.paper,
              fontSize: "0.8rem",
              cursor: "pointer",
            }}
          >
            Sign out
          </button>
        </header>

        <nav
          style={{
            display: "flex",
            gap: "0.25rem",
            padding: "0.75rem 1.5rem 0",
            borderBottom: `1px solid ${TOKENS.paperDim}`,
            background: TOKENS.paper,
            flexWrap: "wrap",
          }}
        >
          {[
            { id: "analytics", label: "Analytics" },
            { id: "roomActivity", label: "Room activity" },
            { id: "ticketRecords", label: "Ticket records" },
            { id: "todayReport", label: "Today report" },
            { id: "pricing", label: "Room pricing" },
            { id: "users", label: "Users" },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setManagerTab(t.id)}
              style={{
                border: "none",
                background: "transparent",
                padding: "0.6rem 1rem",
                fontFamily: "Inter, sans-serif",
                fontSize: "0.9rem",
                fontWeight: 500,
                color: managerTab === t.id ? TOKENS.ink : TOKENS.inkSoft,
                borderBottom: managerTab === t.id ? `2px solid ${TOKENS.brass}` : "2px solid transparent",
                cursor: "pointer",
                opacity: managerTab === t.id ? 1 : 0.6,
              }}
            >
              {t.label}
            </button>
          ))}
        </nav>

        {error && (
          <div style={{ background: TOKENS.oosBg, color: TOKENS.oos, padding: "0.5rem 1.5rem", fontSize: "0.85rem" }}>
            {error}
          </div>
        )}

        <main style={{ padding: "1.5rem", maxWidth: 1100, margin: "0 auto" }}>
          {managerTab === "home" && (
            <TabHomeScreen
              tabs={[
                { id: "analytics", label: "Analytics" },
                { id: "roomActivity", label: "Room activity" },
                { id: "ticketRecords", label: "Ticket records" },
                { id: "todayReport", label: "Today report" },
                { id: "pricing", label: "Room pricing" },
                { id: "users", label: "Users" },
              ]}
              onSelect={setManagerTab}
            />
          )}
          {managerTab === "analytics" && (
            <AnalyticsDashboard
              rooms={rooms}
              bookings={bookings}
              maintenanceLog={maintenanceLog}
              roomRates={roomRates}
              mealPlanRates={mealPlanRates}
              tickets={tickets}
              accessToken={supabaseSession?.access_token}
              hotelId={supabaseSession?.hotelId}
              onDeleteTicket={deleteTicket}
              guestName={guestName}
              onDeleteBooking={deleteBookingRecord}
            />
          )}
          {managerTab === "roomActivity" && (
            <RoomActivityTab
              rooms={rooms}
              bookings={bookings}
              maintenanceLog={maintenanceLog}
              roomRates={roomRates}
              mealPlanRates={mealPlanRates}
            />
          )}
          {managerTab === "ticketRecords" && (
            <TicketRecordsTab
              accessToken={supabaseSession?.access_token}
              hotelId={supabaseSession?.hotelId}
              localTickets={tickets}
              onDeleteTicket={deleteTicket}
            />
          )}
          {managerTab === "todayReport" && (
            <TodayReportTab rooms={rooms} bookings={bookings} roomRates={roomRates} mealPlanRates={mealPlanRates} accessToken={supabaseSession?.access_token} hotelId={supabaseSession?.hotelId} guestName={guestName} onCheckIn={checkIn} onCheckOut={checkOut} />
          )}
          {managerTab === "pricing" && (
            <RoomPricingTab
              roomRates={roomRates}
              mealPlanRates={mealPlanRates}
              onSave={updateRoomRates}
              onSaveMealPlans={updateMealPlanRates}
            />
          )}
          {managerTab === "users" && (
            <UsersTab extraUsers={extraUsers} onAddUser={addUser} onDeleteUser={deleteUser} supabaseSession={supabaseSession} />
          )}
        </main>
      </div>
    );
  }

  if (role === "accountant") {
    return <AccountantConsole supabaseSession={supabaseSession} onLogout={onLogout} />;
  }

  if (role === "analyst") {
    return (
      <div
        style={{
          fontFamily: "Inter, sans-serif",
          background: TOKENS.paper,
          minHeight: "100vh",
          color: TOKENS.ink,
        }}
      >
        <header
          style={{
            background: TOKENS.ink,
            color: TOKENS.paper,
            padding: "1.25rem 1.5rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "0.75rem",
          }}
        >
          <div
            onClick={() => setManagerTab("home")}
            style={{ display: "flex", alignItems: "baseline", gap: "0.75rem", cursor: "pointer" }}
          >
            <span style={{ fontFamily: "Fraunces, serif", fontSize: "1.5rem", fontWeight: 600, letterSpacing: "0.01em" }}>
              Geisum Hotel
            </span>
            <span style={{ fontSize: "0.75rem", color: TOKENS.brass, letterSpacing: "0.08em", textTransform: "uppercase" }}>
              View access · pricing editable
            </span>
          </div>
          <button
            onClick={onLogout}
            style={{
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.2)",
              borderRadius: 8,
              padding: "0.4rem 0.8rem",
              color: TOKENS.paper,
              fontSize: "0.8rem",
              cursor: "pointer",
            }}
          >
            Sign out
          </button>
        </header>

        <nav
          style={{
            display: "flex",
            gap: "0.25rem",
            padding: "0.75rem 1.5rem 0",
            borderBottom: `1px solid ${TOKENS.paperDim}`,
            background: TOKENS.paper,
            flexWrap: "wrap",
          }}
        >
          {[
            { id: "analytics", label: "Analytics" },
            { id: "roomActivity", label: "Room activity" },
            { id: "ticketRecords", label: "Ticket records" },
            { id: "todayReport", label: "Today report" },
            { id: "pricing", label: "Room pricing" },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setManagerTab(t.id)}
              style={{
                border: "none",
                background: "transparent",
                padding: "0.6rem 1rem",
                fontFamily: "Inter, sans-serif",
                fontSize: "0.9rem",
                fontWeight: 500,
                color: managerTab === t.id ? TOKENS.ink : TOKENS.inkSoft,
                borderBottom: managerTab === t.id ? `2px solid ${TOKENS.brass}` : "2px solid transparent",
                cursor: "pointer",
                opacity: managerTab === t.id ? 1 : 0.6,
              }}
            >
              {t.label}
            </button>
          ))}
        </nav>

        {error && (
          <div style={{ background: TOKENS.oosBg, color: TOKENS.oos, padding: "0.5rem 1.5rem", fontSize: "0.85rem" }}>
            {error}
          </div>
        )}

        <main style={{ padding: "1.5rem", maxWidth: 1100, margin: "0 auto" }}>
          {managerTab === "home" && (
            <TabHomeScreen
              tabs={[
                { id: "analytics", label: "Analytics" },
                { id: "roomActivity", label: "Room activity" },
                { id: "ticketRecords", label: "Ticket records" },
                { id: "todayReport", label: "Today report" },
                { id: "pricing", label: "Room pricing" },
              ]}
              onSelect={setManagerTab}
            />
          )}
          {managerTab === "analytics" && (
            <AnalyticsDashboard
              rooms={rooms}
              bookings={bookings}
              maintenanceLog={maintenanceLog}
              roomRates={roomRates}
              mealPlanRates={mealPlanRates}
              tickets={tickets}
              accessToken={supabaseSession?.access_token}
              hotelId={supabaseSession?.hotelId}
              guestName={guestName}
            />
          )}
          {managerTab === "roomActivity" && (
            <RoomActivityTab
              rooms={rooms}
              bookings={bookings}
              maintenanceLog={maintenanceLog}
              roomRates={roomRates}
              mealPlanRates={mealPlanRates}
            />
          )}
          {managerTab === "ticketRecords" && (
            <TicketRecordsTab
              accessToken={supabaseSession?.access_token}
              hotelId={supabaseSession?.hotelId}
              localTickets={tickets}
            />
          )}
          {managerTab === "todayReport" && (
            <TodayReportTab rooms={rooms} bookings={bookings} roomRates={roomRates} mealPlanRates={mealPlanRates} accessToken={supabaseSession?.access_token} hotelId={supabaseSession?.hotelId} guestName={guestName} />
          )}
          {managerTab === "pricing" && (
            <RoomPricingTab
              roomRates={roomRates}
              mealPlanRates={mealPlanRates}
              onSave={updateRoomRates}
              onSaveMealPlans={updateMealPlanRates}
            />
          )}
        </main>
      </div>
    );
  }

  return (
    <div
      style={{
        fontFamily: "Inter, sans-serif",
        background: TOKENS.paper,
        minHeight: "100vh",
        color: TOKENS.ink,
      }}
    >
      <header
        style={{
          background: TOKENS.ink,
          color: TOKENS.paper,
          padding: "1.25rem 1.5rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "0.75rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: "0.75rem" }}>
          <span
            style={{
              fontFamily: "Fraunces, serif",
              fontSize: "1.5rem",
              fontWeight: 600,
              letterSpacing: "0.01em",
            }}
          >
            Geisum Hotel
          </span>
          <span style={{ fontSize: "0.75rem", color: TOKENS.brass, letterSpacing: "0.08em", textTransform: "uppercase" }}>
            Reception console
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <span
            style={{
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.2)",
              borderRadius: 6,
              padding: "0.4rem 0.7rem",
              color: TOKENS.paper,
              fontSize: "0.8rem",
            }}
          >
            Signed in as <strong>{username}</strong>
          </span>
          <span style={{ fontSize: "0.7rem", color: saving ? TOKENS.brass : "rgba(245,239,230,0.4)" }}>
            {saving ? "Saving…" : "Synced"}
          </span>
          <button
            onClick={onLogout}
            style={{
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.2)",
              borderRadius: 6,
              padding: "0.4rem 0.7rem",
              color: TOKENS.paper,
              fontSize: "0.75rem",
              cursor: "pointer",
            }}
          >
            Sign out
          </button>
        </div>
      </header>

      <nav
        style={{
          display: "flex",
          gap: "0.25rem",
          padding: "0.75rem 1.5rem 0",
          borderBottom: `1px solid ${TOKENS.paperDim}`,
          background: TOKENS.paper,
          flexWrap: "wrap",
        }}
      >
        {[
          { id: "rooms", label: "Rooms" },
          { id: "bookings", label: "Bookings" },
          { id: "guests", label: "Guests" },
          { id: "housekeeping", label: "Housekeeping" },
          { id: "todayReport", label: "Today report" },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              border: "none",
              background: "transparent",
              padding: "0.6rem 1rem",
              fontFamily: "Inter, sans-serif",
              fontSize: "0.9rem",
              fontWeight: 500,
              color: tab === t.id ? TOKENS.ink : TOKENS.inkSoft,
              borderBottom: tab === t.id ? `2px solid ${TOKENS.brass}` : "2px solid transparent",
              cursor: "pointer",
              opacity: tab === t.id ? 1 : 0.6,
            }}
          >
            {t.label}
            {t.id === "housekeeping" && (roomsNeedingCleaning.length > 0 || roomsNeedingMaintenance.length > 0) && (
              <span
                style={{
                  marginLeft: 6,
                  background: TOKENS.dirty,
                  color: "#fff",
                  borderRadius: 10,
                  fontSize: "0.65rem",
                  padding: "1px 6px",
                }}
              >
                {roomsNeedingCleaning.length + roomsNeedingMaintenance.length}
              </span>
            )}
          </button>
        ))}
      </nav>

      {error && (
        <div style={{ background: TOKENS.oosBg, color: TOKENS.oos, padding: "0.5rem 1.5rem", fontSize: "0.85rem" }}>
          {error}
        </div>
      )}

      <main style={{ padding: "1.5rem", maxWidth: 1100, margin: "0 auto" }}>
        {tab === "rooms" && (
          <RoomsTab
            rooms={rooms}
            counts={counts}
            onSelect={setSelectedRoom}
            activeBookingForRoom={activeBookingForRoom}
            guestName={guestName}
            checkoutCounts={checkoutCounts}
            roomRates={roomRates}
            bookings={bookings}
            onCheckIn={checkIn}
            onQuickClean={(number) => setRoomStatus(number, "vacant_clean", "")}
          />
        )}
        {tab === "bookings" && (
          <BookingsTab
            bookings={upcomingBookings}
            allBookings={bookings}
            rooms={rooms}
            guests={guests}
            guestName={guestName}
            onCheckIn={checkIn}
            onCheckOut={checkOut}
            onCancel={cancelBooking}
            onUpdateBooking={updateBooking}
            onSwitchRoom={switchRoom}
            showNew={showNewBooking}
            setShowNew={setShowNewBooking}
            roomRates={roomRates}
            mealPlanRates={mealPlanRates}
            onReserve={(payload) => {
              reserveRoom(payload);
              setShowNewBooking(false);
            }}
          />
        )}
        {tab === "guests" && (
          <GuestsTab
            guests={filteredGuests}
            search={guestSearch}
            setSearch={setGuestSearch}
            showNew={showNewGuest}
            setShowNew={setShowNewGuest}
            onCreate={(g) => {
              addGuest(g);
              setShowNewGuest(false);
            }}
            bookings={bookings}
            rooms={rooms}
            onUpdateTags={updateGuestTags}
          />
        )}
        {tab === "housekeeping" && (
          <HousekeepingTab
            rooms={rooms}
            username={username}
            onMarkClean={(number) => setRoomStatus(number, "vacant_clean", "")}
            checkoutCounts={checkoutCounts}
            onPostponeMaintenance={postponeMaintenance}
            activeBookingForRoom={activeBookingForRoom}
            guestName={guestName}
            onMarkCleanedToday={markCleanedToday}
            bookings={bookings}
          />
        )}
        {tab === "todayReport" && (
          <TodayReportTab rooms={rooms} bookings={bookings} roomRates={roomRates} mealPlanRates={mealPlanRates} accessToken={supabaseSession?.access_token} hotelId={supabaseSession?.hotelId} guestName={guestName} onCheckIn={checkIn} onCheckOut={checkOut} />
        )}
      </main>

      {selectedRoom && (
        <RoomDrawer
          room={rooms.find((r) => r.number === selectedRoom.number) || selectedRoom}
          onClose={() => setSelectedRoom(null)}
          onSetStatus={(status) => setRoomStatus(selectedRoom.number, status)}
          booking={activeBookingForRoom(selectedRoom.number)}
          guestName={guestName}
          onCheckOut={checkOut}
          checkoutCounts={checkoutCounts}
          onPostponeMaintenance={postponeMaintenance}
          guests={guests}
          allBookings={bookings}
          onReserve={reserveRoom}
          roomRates={roomRates}
          mealPlanRates={mealPlanRates}
        />
      )}
    </div>
  );
}

function Pill({ status }) {
  const meta = STATUS_META[status];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: "0.72rem",
        fontWeight: 500,
        color: meta.color,
        background: meta.bg,
        borderRadius: 20,
        padding: "3px 10px",
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: meta.color }} />
      {meta.label}
    </span>
  );
}

// ───────────────────────── Rooms page (rack) ─────────────────────────

const ROOMS_CSS = `
@keyframes rkPop { from { opacity: 0; transform: translateY(8px) scale(.98) } to { opacity: 1; transform: none } }
@keyframes rkSlideRight { from { transform: translateX(100%) } to { transform: translateX(0) } }
.rk-grid { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: .75rem; }
@media (max-width: 1023px) { .rk-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
@media (max-width: 639px) { .rk-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .6rem; } }
.rk-card { position: relative; overflow: hidden; cursor: pointer; animation: rkPop .28s ease-out both; transition: box-shadow .15s, transform .15s; }
.rk-card:hover, .rk-card:focus-visible { box-shadow: 0 8px 22px rgba(27,36,48,.14); transform: translateY(-2px); outline: none; }
.rk-actions { position: absolute; left: 0; right: 0; bottom: 0; display: flex; gap: 5px; padding: 22px 8px 8px; background: linear-gradient(to top, rgba(255,255,255,.98) 62%, rgba(255,255,255,0)); opacity: 0; transform: translateY(8px); transition: opacity .15s, transform .15s; pointer-events: none; }
.rk-card:hover .rk-actions, .rk-card:focus-within .rk-actions { opacity: 1; transform: none; pointer-events: auto; }
@media (hover: none) { .rk-actions { display: none; } }
.rk-act { flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 4px; border: 1px solid #EAE1D2; background: #fff; color: #3A4556; border-radius: 8px; padding: 5px 4px; font-size: .68rem; font-weight: 600; cursor: pointer; white-space: nowrap; }
.rk-act:hover { background: #F5EFE6; }
.rk-act.primary { background: #1B2430; color: #F5EFE6; border-color: #1B2430; }
.rk-act.primary:hover { background: #2a3646; }
.rk-kpi { text-align: left; cursor: pointer; border: 1px solid rgba(255,255,255,.9); background: rgba(255,255,255,.62); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); border-radius: 14px; padding: .7rem .8rem; display: flex; align-items: center; gap: 10px; transition: transform .15s, box-shadow .15s, background .15s; box-shadow: 0 2px 10px rgba(27,36,48,.05); font-family: inherit; }
.rk-kpi:hover { transform: translateY(-1px); background: rgba(255,255,255,.85); }
.rk-kpi:focus-visible { outline: 2px solid #B08968; outline-offset: 2px; }
`;

const ORDINALS = ["th", "st", "nd", "rd"];
function floorLabel(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return `Floor ${n}`;
  const mod = v % 100;
  const suffix = ORDINALS[(mod - 20) % 10] || ORDINALS[mod] || ORDINALS[0];
  return `${v}${suffix} Floor`;
}
const ROOM_SHORT_STATUS = { vacant_clean: "Vacant", vacant_dirty: "Needs cleaning", occupied: "Occupied", out_of_order: "Out of order" };

function RoomsTab({ rooms, counts, onSelect, activeBookingForRoom, guestName, checkoutCounts, roomRates, bookings, onCheckIn, onQuickClean }) {
  const [filter, setFilter] = useState(null);
  const today = todayISO();
  const floors = [...new Set(rooms.map((r) => r.floor))].sort((a, b) => Number(a) - Number(b));
  const isMaint = (r) => (checkoutCounts[r.number] || 0) - (r.maintenanceBaseline || 0) >= MAINTENANCE_THRESHOLD;
  const maintenanceCount = rooms.filter(isMaint).length;
  const matches = (r) => !filter || (filter === "maintenance" ? isMaint(r) : r.status === filter);
  const shown = rooms.filter(matches).length;

  const kpis = [
    { key: "vacant_clean", label: "Vacant · clean", icon: "check", color: TOKENS.clean, bg: TOKENS.cleanBg, n: counts.vacant_clean || 0 },
    { key: "occupied", label: "Occupied", icon: "bed", color: TOKENS.occupied, bg: TOKENS.occupiedBg, n: counts.occupied || 0 },
    { key: "vacant_dirty", label: "Needs cleaning", icon: "sparkles", color: TOKENS.dirty, bg: TOKENS.dirtyBg, n: counts.vacant_dirty || 0 },
    { key: "out_of_order", label: "Out of order", icon: "ban", color: TOKENS.oos, bg: TOKENS.oosBg, n: counts.out_of_order || 0 },
    { key: "maintenance", label: "Needs maintenance", icon: "wrench", color: TOKENS.oos, bg: TOKENS.oosBg, n: maintenanceCount },
  ];

  return (
    <div>
      <style>{ROOMS_CSS}</style>

      <div style={{ background: "linear-gradient(135deg, rgba(176,137,104,.22), rgba(68,85,105,.12))", borderRadius: 18, padding: 10, marginBottom: "1rem" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8 }}>
          {kpis.map((k) => {
            const active = filter === k.key;
            return (
              <button
                key={k.key}
                className="rk-kpi"
                onClick={() => setFilter(active ? null : k.key)}
                aria-pressed={active}
                style={{ borderColor: active ? k.color : undefined, boxShadow: active ? `0 0 0 2px ${k.color}33, 0 6px 16px rgba(27,36,48,.08)` : undefined, background: active ? "rgba(255,255,255,.95)" : undefined }}
              >
                <span style={{ width: 34, height: 34, borderRadius: 10, background: k.bg, color: k.color, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Ico name={k.icon} size={17} />
                </span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: "1.35rem", fontWeight: 700, fontFamily: "Fraunces, serif", lineHeight: 1.1, color: TOKENS.ink }}>{k.n}</span>
                  <span style={{ display: "block", fontSize: "0.7rem", color: TOKENS.inkSoft, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{k.label}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ display: "flex", gap: "0.9rem", flexWrap: "wrap", alignItems: "center", marginBottom: "1.25rem", fontSize: "0.72rem", color: TOKENS.inkSoft }}>
        {[
          { color: "#D9A527", label: "Checking out today" },
          { color: TOKENS.oos, label: "Occupied" },
          { color: TOKENS.clean, label: "Arriving today" },
          { color: TOKENS.dirty, label: "Needs maintenance" },
          { color: "#3B6FA0", label: "Needs cleaning" },
        ].map((item) => (
          <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 9, height: 9, borderRadius: "50%", background: item.color, display: "inline-block" }} />
            {item.label}
          </div>
        ))}
        {filter && (
          <button className="gx-btn" onClick={() => setFilter(null)} style={{ ...ghostBtn, marginLeft: "auto", padding: "0.25rem 0.65rem", fontSize: "0.72rem", display: "inline-flex", alignItems: "center", gap: 5 }}>
            Showing {shown} room{shown === 1 ? "" : "s"} <Ico name="x" size={12} /> Clear
          </button>
        )}
      </div>

      {shown === 0 && (
        <div style={{ ...cardStyle, textAlign: "center", padding: "2rem 1rem", color: TOKENS.inkSoft }}>
          No rooms match this filter.{" "}
          <button onClick={() => setFilter(null)} style={{ ...ghostBtn, marginLeft: 6 }}>
            Show all rooms
          </button>
        </div>
      )}

      {floors.map((floor) => {
        const floorRooms = rooms.filter((r) => r.floor === floor);
        const visible = floorRooms.filter(matches);
        if (visible.length === 0) return null;
        const usable = floorRooms.filter((r) => r.status !== "out_of_order").length;
        const occ = floorRooms.filter((r) => r.status === "occupied").length;
        const pct = usable ? Math.round((occ / usable) * 100) : 0;
        return (
          <div key={floor} style={{ marginBottom: "1.75rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: "0.7rem", flexWrap: "wrap" }}>
              <div style={{ fontFamily: "Fraunces, serif", fontSize: "1.05rem", fontWeight: 600 }}>{floorLabel(floor)}</div>
              <div style={{ flex: "1 1 120px", maxWidth: 260, height: 6, background: TOKENS.paperDim, borderRadius: 999, overflow: "hidden" }} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${floorLabel(floor)} occupancy`}>
                <div style={{ width: `${pct}%`, height: "100%", background: `linear-gradient(90deg, ${TOKENS.brass}, ${TOKENS.occupied})`, borderRadius: 999, transition: "width .4s ease" }} />
              </div>
              <div style={{ fontSize: "0.72rem", color: TOKENS.inkSoft }}>
                {occ}/{usable} occupied · <strong style={{ color: TOKENS.ink }}>{pct}%</strong>
              </div>
            </div>
            <div className="rk-grid" key={filter || "all"}>
              {visible.map((room, idx) => {
                const meta = STATUS_META[room.status];
                const booking = activeBookingForRoom(room.number);
                const needsMaintenance = isMaint(room);
                const checkoutToday = booking && booking.checkOut === today;
                const arriving = !booking ? bookings.find((b) => b.roomNumber === room.number && b.status === "reserved" && b.checkIn === today) : null;
                const isOccupied = room.status === "occupied";
                const needsCleaning = room.status === "vacant_dirty";
                let dotColor = meta.color;
                if (checkoutToday) dotColor = "#D9A527";
                else if (isOccupied) dotColor = TOKENS.oos;
                else if (arriving) dotColor = TOKENS.clean;
                else if (needsMaintenance) dotColor = TOKENS.dirty;
                else if (needsCleaning) dotColor = "#3B6FA0";
                const canCheckIn = !!arriving && (room.status === "vacant_clean" || room.status === "vacant_dirty");
                const stop = (fn) => (e) => {
                  e.stopPropagation();
                  fn();
                };
                return (
                  <div
                    key={room.number + (filter || "")}
                    className="rk-card"
                    role="button"
                    tabIndex={0}
                    onClick={() => onSelect(room)}
                    onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onSelect(room))}
                    aria-label={`Room ${room.number}, ${meta.label}`}
                    style={{
                      background: "#fff",
                      border: `1px solid ${TOKENS.paperDim}`,
                      borderTop: `3px solid ${meta.color}`,
                      borderRadius: 14,
                      padding: "0.7rem 0.75rem 0.65rem",
                      minHeight: 132,
                      animationDelay: `${Math.min(idx, 12) * 18}ms`,
                      boxShadow: "0 1px 2px rgba(27,36,48,0.05)",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 6 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span
                          title={checkoutToday ? "Checking out today" : isOccupied ? "Occupied" : arriving ? "Arriving today" : needsMaintenance ? "Needs maintenance" : needsCleaning ? "Needs cleaning" : undefined}
                          style={{ width: 9, height: 9, borderRadius: "50%", background: dotColor, flexShrink: 0 }}
                        />
                        <span style={{ fontFamily: "Fraunces, serif", fontSize: "1.55rem", fontWeight: 700, lineHeight: 1 }}>{room.number}</span>
                      </div>
                      <span style={{ fontSize: "0.64rem", fontWeight: 700, color: TOKENS.inkSoft, background: TOKENS.paper, borderRadius: 6, padding: "2px 6px", letterSpacing: "0.03em", whiteSpace: "nowrap" }}>
                        {room.type}
                      </span>
                    </div>

                    <div style={{ marginTop: 8 }}>
                      <SoftBadge small color={meta.color} bg={meta.bg}>
                        {ROOM_SHORT_STATUS[room.status] || meta.label}
                      </SoftBadge>
                    </div>

                    <div style={{ fontSize: "0.7rem", color: TOKENS.inkSoft, marginTop: 6 }}>{fmtMoney(getRoomRate(room, roomRates))}/night</div>

                    {booking && (
                      <div style={{ fontSize: "0.72rem", color: TOKENS.ink, marginTop: 5, display: "flex", alignItems: "center", gap: 5, minWidth: 0 }}>
                        <Ico name="user" size={12} color={TOKENS.inkSoft} />
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{guestName(booking.guestId)}</span>
                      </div>
                    )}
                    {!booking && arriving && (
                      <div style={{ fontSize: "0.68rem", color: TOKENS.clean, marginTop: 5, display: "flex", alignItems: "center", gap: 5, minWidth: 0 }}>
                        <Ico name="user" size={12} />
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Arriving: {guestName(arriving.guestId)}</span>
                      </div>
                    )}
                    {checkoutToday && <div style={{ fontSize: "0.66rem", color: "#9A7410", marginTop: 3, fontWeight: 600 }}>Checking out today</div>}
                    {needsMaintenance && (
                      <div title={`Checked out ${checkoutCounts[room.number]} times — due for a maintenance check`} style={{ fontSize: "0.66rem", color: TOKENS.oos, marginTop: 3, fontWeight: 600 }}>
                        Maintenance due
                      </div>
                    )}

                    <div className="rk-actions">
                      {canCheckIn && (
                        <button className="rk-act primary" onClick={stop(() => onCheckIn(arriving.id))} title="Check in the arriving guest">
                          <Ico name="login" size={12} /> Check in
                        </button>
                      )}
                      {needsCleaning && (
                        <button className="rk-act" onClick={stop(() => onQuickClean(room.number))} title="Mark as clean">
                          <Ico name="sparkles" size={12} /> Clean
                        </button>
                      )}
                      <button className="rk-act" onClick={stop(() => onSelect(room))} title="View details">
                        <Ico name="eye" size={12} /> Details
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PaymentMethodPicker({ value, onChange }) {
  return (
    <div style={{ marginBottom: "0.75rem" }}>
      <div style={{ fontSize: "0.7rem", color: TOKENS.inkSoft, marginBottom: 4 }}>Payment method</div>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
        {PAYMENT_METHODS.map((m) => (
          <label key={m.key} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.82rem", cursor: "pointer" }}>
            <input type="checkbox" checked={value === m.key} onChange={() => onChange(value === m.key ? "" : m.key)} />
            {m.label}
          </label>
        ))}
      </div>
    </div>
  );
}

function RoomDrawer({ room, onClose, onSetStatus, booking, guestName, onCheckOut, checkoutCounts, onPostponeMaintenance, guests, allBookings, onReserve, roomRates, mealPlanRates }) {
  const checkoutsSinceCheck = (checkoutCounts[room.number] || 0) - (room.maintenanceBaseline || 0);
  const needsMaintenance = checkoutsSinceCheck >= MAINTENANCE_THRESHOLD;
  const canReserve = room.status === "vacant_clean" || room.status === "vacant_dirty";
  const occupancyOptions = occupancyOptionsForType(room.type);
  const showMealPlans = true;
  const [confirmOut, setConfirmOut] = useState(false);
  const roomHistory = useMemo(
    () => allBookings.filter((b) => b.roomNumber === room.number).sort((a, b) => b.checkIn.localeCompare(a.checkIn)),
    [allBookings, room.number]
  );

  const [guestMode, setGuestMode] = useState(guests.length ? "existing" : "new");
  const [form, setForm] = useState({
    guestId: "",
    name: "",
    phone: "",
    email: "",
    nationalId: "",
    checkIn: todayISO(),
    checkOut: addDaysISO(todayISO(), 1),
    checkInNow: false,
    persons: occupancyOptions[0],
    mealPlans: [],
    bookingType: "booking",
    paymentMethod: "",
    discountPercent: 0,
    totalAmount: "",
  });
  const [formError, setFormError] = useState("");
  const [duplicateGuestWarning, setDuplicateGuestWarning] = useState("");

  const nights = form.checkOut > form.checkIn ? Math.round((new Date(form.checkOut) - new Date(form.checkIn)) / 86400000) : 0;
  const discountPercent = Math.min(100, Math.max(0, Number(form.discountPercent) || 0));
  const grossTotal = Number(form.totalAmount) || 0;
  const estimatedTotal = grossTotal * (1 - discountPercent / 100);

  const selectMealPlan = (plan) => {
    setForm((f) => ({ ...f, mealPlans: plan ? [plan] : [] }));
  };

  const checkDuplicateNationalId = (value) => {
    const q = value.trim().toLowerCase();
    if (!q) {
      setDuplicateGuestWarning("");
      return;
    }
    const match = guests.find((g) => (g.nationalId || "").trim().toLowerCase() === q);
    setDuplicateGuestWarning(match ? `This ID belongs to an existing customer: ${match.name}.` : "");
  };

  const conflict =
    form.checkIn && form.checkOut && form.checkOut > form.checkIn
      ? findConflict(allBookings, room.number, form.checkIn, form.checkOut)
      : null;

  const submitReservation = () => {
    setFormError("");
    if (!form.checkOut || form.checkOut <= form.checkIn) {
      setFormError("Check-out must be after check-in.");
      return;
    }
    if (guestMode === "existing" && !form.guestId) {
      setFormError("Choose a guest, or switch to \"New guest\".");
      return;
    }
    if (guestMode === "new" && !form.name.trim()) {
      setFormError("Guest name is required.");
      return;
    }
    if (guestMode === "new" && duplicateGuestWarning) {
      setFormError(duplicateGuestWarning + " Switch to \"Existing guest\" to select them instead, or double-check the ID.");
      return;
    }
    const clash = findConflict(allBookings, room.number, form.checkIn, form.checkOut);
    if (clash) {
      setFormError(`This room is already booked for ${guestName(clash.guestId)} from ${fmtDate(clash.checkIn)} to ${fmtDate(clash.checkOut)}.`);
      return;
    }
    onReserve({
      roomNumber: room.number,
      guestId: guestMode === "existing" ? form.guestId : null,
      newGuest:
        guestMode === "new"
          ? { name: form.name, phone: form.phone, email: form.email, nationalId: form.nationalId, notes: "" }
          : null,
      checkIn: form.checkIn,
      checkOut: form.checkOut,
      checkInNow: form.checkInNow,
      persons: form.persons,
      mealPlans: showMealPlans ? form.mealPlans : [],
      bookingType: form.bookingType,
      paymentMethod: form.paymentMethod,
      discountPercent,
      totalAmount: grossTotal,
    });
    onClose();
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(27,36,48,0.4)",
        display: "flex",
        justifyContent: "flex-end",
        zIndex: 50,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 420,
          maxWidth: "100vw",
          background: TOKENS.paper,
          height: "100%",
          padding: "1.25rem",
          overflowY: "auto",
          animation: "rkSlideRight .22s ease-out",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
          <div>
            <div style={{ fontFamily: "Fraunces, serif", fontSize: "2.2rem", fontWeight: 700, lineHeight: 1 }}>{room.number}</div>
            <div style={{ color: TOKENS.inkSoft, marginTop: 6, fontSize: "0.85rem" }}>
              {room.type} · {floorLabel(room.floor)} · {fmtMoney(getRoomRate(room, roomRates))}/night
            </div>
          </div>
          <button className="gx-btn" onClick={onClose} aria-label="Close" style={{ ...ghostBtn, padding: "0.4rem", display: "inline-flex", background: "#fff" }}>
            <Ico name="x" size={16} />
          </button>
        </div>
        <div style={{ marginBottom: 4 }}>
          <SoftBadge color={STATUS_META[room.status].color} bg={STATUS_META[room.status].bg}>
            {STATUS_META[room.status].label}
          </SoftBadge>
        </div>

        {needsMaintenance && (
          <div
            style={{
              marginTop: "1rem",
              background: TOKENS.oosBg,
              border: `1px solid ${TOKENS.oos}`,
              borderRadius: 10,
              padding: "0.9rem",
            }}
          >
            <div style={{ fontWeight: 600, color: TOKENS.oos, marginBottom: 4 }}>Maintenance check due</div>
            <div style={{ fontSize: "0.8rem", color: TOKENS.inkSoft, marginBottom: 10 }}>
              Checked out {checkoutsSinceCheck} times since the last check.
            </div>
            <button
              onClick={() => onPostponeMaintenance(room.number)}
              style={{ ...ghostBtn, width: "100%", background: "#fff" }}
            >
              Mark maintenance done / postpone
            </button>
          </div>
        )}

        {booking && (
          <div style={{ marginTop: "1.25rem", background: "#fff", borderRadius: 12, padding: "0.9rem", border: `1px solid ${TOKENS.paperDim}` }}>
            <div style={{ fontSize: "0.72rem", color: TOKENS.inkSoft, marginBottom: 6, fontWeight: 600 }}>Active guest</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <span style={{ width: 32, height: 32, borderRadius: "50%", background: TOKENS.paper, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                <Ico name="user" size={16} color={TOKENS.inkSoft} />
              </span>
              <div style={{ fontWeight: 600, fontSize: "1rem" }}>{guestName(booking.guestId)}</div>
            </div>
            {(() => {
              const g = guests.find((x) => x.id === booking.guestId);
              const nn = nightsBetween(booking.checkIn, booking.checkOut);
              return (
                <div style={{ fontSize: "0.8rem", color: TOKENS.inkSoft, display: "flex", flexDirection: "column", gap: 4, marginBottom: 10 }}>
                  {g && g.phone && (
                    <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <Ico name="phone" size={12} /> {g.phone}
                    </span>
                  )}
                  {g && g.email && (
                    <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <Ico name="mail" size={12} /> {g.email}
                    </span>
                  )}
                  {g && g.nationalId && (
                    <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <Ico name="id" size={12} /> {g.nationalId}
                    </span>
                  )}
                  <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <Ico name="calendar" size={12} /> {fmtDateY(booking.checkIn)} → {fmtDateY(booking.checkOut)}
                    {nn > 0 ? ` · ${nn} night${nn === 1 ? "" : "s"}` : ""} · {booking.persons || 1} {(booking.persons || 1) === 1 ? "person" : "persons"}
                  </span>
                </div>
              );
            })()}
            <div style={{ marginBottom: 10 }}>
              <BookingBadges b={booking} small />
            </div>
            {booking.discountPercent > 0 && (
              <div style={{ fontSize: "0.72rem", color: TOKENS.clean, marginBottom: 8 }}>{booking.discountPercent}% discount applied</div>
            )}
            <button
              className="gx-btn"
              onClick={() => setConfirmOut(true)}
              style={{ width: "100%", background: TOKENS.ink, color: TOKENS.paper, border: "none", borderRadius: 8, padding: "0.55rem", cursor: "pointer", fontWeight: 500, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6 }}
            >
              <Ico name="logout" size={14} /> Check out
            </button>
          </div>
        )}

        {!booking && (
          <div style={{ marginTop: "1.25rem" }}>
            <div style={{ fontSize: "0.72rem", color: TOKENS.inkSoft, marginBottom: 6, fontWeight: 600 }}>Quick status</div>
            <div style={{ display: "flex", gap: 6 }}>
              {[
                { key: "vacant_clean", label: "Clean", icon: "check" },
                { key: "vacant_dirty", label: "Needs cleaning", icon: "sparkles" },
                { key: "out_of_order", label: "Out of order", icon: "ban" },
              ].map((o) => {
                const active = room.status === o.key;
                const m = STATUS_META[o.key];
                return (
                  <button
                    key={o.key}
                    className="gx-btn"
                    onClick={() => !active && onSetStatus(o.key)}
                    aria-pressed={active}
                    style={{ ...ghostBtn, flex: 1, padding: "0.5rem 0.3rem", fontSize: "0.72rem", display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 3, background: active ? m.bg : "#fff", color: active ? m.color : TOKENS.inkSoft, borderColor: active ? m.color : TOKENS.paperDim, fontWeight: active ? 700 : 400 }}
                  >
                    <Ico name={o.icon} size={15} />
                    {o.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {canReserve && (
          <div style={{ marginTop: "1.25rem", background: "#fff", borderRadius: 10, padding: "0.9rem", border: `1px solid ${TOKENS.paperDim}` }}>
            <div style={{ fontWeight: 600, marginBottom: 10 }}>New reservation</div>

            <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
              <button
                onClick={() => setGuestMode("existing")}
                style={{ ...ghostBtn, flex: 1, background: guestMode === "existing" ? TOKENS.paperDim : "#fff" }}
              >
                Existing guest
              </button>
              <button
                onClick={() => setGuestMode("new")}
                style={{ ...ghostBtn, flex: 1, background: guestMode === "new" ? TOKENS.paperDim : "#fff" }}
              >
                New guest
              </button>
            </div>

            {guestMode === "existing" ? (
              <select
                value={form.guestId}
                onChange={(e) => setForm({ ...form, guestId: e.target.value })}
                style={{ ...inputStyle, width: "100%", marginBottom: 8 }}
              >
                <option value="">Select guest…</option>
                {guests.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 8 }}>
                <input placeholder="Full name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={inputStyle} />
                <input
                  placeholder="National ID / passport number (optional)"
                  value={form.nationalId}
                  onChange={(e) => setForm({ ...form, nationalId: e.target.value })}
                  onBlur={(e) => checkDuplicateNationalId(e.target.value)}
                  style={inputStyle}
                />
                {duplicateGuestWarning && (
                  <div style={{ fontSize: "0.78rem", color: TOKENS.oos, background: TOKENS.oosBg, borderRadius: 8, padding: "0.5rem 0.7rem" }}>
                    ⚠ {duplicateGuestWarning}
                  </div>
                )}
                <input placeholder="Phone (optional)" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} style={inputStyle} />
                <input placeholder="Email (optional)" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} style={inputStyle} />
              </div>
            )}

            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: "0.7rem", color: TOKENS.inkSoft, marginBottom: 4 }}>Booking type</div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: "50%",
                    background: bookingTypeMeta(form.bookingType).color,
                    flexShrink: 0,
                  }}
                />
                <select
                  value={form.bookingType}
                  onChange={(e) => setForm({ ...form, bookingType: e.target.value })}
                  style={{ ...inputStyle, width: "100%" }}
                >
                  {BOOKING_TYPES.map((t) => (
                    <option key={t.key} value={t.key}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
              <div>
                <div style={{ fontSize: "0.7rem", color: TOKENS.inkSoft, marginBottom: 4 }}>Check-in</div>
                <input type="date" value={form.checkIn} onChange={(e) => setForm({ ...form, checkIn: e.target.value })} style={{ ...inputStyle, width: "100%" }} />
              </div>
              <div>
                <div style={{ fontSize: "0.7rem", color: TOKENS.inkSoft, marginBottom: 4 }}>Check-out</div>
                <input type="date" value={form.checkOut} onChange={(e) => setForm({ ...form, checkOut: e.target.value })} style={{ ...inputStyle, width: "100%" }} />
              </div>
            </div>

            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: "0.7rem", color: TOKENS.inkSoft, marginBottom: 4 }}>
                How many people ({room.type})?
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                {occupancyOptions.map((n) => (
                  <button
                    key={n}
                    onClick={() => setForm({ ...form, persons: n })}
                    style={{ ...ghostBtn, flex: 1, background: form.persons === n ? TOKENS.paperDim : "#fff" }}
                  >
                    {n} {n === 1 ? "person" : "persons"}
                  </button>
                ))}
              </div>
            </div>

            {showMealPlans && (
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: "0.7rem", color: TOKENS.inkSoft, marginBottom: 4 }}>Meal plan</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.82rem" }}>
                    <input type="radio" name="roomDrawerMealPlan" checked={form.mealPlans.length === 0} onChange={() => selectMealPlan(null)} />
                    None
                  </label>
                  {GUEST_MEAL_PLAN_CHOICES.map((plan) => (
                    <label key={plan} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.82rem" }}>
                      <input type="radio" name="roomDrawerMealPlan" checked={form.mealPlans[0] === plan} onChange={() => selectMealPlan(plan)} />
                      {plan}{" "}
                      <span style={{ color: TOKENS.inkSoft, fontSize: "0.75rem" }}>
                        {FREE_MEAL_PLANS.includes(plan) ? "(no charge)" : `(+${fmtMoney(mealPlanRates[plan] || 0)}/person/night)`}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <PaymentMethodPicker value={form.paymentMethod} onChange={(v) => setForm({ ...form, paymentMethod: v })} />

            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: "0.7rem", color: TOKENS.inkSoft, marginBottom: 4 }}>Estimated total (EGP)</div>
              <input
                type="number"
                min="0"
                step="1"
                placeholder="Enter total manually"
                value={form.totalAmount}
                onChange={(e) => setForm({ ...form, totalAmount: e.target.value })}
                style={{ ...inputStyle, width: "100%" }}
              />
            </div>

            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: "0.7rem", color: TOKENS.inkSoft, marginBottom: 4 }}>Discount (%)</div>
              <input
                type="number"
                min="0"
                max="100"
                step="1"
                value={form.discountPercent}
                onChange={(e) => setForm({ ...form, discountPercent: e.target.value })}
                style={{ ...inputStyle, width: "100%" }}
              />
            </div>

            {grossTotal > 0 && (
              <div style={{ fontSize: "0.78rem", color: TOKENS.inkSoft, marginBottom: 8 }}>
                Total to charge: <strong style={{ color: TOKENS.ink }}>{fmtMoney(estimatedTotal)}</strong>
                {nights > 0 ? ` for ${nights} ${nights === 1 ? "night" : "nights"}` : ""}
                {discountPercent > 0 && (
                  <>
                    {" "}
                    <span style={{ textDecoration: "line-through", color: TOKENS.inkSoft }}>{fmtMoney(grossTotal)}</span>{" "}
                    <span style={{ color: TOKENS.clean }}>(−{discountPercent}%)</span>
                  </>
                )}
              </div>
            )}

            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.8rem", color: TOKENS.inkSoft, marginBottom: 10 }}>
              <input type="checkbox" checked={form.checkInNow} onChange={(e) => setForm({ ...form, checkInNow: e.target.checked })} />
              Check in now (walk-in)
            </label>

            {!formError && conflict && (
              <div style={{ fontSize: "0.78rem", color: TOKENS.dirty, background: TOKENS.dirtyBg, borderRadius: 8, padding: "0.5rem 0.7rem", marginBottom: 8 }}>
                Heads up: room already booked for {guestName(conflict.guestId)} in that window.
              </div>
            )}
            {formError && (
              <div style={{ fontSize: "0.78rem", color: TOKENS.oos, background: TOKENS.oosBg, borderRadius: 8, padding: "0.5rem 0.7rem", marginBottom: 8 }}>
                {formError}
              </div>
            )}

            <button onClick={submitReservation} disabled={!!conflict} style={{ ...primaryBtn, width: "100%" }}>
              Reserve room
            </button>
          </div>
        )}

        <div style={{ marginTop: "1.25rem" }}>
          <div style={{ fontSize: "0.72rem", color: TOKENS.inkSoft, marginBottom: 6, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
            <Ico name="history" size={13} /> Room history ({roomHistory.length})
          </div>
          {roomHistory.length === 0 ? (
            <div style={{ fontSize: "0.8rem", color: TOKENS.inkSoft }}>No bookings on record for this room.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {roomHistory.slice(0, 8).map((hb) => {
                const hm = BOOKING_STATUS_META[hb.status] || BOOKING_STATUS_META.reserved;
                const ht = bookingTypeMeta(hb.bookingType);
                return (
                  <div key={hb.id} style={{ background: "#fff", border: `1px solid ${TOKENS.paperDim}`, borderRadius: 10, padding: "0.5rem 0.65rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                      <div style={{ fontWeight: 600, fontSize: "0.82rem", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{guestName(hb.guestId)}</div>
                      <SoftBadge small color={hm.color} bg={hm.bg}>
                        {hm.label}
                      </SoftBadge>
                    </div>
                    <div style={{ fontSize: "0.72rem", color: TOKENS.inkSoft, marginTop: 2, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      {fmtDateY(hb.checkIn)} → {fmtDateY(hb.checkOut)}
                      <SoftBadge small color={ht.color} bg={ht.bg}>
                        {ht.label}
                      </SoftBadge>
                    </div>
                  </div>
                );
              })}
              {roomHistory.length > 8 && <div style={{ fontSize: "0.72rem", color: TOKENS.inkSoft }}>+ {roomHistory.length - 8} older booking{roomHistory.length - 8 === 1 ? "" : "s"}</div>}
            </div>
          )}
        </div>

        <div style={{ marginTop: "1.5rem" }} />
      </div>

      {confirmOut && booking && (
        <ConfirmModal
          title="Check out guest?"
          message={`${guestName(booking.guestId)} will be checked out of room ${room.number}. The room will be marked as needing cleaning.`}
          confirmLabel="Check out"
          cancelLabel="Not yet"
          onConfirm={() => {
            setConfirmOut(false);
            onCheckOut(booking.id);
          }}
          onClose={() => setConfirmOut(false)}
        />
      )}
    </div>
  );
}

// ───────────────────────── Bookings page helpers ─────────────────────────

const BOOKING_STATUS_META = {
  reserved: { label: "Reserved", color: TOKENS.reserved, bg: TOKENS.reservedBg },
  checked_in: { label: "In-House", color: TOKENS.clean, bg: TOKENS.cleanBg },
  checked_out: { label: "Checked out", color: TOKENS.occupied, bg: TOKENS.occupiedBg },
  cancelled: { label: "Cancelled", color: TOKENS.oos, bg: TOKENS.oosBg },
};

function shortRef(id) {
  return "#" + String(id).replace(/-/g, "").slice(0, 6).toUpperCase();
}

function BookingBadges({ b, small }) {
  const meta = BOOKING_STATUS_META[b.status] || BOOKING_STATUS_META.reserved;
  const type = bookingTypeMeta(b.bookingType);
  const today = todayISO();
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 5, alignItems: "center" }}>
      <SoftBadge small={small} color={type.color} bg={type.bg}>
        {type.label}
      </SoftBadge>
      {b.paymentMethod && (
        <span style={{ fontSize: small ? "0.66rem" : "0.7rem", color: TOKENS.inkSoft, border: `1px solid ${TOKENS.paperDim}`, borderRadius: 999, padding: small ? "2px 7px" : "2px 8px" }}>
          {paymentMethodLabel(b.paymentMethod)}
        </span>
      )}
      {b.status === "checked_in" && b.checkOut === today && (
        <SoftBadge small={small} color={TOKENS.dirty} bg={TOKENS.dirtyBg}>
          Departs today
        </SoftBadge>
      )}
      {b.status === "reserved" && b.checkIn === today && (
        <SoftBadge small={small} color={TOKENS.reserved} bg={TOKENS.reservedBg}>
          Arrives today
        </SoftBadge>
      )}
    </div>
  );
}

function BookingsSkeleton({ mobile }) {
  const rows = Array.from({ length: 5 });
  if (mobile) {
    return (
      <div>
        {rows.map((_, i) => (
          <div key={i} style={{ ...cardStyle, display: "flex", flexDirection: "column", gap: 8 }}>
            <div className="gx-skel" style={{ height: 18, width: "40%" }} />
            <div className="gx-skel" style={{ height: 14, width: "60%" }} />
            <div className="gx-skel" style={{ height: 36, width: "100%" }} />
          </div>
        ))}
      </div>
    );
  }
  return (
    <div style={{ ...cardStyle, padding: 0 }}>
      {rows.map((_, i) => (
        <div key={i} style={{ display: "flex", gap: 16, padding: "1rem", borderTop: i ? `1px solid ${TOKENS.paperDim}` : "none" }}>
          <div className="gx-skel" style={{ height: 16, flex: 1 }} />
          <div className="gx-skel" style={{ height: 16, flex: 2 }} />
          <div className="gx-skel" style={{ height: 16, flex: 2 }} />
          <div className="gx-skel" style={{ height: 16, flex: 2 }} />
        </div>
      ))}
    </div>
  );
}

function ConfirmModal({ title, message, confirmLabel, cancelLabel = "Close", danger, onConfirm, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div style={modalOverlay} onClick={onClose} role="presentation">
      <div role="alertdialog" aria-modal="true" aria-label={title} style={{ ...modalBox, width: 400 }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ fontFamily: "Fraunces, serif", fontSize: "1.15rem", margin: "0 0 0.5rem" }}>{title}</h3>
        <div style={{ fontSize: "0.86rem", color: TOKENS.inkSoft, marginBottom: "1rem", lineHeight: 1.45 }}>{message}</div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button className="gx-btn" onClick={onClose} style={ghostBtn}>
            {cancelLabel}
          </button>
          <button className="gx-btn" onClick={onConfirm} style={{ ...primaryBtn, background: danger ? TOKENS.oos : TOKENS.ink }} autoFocus>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}


function BookingsTab({ bookings, allBookings, rooms, guests, guestName, onCheckIn, onCheckOut, onCancel, onUpdateBooking, onSwitchRoom, showNew, setShowNew, onReserve, roomRates, mealPlanRates, loading = false }) {
  const [editingId, setEditingId] = useState(null);
  const [switchingId, setSwitchingId] = useState(null);
  const mobile = useIsMobile();
  const [tabKey, setTabKey] = useState("all");
  const [q, setQ] = useState("");
  const [channelFilter, setChannelFilter] = useState("all");
  const [payFilter, setPayFilter] = useState("all");
  const [dFrom, setDFrom] = useState("");
  const [dTo, setDTo] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [bPage, setBPage] = useState(1);
  const [bPageSize, setBPageSize] = useState(10);
  const [confirm, setConfirm] = useState(null);
  const [toast, setToast] = useState("");
  const toastTimer = useRef(null);
  const [submitting, setSubmitting] = useState(false);
  const [guestQuery, setGuestQuery] = useState("");
  const [guestOpen, setGuestOpen] = useState(false);
  const [guestMode, setGuestMode] = useState(guests.length ? "existing" : "new");
  const [form, setForm] = useState({
    roomNumber: "",
    guestId: "",
    name: "",
    phone: "",
    email: "",
    nationalId: "",
    checkIn: todayISO(),
    checkOut: "",
    persons: 1,
    mealPlans: [],
    bookingType: "booking",
    paymentMethod: "",
    discountPercent: 0,
    totalAmount: "",
  });
  const [formError, setFormError] = useState("");
  const [duplicateGuestWarning, setDuplicateGuestWarning] = useState("");

  const checkDuplicateNationalId = (value) => {
    const q = value.trim().toLowerCase();
    if (!q) {
      setDuplicateGuestWarning("");
      return;
    }
    const match = guests.find((g) => (g.nationalId || "").trim().toLowerCase() === q);
    setDuplicateGuestWarning(match ? `This ID belongs to an existing customer: ${match.name}.` : "");
  };

  const availableRooms = rooms.filter((r) => r.status !== "out_of_order");
  const dayForFilter = form.checkIn || todayISO();
  const roomOptions = useMemo(() => {
    return availableRooms
      .map((r) => {
        if (r.status !== "occupied") return { room: r, checkingOut: false };
        const active = allBookings.find((b) => b.roomNumber === r.number && b.status === "checked_in");
        if (active && active.checkOut === dayForFilter) return { room: r, checkingOut: true };
        return null;
      })
      .filter(Boolean);
  }, [availableRooms, allBookings, dayForFilter]);
  const selectedRoom = rooms.find((r) => r.number === form.roomNumber);
  const occupancyOptions = selectedRoom ? occupancyOptionsForType(selectedRoom.type) : [1];
  const showMealPlans = !!selectedRoom;

  const rangeAvailableRooms = useMemo(() => {
    if (!form.checkIn || !form.checkOut || form.checkOut <= form.checkIn) return [];
    return availableRooms.filter((r) => !findConflict(allBookings, r.number, form.checkIn, form.checkOut));
  }, [availableRooms, allBookings, form.checkIn, form.checkOut]);

  const pickRoom = (roomNumber) => {
    const room = rooms.find((r) => r.number === roomNumber);
    const opts = room ? occupancyOptionsForType(room.type) : [1];
    setForm({ ...form, roomNumber, persons: opts[0], mealPlans: [] });
  };

  const selectMealPlan = (plan) => {
    setForm((f) => ({ ...f, mealPlans: plan ? [plan] : [] }));
  };

  const discountPercent = Math.min(100, Math.max(0, Number(form.discountPercent) || 0));
  const grossTotal = Number(form.totalAmount) || 0;
  const estimatedTotal = grossTotal * (1 - discountPercent / 100);

  const submit = async () => {
    setFormError("");
    if (!form.checkOut) {
      setFormError("Fill in the check-out date.");
      return;
    }
    if (guestMode === "existing" && !form.guestId) {
      setFormError("Choose a guest, or switch to \"New guest\".");
      return;
    }
    if (guestMode === "new" && !form.name.trim()) {
      setFormError("Guest name is required.");
      return;
    }
    if (guestMode === "new" && duplicateGuestWarning) {
      setFormError(duplicateGuestWarning + " Switch to \"Existing guest\" to select them instead, or double-check the ID.");
      return;
    }
    if (form.checkOut <= form.checkIn) {
      setFormError("Check-out must be after check-in.");
      return;
    }
    const clash = form.roomNumber ? findConflict(allBookings, form.roomNumber, form.checkIn, form.checkOut) : null;
    if (clash) {
      setFormError(
        `Room ${form.roomNumber} is already booked for ${guestName(clash.guestId)} from ${fmtDate(clash.checkIn)} to ${fmtDate(clash.checkOut)}. Pick different dates or another room.`
      );
      return;
    }
    setSubmitting(true);
    const ok = await onReserve({
      roomNumber: form.roomNumber,
      guestId: guestMode === "existing" ? form.guestId : null,
      newGuest:
        guestMode === "new"
          ? { name: form.name, phone: form.phone, email: form.email, nationalId: form.nationalId, notes: "" }
          : null,
      checkIn: form.checkIn,
      checkOut: form.checkOut,
      checkInNow: false,
      persons: form.persons,
      mealPlans: showMealPlans ? form.mealPlans : [],
      bookingType: form.bookingType,
      paymentMethod: form.paymentMethod,
      discountPercent,
      totalAmount: grossTotal,
    }).finally(() => setSubmitting(false));
    if (ok === false) return;
    setForm({
      roomNumber: "",
      guestId: "",
      name: "",
      phone: "",
      email: "",
      nationalId: "",
      checkIn: todayISO(),
      checkOut: "",
      persons: 1,
      mealPlans: [],
      bookingType: "booking",
      paymentMethod: "",
      discountPercent: 0,
      totalAmount: "",
    });
    setDuplicateGuestWarning("");
    setSelectingCheckout(false);
    setGuestQuery("");
    setShowNew(false);
  };

  const liveConflict =
    form.roomNumber && form.checkIn && form.checkOut && form.checkOut > form.checkIn
      ? findConflict(allBookings, form.roomNumber, form.checkIn, form.checkOut)
      : null;

  const [calYear, setCalYear] = useState(() => Number(todayISO().slice(0, 4)));
  const [calMonth, setCalMonth] = useState(() => Number(todayISO().slice(5, 7)) - 1);
  const [selectingCheckout, setSelectingCheckout] = useState(false);

  const fullyBookedDates = useMemo(() => {
    const set = new Set();
    if (availableRooms.length === 0) return set;
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
    for (let d = 1; d <= daysInMonth; d++) {
      const iso = `${calYear}-${String(calMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const nextIso = addDaysISO(iso, 1);
      const allBusy = availableRooms.every((r) => findConflict(allBookings, r.number, iso, nextIso));
      if (allBusy) set.add(iso);
    }
    return set;
  }, [availableRooms, allBookings, calYear, calMonth]);

  const pickDay = (iso) => {
    if (!selectingCheckout) {
      setForm((f) => ({ ...f, checkIn: iso, checkOut: "" }));
      setSelectingCheckout(true);
    } else if (iso <= form.checkIn) {
      setForm((f) => ({ ...f, checkIn: iso, checkOut: "" }));
    } else {
      setForm((f) => ({ ...f, checkOut: iso }));
      setSelectingCheckout(false);
    }
  };

  const todayStr = todayISO();
  const tabCounts = useMemo(
    () => ({
      all: bookings.length,
      inhouse: allBookings.filter((b) => b.status === "checked_in").length,
      arrivals: allBookings.filter((b) => b.status === "reserved" && b.checkIn === todayStr).length,
      departures: allBookings.filter((b) => b.status === "checked_in" && b.checkOut === todayStr).length,
      cancelled: allBookings.filter((b) => b.status === "cancelled").length,
    }),
    [bookings, allBookings, todayStr]
  );

  const listRows = useMemo(() => {
    let base;
    if (tabKey === "cancelled") base = allBookings.filter((b) => b.status === "cancelled").sort((a, b) => b.checkIn.localeCompare(a.checkIn));
    else if (tabKey === "inhouse") base = bookings.filter((b) => b.status === "checked_in");
    else if (tabKey === "arrivals") base = bookings.filter((b) => b.status === "reserved" && b.checkIn === todayStr);
    else if (tabKey === "departures") base = bookings.filter((b) => b.status === "checked_in" && b.checkOut === todayStr);
    else base = bookings;
    const needle = q.trim().toLowerCase().replace(/^#/, "");
    return base.filter((b) => {
      if (needle) {
        const hit =
          guestName(b.guestId).toLowerCase().includes(needle) ||
          String(b.roomNumber || "").toLowerCase().includes(needle) ||
          String(b.id).replace(/-/g, "").toLowerCase().includes(needle);
        if (!hit) return false;
      }
      if (channelFilter !== "all" && (b.bookingType || "booking") !== channelFilter) return false;
      if (payFilter === "none" && b.paymentMethod) return false;
      if (payFilter !== "all" && payFilter !== "none" && b.paymentMethod !== payFilter) return false;
      if ((dTo && b.checkIn > dTo) || (dFrom && b.checkOut < dFrom)) return false;
      return true;
    });
  }, [tabKey, bookings, allBookings, q, channelFilter, payFilter, dFrom, dTo, todayStr, guests]);

  useEffect(() => {
    setBPage(1);
  }, [tabKey, q, channelFilter, payFilter, dFrom, dTo, bPageSize]);

  const bPageCount = Math.max(1, Math.ceil(listRows.length / bPageSize));
  const bSafePage = Math.min(bPage, bPageCount);
  const visibleRows = listRows.slice((bSafePage - 1) * bPageSize, bSafePage * bPageSize);
  const filterCount = (channelFilter !== "all" ? 1 : 0) + (payFilter !== "all" ? 1 : 0) + (dFrom || dTo ? 1 : 0);
  const hasAnyFilter = filterCount > 0 || q.trim() !== "";
  const clearAllFilters = () => {
    setQ("");
    setChannelFilter("all");
    setPayFilter("all");
    setDFrom("");
    setDTo("");
  };
  const toggleNew = () => {
    setShowNew(!showNew);
  };

  const showToast = (msg) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 3800);
  };
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  // New-booking drawer: Esc closes it, page behind doesn't scroll.
  useEffect(() => {
    if (!showNew) return undefined;
    const onKey = (e) => e.key === "Escape" && !submitting && setShowNew(false);
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [showNew, submitting]);

  const stayNights = form.checkIn && form.checkOut ? nightsBetween(form.checkIn, form.checkOut) : 0;
  const tileRooms = useMemo(() => {
    const list = [...rangeAvailableRooms];
    if (selectedRoom && !list.some((r) => r.number === selectedRoom.number)) list.unshift(selectedRoom);
    return list;
  }, [rangeAvailableRooms, selectedRoom]);
  const guestMatches = useMemo(() => {
    const needle = guestQuery.trim().toLowerCase();
    const list = needle
      ? guests.filter((g) => g.name.toLowerCase().includes(needle) || (g.phone || "").toLowerCase().includes(needle) || (g.nationalId || "").toLowerCase().includes(needle))
      : guests;
    return list.slice(0, 8);
  }, [guests, guestQuery]);
  const chosenGuest = guests.find((g) => g.id === form.guestId);
  const chooseGuest = (g) => {
    setForm((f) => ({ ...f, guestId: g.id }));
    setGuestQuery("");
    setGuestOpen(false);
  };
  const calcTotal =
    selectedRoom && stayNights > 0
      ? Math.round((form.persons || 1) * (getRoomRate(selectedRoom, roomRates) + mealPlanSurcharge(form.mealPlans, mealPlanRates)) * stayNights)
      : 0;

  const nbLabel = { fontSize: "0.72rem", color: TOKENS.inkSoft, marginBottom: 5, fontWeight: 600 };
  const nbCard = { background: "#fff", border: `1px solid ${TOKENS.paperDim}`, borderRadius: 14, padding: "0.9rem", marginBottom: "1.1rem" };
  const nbSectionHead = (n, title, sub) => (
    <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "0 2px 8px" }}>
      <span style={{ width: 26, height: 26, borderRadius: "50%", background: TOKENS.ink, color: TOKENS.paper, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "0.78rem", fontWeight: 700, flexShrink: 0 }}>{n}</span>
      <div>
        <div style={{ fontWeight: 700, fontSize: "0.95rem" }}>{title}</div>
        <div style={{ fontSize: "0.72rem", color: TOKENS.inkSoft }}>{sub}</div>
      </div>
    </div>
  );
  const nbTile = (sel) => ({
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: 2,
    textAlign: "left",
    padding: "0.55rem 0.65rem",
    borderRadius: 12,
    cursor: "pointer",
    fontFamily: "inherit",
    border: `1.5px solid ${sel ? TOKENS.ink : TOKENS.paperDim}`,
    background: sel ? TOKENS.paperDim : "#fff",
    minHeight: 64,
  });

  const renderActions = (b, stretch) => {
    const grow = stretch ? { flex: 1, justifyContent: "center", padding: "0.55rem 0.4rem" } : {};
    const base = { display: "inline-flex", alignItems: "center", gap: 5, whiteSpace: "nowrap", ...grow };
    if (b.status === "reserved") {
      const checkInBlock = checkInBlockReason(b);
      return (
        <>
          <button className="gx-btn" onClick={() => setEditingId(b.id)} style={{ ...ghostBtn, ...base }}>
            <Ico name="edit" size={13} /> Edit
          </button>
          <button
            className="gx-btn"
            aria-disabled={!!checkInBlock}
            onClick={() => {
              if (checkInBlock) return showToast(checkInBlock);
              if (b.roomNumber) onCheckIn(b.id);
              else setEditingId(b.id);
            }}
            style={{ ...primaryBtn, ...base, ...(checkInBlock ? { background: "#D9D4CB", color: "#8A8F98", cursor: "not-allowed" } : {}) }}
            title={checkInBlock || (b.roomNumber ? "" : "Choose a room first")}
          >
            <Ico name="login" size={13} /> Check in
          </button>
          <button className="gx-btn" onClick={() => setConfirm({ kind: "cancel", booking: b })} style={{ ...ghostBtn, ...base, color: TOKENS.oos }}>
            Cancel
          </button>
        </>
      );
    }
    if (b.status === "checked_in") {
      return (
        <>
          <button className="gx-btn" onClick={() => setEditingId(b.id)} style={{ ...ghostBtn, ...base }}>
            <Ico name="edit" size={13} /> Edit
          </button>
          <button className="gx-btn" onClick={() => setSwitchingId(b.id)} style={{ ...ghostBtn, ...base }}>
            <Ico name="swap" size={13} /> Switch
          </button>
          <button className="gx-btn" onClick={() => setConfirm({ kind: "checkout", booking: b })} style={{ ...primaryBtn, ...base }}>
            <Ico name="logout" size={13} /> Check out
          </button>
        </>
      );
    }
    return null;
  };

  const tabDefs = [
    { key: "all", label: "All" },
    { key: "inhouse", label: "In-House" },
    { key: "arrivals", label: "Arrivals Today" },
    { key: "departures", label: "Departures Today" },
    { key: "cancelled", label: "Cancelled" },
  ];

  const filterControls = (
    <>
      <select value={channelFilter} onChange={(e) => setChannelFilter(e.target.value)} style={{ ...inputStyle, minWidth: 0 }} aria-label="Channel filter">
        <option value="all">All channels</option>
        {BOOKING_TYPES.map((t) => (
          <option key={t.key} value={t.key}>
            {t.label}
          </option>
        ))}
      </select>
      <select value={payFilter} onChange={(e) => setPayFilter(e.target.value)} style={{ ...inputStyle, minWidth: 0 }} aria-label="Payment method filter">
        <option value="all">All payment methods</option>
        {PAYMENT_METHODS.map((m) => (
          <option key={m.key} value={m.key}>
            {m.label}
          </option>
        ))}
        <option value="none">Not set</option>
      </select>
      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.72rem", color: TOKENS.inkSoft }}>
        From
        <input type="date" value={dFrom} onChange={(e) => setDFrom(e.target.value)} style={{ ...inputStyle, flex: 1, minWidth: 0 }} />
      </label>
      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.72rem", color: TOKENS.inkSoft }}>
        to
        <input type="date" value={dTo} onChange={(e) => setDTo(e.target.value)} style={{ ...inputStyle, flex: 1, minWidth: 0 }} />
      </label>
    </>
  );

  const th = { textAlign: "left", fontSize: "0.7rem", fontWeight: 600, color: TOKENS.inkSoft, padding: "0.65rem 0.9rem", background: "#FBF8F3", whiteSpace: "nowrap" };
  const td = { padding: "0.7rem 0.9rem", fontSize: "0.84rem", verticalAlign: "middle", borderTop: `1px solid ${TOKENS.paperDim}` };

  return (
    <div style={mobile ? { paddingBottom: 84 } : undefined}>
      <style>{GUESTS_CSS}</style>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.9rem", gap: 10, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ fontFamily: "Fraunces, serif", fontSize: "1.3rem", margin: 0 }}>Bookings</h2>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
            <SoftBadge color={TOKENS.clean} bg={TOKENS.cleanBg}>
              In-House: {tabCounts.inhouse}
            </SoftBadge>
            <SoftBadge color={TOKENS.reserved} bg={TOKENS.reservedBg}>
              Arriving today: {tabCounts.arrivals}
            </SoftBadge>
            <SoftBadge color={TOKENS.dirty} bg={TOKENS.dirtyBg}>
              Checking out today: {tabCounts.departures}
            </SoftBadge>
          </div>
        </div>
        {!mobile && (
          <button onClick={toggleNew} style={{ ...primaryBtn, display: "inline-flex", alignItems: "center", gap: 6 }}>
            <Ico name={showNew ? "x" : "plus"} size={14} /> {showNew ? "Cancel" : "New booking"}
          </button>
        )}
      </div>

      {mobile && (
        <button
          onClick={toggleNew}
          aria-label={showNew ? "Cancel new booking" : "New booking"}
          style={{
            position: "fixed",
            right: 18,
            bottom: 22,
            width: 56,
            height: 56,
            borderRadius: "50%",
            border: "none",
            background: showNew ? TOKENS.inkSoft : TOKENS.ink,
            color: TOKENS.paper,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 6px 18px rgba(27,36,48,0.35)",
            cursor: "pointer",
            zIndex: 50,
          }}
        >
          <Ico name={showNew ? "x" : "plus"} size={24} />
        </button>
      )}

      {showNew && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 65, background: "rgba(27,36,48,0.45)", display: "flex", justifyContent: "flex-end", animation: "gxFade .15s ease-out" }}
          role="presentation"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="New booking"
            style={{ width: mobile ? "100%" : 580, maxWidth: "100vw", height: "100%", background: TOKENS.paper, display: "flex", flexDirection: "column", animation: "nbSlide .24s ease-out", boxShadow: "-12px 0 40px rgba(0,0,0,0.18)" }}
          >
            {/* Header */}
            <div style={{ padding: "1rem 1.1rem", background: "#fff", borderBottom: `1px solid ${TOKENS.paperDim}`, display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: "Fraunces, serif", fontSize: "1.2rem", fontWeight: 600 }}>New booking</div>
                <div style={{ fontSize: "0.75rem", color: TOKENS.inkSoft }}>Dates &amp; room · Guest · Pricing &amp; payment</div>
              </div>
              <button className="gx-btn" onClick={() => !submitting && setShowNew(false)} aria-label="Close" style={{ ...ghostBtn, padding: "0.5rem", display: "inline-flex", minWidth: 40, minHeight: 40, alignItems: "center", justifyContent: "center" }}>
                <Ico name="x" size={17} />
              </button>
            </div>

            {/* Body */}
            <div style={{ flex: 1, overflowY: "auto", padding: "1rem 1.1rem 1.5rem", WebkitOverflowScrolling: "touch" }}>
              {/* 1. Dates & room */}
              {nbSectionHead(1, "Dates & room", "Pick the stay, the channel and (optionally) the room")}
              <div style={nbCard}>
                <div style={nbLabel}>Booking channel</div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 14 }}>
                  <span style={{ width: 14, height: 14, borderRadius: "50%", background: bookingTypeMeta(form.bookingType).color, flexShrink: 0 }} />
                  <select value={form.bookingType} onChange={(e) => setForm({ ...form, bookingType: e.target.value })} style={{ ...inputStyle, width: "100%", minHeight: 44, fontSize: "1rem" }}>
                    {BOOKING_TYPES.map((t) => (
                      <option key={t.key} value={t.key}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={nbLabel}>{selectingCheckout ? "Now tap the check-out day" : "Tap a day for check-in, then one for check-out"}</div>
                <div style={{ display: "flex", justifyContent: "center", marginBottom: 10 }}>
                  <MonthCalendar
                    year={calYear}
                    month={calMonth}
                    onMonthChange={(y, m) => {
                      setCalYear(y);
                      setCalMonth(m);
                    }}
                    highlightedDates={fullyBookedDates}
                    todayIso={todayISO()}
                    onDayClick={pickDay}
                    rangeStart={form.checkIn}
                    rangeEnd={form.checkOut}
                    legendLabel="Fully booked"
                  />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                  <label>
                    <div style={nbLabel}>Check-in</div>
                    <input type="date" value={form.checkIn} onChange={(e) => setForm({ ...form, checkIn: e.target.value })} style={{ ...inputStyle, width: "100%", boxSizing: "border-box", minHeight: 44 }} />
                  </label>
                  <label>
                    <div style={nbLabel}>Check-out</div>
                    <input type="date" value={form.checkOut} onChange={(e) => setForm({ ...form, checkOut: e.target.value })} style={{ ...inputStyle, width: "100%", boxSizing: "border-box", minHeight: 44 }} />
                  </label>
                </div>
                {stayNights > 0 && (
                  <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: TOKENS.cleanBg, color: TOKENS.clean, borderRadius: 999, padding: "4px 12px", fontSize: "0.78rem", fontWeight: 600, marginBottom: 14 }}>
                    <Ico name="calendar" size={13} /> {fmtDate(form.checkIn)} → {fmtDate(form.checkOut)} · {stayNights} night{stayNights === 1 ? "" : "s"}
                  </div>
                )}

                <div style={{ ...nbLabel, display: "flex", justifyContent: "space-between" }}>
                  <span>Room</span>
                  {stayNights > 0 && (
                    <span style={{ fontWeight: 400 }}>
                      {rangeAvailableRooms.length} available
                    </span>
                  )}
                </div>
                {stayNights <= 0 ? (
                  <div style={{ fontSize: "0.8rem", color: TOKENS.inkSoft, background: TOKENS.paper, borderRadius: 10, padding: "0.7rem 0.8rem" }}>
                    Pick check-in and check-out dates to see which rooms are free. You can also leave the room empty and choose it later.
                  </div>
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(112px, 1fr))", gap: 8, maxHeight: 230, overflowY: "auto", padding: 2 }}>
                    <button type="button" className="gx-btn" onClick={() => pickRoom("")} style={nbTile(form.roomNumber === "")}>
                      <span style={{ fontWeight: 700, fontSize: "0.85rem" }}>No room yet</span>
                      <span style={{ fontSize: "0.68rem", color: TOKENS.inkSoft }}>choose later</span>
                    </button>
                    {tileRooms.map((r) => {
                      const sel = form.roomNumber === r.number;
                      const dot = r.status === "vacant_clean" ? { c: TOKENS.clean, t: "Clean" } : r.status === "vacant_dirty" ? { c: TOKENS.dirty, t: "Needs cleaning" } : { c: "#3B6FA0", t: "Frees up" };
                      return (
                        <button key={r.number} type="button" className="gx-btn" onClick={() => pickRoom(r.number)} style={nbTile(sel)} aria-pressed={sel}>
                          <span style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
                            <span style={{ fontFamily: "Fraunces, serif", fontWeight: 700, fontSize: "1.15rem" }}>{r.number}</span>
                            {sel && <Ico name="check" size={15} color={TOKENS.clean} />}
                          </span>
                          <span style={{ fontSize: "0.68rem", color: TOKENS.inkSoft }}>{r.type}</span>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: "0.66rem", color: dot.c, fontWeight: 600 }}>
                            <span style={{ width: 7, height: 7, borderRadius: "50%", background: dot.c }} /> {dot.t}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
                {stayNights > 0 && rangeAvailableRooms.length === 0 && <div style={{ color: TOKENS.oos, fontSize: "0.8rem", marginTop: 8 }}>No rooms are free for these dates.</div>}

                {selectedRoom && (
                  <>
                    <div style={{ ...nbLabel, marginTop: 14 }}>How many people ({selectedRoom.type})</div>
                    <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
                      {occupancyOptions.map((n) => (
                        <button key={n} type="button" className="gx-btn" onClick={() => setForm({ ...form, persons: n })} style={{ ...ghostBtn, flex: 1, minHeight: 42, background: form.persons === n ? TOKENS.ink : "#fff", color: form.persons === n ? TOKENS.paper : TOKENS.ink, borderColor: form.persons === n ? TOKENS.ink : TOKENS.paperDim, fontWeight: 600 }}>
                          {n} {n === 1 ? "person" : "persons"}
                        </button>
                      ))}
                    </div>
                    <div style={nbLabel}>Meal plan</div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {[null, ...GUEST_MEAL_PLAN_CHOICES].map((plan) => {
                        const sel = plan === null ? form.mealPlans.length === 0 : form.mealPlans[0] === plan;
                        return (
                          <button key={plan || "none"} type="button" className="gx-btn" onClick={() => selectMealPlan(plan)} style={{ ...ghostBtn, minHeight: 40, background: sel ? "#DCE9F5" : "#fff", color: sel ? "#2F5F8F" : TOKENS.inkSoft, borderColor: sel ? "#2F5F8F" : TOKENS.paperDim, fontWeight: sel ? 700 : 400 }}>
                            {plan || "None"}
                            {plan && !FREE_MEAL_PLANS.includes(plan) && <span style={{ fontSize: "0.66rem", marginLeft: 4, opacity: 0.8 }}>+{fmtMoney((mealPlanRates && mealPlanRates[plan]) || 0)}</span>}
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>

              {/* 2. Guest */}
              {nbSectionHead(2, "Guest information", "Search an existing guest or add a new one")}
              <div style={nbCard}>
                <div style={{ display: "flex", background: TOKENS.paper, borderRadius: 12, padding: 4, marginBottom: 12 }} role="tablist">
                  {[
                    { key: "existing", label: "Existing guest", icon: "users" },
                    { key: "new", label: "New guest", icon: "plus" },
                  ].map((t) => {
                    const act = guestMode === t.key;
                    return (
                      <button key={t.key} type="button" role="tab" aria-selected={act} className="gx-btn" onClick={() => setGuestMode(t.key)} style={{ flex: 1, minHeight: 42, border: "none", borderRadius: 9, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, background: act ? "#fff" : "transparent", color: act ? TOKENS.ink : TOKENS.inkSoft, fontWeight: act ? 700 : 500, boxShadow: act ? "0 1px 4px rgba(27,36,48,0.12)" : "none", fontFamily: "inherit", fontSize: "0.88rem" }}>
                        <Ico name={t.icon} size={14} /> {t.label}
                      </button>
                    );
                  })}
                </div>

                {guestMode === "existing" ? (
                  chosenGuest ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 10, border: `1px solid ${TOKENS.clean}`, background: TOKENS.cleanBg, borderRadius: 12, padding: "0.65rem 0.8rem" }}>
                      <span style={{ width: 36, height: 36, borderRadius: "50%", background: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <Ico name="user" size={17} color={TOKENS.clean} />
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{chosenGuest.name}</div>
                        <div style={{ fontSize: "0.74rem", color: TOKENS.inkSoft }}>{chosenGuest.phone || chosenGuest.nationalId || "No contact info"}</div>
                      </div>
                      <button type="button" className="gx-btn" onClick={() => { setForm({ ...form, guestId: "" }); setGuestQuery(""); setGuestOpen(true); }} style={{ ...ghostBtn, background: "#fff" }}>
                        Change
                      </button>
                    </div>
                  ) : (
                    <div style={{ position: "relative" }}>
                      <Ico name="search" size={15} color={TOKENS.inkSoft} style={{ position: "absolute", left: 11, top: 15, pointerEvents: "none" }} />
                      <input
                        placeholder="Search by name, phone or ID…"
                        value={guestQuery}
                        onChange={(e) => { setGuestQuery(e.target.value); setGuestOpen(true); }}
                        onFocus={() => setGuestOpen(true)}
                        onBlur={() => setTimeout(() => setGuestOpen(false), 150)}
                        onKeyDown={(e) => { if (e.key === "Enter" && guestMatches[0]) { e.preventDefault(); chooseGuest(guestMatches[0]); } }}
                        style={{ ...inputStyle, width: "100%", boxSizing: "border-box", minHeight: 46, paddingLeft: 34, fontSize: "1rem" }}
                      />
                      {guestOpen && (
                        <div style={{ position: "absolute", left: 0, right: 0, top: 50, zIndex: 5, background: "#fff", border: `1px solid ${TOKENS.paperDim}`, borderRadius: 12, boxShadow: "0 10px 28px rgba(27,36,48,0.16)", maxHeight: 250, overflowY: "auto" }}>
                          {guestMatches.length === 0 ? (
                            <div style={{ padding: "0.8rem", fontSize: "0.82rem", color: TOKENS.inkSoft }}>
                              No guest found.{" "}
                              <button type="button" className="gx-btn" onMouseDown={(e) => e.preventDefault()} onClick={() => { setGuestMode("new"); setForm({ ...form, name: guestQuery }); }} style={{ ...ghostBtn, marginLeft: 4 }}>
                                Add as new guest
                              </button>
                            </div>
                          ) : (
                            guestMatches.map((g) => (
                              <button key={g.id} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => chooseGuest(g)} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", border: "none", borderBottom: `1px solid ${TOKENS.paperDim}`, background: "#fff", padding: "0.65rem 0.8rem", cursor: "pointer", fontFamily: "inherit" }}>
                                <Ico name="user" size={15} color={TOKENS.inkSoft} />
                                <span style={{ minWidth: 0 }}>
                                  <span style={{ display: "block", fontWeight: 600, fontSize: "0.88rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.name}</span>
                                  <span style={{ display: "block", fontSize: "0.72rem", color: TOKENS.inkSoft }}>{[g.phone, g.nationalId].filter(Boolean).join(" · ") || "No contact info"}</span>
                                </span>
                              </button>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  )
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: mobile ? "1fr" : "1fr 1fr", gap: 10 }}>
                    <input placeholder="Full name *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={{ ...inputStyle, minHeight: 44, gridColumn: "1 / -1", fontSize: "1rem" }} />
                    <input placeholder="National ID / passport (optional)" value={form.nationalId} onChange={(e) => setForm({ ...form, nationalId: e.target.value })} onBlur={(e) => checkDuplicateNationalId(e.target.value)} style={{ ...inputStyle, minHeight: 44, fontSize: "1rem" }} />
                    <input placeholder="Phone (optional)" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} style={{ ...inputStyle, minHeight: 44, fontSize: "1rem" }} />
                    <input placeholder="Email (optional)" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} style={{ ...inputStyle, minHeight: 44, gridColumn: "1 / -1", fontSize: "1rem" }} />
                    {duplicateGuestWarning && (
                      <div style={{ gridColumn: "1 / -1", fontSize: "0.78rem", color: TOKENS.oos, background: TOKENS.oosBg, borderRadius: 8, padding: "0.5rem 0.7rem" }}>⚠ {duplicateGuestWarning}</div>
                    )}
                  </div>
                )}
              </div>

              {/* 3. Pricing & payment */}
              {nbSectionHead(3, "Pricing & payment", "Total, discount and how the guest pays")}
              <div style={nbCard}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 8 }}>
                  <label>
                    <div style={nbLabel}>Total (EGP)</div>
                    <input type="number" min="0" step="1" inputMode="decimal" placeholder="Enter total" value={form.totalAmount} onChange={(e) => setForm({ ...form, totalAmount: e.target.value })} style={{ ...inputStyle, width: "100%", boxSizing: "border-box", minHeight: 44, fontSize: "1rem" }} />
                  </label>
                  <label>
                    <div style={nbLabel}>Discount (%)</div>
                    <input type="number" min="0" max="100" step="1" inputMode="decimal" value={form.discountPercent} onChange={(e) => setForm({ ...form, discountPercent: e.target.value })} style={{ ...inputStyle, width: "100%", boxSizing: "border-box", minHeight: 44, fontSize: "1rem" }} />
                  </label>
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12, alignItems: "center" }}>
                  {[0, 5, 10, 15, 20].map((d) => (
                    <button key={d} type="button" className="gx-btn" onClick={() => setForm({ ...form, discountPercent: d })} style={{ ...ghostBtn, padding: "0.3rem 0.7rem", background: discountPercent === d ? TOKENS.ink : "#fff", color: discountPercent === d ? TOKENS.paper : TOKENS.inkSoft, borderColor: discountPercent === d ? TOKENS.ink : TOKENS.paperDim }}>
                      {d}%
                    </button>
                  ))}
                  {calcTotal > 0 && Number(form.totalAmount) !== calcTotal && (
                    <button type="button" className="gx-btn" onClick={() => setForm({ ...form, totalAmount: String(calcTotal) })} style={{ ...ghostBtn, marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 5, color: "#2F5F8F", borderColor: "#9DB9D6", background: "#EEF4FA" }}>
                      <Ico name="sparkles" size={13} /> Use calculated {fmtMoney(calcTotal)}
                    </button>
                  )}
                </div>

                <div style={nbLabel}>Payment method</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }} role="radiogroup" aria-label="Payment method">
                  {PAYMENT_METHODS.map((m) => {
                    const sel = form.paymentMethod === m.key;
                    return (
                      <button key={m.key} type="button" role="radio" aria-checked={sel} className="gx-btn" onClick={() => setForm({ ...form, paymentMethod: sel ? "" : m.key })} style={{ display: "inline-flex", alignItems: "center", gap: 8, minHeight: 44, padding: "0.4rem 0.9rem", borderRadius: 999, cursor: "pointer", fontFamily: "inherit", fontSize: "0.88rem", border: `1.5px solid ${sel ? TOKENS.ink : TOKENS.paperDim}`, background: sel ? TOKENS.ink : "#fff", color: sel ? TOKENS.paper : TOKENS.ink, fontWeight: sel ? 700 : 500 }}>
                        <span style={{ width: 16, height: 16, borderRadius: "50%", border: `2px solid ${sel ? TOKENS.paper : TOKENS.inkSoft}`, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                          {sel && <span style={{ width: 7, height: 7, borderRadius: "50%", background: TOKENS.paper }} />}
                        </span>
                        {m.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Sticky footer */}
            <div style={{ padding: "0.8rem 1.1rem calc(0.8rem + env(safe-area-inset-bottom, 0px))", background: "#fff", borderTop: `1px solid ${TOKENS.paperDim}`, boxShadow: "0 -6px 20px rgba(27,36,48,0.06)" }}>
              {!formError && liveConflict && (
                <div style={{ fontSize: "0.8rem", color: TOKENS.dirty, background: TOKENS.dirtyBg, borderRadius: 8, padding: "0.5rem 0.7rem", marginBottom: 8, display: "flex", gap: 6, alignItems: "flex-start" }}>
                  <Ico name="alert" size={14} style={{ marginTop: 2 }} /> Room {form.roomNumber} is already booked for {guestName(liveConflict.guestId)} in that window.
                </div>
              )}
              {formError && (
                <div style={{ fontSize: "0.8rem", color: TOKENS.oos, background: TOKENS.oosBg, borderRadius: 8, padding: "0.5rem 0.7rem", marginBottom: 8, display: "flex", gap: 6, alignItems: "flex-start" }}>
                  <Ico name="alert" size={14} style={{ marginTop: 2 }} /> {formError}
                </div>
              )}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, gap: 8 }}>
                <div style={{ fontSize: "0.74rem", color: TOKENS.inkSoft }}>
                  {selectedRoom ? roomLabel(selectedRoom.number) : "No room yet"}
                  {stayNights > 0 ? ` · ${stayNights} night${stayNights === 1 ? "" : "s"}` : ""}
                  {form.paymentMethod ? ` · ${paymentMethodLabel(form.paymentMethod)}` : ""}
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: "0.66rem", color: TOKENS.inkSoft }}>Total to charge</div>
                  <div style={{ fontFamily: "Fraunces, serif", fontSize: "1.35rem", fontWeight: 700, lineHeight: 1.1 }}>
                    {grossTotal > 0 ? fmtMoney(estimatedTotal) : "—"}
                    {grossTotal > 0 && discountPercent > 0 && (
                      <span style={{ fontFamily: "Inter, sans-serif", fontSize: "0.72rem", fontWeight: 500, marginLeft: 6 }}>
                        <span style={{ textDecoration: "line-through", color: TOKENS.inkSoft }}>{fmtMoney(grossTotal)}</span> <span style={{ color: TOKENS.clean }}>−{discountPercent}%</span>
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="gx-btn" onClick={() => !submitting && setShowNew(false)} disabled={submitting} style={{ ...ghostBtn, minHeight: 48, padding: "0.5rem 1.1rem", fontSize: "0.92rem" }}>
                  Cancel
                </button>
                <button className="gx-btn" onClick={submit} disabled={!!liveConflict || submitting} style={{ ...primaryBtn, flex: 1, minHeight: 48, fontSize: "0.95rem", fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, opacity: liveConflict || submitting ? 0.6 : 1, cursor: liveConflict || submitting ? "not-allowed" : "pointer" }}>
                  {submitting ? (
                    <>
                      <span style={{ width: 16, height: 16, border: "2px solid rgba(255,255,255,0.4)", borderTopColor: "#fff", borderRadius: "50%", animation: "nbSpin .7s linear infinite" }} />
                      Creating…
                    </>
                  ) : (
                    <>
                      <Ico name="check" size={17} /> Confirm &amp; Create Booking
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Status tabs */}
      <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 6, marginBottom: 8, WebkitOverflowScrolling: "touch" }} role="tablist">
        {tabDefs.map((t) => {
          const active = tabKey === t.key;
          return (
            <button
              key={t.key}
              role="tab"
              aria-selected={active}
              className="gx-btn"
              onClick={() => setTabKey(t.key)}
              style={{
                ...ghostBtn,
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                whiteSpace: "nowrap",
                background: active ? TOKENS.ink : "#fff",
                color: active ? TOKENS.paper : TOKENS.inkSoft,
                borderColor: active ? TOKENS.ink : TOKENS.paperDim,
                fontWeight: active ? 600 : 400,
                flexShrink: 0,
              }}
            >
              {t.label}
              <span style={{ fontSize: "0.68rem", borderRadius: 999, padding: "1px 7px", background: active ? "rgba(255,255,255,0.18)" : TOKENS.paper, color: active ? TOKENS.paper : TOKENS.inkSoft }}>
                {tabCounts[t.key]}
              </span>
            </button>
          );
        })}
      </div>

      {/* Search + filters */}
      <div style={{ ...cardStyle, padding: "0.65rem", marginBottom: 12 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: mobile ? "nowrap" : "wrap" }}>
          <div style={{ position: "relative", flex: 1, minWidth: 0 }}>
            <Ico name="search" size={15} color={TOKENS.inkSoft} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
            <input
              placeholder="Search guest, room or reservation ID…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              style={{ ...inputStyle, width: "100%", boxSizing: "border-box", paddingLeft: 32, paddingRight: q ? 30 : undefined }}
            />
            {q && (
              <button className="gx-btn" onClick={() => setQ("")} aria-label="Clear search" style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", border: "none", background: "none", cursor: "pointer", display: "inline-flex", color: TOKENS.inkSoft }}>
                <Ico name="x" size={14} />
              </button>
            )}
          </div>
          {mobile ? (
            <button className="gx-btn" onClick={() => setFiltersOpen(!filtersOpen)} style={{ ...ghostBtn, display: "inline-flex", alignItems: "center", gap: 6, background: filtersOpen ? TOKENS.paperDim : "#fff" }}>
              <Ico name="filter" size={14} /> Filters
              {filterCount > 0 && <span style={{ background: TOKENS.ink, color: TOKENS.paper, borderRadius: 999, fontSize: "0.65rem", padding: "1px 6px" }}>{filterCount}</span>}
            </button>
          ) : (
            <>
              {filterControls}
              {hasAnyFilter && (
                <button className="gx-btn" onClick={clearAllFilters} style={ghostBtn}>
                  Clear
                </button>
              )}
            </>
          )}
        </div>
        {mobile && filtersOpen && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
            {filterControls}
            {hasAnyFilter && (
              <button className="gx-btn" onClick={clearAllFilters} style={ghostBtn}>
                Clear all
              </button>
            )}
          </div>
        )}
      </div>

      {loading ? (
        <BookingsSkeleton mobile={mobile} />
      ) : listRows.length === 0 ? (
        <div style={{ ...cardStyle, textAlign: "center", padding: "2.5rem 1rem", color: TOKENS.inkSoft }}>
          <div style={{ display: "inline-flex", padding: 14, borderRadius: "50%", background: TOKENS.paper, marginBottom: 10 }}>
            <Ico name="inbox" size={26} color={TOKENS.brass} />
          </div>
          <div style={{ fontWeight: 600, color: TOKENS.ink, marginBottom: 4 }}>
            {hasAnyFilter ? "No bookings match your filters" : tabKey === "cancelled" ? "No cancelled bookings" : "No bookings here yet"}
          </div>
          <div style={{ fontSize: "0.82rem", marginBottom: 12 }}>
            {hasAnyFilter ? "Try a different search, or clear the filters." : "New reservations will show up in this list."}
          </div>
          {hasAnyFilter ? (
            <button onClick={clearAllFilters} style={ghostBtn}>
              Clear search & filters
            </button>
          ) : (
            tabKey !== "cancelled" && (
              <button onClick={() => !showNew && toggleNew()} style={primaryBtn}>
                New booking
              </button>
            )
          )}
        </div>
      ) : mobile ? (
        <div>
          {visibleRows.map((b) => {
            const meta = BOOKING_STATUS_META[b.status] || BOOKING_STATUS_META.reserved;
            const n = nightsBetween(b.checkIn, b.checkOut);
            return (
              <div key={b.id} style={{ ...cardStyle, opacity: b.status === "cancelled" ? 0.85 : 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: "1.02rem" }}>{roomLabel(b.roomNumber)}</div>
                    <div style={{ fontWeight: 600, fontSize: "0.92rem", wordBreak: "break-word" }}>{guestName(b.guestId)}</div>
                  </div>
                  <SoftBadge color={meta.color} bg={meta.bg}>
                    {meta.label}
                  </SoftBadge>
                </div>
                <div style={{ fontSize: "0.78rem", color: TOKENS.inkSoft, margin: "6px 0", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  <Ico name="calendar" size={12} />
                  {fmtDate(b.checkIn)} → {fmtDate(b.checkOut)}
                  {n > 0 && (
                    <span>
                      · {n} night{n === 1 ? "" : "s"}
                    </span>
                  )}
                  <span style={{ marginLeft: "auto", fontSize: "0.7rem" }}>{shortRef(b.id)}</span>
                </div>
                <BookingBadges b={b} small />
                {(b.status === "reserved" || b.status === "checked_in") && (
                  <div style={{ display: "flex", gap: 6, marginTop: 10 }}>{renderActions(b, true)}</div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ background: "#fff", border: `1px solid ${TOKENS.paperDim}`, borderRadius: 10, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 860 }}>
            <thead>
              <tr>
                <th style={th}>Room</th>
                <th style={th}>Guest</th>
                <th style={th}>Dates</th>
                <th style={th}>Nights</th>
                <th style={th}>Channel / Payment</th>
                <th style={th}>Status</th>
                <th style={{ ...th, textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((b) => {
                const meta = BOOKING_STATUS_META[b.status] || BOOKING_STATUS_META.reserved;
                const n = nightsBetween(b.checkIn, b.checkOut);
                return (
                  <tr key={b.id} className="gx-row" style={{ cursor: "default" }}>
                    <td style={{ ...td, fontWeight: 700, whiteSpace: "nowrap" }}>{b.roomNumber || <span style={{ color: TOKENS.dirty, fontWeight: 600 }}>No room yet</span>}</td>
                    <td style={td}>
                      <div style={{ fontWeight: 600 }}>{guestName(b.guestId)}</div>
                      <div style={{ fontSize: "0.7rem", color: TOKENS.inkSoft }}>{shortRef(b.id)}</div>
                    </td>
                    <td style={{ ...td, whiteSpace: "nowrap" }}>
                      {fmtDate(b.checkIn)} → {fmtDate(b.checkOut)}
                    </td>
                    <td style={{ ...td, color: TOKENS.inkSoft }}>{n || "—"}</td>
                    <td style={td}>
                      <BookingBadges b={b} small />
                    </td>
                    <td style={td}>
                      <SoftBadge small color={meta.color} bg={meta.bg}>
                        {meta.label}
                      </SoftBadge>
                    </td>
                    <td style={{ ...td, textAlign: "right" }}>
                      <div style={{ display: "inline-flex", gap: 6 }}>{renderActions(b, false)}</div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!loading && listRows.length > 0 && (
        <GuestsPagination page={bSafePage} pageCount={bPageCount} total={listRows.length} pageSize={bPageSize} setPage={setBPage} setPageSize={setBPageSize} mobile={mobile} />
      )}

      {editingId && allBookings.find((b) => b.id === editingId) && (
        <EditBookingModal
          booking={allBookings.find((b) => b.id === editingId)}
          guest={guests.find((g) => g.id === allBookings.find((b) => b.id === editingId).guestId)}
          rooms={rooms}
          guests={guests}
          allBookings={allBookings}
          guestName={guestName}
          mealPlanRates={mealPlanRates}
          onSave={(fields, guestPatch) => {
            onUpdateBooking(editingId, fields, guestPatch);
            setEditingId(null);
          }}
          onClose={() => setEditingId(null)}
        />
      )}

      {switchingId && allBookings.find((b) => b.id === switchingId) && (
        <SwitchRoomModal
          booking={allBookings.find((b) => b.id === switchingId)}
          rooms={rooms}
          allBookings={allBookings}
          guestName={guestName}
          onSwitch={(roomNumber, persons, reason) => {
            onSwitchRoom(switchingId, roomNumber, persons, reason);
            setSwitchingId(null);
          }}
          onClose={() => setSwitchingId(null)}
        />
      )}

      {toast && (
        <div role="alert" style={{ position: "fixed", left: "50%", transform: "translateX(-50%)", bottom: mobile ? 92 : 28, zIndex: 80, background: "#FDF0D5", border: "1px solid #E8C97A", color: "#7A5A12", borderRadius: 12, padding: "0.65rem 0.9rem", maxWidth: "92vw", display: "flex", gap: 8, alignItems: "center", boxShadow: "0 8px 24px rgba(0,0,0,0.18)", fontSize: "0.85rem", fontWeight: 500 }}>
          <Ico name="alert" size={16} /> {toast}
        </div>
      )}

      {confirm && (
        <ConfirmModal
          title={confirm.kind === "checkout" ? "Check out guest?" : "Cancel this reservation?"}
          message={
            confirm.kind === "checkout"
              ? `${guestName(confirm.booking.guestId)} will be checked out of ${roomLabel(confirm.booking.roomNumber)}. The room will be marked as needing cleaning.`
              : `${guestName(confirm.booking.guestId)} · ${roomLabel(confirm.booking.roomNumber)} · ${fmtDate(confirm.booking.checkIn)} → ${fmtDate(confirm.booking.checkOut)} will be cancelled.`
          }
          confirmLabel={confirm.kind === "checkout" ? "Check out" : "Cancel reservation"}
          cancelLabel={confirm.kind === "checkout" ? "Not yet" : "Keep it"}
          danger={confirm.kind === "cancel"}
          onConfirm={() => {
            if (confirm.kind === "checkout") onCheckOut(confirm.booking.id);
            else onCancel(confirm.booking.id);
            setConfirm(null);
          }}
          onClose={() => setConfirm(null)}
        />
      )}
    </div>
  );
}

const modalOverlay = {
  position: "fixed",
  inset: 0,
  background: "rgba(27,36,48,0.4)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 60,
  padding: "1rem",
};
const modalBox = {
  background: TOKENS.paper,
  borderRadius: 12,
  padding: "1.25rem",
  width: 480,
  maxWidth: "100%",
  maxHeight: "92vh",
  overflowY: "auto",
};

function EditBookingModal({ booking, guest, rooms, guests, allBookings, guestName, mealPlanRates, onSave, onClose }) {
  const inHouse = booking.status === "checked_in";
  const [form, setForm] = useState({
    roomNumber: booking.roomNumber,
    checkIn: booking.checkIn,
    checkOut: booking.checkOut,
    persons: booking.persons || 1,
    mealPlans: booking.mealPlans || [],
    bookingType: booking.bookingType || "booking",
    paymentMethod: booking.paymentMethod || "",
    discountPercent: booking.discountPercent || 0,
    totalAmount: booking.totalAmount || "",
  });
  const [g, setG] = useState({
    name: guest?.name || "",
    phone: guest?.phone || "",
    email: guest?.email || "",
    nationalId: guest?.nationalId || "",
  });
  const [error, setError] = useState("");

  const room = rooms.find((r) => r.number === form.roomNumber);
  const occupancyOptions = room ? occupancyOptionsForType(room.type) : [1, 2, 3];
  const validRange = form.checkIn && form.checkOut && form.checkOut > form.checkIn;

  // Reserved bookings can move to any free room; in-house guests use "Switch" instead.
  const roomChoices = useMemo(
    () =>
      rooms.filter(
        (r) =>
          r.number === booking.roomNumber ||
          (r.status !== "out_of_order" && validRange && !findConflict(allBookings, r.number, form.checkIn, form.checkOut, booking.id))
      ),
    [rooms, allBookings, form.checkIn, form.checkOut, validRange, booking]
  );

  const pickRoom = (roomNumber) => {
    const r = rooms.find((x) => x.number === roomNumber);
    const opts = r ? occupancyOptionsForType(r.type) : [1, 2, 3];
    setForm((f) => ({ ...f, roomNumber, persons: opts.includes(f.persons) ? f.persons : opts[opts.length - 1] }));
  };

  const save = () => {
    setError("");
    if (!g.name.trim()) return setError("Guest name is required.");
    if (!form.checkIn || !form.checkOut || form.checkOut <= form.checkIn) return setError("Check-out must be after check-in.");
    const nid = g.nationalId.trim().toLowerCase();
    if (nid) {
      const dup = guests.find((x) => x.id !== booking.guestId && (x.nationalId || "").trim().toLowerCase() === nid);
      if (dup) return setError(`This ID already belongs to another guest: ${dup.name}.`);
    }
    const clash = findConflict(allBookings, form.roomNumber, form.checkIn, form.checkOut, booking.id);
    if (clash) {
      return setError(
        `Room ${form.roomNumber} is already booked for ${guestName(clash.guestId)} from ${fmtDate(clash.checkIn)} to ${fmtDate(clash.checkOut)}.`
      );
    }
    const discountPercent = Math.min(100, Math.max(0, Number(form.discountPercent) || 0));
    onSave(
      {
        roomNumber: form.roomNumber,
        checkIn: form.checkIn,
        checkOut: form.checkOut,
        persons: form.persons,
        mealPlans: form.mealPlans,
        bookingType: form.bookingType,
        paymentMethod: form.paymentMethod,
        discountPercent,
        totalAmount: Number(form.totalAmount) || 0,
      },
      { name: g.name.trim(), phone: g.phone.trim(), email: g.email.trim(), nationalId: g.nationalId.trim() }
    );
  };

  const label = { fontSize: "0.7rem", color: TOKENS.inkSoft, marginBottom: 4 };

  return (
    <div style={modalOverlay} onClick={onClose}>
      <div style={modalBox} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ fontFamily: "Fraunces, serif", fontSize: "1.15rem", margin: "0 0 0.75rem" }}>
          Edit booking · {roomLabel(booking.roomNumber)}
        </h3>

        <div style={{ ...label, fontWeight: 600, color: TOKENS.ink }}>Guest</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: "0.5rem" }}>
          <input placeholder="Full name" value={g.name} onChange={(e) => setG({ ...g, name: e.target.value })} style={inputStyle} />
          <input placeholder="National ID / passport" value={g.nationalId} onChange={(e) => setG({ ...g, nationalId: e.target.value })} style={inputStyle} />
          <input placeholder="Phone" value={g.phone} onChange={(e) => setG({ ...g, phone: e.target.value })} style={inputStyle} />
          <input placeholder="Email (optional)" value={g.email} onChange={(e) => setG({ ...g, email: e.target.value })} style={inputStyle} />
        </div>
        <div style={{ fontSize: "0.7rem", color: TOKENS.inkSoft, marginBottom: "0.9rem" }}>
          Guest changes apply to the guest's profile (all of their bookings).
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "0.75rem" }}>
          <div>
            <div style={label}>Check-in</div>
            <input
              type="date"
              value={form.checkIn}
              disabled={inHouse}
              onChange={(e) => setForm({ ...form, checkIn: e.target.value })}
              style={{ ...inputStyle, width: "100%", opacity: inHouse ? 0.6 : 1 }}
            />
          </div>
          <div>
            <div style={label}>Check-out</div>
            <input type="date" value={form.checkOut} onChange={(e) => setForm({ ...form, checkOut: e.target.value })} style={{ ...inputStyle, width: "100%" }} />
          </div>
        </div>

        <div style={{ marginBottom: "0.75rem" }}>
          <div style={label}>Room</div>
          {!booking.roomNumber && (
            <div style={{ fontSize: "0.76rem", color: TOKENS.dirty, marginBottom: 6 }}>
              This booking has no room yet. Pick one below when the guest arrives, then check in.
            </div>
          )}
          {inHouse ? (
            <div style={{ fontSize: "0.82rem", color: TOKENS.inkSoft }}>
              Room {booking.roomNumber} — to move the guest to another room use the <strong>Switch</strong> button.
            </div>
          ) : (
            <select value={form.roomNumber} onChange={(e) => pickRoom(e.target.value)} style={{ ...inputStyle, width: "100%" }}>
              <option value="">No room assigned yet</option>
              {roomChoices.map((r) => (
                <option key={r.number} value={r.number}>
                  {r.number} · {r.type}
                </option>
              ))}
            </select>
          )}
        </div>

        <div style={{ marginBottom: "0.75rem" }}>
          <div style={label}>How many people</div>
          <div style={{ display: "flex", gap: 6 }}>
            {occupancyOptions.map((n) => (
              <button key={n} onClick={() => setForm({ ...form, persons: n })} style={{ ...ghostBtn, flex: 1, background: form.persons === n ? TOKENS.paperDim : "#fff" }}>
                {n}
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: "0.75rem" }}>
          <div style={label}>Meal plan</div>
          <select
            value={form.mealPlans[0] || ""}
            onChange={(e) => setForm({ ...form, mealPlans: e.target.value ? [e.target.value] : [] })}
            style={{ ...inputStyle, width: "100%" }}
          >
            <option value="">None</option>
            {GUEST_MEAL_PLAN_CHOICES.map((plan) => (
              <option key={plan} value={plan}>
                {plan} {FREE_MEAL_PLANS.includes(plan) ? "(no charge)" : `(+${fmtMoney((mealPlanRates && mealPlanRates[plan]) || 0)}/person/night)`}
              </option>
            ))}
          </select>
        </div>

        <div style={{ marginBottom: "0.75rem" }}>
          <div style={label}>Booking type</div>
          <select value={form.bookingType} onChange={(e) => setForm({ ...form, bookingType: e.target.value })} style={{ ...inputStyle, width: "100%" }}>
            {BOOKING_TYPES.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        <PaymentMethodPicker value={form.paymentMethod} onChange={(v) => setForm({ ...form, paymentMethod: v })} />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "0.75rem" }}>
          <div>
            <div style={label}>Total (EGP)</div>
            <input type="number" min="0" step="1" value={form.totalAmount} onChange={(e) => setForm({ ...form, totalAmount: e.target.value })} style={{ ...inputStyle, width: "100%" }} />
          </div>
          <div>
            <div style={label}>Discount (%)</div>
            <input type="number" min="0" max="100" step="1" value={form.discountPercent} onChange={(e) => setForm({ ...form, discountPercent: e.target.value })} style={{ ...inputStyle, width: "100%" }} />
          </div>
        </div>

        {error && (
          <div style={{ fontSize: "0.8rem", color: TOKENS.oos, background: TOKENS.oosBg, borderRadius: 8, padding: "0.5rem 0.7rem", marginBottom: 8 }}>
            {error}
          </div>
        )}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={ghostBtn}>
            Close
          </button>
          <button onClick={save} style={primaryBtn}>
            Save changes
          </button>
        </div>
      </div>
    </div>
  );
}

function SwitchRoomModal({ booking, rooms, allBookings, guestName, onSwitch, onClose }) {
  const from = todayISO() > booking.checkIn ? todayISO() : booking.checkIn;
  const to = booking.checkOut > from ? booking.checkOut : addDaysISO(from, 1);
  const [target, setTarget] = useState("");
  const [reason, setReason] = useState("");

  const candidates = rooms.filter(
    (r) =>
      r.number !== booking.roomNumber &&
      (r.status === "vacant_clean" || r.status === "vacant_dirty") &&
      !findConflict(allBookings, r.number, from, to, booking.id)
  );
  const targetRoom = rooms.find((r) => r.number === target);
  const maxPersons = targetRoom ? Math.max(...occupancyOptionsForType(targetRoom.type)) : null;
  const tooMany = maxPersons !== null && (booking.persons || 1) > maxPersons;
  const currentRoom = rooms.find((r) => r.number === booking.roomNumber);

  return (
    <div style={modalOverlay} onClick={onClose}>
      <div style={modalBox} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ fontFamily: "Fraunces, serif", fontSize: "1.15rem", margin: "0 0 0.25rem" }}>Switch room</h3>
        <div style={{ fontSize: "0.82rem", color: TOKENS.inkSoft, marginBottom: "0.9rem" }}>
          {guestName(booking.guestId)} · now in Room {booking.roomNumber}
          {currentRoom ? ` (${currentRoom.type})` : ""} · until {fmtDate(booking.checkOut)}
        </div>

        {candidates.length === 0 ? (
          <div style={{ color: TOKENS.inkSoft, fontSize: "0.85rem", marginBottom: "0.9rem" }}>
            No free rooms available for the rest of the stay.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: "0.9rem", maxHeight: 280, overflowY: "auto" }}>
            {candidates.map((r) => (
              <button
                key={r.number}
                onClick={() => setTarget(r.number)}
                style={{ ...ghostBtn, textAlign: "left", padding: "0.45rem 0.65rem", background: target === r.number ? TOKENS.paperDim : "#fff" }}
              >
                {r.number} · {r.type}
                <span style={{ color: TOKENS.inkSoft, fontSize: "0.72rem" }}>
                  {" "}
                  — {r.status === "vacant_clean" ? "clean" : "needs cleaning"}
                </span>
              </button>
            ))}
          </div>
        )}

        {target && (
          <div style={{ fontSize: "0.78rem", color: TOKENS.inkSoft, marginBottom: "0.75rem" }}>
            Room {booking.roomNumber} will be marked <strong>needs cleaning</strong> and Room {target} <strong>occupied</strong>.
            {tooMany && (
              <div style={{ color: TOKENS.dirty, marginTop: 4 }}>
                Room {target} sleeps up to {maxPersons}; guests will be set to {maxPersons}.
              </div>
            )}
          </div>
        )}

        <div style={{ marginBottom: "0.9rem" }}>
          <div style={{ fontSize: "0.7rem", color: TOKENS.inkSoft, marginBottom: 4 }}>Reason for switching (required)</div>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. AC not working, guest asked for a quieter room…"
            rows={3}
            style={{ ...inputStyle, width: "100%", resize: "vertical", boxSizing: "border-box" }}
          />
          <div style={{ fontSize: "0.7rem", color: TOKENS.inkSoft, marginTop: 4 }}>
            Saved in the guest's notes and shown under this reservation in the Guests tab.
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={ghostBtn}>
            Close
          </button>
          <button
            onClick={() => onSwitch(target, tooMany ? maxPersons : booking.persons, reason.trim())}
            style={{ ...primaryBtn, opacity: target && reason.trim() ? 1 : 0.5 }}
            disabled={!target || !reason.trim()}
          >
            Switch room
          </button>
        </div>
      </div>
    </div>
  );
}

// ───────────────────────── Guests page (responsive) ─────────────────────────

const GUESTS_CSS = `
@keyframes gxFade { from { opacity: 0 } to { opacity: 1 } }
@keyframes nbSlide { from { transform: translateX(100%) } to { transform: translateX(0) } }
@keyframes nbSpin { to { transform: rotate(360deg) } }
@keyframes gxSlideRight { from { transform: translateX(100%) } to { transform: translateX(0) } }
@keyframes gxSlideUp { from { transform: translateY(100%) } to { transform: translateY(0) } }
@keyframes gxShimmer { 0% { background-position: -200px 0 } 100% { background-position: calc(200px + 100%) 0 } }
.gx-row { cursor: pointer; transition: background .12s; }
.gx-row:hover { background: #FBF8F3; }
.gx-card { cursor: pointer; transition: box-shadow .12s, transform .12s; }
.gx-card:active { transform: scale(.995); }
.gx-skel { background: linear-gradient(90deg, #EFE8DC 0px, #F8F4EC 100px, #EFE8DC 200px); background-size: 200px 100%; background-repeat: no-repeat; background-color: #EFE8DC; animation: gxShimmer 1.2s infinite linear; border-radius: 6px; }
.gx-btn:focus-visible, .gx-row:focus-visible, .gx-card:focus-visible { outline: 2px solid #B08968; outline-offset: 2px; }
`;

const ICON_PATHS = {
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  filter: '<polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>',
  phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>',
  mail: '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
  star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
  repeat: '<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
  ban: '<circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/>',
  home: '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
  left: '<path d="m15 18-6-6 6-6"/>',
  right: '<path d="m9 18 6-6-6-6"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  id: '<rect width="18" height="14" x="3" y="5" rx="2"/><circle cx="9" cy="11" r="2"/><path d="M14 10h4"/><path d="M14 14h4"/><path d="M6 17c.5-1.5 1.7-2 3-2s2.5.5 3 2"/>',
  calendar: '<rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/>',
  check: '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
  bed: '<path d="M2 4v16"/><path d="M2 8h18a2 2 0 0 1 2 2v10"/><path d="M2 17h20"/><path d="M6 8v9"/>',
  sparkles: '<path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z"/>',
  wrench: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
  user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  eye: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
  history: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>',
  alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  edit: '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/>',
  login: '<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" x2="3" y1="12" y2="12"/>',
  inbox: '<polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
  moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
  swap: '<path d="m16 3 4 4-4 4"/><path d="M20 7H4"/><path d="m8 21-4-4 4-4"/><path d="M4 17h16"/>',
};
function Ico({ name, size = 14, color = "currentColor", style }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0, ...style }}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: ICON_PATHS[name] || "" }}
    />
  );
}

function useIsMobile(breakpoint = 768) {
  const query = `(max-width: ${breakpoint - 1}px)`;
  const [mobile, setMobile] = useState(() => typeof window !== "undefined" && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = (e) => setMobile(e.matches);
    setMobile(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [query]);
  return mobile;
}

const GUEST_BADGES = {
  inhouse: { label: "In-House", color: TOKENS.clean, bg: TOKENS.cleanBg, icon: "home" },
  vip: { label: "VIP", color: "#8A5A00", bg: "#F8E9C8", icon: "star" },
  repeat: { label: "Repeat Guest", color: TOKENS.reserved, bg: TOKENS.reservedBg, icon: "repeat" },
  blacklisted: { label: "Blacklisted", color: TOKENS.oos, bg: TOKENS.oosBg, icon: "ban" },
};
const RES_STATUS_META = {
  reserved: { label: "Reserved", color: TOKENS.reserved, bg: TOKENS.reservedBg },
  checked_in: { label: "Checked in", color: TOKENS.clean, bg: TOKENS.cleanBg },
  checked_out: { label: "Checked out", color: TOKENS.occupied, bg: TOKENS.occupiedBg },
  cancelled: { label: "Cancelled", color: TOKENS.oos, bg: TOKENS.oosBg },
};

function SoftBadge({ color, bg, icon, children, small }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontSize: small ? "0.66rem" : "0.7rem",
        fontWeight: 600,
        color,
        background: bg,
        borderRadius: 999,
        padding: small ? "2px 7px" : "3px 9px",
        whiteSpace: "nowrap",
      }}
    >
      {icon && <Ico name={icon} size={small ? 10 : 11} />}
      {children}
    </span>
  );
}

function fmtDateY(iso) {
  if (!iso) return "—";
  return new Date(iso + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
function nightsBetween(ci, co) {
  const n = Math.round((new Date(co + "T00:00:00") - new Date(ci + "T00:00:00")) / 86400000);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function computeGuestStats(guest, mine) {
  const history = [...mine].sort((a, b) => b.checkIn.localeCompare(a.checkIn));
  const live = history.filter((b) => b.status !== "cancelled");
  const spent = live.reduce((sum, b) => sum + (Number(b.totalAmount) || 0), 0);
  const stay = history.find((b) => b.status === "checked_in");
  const roomCount = {};
  live.forEach((b) => {
    if (b.roomNumber) roomCount[b.roomNumber] = (roomCount[b.roomNumber] || 0) + 1;
  });
  const top = Object.entries(roomCount).sort((a, b) => b[1] - a[1])[0];
  const tags = splitGuestNotes(guest.notes).tags;
  return {
    history,
    live,
    count: live.length,
    spent,
    isInHouse: !!stay,
    inHouseRoom: stay ? stay.roomNumber : null,
    preferredRoom: top ? top[0] : null,
    vip: tags.includes("vip"),
    blacklisted: tags.includes("blacklisted"),
    repeat: live.length >= 2,
    lastStay: live.length ? live[0].checkIn : "",
  };
}

function guestBadgeList(st) {
  const list = [];
  if (st.blacklisted) list.push("blacklisted");
  if (st.isInHouse) list.push("inhouse");
  if (st.vip) list.push("vip");
  if (st.repeat) list.push("repeat");
  return list;
}

function GuestBadges({ st, small }) {
  const list = guestBadgeList(st);
  if (list.length === 0) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
      {list.map((k) => (
        <SoftBadge key={k} small={small} color={GUEST_BADGES[k].color} bg={GUEST_BADGES[k].bg} icon={GUEST_BADGES[k].icon}>
          {GUEST_BADGES[k].label}
        </SoftBadge>
      ))}
    </div>
  );
}

function GuestsSkeleton({ mobile }) {
  const rows = Array.from({ length: 5 });
  if (mobile) {
    return (
      <div>
        {rows.map((_, i) => (
          <div key={i} style={{ ...cardStyle, display: "flex", flexDirection: "column", gap: 8 }}>
            <div className="gx-skel" style={{ height: 16, width: "55%" }} />
            <div className="gx-skel" style={{ height: 12, width: "35%" }} />
            <div className="gx-skel" style={{ height: 12, width: "70%" }} />
          </div>
        ))}
      </div>
    );
  }
  return (
    <div style={{ ...cardStyle, padding: 0 }}>
      {rows.map((_, i) => (
        <div key={i} style={{ display: "flex", gap: 16, padding: "1rem", borderTop: i ? `1px solid ${TOKENS.paperDim}` : "none" }}>
          <div className="gx-skel" style={{ height: 16, flex: 2 }} />
          <div className="gx-skel" style={{ height: 16, flex: 2 }} />
          <div className="gx-skel" style={{ height: 16, flex: 1 }} />
          <div className="gx-skel" style={{ height: 16, flex: 1 }} />
        </div>
      ))}
    </div>
  );
}

function GuestsPagination({ page, pageCount, total, pageSize, setPage, setPageSize, mobile }) {
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const set = new Set([1, pageCount, page - 1, page, page + 1]);
  const nums = [...set].filter((n) => n >= 1 && n <= pageCount).sort((a, b) => a - b);
  const items = [];
  nums.forEach((n, i) => {
    if (i > 0 && n - nums[i - 1] > 1) items.push("…" + n);
    items.push(n);
  });
  const navBtn = (disabled) => ({ ...ghostBtn, padding: "0.4rem 0.6rem", display: "inline-flex", alignItems: "center", opacity: disabled ? 0.4 : 1, background: "#fff" });
  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 12 }}>
      <div style={{ fontSize: "0.78rem", color: TOKENS.inkSoft }}>
        Showing {from}–{to} of {total}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        {!mobile && (
          <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} style={{ ...inputStyle, padding: "0.35rem 0.5rem", marginRight: 6 }} aria-label="Rows per page">
            {[10, 25, 50].map((n) => (
              <option key={n} value={n}>
                {n} / page
              </option>
            ))}
          </select>
        )}
        <button className="gx-btn" onClick={() => setPage(page - 1)} disabled={page <= 1} style={navBtn(page <= 1)} aria-label="Previous page">
          <Ico name="left" size={14} />
        </button>
        {mobile ? (
          <span style={{ fontSize: "0.8rem", color: TOKENS.ink, padding: "0 6px" }}>
            Page {page} / {pageCount}
          </span>
        ) : (
          items.map((it) =>
            typeof it === "string" ? (
              <span key={it} style={{ color: TOKENS.inkSoft, padding: "0 2px" }}>
                …
              </span>
            ) : (
              <button
                key={it}
                className="gx-btn"
                onClick={() => setPage(it)}
                style={{
                  ...ghostBtn,
                  padding: "0.35rem 0.65rem",
                  minWidth: 34,
                  background: it === page ? TOKENS.ink : "#fff",
                  color: it === page ? TOKENS.paper : TOKENS.inkSoft,
                  borderColor: it === page ? TOKENS.ink : TOKENS.paperDim,
                }}
                aria-current={it === page ? "page" : undefined}
              >
                {it}
              </button>
            )
          )
        )}
        <button className="gx-btn" onClick={() => setPage(page + 1)} disabled={page >= pageCount} style={navBtn(page >= pageCount)} aria-label="Next page">
          <Ico name="right" size={14} />
        </button>
      </div>
    </div>
  );
}

function GuestDrawer({ guest, st, mobile, onClose, onToggleTag }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const notes = splitGuestNotes(guest.notes);
  const tile = { background: TOKENS.paper, borderRadius: 10, padding: "0.65rem 0.75rem", flex: "1 1 0", minWidth: 0 };
  const tileLabel = { fontSize: "0.68rem", color: TOKENS.inkSoft, marginBottom: 2 };
  const tileValue = { fontWeight: 700, fontSize: "1rem", color: TOKENS.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };
  const infoRow = { display: "flex", alignItems: "center", gap: 8, fontSize: "0.84rem", color: TOKENS.ink, marginBottom: 6 };

  const panelStyle = mobile
    ? {
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        height: "92vh",
        borderRadius: "16px 16px 0 0",
        animation: "gxSlideUp .22s ease-out",
      }
    : { position: "fixed", top: 0, right: 0, bottom: 0, width: 460, maxWidth: "100vw", animation: "gxSlideRight .22s ease-out" };

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(27,36,48,0.45)", zIndex: 70, animation: "gxFade .15s ease-out" }}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Guest details: ${guest.name}`}
        onClick={(e) => e.stopPropagation()}
        style={{ ...panelStyle, background: "#fff", display: "flex", flexDirection: "column", boxShadow: "0 0 40px rgba(0,0,0,0.2)" }}
      >
        {mobile && <div style={{ width: 40, height: 4, borderRadius: 4, background: TOKENS.paperDim, margin: "8px auto 0" }} />}

        <div style={{ padding: "1rem 1.1rem 0.75rem", borderBottom: `1px solid ${TOKENS.paperDim}`, display: "flex", gap: 10, alignItems: "flex-start" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: "Fraunces, serif", fontSize: "1.2rem", fontWeight: 600, wordBreak: "break-word" }}>{guest.name}</div>
            <div style={{ marginTop: 6 }}>
              <GuestBadges st={st} />
            </div>
            {st.isInHouse && (
              <div style={{ fontSize: "0.76rem", color: TOKENS.brassDark, marginTop: 6 }}>Currently in {roomLabel(st.inHouseRoom).toLowerCase()}</div>
            )}
          </div>
          <button className="gx-btn" onClick={onClose} aria-label="Close" style={{ ...ghostBtn, padding: "0.4rem", display: "inline-flex" }}>
            <Ico name="x" size={16} />
          </button>
        </div>

        <div style={{ overflowY: "auto", padding: "1rem 1.1rem 1.5rem", flex: 1 }}>
          <div style={{ marginBottom: "1rem" }}>
            <div style={infoRow}>
              <Ico name="phone" color={TOKENS.inkSoft} />
              {guest.phone || <span style={{ color: TOKENS.inkSoft }}>No phone</span>}
            </div>
            <div style={infoRow}>
              <Ico name="mail" color={TOKENS.inkSoft} />
              {guest.email || <span style={{ color: TOKENS.inkSoft }}>No email</span>}
            </div>
            <div style={infoRow}>
              <Ico name="id" color={TOKENS.inkSoft} />
              {guest.nationalId ? `ID / Passport: ${guest.nationalId}` : <span style={{ color: TOKENS.inkSoft }}>No ID on file</span>}
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, marginBottom: "1rem" }}>
            <div style={tile}>
              <div style={tileLabel}>Total bookings</div>
              <div style={tileValue}>{st.count}</div>
            </div>
            <div style={tile}>
              <div style={tileLabel}>Total spent</div>
              <div style={tileValue}>{fmtMoney(st.spent)}</div>
            </div>
            <div style={tile}>
              <div style={tileLabel}>Preferred room</div>
              <div style={tileValue}>{st.preferredRoom || "—"}</div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: "1rem" }}>
            <button
              className="gx-btn"
              onClick={() => onToggleTag("vip")}
              style={{ ...ghostBtn, display: "inline-flex", alignItems: "center", gap: 6, fontSize: "0.78rem", background: st.vip ? GUEST_BADGES.vip.bg : "#fff", color: st.vip ? GUEST_BADGES.vip.color : TOKENS.inkSoft }}
            >
              <Ico name="star" size={13} /> {st.vip ? "Remove VIP" : "Mark as VIP"}
            </button>
            <button
              className="gx-btn"
              onClick={() => onToggleTag("blacklisted")}
              style={{ ...ghostBtn, display: "inline-flex", alignItems: "center", gap: 6, fontSize: "0.78rem", background: st.blacklisted ? TOKENS.oosBg : "#fff", color: st.blacklisted ? TOKENS.oos : TOKENS.inkSoft }}
            >
              <Ico name="ban" size={13} /> {st.blacklisted ? "Remove from blacklist" : "Blacklist"}
            </button>
          </div>

          {notes.plain && (
            <div style={{ marginBottom: "1rem" }}>
              <div style={{ fontSize: "0.72rem", fontWeight: 600, color: TOKENS.inkSoft, marginBottom: 4 }}>Notes</div>
              <div style={{ fontSize: "0.82rem", whiteSpace: "pre-wrap", background: TOKENS.paper, borderRadius: 8, padding: "0.6rem 0.75rem" }}>{notes.plain}</div>
            </div>
          )}

          <div style={{ fontSize: "0.72rem", fontWeight: 600, color: TOKENS.inkSoft, marginBottom: 8 }}>Reservation history ({st.history.length})</div>
          {st.history.length === 0 ? (
            <div style={{ color: TOKENS.inkSoft, fontSize: "0.82rem" }}>No reservations on record for this guest.</div>
          ) : (
            <div style={{ position: "relative", paddingLeft: 18 }}>
              <div style={{ position: "absolute", left: 5, top: 6, bottom: 6, width: 2, background: TOKENS.paperDim }} />
              {st.history.map((b) => {
                const meta = RES_STATUS_META[b.status] || RES_STATUS_META.reserved;
                const n = nightsBetween(b.checkIn, b.checkOut);
                const type = bookingTypeMeta(b.bookingType);
                return (
                  <div key={b.id} style={{ position: "relative", marginBottom: 10 }}>
                    <span style={{ position: "absolute", left: -18, top: 14, width: 12, height: 12, borderRadius: "50%", background: meta.color, border: "2px solid #fff", boxSizing: "border-box", boxShadow: `0 0 0 1px ${meta.color}` }} />
                    <div style={{ border: `1px solid ${TOKENS.paperDim}`, borderRadius: 10, padding: "0.6rem 0.75rem", background: b.status === "cancelled" ? "#FBF7F5" : "#fff" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
                        <div style={{ fontWeight: 600, fontSize: "0.88rem" }}>{roomLabel(b.roomNumber)}</div>
                        <SoftBadge small color={meta.color} bg={meta.bg}>
                          {meta.label}
                        </SoftBadge>
                      </div>
                      <div style={{ fontSize: "0.76rem", color: TOKENS.inkSoft, marginTop: 2, display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
                        <Ico name="calendar" size={12} />
                        {fmtDateY(b.checkIn)} → {fmtDateY(b.checkOut)}
                        {n > 0 && <span>· {n} night{n === 1 ? "" : "s"}</span>}
                        <span>
                          · {b.persons || 1} {(b.persons || 1) === 1 ? "person" : "persons"}
                        </span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                        <SoftBadge small color={type.color} bg={type.bg}>
                          {type.label}
                        </SoftBadge>
                        {b.paymentMethod && (
                          <span style={{ fontSize: "0.66rem", color: TOKENS.inkSoft, border: `1px solid ${TOKENS.paperDim}`, borderRadius: 999, padding: "2px 7px" }}>
                            {paymentMethodLabel(b.paymentMethod)}
                          </span>
                        )}
                        {b.mealPlans && b.mealPlans[0] && <span style={{ fontSize: "0.7rem", color: TOKENS.inkSoft }}>{b.mealPlans[0]}</span>}
                        {Number(b.totalAmount) > 0 && <span style={{ marginLeft: "auto", fontSize: "0.8rem", fontWeight: 700 }}>{fmtMoney(Number(b.totalAmount))}</span>}
                      </div>
                      {(notes.switches[b.id] || []).map((txt, i) => (
                        <div key={i} style={{ marginTop: 6, fontSize: "0.74rem", color: TOKENS.dirty, background: TOKENS.dirtyBg, borderRadius: 6, padding: "0.35rem 0.55rem", display: "flex", gap: 6, alignItems: "flex-start" }}>
                          <Ico name="swap" size={12} style={{ marginTop: 2 }} />
                          <span>Room switch: {txt}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function GuestsTab({ guests, search, setSearch, showNew, setShowNew, onCreate, bookings, rooms, onUpdateTags, loading = false }) {
  const mobile = useIsMobile();
  const [form, setForm] = useState({ name: "", phone: "", email: "", nationalId: "", notes: "" });
  const [formError, setFormError] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortBy, setSortBy] = useState("name");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [openGuestId, setOpenGuestId] = useState(null);

  const submit = () => {
    setFormError("");
    if (!form.name.trim()) return;
    const nameQ = form.name.trim().toLowerCase();
    const idQ = (form.nationalId || "").trim().toLowerCase();
    const duplicate = guests.find(
      (g) => g.name.trim().toLowerCase() === nameQ && idQ && (g.nationalId || "").trim().toLowerCase() === idQ
    );
    if (duplicate) {
      setFormError(`This guest is already added: ${duplicate.name} (ID: ${duplicate.nationalId}).`);
      return;
    }
    onCreate({ id: uid(), ...form });
    setForm({ name: "", phone: "", email: "", nationalId: "", notes: "" });
  };

  const bookingsByGuest = useMemo(() => {
    const map = {};
    bookings.forEach((b) => (map[b.guestId] = map[b.guestId] || []).push(b));
    return map;
  }, [bookings]);

  const rows = useMemo(() => guests.map((g) => ({ g, st: computeGuestStats(g, bookingsByGuest[g.id] || []) })), [guests, bookingsByGuest]);

  const filtered = useMemo(() => {
    let list = rows.filter(({ st }) => {
      if (statusFilter === "inhouse" && !st.isInHouse) return false;
      if (statusFilter === "vip" && !st.vip) return false;
      if (statusFilter === "repeat" && !st.repeat) return false;
      if (statusFilter === "blacklisted" && !st.blacklisted) return false;
      if (dateFrom || dateTo) {
        const hit = st.live.some((b) => (!dateTo || b.checkIn <= dateTo) && (!dateFrom || b.checkOut >= dateFrom));
        if (!hit) return false;
      }
      return true;
    });
    if (sortBy === "ltv") list = [...list].sort((a, b) => b.st.spent - a.st.spent);
    else if (sortBy === "recent") list = [...list].sort((a, b) => (b.st.lastStay || "").localeCompare(a.st.lastStay || ""));
    return list;
  }, [rows, statusFilter, dateFrom, dateTo, sortBy]);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, dateFrom, dateTo, sortBy, pageSize]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const visible = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  const activeFilterCount = (statusFilter !== "all" ? 1 : 0) + (dateFrom || dateTo ? 1 : 0) + (sortBy !== "name" ? 1 : 0);
  const hasAnyFilter = activeFilterCount > 0 || search.trim() !== "";
  const clearAll = () => {
    setSearch("");
    setStatusFilter("all");
    setDateFrom("");
    setDateTo("");
    setSortBy("name");
  };

  const openRow = rows.find((r) => r.g.id === openGuestId);

  const filterControls = (
    <>
      <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ ...inputStyle, minWidth: 0 }} aria-label="Status filter">
        <option value="all">All statuses</option>
        <option value="inhouse">In-House</option>
        <option value="vip">VIP</option>
        <option value="repeat">Repeat Guest</option>
        <option value="blacklisted">Blacklisted</option>
      </select>
      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.72rem", color: TOKENS.inkSoft }}>
        Stay from
        <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={{ ...inputStyle, flex: 1, minWidth: 0 }} />
      </label>
      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.72rem", color: TOKENS.inkSoft }}>
        to
        <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={{ ...inputStyle, flex: 1, minWidth: 0 }} />
      </label>
      <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} style={{ ...inputStyle, minWidth: 0 }} aria-label="Sort">
        <option value="name">Sort: Name A–Z</option>
        <option value="ltv">Sort: Highest spent</option>
        <option value="recent">Sort: Latest stay</option>
      </select>
    </>
  );

  const th = { textAlign: "left", fontSize: "0.7rem", fontWeight: 600, color: TOKENS.inkSoft, padding: "0.65rem 0.9rem", background: "#FBF8F3", whiteSpace: "nowrap" };
  const td = { padding: "0.75rem 0.9rem", fontSize: "0.84rem", verticalAlign: "middle", borderTop: `1px solid ${TOKENS.paperDim}` };

  return (
    <div>
      <style>{GUESTS_CSS}</style>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.9rem", gap: 8 }}>
        <h2 style={{ fontFamily: "Fraunces, serif", fontSize: "1.3rem", margin: 0 }}>
          Guests <span style={{ fontFamily: "Inter, sans-serif", fontSize: "0.78rem", color: TOKENS.inkSoft, fontWeight: 400 }}>({filtered.length})</span>
        </h2>
        <button onClick={() => setShowNew(!showNew)} style={primaryBtn}>
          {showNew ? "Cancel" : "Add guest"}
        </button>
      </div>

      {showNew && (
        <div style={cardStyle}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "0.75rem", marginBottom: "0.75rem" }}>
            <input placeholder="Full name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={inputStyle} />
            <input placeholder="National ID / passport number" value={form.nationalId} onChange={(e) => setForm({ ...form, nationalId: e.target.value })} style={inputStyle} />
            <input placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} style={inputStyle} />
            <input placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} style={inputStyle} />
            <input placeholder="Notes (preferences, etc.)" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} style={{ ...inputStyle, gridColumn: "1 / -1" }} />
          </div>
          {formError && (
            <div style={{ fontSize: "0.8rem", color: TOKENS.oos, background: TOKENS.oosBg, borderRadius: 8, padding: "0.5rem 0.7rem", marginBottom: "0.75rem" }}>⚠ {formError}</div>
          )}
          <button onClick={submit} style={primaryBtn}>
            Save guest
          </button>
        </div>
      )}

      {/* Search + filters */}
      <div style={{ ...cardStyle, padding: "0.65rem", marginBottom: 12 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: mobile ? "nowrap" : "wrap" }}>
          <div style={{ position: "relative", flex: 1, minWidth: 0 }}>
            <Ico name="search" size={15} color={TOKENS.inkSoft} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
            <input
              placeholder="Search name, phone, email or ID…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ ...inputStyle, width: "100%", boxSizing: "border-box", paddingLeft: 32, paddingRight: search ? 30 : undefined }}
            />
            {search && (
              <button className="gx-btn" onClick={() => setSearch("")} aria-label="Clear search" style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", border: "none", background: "none", cursor: "pointer", display: "inline-flex", color: TOKENS.inkSoft }}>
                <Ico name="x" size={14} />
              </button>
            )}
          </div>
          {mobile ? (
            <button className="gx-btn" onClick={() => setFiltersOpen(!filtersOpen)} style={{ ...ghostBtn, display: "inline-flex", alignItems: "center", gap: 6, background: filtersOpen ? TOKENS.paperDim : "#fff" }}>
              <Ico name="filter" size={14} /> Filters
              {activeFilterCount > 0 && (
                <span style={{ background: TOKENS.ink, color: TOKENS.paper, borderRadius: 999, fontSize: "0.65rem", padding: "1px 6px" }}>{activeFilterCount}</span>
              )}
            </button>
          ) : (
            <>
              {filterControls}
              {hasAnyFilter && (
                <button className="gx-btn" onClick={clearAll} style={ghostBtn}>
                  Clear
                </button>
              )}
            </>
          )}
        </div>
        {mobile && filtersOpen && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
            {filterControls}
            {hasAnyFilter && (
              <button className="gx-btn" onClick={clearAll} style={ghostBtn}>
                Clear all
              </button>
            )}
          </div>
        )}
      </div>

      {loading ? (
        <GuestsSkeleton mobile={mobile} />
      ) : filtered.length === 0 ? (
        <div style={{ ...cardStyle, textAlign: "center", padding: "2.5rem 1rem", color: TOKENS.inkSoft }}>
          <div style={{ display: "inline-flex", padding: 14, borderRadius: "50%", background: TOKENS.paper, marginBottom: 10 }}>
            <Ico name="users" size={26} color={TOKENS.brass} />
          </div>
          <div style={{ fontWeight: 600, color: TOKENS.ink, marginBottom: 4 }}>{hasAnyFilter ? "No guests match your search" : "No guests yet"}</div>
          <div style={{ fontSize: "0.82rem", marginBottom: 12 }}>
            {hasAnyFilter ? "Try a different name, phone or ID, or clear the filters." : "Add your first guest, or create a booking with a new guest."}
          </div>
          {hasAnyFilter ? (
            <button onClick={clearAll} style={ghostBtn}>
              Clear search & filters
            </button>
          ) : (
            <button onClick={() => setShowNew(true)} style={primaryBtn}>
              Add guest
            </button>
          )}
        </div>
      ) : mobile ? (
        <div>
          {visible.map(({ g, st }) => (
            <div
              key={g.id}
              className="gx-card"
              tabIndex={0}
              role="button"
              onClick={() => setOpenGuestId(g.id)}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setOpenGuestId(g.id)}
              style={{ ...cardStyle, borderColor: st.blacklisted ? "#E7BEBE" : TOKENS.paperDim }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
                <div style={{ fontWeight: 600, wordBreak: "break-word" }}>{g.name}</div>
                <div style={{ fontWeight: 700, fontSize: "0.85rem", whiteSpace: "nowrap" }}>{fmtMoney(st.spent)}</div>
              </div>
              <div style={{ margin: "6px 0" }}>
                <GuestBadges st={st} small />
              </div>
              <div style={{ fontSize: "0.78rem", color: TOKENS.inkSoft, display: "flex", flexDirection: "column", gap: 3 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <Ico name="phone" size={12} /> {g.phone || "No phone"}
                </span>
                {st.isInHouse && <span style={{ color: TOKENS.brassDark }}>Currently in {roomLabel(st.inHouseRoom).toLowerCase()}</span>}
              </div>
              <button
                className="gx-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  setOpenGuestId(g.id);
                }}
                style={{ ...ghostBtn, width: "100%", marginTop: 10, fontSize: "0.78rem", padding: "0.5rem" }}
              >
                View details
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ background: "#fff", border: `1px solid ${TOKENS.paperDim}`, borderRadius: 10, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
            <thead>
              <tr>
                <th style={th}>Guest</th>
                <th style={th}>Contact</th>
                <th style={th}>ID / Passport</th>
                <th style={th}>Status</th>
                <th style={{ ...th, textAlign: "right" }}>Lifetime value</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {visible.map(({ g, st }) => (
                <tr key={g.id} className="gx-row" tabIndex={0} onClick={() => setOpenGuestId(g.id)} onKeyDown={(e) => e.key === "Enter" && setOpenGuestId(g.id)}>
                  <td style={td}>
                    <div style={{ fontWeight: 600 }}>{g.name}</div>
                    {st.isInHouse && <div style={{ fontSize: "0.72rem", color: TOKENS.brassDark, marginTop: 2 }}>In {roomLabel(st.inHouseRoom).toLowerCase()}</div>}
                  </td>
                  <td style={{ ...td, color: TOKENS.inkSoft, fontSize: "0.8rem" }}>
                    <div>{g.phone || "—"}</div>
                    <div>{g.email || ""}</div>
                  </td>
                  <td style={{ ...td, fontSize: "0.8rem" }}>{g.nationalId || <span style={{ color: TOKENS.inkSoft }}>—</span>}</td>
                  <td style={td}>
                    <GuestBadges st={st} small />
                  </td>
                  <td style={{ ...td, textAlign: "right", fontWeight: 700 }}>{fmtMoney(st.spent)}</td>
                  <td style={{ ...td, textAlign: "right" }}>
                    <button
                      className="gx-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenGuestId(g.id);
                      }}
                      style={{ ...ghostBtn, fontSize: "0.75rem", padding: "0.35rem 0.75rem", whiteSpace: "nowrap" }}
                    >
                      View details
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <GuestsPagination page={safePage} pageCount={pageCount} total={filtered.length} pageSize={pageSize} setPage={setPage} setPageSize={setPageSize} mobile={mobile} />
      )}

      {openRow && (
        <GuestDrawer
          guest={openRow.g}
          st={openRow.st}
          mobile={mobile}
          onClose={() => setOpenGuestId(null)}
          onToggleTag={(tag) => {
            const cur = splitGuestNotes(openRow.g.notes).tags;
            onUpdateTags(openRow.g.id, cur.includes(tag) ? cur.filter((t) => t !== tag) : [...cur, tag]);
          }}
        />
      )}
    </div>
  );
}

// ───────────────────────── Housekeeping page ─────────────────────────

const HK_CSS = `
.hk-card { transition: background .35s ease, border-color .35s ease, box-shadow .2s ease; }
.hk-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 10px; }
@media (max-width: 639px) { .hk-grid { grid-template-columns: minmax(0, 1fr); } }
@keyframes hkCheck { from { transform: scale(.3); opacity: 0 } to { transform: scale(1); opacity: 1 } }
.hk-check { animation: hkCheck .3s ease-out both; }
.hk-btn { min-height: 46px; width: 100%; display: inline-flex; align-items: center; justify-content: center; gap: 8px; border: none; border-radius: 10px; font-size: .92rem; font-weight: 600; cursor: pointer; font-family: inherit; transition: transform .1s, filter .15s; }
.hk-btn:active { transform: scale(.98); }
.hk-btn:hover { filter: brightness(1.08); }
.hk-chips { display: flex; gap: 6px; overflow-x: auto; padding-bottom: 4px; -webkit-overflow-scrolling: touch; }
.hk-chips::-webkit-scrollbar { display: none; }
`;

function HousekeepingTab({ rooms, username, onMarkClean, checkoutCounts, onPostponeMaintenance, activeBookingForRoom, guestName, onMarkCleanedToday, bookings = [] }) {
  const today = todayISO();
  const isMaintDue = (r) => (checkoutCounts[r.number] || 0) - (r.maintenanceBaseline || 0) >= MAINTENANCE_THRESHOLD;

  const [view, setView] = useState(() => (rooms.some((r) => r.status === "vacant_dirty") ? "checkout" : "occupied"));
  const [floor, setFloor] = useState("all");
  const [q, setQ] = useState("");
  const [flash, setFlash] = useState({ occ: {}, out: {}, maint: {} });
  const timers = useRef([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const flashDone = (kind, snapshot) => {
    setFlash((f) => ({ ...f, [kind]: { ...f[kind], [snapshot.number]: snapshot } }));
    timers.current.push(
      setTimeout(() => {
        setFlash((f) => {
          const copy = { ...f[kind] };
          delete copy[snapshot.number];
          return { ...f, [kind]: copy };
        });
      }, 1800)
    );
  };

  const floors = [...new Set(rooms.map((r) => r.floor))].sort((a, b) => Number(a) - Number(b));
  const needle = q.trim().toLowerCase();
  const pass = (r) => (floor === "all" || String(r.floor) === String(floor)) && (!needle || String(r.number).toLowerCase().includes(needle));

  // Occupied rooms: daily service
  const occupiedAll = rooms.filter((r) => r.status === "occupied" && pass(r));
  const occDue = occupiedAll.filter((r) => r.lastCleanedDate !== today || flash.occ[r.number]);
  const occDone = occupiedAll.filter((r) => r.lastCleanedDate === today && !flash.occ[r.number]);
  const occPendingCount = occupiedAll.filter((r) => r.lastCleanedDate !== today).length;

  // Check-out rooms: turnover cleaning
  const arrivingToday = (r) => bookings.some((b) => b.roomNumber === r.number && b.status === "reserved" && b.checkIn === today);
  const outPending = rooms
    .filter((r) => r.status === "vacant_dirty" && pass(r))
    .sort((a, b) => Number(arrivingToday(b)) - Number(arrivingToday(a)));
  const outFlashed = Object.values(flash.out).filter((r) => pass(r) && !outPending.some((x) => x.number === r.number));
  const lastCheckout = (r) =>
    bookings
      .filter((b) => b.roomNumber === r.number && b.status === "checked_out")
      .sort((a, b) => b.checkOut.localeCompare(a.checkOut))[0];

  // Maintenance
  const maintDue = rooms.filter((r) => isMaintDue(r) && pass(r)).sort((a, b) => (checkoutCounts[b.number] || 0) - (checkoutCounts[a.number] || 0));
  const maintFlashed = Object.values(flash.maint).filter((r) => pass(r) && !maintDue.some((x) => x.number === r.number));
  const outOfOrder = rooms.filter((r) => r.status === "out_of_order" && pass(r));

  const tabs = [
    { key: "occupied", label: "Occupied cleaning", short: "Occupied", n: occPendingCount, icon: "bed", color: TOKENS.occupied, bg: TOKENS.occupiedBg },
    { key: "checkout", label: "Check-out cleaning", short: "Check-out", n: outPending.length, icon: "sparkles", color: "#C0502F", bg: "#FBE3D8" },
    { key: "maintenance", label: "Maintenance needed", short: "Maintenance", n: maintDue.length + outOfOrder.length, icon: "wrench", color: TOKENS.oos, bg: TOKENS.oosBg },
  ];

  const typeChip = (r) => (
    <span style={{ fontSize: "0.68rem", fontWeight: 700, color: TOKENS.inkSoft, background: TOKENS.paper, borderRadius: 6, padding: "2px 7px", letterSpacing: "0.03em" }}>{r.type}</span>
  );
  const cardBase = (done, accent) => ({
    background: done ? "#E4F1E7" : "#fff",
    border: `1px solid ${done ? "#9CC9A8" : TOKENS.paperDim}`,
    borderLeft: `5px solid ${done ? TOKENS.clean : accent}`,
    borderRadius: 14,
    padding: "0.85rem 0.9rem",
    display: "flex",
    flexDirection: "column",
    gap: 8,
    boxShadow: "0 1px 2px rgba(27,36,48,0.05)",
  });
  const roomNumberStyle = { fontFamily: "Fraunces, serif", fontSize: "1.7rem", fontWeight: 700, lineHeight: 1 };
  const infoLine = { fontSize: "0.8rem", color: TOKENS.inkSoft, display: "flex", alignItems: "center", gap: 6, minWidth: 0 };
  const DoneTag = ({ text }) => (
    <span className="hk-check" style={{ display: "inline-flex", alignItems: "center", gap: 5, color: TOKENS.clean, fontWeight: 700, fontSize: "0.85rem" }}>
      <Ico name="check" size={18} /> {text}
    </span>
  );
  const EmptyState = ({ icon, title, text }) => (
    <div style={{ ...cardStyle, textAlign: "center", padding: "2.2rem 1rem", color: TOKENS.inkSoft }}>
      <div style={{ display: "inline-flex", padding: 14, borderRadius: "50%", background: TOKENS.cleanBg, marginBottom: 10 }}>
        <Ico name={icon} size={26} color={TOKENS.clean} />
      </div>
      <div style={{ fontWeight: 600, color: TOKENS.ink, marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: "0.82rem" }}>{text}</div>
    </div>
  );
  const sectionLabel = (text, color) => (
    <div style={{ fontSize: "0.72rem", color, textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 8px", fontWeight: 700 }}>{text}</div>
  );

  const renderOccupiedCard = (r) => {
    const b = activeBookingForRoom(r.number);
    const done = r.lastCleanedDate === today;
    return (
      <div key={r.number} className="hk-card" style={cardBase(done, TOKENS.occupied)}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <div style={roomNumberStyle}>{r.number}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {done && <DoneTag text="Cleaned today" />}
            {typeChip(r)}
          </div>
        </div>
        {b ? (
          <>
            <div style={{ ...infoLine, color: TOKENS.ink, fontWeight: 600, fontSize: "0.9rem" }}>
              <Ico name="user" size={14} color={TOKENS.inkSoft} />
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{guestName(b.guestId)}</span>
            </div>
            <div style={infoLine}>
              <Ico name="calendar" size={13} /> {fmtDate(b.checkIn)} → {fmtDate(b.checkOut)}
            </div>
          </>
        ) : (
          <div style={infoLine}>No active booking found</div>
        )}
        {!done && (
          <button
            className="hk-btn"
            onClick={() => {
              onMarkCleanedToday(r.number);
              flashDone("occ", r);
            }}
            style={{ background: TOKENS.ink, color: TOKENS.paper }}
          >
            <Ico name="check" size={17} /> Mark cleaned today
          </button>
        )}
      </div>
    );
  };

  const renderCheckoutCard = (r, flashed) => {
    const last = lastCheckout(r);
    const urgent = arrivingToday(r);
    return (
      <div key={r.number} className="hk-card" style={cardBase(flashed, urgent ? "#C0392B" : TOKENS.dirty)}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <div style={roomNumberStyle}>{r.number}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {flashed ? (
              <DoneTag text="Clean & ready" />
            ) : urgent ? (
              <SoftBadge color="#B03A2E" bg="#FADBD8" icon="alert">
                Arriving today
              </SoftBadge>
            ) : (
              <SoftBadge color="#B5651D" bg="#FBE7D2" icon="sparkles">
                Turnover
              </SoftBadge>
            )}
            {typeChip(r)}
          </div>
        </div>
        {last ? (
          <div style={infoLine}>
            <Ico name="user" size={13} />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              Checked out: {guestName(last.guestId)} · {fmtDate(last.checkOut)}
            </span>
          </div>
        ) : (
          <div style={infoLine}>Needs full cleaning before the next guest</div>
        )}
        {!flashed && (
          <button
            className="hk-btn"
            onClick={() => {
              onMarkClean(r.number);
              flashDone("out", { ...r, status: "vacant_clean" });
            }}
            style={{ background: urgent ? "#C0392B" : "#C9722B", color: "#fff" }}
          >
            <Ico name="sparkles" size={17} /> Clean &amp; ready
          </button>
        )}
      </div>
    );
  };

  const renderMaintCard = (r, flashed) => {
    const since = (checkoutCounts[r.number] || 0) - (r.maintenanceBaseline || 0);
    return (
      <div key={r.number} className="hk-card" style={cardBase(flashed, TOKENS.oos)}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <div style={roomNumberStyle}>{r.number}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {flashed ? (
              <DoneTag text="Logged" />
            ) : (
              <SoftBadge color={TOKENS.oos} bg={TOKENS.oosBg} icon="wrench">
                Check due
              </SoftBadge>
            )}
            {typeChip(r)}
          </div>
        </div>
        <div style={infoLine}>
          <Ico name="alert" size={13} color={TOKENS.oos} />
          {flashed ? "Maintenance check recorded" : `${since} checkout${since === 1 ? "" : "s"} since last inspection`}
        </div>
        {!flashed && (
          <button
            className="hk-btn"
            onClick={() => {
              onPostponeMaintenance(r.number);
              flashDone("maint", r);
            }}
            style={{ background: "#fff", color: TOKENS.ink, border: `1.5px solid ${TOKENS.ink}` }}
          >
            <Ico name="check" size={17} /> Mark done / postpone
          </button>
        )}
      </div>
    );
  };

  const doneToday = rooms.filter((r) => r.status === "occupied" && r.lastCleanedDate === today).length;
  const totalOccupied = rooms.filter((r) => r.status === "occupied").length;
  const pct = totalOccupied ? Math.round((doneToday / totalOccupied) * 100) : 0;

  return (
    <div>
      <style>{GUESTS_CSS}</style>
      <style>{HK_CSS}</style>

      <h2 style={{ fontFamily: "Fraunces, serif", fontSize: "1.3rem", margin: "0 0 4px" }}>Housekeeping</h2>
      <div style={{ fontSize: "0.8rem", color: TOKENS.inkSoft, marginBottom: 12 }}>
        Daily service {doneToday}/{totalOccupied} done
        {username ? ` · logging as ${username}` : ""}
      </div>

      {/* View tabs */}
      <div className="hk-chips" role="tablist" style={{ marginBottom: 10 }}>
        {tabs.map((t) => {
          const act = view === t.key;
          return (
            <button
              key={t.key}
              role="tab"
              aria-selected={act}
              className="gx-btn"
              onClick={() => setView(t.key)}
              style={{ ...ghostBtn, flex: "1 0 auto", minHeight: 48, padding: "0.5rem 0.9rem", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7, whiteSpace: "nowrap", background: act ? t.bg : "#fff", color: act ? t.color : TOKENS.inkSoft, borderColor: act ? t.color : TOKENS.paperDim, fontWeight: act ? 700 : 500, fontSize: "0.88rem" }}
            >
              <Ico name={t.icon} size={16} />
              {t.label}
              <span style={{ fontSize: "0.72rem", borderRadius: 999, padding: "1px 8px", background: act ? "#fff" : TOKENS.paper, color: act ? t.color : TOKENS.inkSoft, fontWeight: 700 }}>{t.n}</span>
            </button>
          );
        })}
      </div>

      {/* Search + floor filter */}
      <div style={{ ...cardStyle, padding: "0.6rem", marginBottom: 14 }}>
        <div style={{ position: "relative", marginBottom: 8 }}>
          <Ico name="search" size={15} color={TOKENS.inkSoft} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
          <input
            inputMode="numeric"
            placeholder="Search room number…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{ ...inputStyle, width: "100%", boxSizing: "border-box", minHeight: 44, paddingLeft: 34, paddingRight: q ? 36 : undefined, fontSize: "1rem" }}
          />
          {q && (
            <button className="gx-btn" onClick={() => setQ("")} aria-label="Clear search" style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", border: "none", background: "none", cursor: "pointer", display: "inline-flex", padding: 8, color: TOKENS.inkSoft }}>
              <Ico name="x" size={15} />
            </button>
          )}
        </div>
        <div className="hk-chips">
          {[{ key: "all", label: "All floors" }, ...floors.map((f) => ({ key: String(f), label: floorLabel(f) }))].map((f) => {
            const act = String(floor) === f.key;
            return (
              <button key={f.key} className="gx-btn" onClick={() => setFloor(f.key)} style={{ ...ghostBtn, minHeight: 40, whiteSpace: "nowrap", flexShrink: 0, background: act ? TOKENS.ink : "#fff", color: act ? TOKENS.paper : TOKENS.inkSoft, borderColor: act ? TOKENS.ink : TOKENS.paperDim, fontWeight: act ? 600 : 400 }}>
                {f.label}
              </button>
            );
          })}
        </div>
      </div>

      {view === "occupied" && (
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <div style={{ flex: 1, height: 8, background: TOKENS.paperDim, borderRadius: 999, overflow: "hidden" }} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
              <div style={{ width: `${pct}%`, height: "100%", background: TOKENS.clean, borderRadius: 999, transition: "width .5s ease" }} />
            </div>
            <div style={{ fontSize: "0.74rem", color: TOKENS.inkSoft, whiteSpace: "nowrap" }}>
              {doneToday}/{totalOccupied} cleaned · <strong style={{ color: TOKENS.ink }}>{pct}%</strong>
            </div>
          </div>
          {occDue.length === 0 && occDone.length === 0 ? (
            <EmptyState icon="bed" title="No occupied rooms here" text={needle || floor !== "all" ? "Nothing matches this floor / search." : "There are no occupied rooms right now."} />
          ) : (
            <>
              {occDue.length === 0 ? (
                <EmptyState icon="check" title="All done for today" text="Every occupied room has been serviced." />
              ) : (
                <div className="hk-grid">{occDue.map(renderOccupiedCard)}</div>
              )}
              {occDone.length > 0 && (
                <div style={{ marginTop: 20 }}>
                  {sectionLabel(`Cleaned today (${occDone.length})`, TOKENS.clean)}
                  <div className="hk-grid">{occDone.map(renderOccupiedCard)}</div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {view === "checkout" && (
        <div>
          {outPending.length === 0 && outFlashed.length === 0 ? (
            <EmptyState icon="sparkles" title="No turnover cleaning waiting" text="All vacant rooms are clean." />
          ) : (
            <div className="hk-grid">
              {outPending.map((r) => renderCheckoutCard(r, false))}
              {outFlashed.map((r) => renderCheckoutCard(r, true))}
            </div>
          )}
        </div>
      )}

      {view === "maintenance" && (
        <div>
          {maintDue.length === 0 && maintFlashed.length === 0 && outOfOrder.length === 0 ? (
            <EmptyState icon="wrench" title="No maintenance needed" text="No room is due for a check and none is out of order." />
          ) : (
            <>
              {(maintDue.length > 0 || maintFlashed.length > 0) && (
                <>
                  {sectionLabel("Due for a maintenance check", TOKENS.oos)}
                  <div className="hk-grid" style={{ marginBottom: 20 }}>
                    {maintDue.map((r) => renderMaintCard(r, false))}
                    {maintFlashed.map((r) => renderMaintCard(r, true))}
                  </div>
                </>
              )}
              {outOfOrder.length > 0 && (
                <>
                  {sectionLabel(`Out of order (${outOfOrder.length})`, TOKENS.brassDark)}
                  <div className="hk-grid">
                    {outOfOrder.map((r) => (
                      <div key={r.number} className="hk-card" style={cardBase(false, TOKENS.brassDark)}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                          <div style={roomNumberStyle}>{r.number}</div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <SoftBadge color={TOKENS.oos} bg={TOKENS.oosBg} icon="ban">
                              Out of order
                            </SoftBadge>
                            {typeChip(r)}
                          </div>
                        </div>
                        <div style={infoLine}>Open the room in the Rooms tab to put it back in service.</div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function AnalyticsDashboard({ rooms, bookings, maintenanceLog, onLogout, roomRates, mealPlanRates, tickets, accessToken, hotelId, onDeleteTicket, guestName, onDeleteBooking }) {
  const [rangeStart, setRangeStart] = useState(startOfMonthISO());
  const [rangeEnd, setRangeEnd] = useState(todayISO());
  const rangeEndExclusive = addDaysISO(rangeEnd, 1);

  const roomNumberById = useMemo(() => {
    const map = {};
    (rooms || []).forEach((r) => {
      map[r.id] = r.number;
    });
    return map;
  }, [rooms]);

  // Analytics fetches its own bounded slice of bookings instead of relying on
  // the app-wide `bookings` array, which keeps growing for as long as the
  // hotel operates — just the ones overlapping the selected revenue range.
  // In local/demo mode (no hotelId) it falls back to filtering the in-memory
  // array, since there's no Supabase table to query against.
  const [rangeBookings, setRangeBookings] = useState([]);
  const [loadingRange, setLoadingRange] = useState(true);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    if (!hotelId) {
      setRangeBookings((bookings || []).filter((b) => b.checkIn < rangeEndExclusive && b.checkOut > rangeStart));
      setLoadingRange(false);
      return;
    }
    let cancelled = false;
    setLoadingRange(true);
    fetchBookingsOverlappingRange({ accessToken, hotelId, rangeStart, rangeEndExclusive, roomNumberById })
      .then((rows) => {
        if (!cancelled) setRangeBookings(rows);
      })
      .catch(() => {
        if (!cancelled) setLoadError("Couldn't load bookings for this range — check your connection and try again.");
      })
      .finally(() => {
        if (!cancelled) setLoadingRange(false);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, hotelId, bookings, rangeStart, rangeEndExclusive, roomNumberById]);

  // Index once by room number (O(bookings)) instead of re-filtering the full
  // array once per room (O(rooms × bookings)) — the loop that was freezing
  // mobile browsers once the hotel had enough history.
  const bookingsByRoom = useMemo(() => {
    const map = new Map();
    rangeBookings.forEach((b) => {
      if (b.status === "cancelled") return;
      if (!map.has(b.roomNumber)) map.set(b.roomNumber, []);
      map.get(b.roomNumber).push(b);
    });
    return map;
  }, [rangeBookings]);

  const perRoom = useMemo(() => {
    return rooms.map((room) => {
      const roomBookings = bookingsByRoom.get(room.number) || [];
      const reservations = roomBookings.filter((b) => b.checkIn >= rangeStart && b.checkIn < rangeEndExclusive).length;
      const stayedBookings = roomBookings.filter((b) => b.status === "checked_in" || b.status === "checked_out");
      const nights = stayedBookings.reduce(
        (sum, b) => sum + overlapNights(rangeStart, rangeEndExclusive, b.checkIn, b.checkOut),
        0
      );
      const maintenance = maintenanceLog.filter(
        (m) => m.roomNumber === room.number && m.date >= rangeStart && m.date < rangeEndExclusive
      ).length;
      const perPersonRate = getRoomRate(room, roomRates);
      const revenue = stayedBookings.reduce((sum, b) => {
        const bNights = overlapNights(rangeStart, rangeEndExclusive, b.checkIn, b.checkOut);
        const totalNights = Math.max(1, Math.round((new Date(b.checkOut) - new Date(b.checkIn)) / 86400000));
        const discountFactor = 1 - (Number(b.discountPercent) || 0) / 100;
        let perNightAmount;
        if (Number(b.totalAmount) > 0) {
          perNightAmount = (Number(b.totalAmount) / totalNights) * discountFactor;
        } else {
          const persons = b.persons || 1;
          perNightAmount = persons * (perPersonRate + mealPlanSurcharge(b.mealPlans, mealPlanRates)) * discountFactor;
        }
        return sum + bNights * perNightAmount;
      }, 0);
      return { room, reservations, nights, maintenance, revenue };
    });
  }, [rooms, bookingsByRoom, maintenanceLog, rangeStart, rangeEndExclusive, roomRates, mealPlanRates]);

  const totals = perRoom.reduce(
    (acc, r) => ({
      reservations: acc.reservations + r.reservations,
      nights: acc.nights + r.nights,
      maintenance: acc.maintenance + r.maintenance,
      revenue: acc.revenue + r.revenue,
    }),
    { reservations: 0, nights: 0, maintenance: 0, revenue: 0 }
  );

  // Ticket totals for the selected range are fetched as a small aggregate
  // query rather than filtered from a fully-downloaded tickets table — the
  // `tickets` prop is intentionally just a bounded recent slice (see
  // INITIAL_TICKETS_LIMIT), so filtering it client-side would silently
  // under-report revenue for any range older than that slice. In local/demo
  // mode (no hotelId) we fall back to filtering the in-memory array.
  const [ticketTotals, setTicketTotals] = useState({ count: 0, persons: 0, revenue: 0 });
  useEffect(() => {
    if (!hotelId) {
      const inRange = (tickets || []).filter((t) => t.date >= rangeStart && t.date < rangeEndExclusive);
      setTicketTotals(
        inRange.reduce(
          (acc, t) => ({ count: acc.count + 1, persons: acc.persons + t.persons, revenue: acc.revenue + t.amountPaid }),
          { count: 0, persons: 0, revenue: 0 }
        )
      );
      return;
    }
    let cancelled = false;
    fetchTicketsRangeTotals({ accessToken, hotelId, rangeStart, rangeEndExclusive })
      .then((result) => {
        if (!cancelled) setTicketTotals(result);
      })
      .catch(() => {
        // Leave the previous totals in place rather than flashing to zero on a transient error.
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, hotelId, tickets, rangeStart, rangeEndExclusive]);
  const grandRevenue = totals.revenue + ticketTotals.revenue;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: 8 }}>
        <h2 style={{ fontFamily: "Fraunces, serif", fontSize: "1.3rem", margin: 0 }}>Analytics</h2>
        {onLogout && (
          <button onClick={onLogout} style={ghostBtn}>
            Sign out
          </button>
        )}
      </div>

      <div style={{ textAlign: "center", padding: "2rem 1rem", marginBottom: "1.5rem" }}>
        <div
          style={{
            fontFamily: "Inter, sans-serif",
            fontWeight: 700,
            fontSize: "clamp(1.6rem, 4vw, 2.6rem)",
            letterSpacing: "-0.02em",
            color: TOKENS.ink,
          }}
        >
          Welcome to the analysis page
        </div>
      </div>

      {loadError && (
        <div style={{ color: TOKENS.oos, fontSize: "0.85rem", marginBottom: "0.75rem" }}>{loadError}</div>
      )}

      {loadingRange && rangeBookings.length === 0 ? (
        // Header + title above have already painted by the time this shows —
        // the range fetch and the O(bookings) computation below run after
        // that first paint, not before it, so the tap never looks frozen.
        <div style={{ color: TOKENS.inkSoft, fontSize: "0.9rem", padding: "2rem 0", textAlign: "center" }}>Loading analytics…</div>
      ) : (
      <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "0.75rem", marginBottom: "1.5rem" }}>
        {[
          { label: "Reservations", value: totals.reservations },
          { label: "Nights occupied", value: totals.nights },
          { label: "Maintenance checks", value: totals.maintenance },
          { label: "Room revenue", value: fmtMoney(totals.revenue) },
          { label: "Tickets sold", value: ticketTotals.count },
          { label: "Ticket persons", value: ticketTotals.persons },
          { label: "Ticket revenue", value: fmtMoney(ticketTotals.revenue) },
          { label: "Total revenue", value: fmtMoney(grandRevenue) },
        ].map((c) => (
          <div key={c.label} style={{ background: "#fff", border: `1px solid ${TOKENS.paperDim}`, borderRadius: 10, padding: "0.9rem" }}>
            <div style={{ fontSize: "1.3rem", fontWeight: 600, fontFamily: "Fraunces, serif" }}>{c.value}</div>
            <div style={{ fontSize: "0.72rem", color: TOKENS.inkSoft }}>{c.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "flex-end", marginBottom: "1.5rem", flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: "0.7rem", color: TOKENS.inkSoft, marginBottom: 4 }}>From</div>
          <input type="date" value={rangeStart} onChange={(e) => setRangeStart(e.target.value)} style={inputStyle} />
        </div>
        <div>
          <div style={{ fontSize: "0.7rem", color: TOKENS.inkSoft, marginBottom: 4 }}>To</div>
          <input type="date" value={rangeEnd} onChange={(e) => setRangeEnd(e.target.value)} style={inputStyle} />
        </div>
      </div>
      </>
      )}
    </div>
  );
}

// Landing screen for the manager/analyst console. Deliberately fetches
// nothing — each tab loads its own data only once the user picks it, so
// opening the console never triggers every heavy query at once.
function TabHomeScreen({ tabs, onSelect }) {
  return (
    <div
      style={{
        minHeight: "60vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "2rem 1rem",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: "1rem",
          maxWidth: 640,
          width: "100%",
        }}
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => onSelect(t.id)}
            style={{
              background: "#fff",
              border: `1px solid ${TOKENS.paperDim}`,
              borderRadius: 12,
              padding: "1.5rem 1rem",
              fontFamily: "Fraunces, serif",
              fontSize: "1.05rem",
              fontWeight: 600,
              color: TOKENS.ink,
              cursor: "pointer",
              textAlign: "center",
              boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function RoomActivityTab({ rooms, bookings, maintenanceLog, roomRates, mealPlanRates }) {
  const [rangeStart, setRangeStart] = useState(startOfMonthISO());
  const [rangeEnd, setRangeEnd] = useState(todayISO());
  const [roomFilter, setRoomFilter] = useState("active");
  const [bookingTypeFilter, setBookingTypeFilter] = useState("all");

  const rangeEndExclusive = addDaysISO(rangeEnd, 1);

  const typeBookings = useMemo(() => {
    if (bookingTypeFilter === "all") return bookings;
    return bookings.filter((b) => (b.bookingType || "booking") === bookingTypeFilter);
  }, [bookings, bookingTypeFilter]);

  const perRoom = useMemo(() => {
    return rooms.map((room) => {
      const roomBookings = typeBookings.filter((b) => b.roomNumber === room.number && b.status !== "cancelled");
      const reservations = roomBookings.filter((b) => b.checkIn >= rangeStart && b.checkIn < rangeEndExclusive).length;
      const checkouts = roomBookings.filter((b) => b.checkOut >= rangeStart && b.checkOut < rangeEndExclusive).length;
      const stayedBookings = roomBookings.filter((b) => b.status === "checked_in" || b.status === "checked_out");
      const nights = stayedBookings.reduce(
        (sum, b) => sum + overlapNights(rangeStart, rangeEndExclusive, b.checkIn, b.checkOut),
        0
      );
      const maintenance = maintenanceLog.filter(
        (m) => m.roomNumber === room.number && m.date >= rangeStart && m.date < rangeEndExclusive
      ).length;
      const perPersonRate = getRoomRate(room, roomRates);
      const revenue = stayedBookings.reduce((sum, b) => {
        const bNights = overlapNights(rangeStart, rangeEndExclusive, b.checkIn, b.checkOut);
        const totalNights = Math.max(1, Math.round((new Date(b.checkOut) - new Date(b.checkIn)) / 86400000));
        const discountFactor = 1 - (Number(b.discountPercent) || 0) / 100;
        let perNightAmount;
        if (Number(b.totalAmount) > 0) {
          perNightAmount = (Number(b.totalAmount) / totalNights) * discountFactor;
        } else {
          const persons = b.persons || 1;
          perNightAmount = persons * (perPersonRate + mealPlanSurcharge(b.mealPlans, mealPlanRates)) * discountFactor;
        }
        return sum + bNights * perNightAmount;
      }, 0);
      return { room, reservations, checkouts, nights, maintenance, revenue };
    });
  }, [rooms, typeBookings, maintenanceLog, rangeStart, rangeEndExclusive, roomRates, mealPlanRates]);

  const filteredPerRoom = useMemo(() => {
    switch (roomFilter) {
      case "reservations":
      case "checkins":
        return perRoom.filter((r) => r.reservations > 0);
      case "checkouts":
        return perRoom.filter((r) => r.checkouts > 0);
      case "occupied":
        return perRoom.filter((r) => r.nights > 0);
      case "maintenance":
        return perRoom.filter((r) => r.maintenance > 0);
      case "revenue":
        return perRoom.filter((r) => r.revenue > 0);
      case "all":
        return perRoom;
      case "active":
      default:
        return perRoom.filter((r) => r.reservations > 0 || r.checkouts > 0 || r.nights > 0 || r.maintenance > 0 || r.revenue > 0);
    }
  }, [perRoom, roomFilter]);

  return (
    <div>
      <h2 style={{ fontFamily: "Fraunces, serif", fontSize: "1.3rem", marginBottom: "1rem" }}>Room activity</h2>

      <div style={{ display: "flex", gap: 8, alignItems: "flex-end", marginBottom: "1.5rem", flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: "0.7rem", color: TOKENS.inkSoft, marginBottom: 4 }}>From</div>
          <input type="date" value={rangeStart} onChange={(e) => setRangeStart(e.target.value)} style={inputStyle} />
        </div>
        <div>
          <div style={{ fontSize: "0.7rem", color: TOKENS.inkSoft, marginBottom: 4 }}>To</div>
          <input type="date" value={rangeEnd} onChange={(e) => setRangeEnd(e.target.value)} style={inputStyle} />
        </div>
      </div>

      <div style={{ display: "flex", gap: "1rem", marginBottom: "1.5rem", flexWrap: "wrap" }}>
        <div style={{ maxWidth: 260, flex: "1 1 200px" }}>
          <div style={{ fontSize: "0.7rem", color: TOKENS.inkSoft, marginBottom: 4 }}>Show rooms</div>
          <select value={roomFilter} onChange={(e) => setRoomFilter(e.target.value)} style={{ ...inputStyle, width: "100%" }}>
            {ROOM_FILTERS.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}
              </option>
            ))}
          </select>
        </div>
        <div style={{ maxWidth: 260, flex: "1 1 200px" }}>
          <div style={{ fontSize: "0.7rem", color: TOKENS.inkSoft, marginBottom: 4 }}>Booking source</div>
          <select value={bookingTypeFilter} onChange={(e) => setBookingTypeFilter(e.target.value)} style={{ ...inputStyle, width: "100%" }}>
            {BOOKING_TYPE_FILTERS.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${TOKENS.paperDim}`, textAlign: "left" }}>
              <th style={{ padding: "0.5rem 0.4rem", color: TOKENS.inkSoft, fontWeight: 500 }}>Room</th>
              <th style={{ padding: "0.5rem 0.4rem", color: TOKENS.inkSoft, fontWeight: 500 }}>Type</th>
              <th style={{ padding: "0.5rem 0.4rem", color: TOKENS.inkSoft, fontWeight: 500 }}>Reservations</th>
              <th style={{ padding: "0.5rem 0.4rem", color: TOKENS.inkSoft, fontWeight: 500 }}>Check-outs</th>
              <th style={{ padding: "0.5rem 0.4rem", color: TOKENS.inkSoft, fontWeight: 500 }}>Nights occupied</th>
              <th style={{ padding: "0.5rem 0.4rem", color: TOKENS.inkSoft, fontWeight: 500 }}>Maintenance</th>
              <th style={{ padding: "0.5rem 0.4rem", color: TOKENS.inkSoft, fontWeight: 500 }}>Revenue</th>
            </tr>
          </thead>
          <tbody>
            {filteredPerRoom.map((r) => (
              <tr key={r.room.number} style={{ borderBottom: `1px solid ${TOKENS.paperDim}` }}>
                <td style={{ padding: "0.5rem 0.4rem", fontWeight: 600 }}>{r.room.number}</td>
                <td style={{ padding: "0.5rem 0.4rem", color: TOKENS.inkSoft }}>{r.room.type}</td>
                <td style={{ padding: "0.5rem 0.4rem" }}>{r.reservations}</td>
                <td style={{ padding: "0.5rem 0.4rem" }}>{r.checkouts}</td>
                <td style={{ padding: "0.5rem 0.4rem" }}>{r.nights}</td>
                <td style={{ padding: "0.5rem 0.4rem" }}>{r.maintenance}</td>
                <td style={{ padding: "0.5rem 0.4rem" }}>{fmtMoney(r.revenue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredPerRoom.length === 0 && (
          <div style={{ color: TOKENS.inkSoft, fontSize: "0.85rem", padding: "0.75rem 0.4rem" }}>
            No rooms match this filter for the selected period.
          </div>
        )}
      </div>
    </div>
  );
}

function ReservationRecordsTab({ bookings, guestName, onDeleteBooking }) {
  const [rangeStart, setRangeStart] = useState(startOfMonthISO());
  const [rangeEnd, setRangeEnd] = useState(todayISO());
  const rangeEndExclusive = addDaysISO(rangeEnd, 1);

  const reservationsInRange = useMemo(
    () =>
      bookings
        .filter((b) => b.checkIn >= rangeStart && b.checkIn < rangeEndExclusive)
        .sort((a, b) => b.checkIn.localeCompare(a.checkIn)),
    [bookings, rangeStart, rangeEndExclusive]
  );

  return (
    <div>
      <h2 style={{ fontFamily: "Fraunces, serif", fontSize: "1.3rem", marginBottom: "1rem" }}>Reservation records</h2>

      <div style={{ display: "flex", gap: 8, alignItems: "flex-end", marginBottom: "1.5rem", flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: "0.7rem", color: TOKENS.inkSoft, marginBottom: 4 }}>From</div>
          <input type="date" value={rangeStart} onChange={(e) => setRangeStart(e.target.value)} style={inputStyle} />
        </div>
        <div>
          <div style={{ fontSize: "0.7rem", color: TOKENS.inkSoft, marginBottom: 4 }}>To</div>
          <input type="date" value={rangeEnd} onChange={(e) => setRangeEnd(e.target.value)} style={inputStyle} />
        </div>
      </div>

      <div style={{ fontSize: "0.75rem", color: TOKENS.brassDark, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8, fontWeight: 600 }}>
        Reservation records in range
      </div>
      {reservationsInRange.length === 0 ? (
        <div style={{ color: TOKENS.inkSoft, fontSize: "0.9rem" }}>No reservations starting in this range.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {reservationsInRange.map((b) => (
            <div key={b.id} style={{ ...cardStyle, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <div>
                <div style={{ fontWeight: 600 }}>
                  {roomLabel(b.roomNumber)} · {guestName(b.guestId)}
                </div>
                <div style={{ fontSize: "0.78rem", color: TOKENS.inkSoft }}>
                  {fmtDate(b.checkIn)} → {fmtDate(b.checkOut)} ·{" "}
                  {b.status === "checked_in" ? "In house" : b.status === "checked_out" ? "Checked out" : b.status === "cancelled" ? "Cancelled" : "Reserved"}
                  {b.discountPercent > 0 ? ` · ${b.discountPercent}% discount` : ""}
                </div>
                <div style={{ fontSize: "0.72rem", color: TOKENS.brassDark, marginTop: 2 }}>
                  Added by {b.createdBy || "unknown"}
                </div>
              </div>
              {onDeleteBooking && (
                <button onClick={() => onDeleteBooking(b.id)} style={ghostBtn}>
                  Delete
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TicketRecordsTab({ accessToken, hotelId, localTickets, onDeleteTicket }) {
  // Local/demo mode has no Supabase table to page against — it's an in-memory
  // array anyway, so keep the old client-side filtering behavior for it.
  if (!hotelId) {
    return <LocalTicketRecordsTab tickets={localTickets} onDeleteTicket={onDeleteTicket} />;
  }
  return <RemoteTicketRecordsTab accessToken={accessToken} hotelId={hotelId} onDeleteTicket={onDeleteTicket} />;
}

function LocalTicketRecordsTab({ tickets, onDeleteTicket }) {
  const [rangeStart, setRangeStart] = useState(todayISO());
  const [rangeEnd, setRangeEnd] = useState(todayISO());
  const rangeEndExclusive = addDaysISO(rangeEnd, 1);

  const ticketsInRange = useMemo(
    () =>
      (tickets || [])
        .filter((t) => t.date >= rangeStart && t.date < rangeEndExclusive)
        .sort((a, b) => b.date.localeCompare(a.date)),
    [tickets, rangeStart, rangeEndExclusive]
  );
  const totals = ticketsInRange.reduce(
    (acc, t) => ({ count: acc.count + 1, persons: acc.persons + t.persons, revenue: acc.revenue + t.amountPaid }),
    { count: 0, persons: 0, revenue: 0 }
  );

  return (
    <div>
      <h2 style={{ fontFamily: "Fraunces, serif", fontSize: "1.3rem", marginBottom: "1rem" }}>Ticket records</h2>

      <div style={{ display: "flex", gap: 8, alignItems: "flex-end", marginBottom: "1.5rem", flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: "0.7rem", color: TOKENS.inkSoft, marginBottom: 4 }}>From</div>
          <input type="date" value={rangeStart} onChange={(e) => setRangeStart(e.target.value)} style={inputStyle} />
        </div>
        <div>
          <div style={{ fontSize: "0.7rem", color: TOKENS.inkSoft, marginBottom: 4 }}>To</div>
          <input type="date" value={rangeEnd} onChange={(e) => setRangeEnd(e.target.value)} style={inputStyle} />
        </div>
        <button
          onClick={() => {
            setRangeStart(todayISO());
            setRangeEnd(todayISO());
          }}
          style={ghostBtn}
        >
          Today
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "0.75rem", marginBottom: "1.5rem" }}>
        {[
          { label: "Tickets sold", value: totals.count },
          { label: "Persons", value: totals.persons },
          { label: "Revenue", value: fmtMoney(totals.revenue) },
        ].map((c) => (
          <div key={c.label} style={{ background: "#fff", border: `1px solid ${TOKENS.paperDim}`, borderRadius: 10, padding: "0.9rem" }}>
            <div style={{ fontSize: "1.3rem", fontWeight: 600, fontFamily: "Fraunces, serif" }}>{c.value}</div>
            <div style={{ fontSize: "0.72rem", color: TOKENS.inkSoft }}>{c.label}</div>
          </div>
        ))}
      </div>

      <div style={{ fontSize: "0.75rem", color: TOKENS.brassDark, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8, fontWeight: 600 }}>
        Ticket records in range
      </div>
      {ticketsInRange.length === 0 ? (
        <div style={{ color: TOKENS.inkSoft, fontSize: "0.9rem" }}>No tickets logged in this range.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {ticketsInRange.map((t) => (
            <div key={t.id} style={{ ...cardStyle, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <div>
                <div style={{ fontWeight: 600 }}>
                  {t.persons} {t.persons === 1 ? "person" : "persons"} · {fmtMoney(t.amountPaid)}
                </div>
                <div style={{ fontSize: "0.78rem", color: TOKENS.inkSoft }}>
                  {fmtDate(t.date)}
                  {t.notes ? ` · ${t.notes}` : ""}
                </div>
                <div style={{ fontSize: "0.72rem", color: TOKENS.brassDark, marginTop: 2 }}>
                  Added by {t.createdBy || "unknown"}
                </div>
              </div>
              {onDeleteTicket && (
                <button onClick={() => onDeleteTicket(t.id)} style={ghostBtn}>
                  Delete
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RemoteTicketRecordsTab({ accessToken, hotelId, onDeleteTicket }) {
  const [rangeStart, setRangeStart] = useState(todayISO());
  const [rangeEnd, setRangeEnd] = useState(todayISO());
  const [page, setPage] = useState(0);
  const [pageRows, setPageRows] = useState([]);
  const [pageTotal, setPageTotal] = useState(0);
  const [totals, setTotals] = useState({ count: 0, persons: 0, revenue: 0 });
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const rangeEndExclusive = addDaysISO(rangeEnd, 1);

  // Reset to page 0 whenever the date range changes — a page number from the
  // previous range rarely makes sense for the new one.
  useEffect(() => {
    setPage(0);
  }, [rangeStart, rangeEnd]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError("");
    Promise.all([
      fetchTicketsPage({ accessToken, hotelId, rangeStart, rangeEndExclusive, page }),
      fetchTicketsRangeTotals({ accessToken, hotelId, rangeStart, rangeEndExclusive }),
    ])
      .then(([pageResult, totalsResult]) => {
        if (cancelled) return;
        setPageRows(pageResult.rows);
        setPageTotal(pageResult.total);
        setTotals(totalsResult);
      })
      .catch((e) => {
        if (!cancelled) setLoadError("Couldn't load tickets for this range — check your connection and try again.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, hotelId, rangeStart, rangeEndExclusive, page]);

  const pageCount = Math.max(1, Math.ceil(pageTotal / TICKETS_PAGE_SIZE));

  const handleDelete = (id) => {
    onDeleteTicket && onDeleteTicket(id);
    // Optimistically drop it from the current page so the list feels responsive;
    // the next range/page change will re-fetch the authoritative data anyway.
    setPageRows((rows) => rows.filter((t) => t.id !== id));
  };

  return (
    <div>
      <h2 style={{ fontFamily: "Fraunces, serif", fontSize: "1.3rem", marginBottom: "1rem" }}>Ticket records</h2>

      <div style={{ display: "flex", gap: 8, alignItems: "flex-end", marginBottom: "1.5rem", flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: "0.7rem", color: TOKENS.inkSoft, marginBottom: 4 }}>From</div>
          <input type="date" value={rangeStart} onChange={(e) => setRangeStart(e.target.value)} style={inputStyle} />
        </div>
        <div>
          <div style={{ fontSize: "0.7rem", color: TOKENS.inkSoft, marginBottom: 4 }}>To</div>
          <input type="date" value={rangeEnd} onChange={(e) => setRangeEnd(e.target.value)} style={inputStyle} />
        </div>
        <button
          onClick={() => {
            setRangeStart(todayISO());
            setRangeEnd(todayISO());
          }}
          style={ghostBtn}
        >
          Today
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "0.75rem", marginBottom: "1.5rem" }}>
        {[
          { label: "Tickets sold", value: totals.count },
          { label: "Persons", value: totals.persons },
          { label: "Revenue", value: fmtMoney(totals.revenue) },
        ].map((c) => (
          <div key={c.label} style={{ background: "#fff", border: `1px solid ${TOKENS.paperDim}`, borderRadius: 10, padding: "0.9rem" }}>
            <div style={{ fontSize: "1.3rem", fontWeight: 600, fontFamily: "Fraunces, serif" }}>{c.value}</div>
            <div style={{ fontSize: "0.72rem", color: TOKENS.inkSoft }}>{c.label}</div>
          </div>
        ))}
      </div>

      <div style={{ fontSize: "0.75rem", color: TOKENS.brassDark, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8, fontWeight: 600 }}>
        Ticket records in range
      </div>
      {loadError && <div style={{ color: TOKENS.oos, fontSize: "0.85rem", marginBottom: 8 }}>{loadError}</div>}
      {loading ? (
        <div style={{ color: TOKENS.inkSoft, fontSize: "0.9rem" }}>Loading…</div>
      ) : pageRows.length === 0 ? (
        <div style={{ color: TOKENS.inkSoft, fontSize: "0.9rem" }}>No tickets logged in this range.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {pageRows.map((t) => (
            <div key={t.id} style={{ ...cardStyle, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <div>
                <div style={{ fontWeight: 600 }}>
                  {t.persons} {t.persons === 1 ? "person" : "persons"} · {fmtMoney(t.amountPaid)}
                </div>
                <div style={{ fontSize: "0.78rem", color: TOKENS.inkSoft }}>
                  {fmtDate(t.date)}
                  {t.notes ? ` · ${t.notes}` : ""}
                </div>
                <div style={{ fontSize: "0.72rem", color: TOKENS.brassDark, marginTop: 2 }}>
                  Added by {t.createdBy || "unknown"}
                </div>
              </div>
              {onDeleteTicket && (
                <button onClick={() => handleDelete(t.id)} style={ghostBtn}>
                  Delete
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {pageTotal > TICKETS_PAGE_SIZE && (
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12 }}>
          <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0 || loading} style={ghostBtn}>
            ← Previous
          </button>
          <div style={{ fontSize: "0.8rem", color: TOKENS.inkSoft }}>
            Page {page + 1} of {pageCount} · {pageTotal} tickets in range
          </div>
          <button onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))} disabled={page >= pageCount - 1 || loading} style={ghostBtn}>
            Next →
          </button>
        </div>
      )}
    </div>
  );
}

function isoDateRange(startIso, endIsoInclusive) {
  const out = [];
  let d = startIso;
  let guard = 0;
  while (d <= endIsoInclusive && guard < 400) {
    out.push(d);
    d = addDaysISO(d, 1);
    guard += 1;
  }
  return out;
}

const CHART_METRICS = [
  { key: "checkins", label: "Check-ins" },
  { key: "checkouts", label: "Check-outs" },
  { key: "occupied", label: "Occupied rooms" },
  { key: "revenue", label: "Revenue" },
];

function SimpleChart({ series, type }) {
  const width = 640;
  const height = 260;
  const padding = { top: 16, right: 16, bottom: 36, left: 48 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;
  const maxVal = Math.max(1, ...series.map((p) => p.value));
  const stepX = series.length > 1 ? innerW / (series.length - 1) : innerW;
  const barW = series.length > 0 ? Math.min(36, (innerW / series.length) * 0.6) : 10;

  const xFor = (i) => padding.left + (series.length > 1 ? i * stepX : innerW / 2);
  const yFor = (v) => padding.top + innerH - (v / maxVal) * innerH;

  const linePoints = series.map((p, i) => `${xFor(i)},${yFor(p.value)}`).join(" ");

  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", maxWidth: 640, height: "auto" }}>
      {[0, 0.25, 0.5, 0.75, 1].map((f) => (
        <line
          key={f}
          x1={padding.left}
          x2={width - padding.right}
          y1={padding.top + innerH * (1 - f)}
          y2={padding.top + innerH * (1 - f)}
          stroke={TOKENS.paperDim}
          strokeWidth="1"
        />
      ))}
      {[0, 0.25, 0.5, 0.75, 1].map((f) => (
        <text key={f} x={padding.left - 8} y={padding.top + innerH * (1 - f) + 4} textAnchor="end" fontSize="10" fill={TOKENS.inkSoft}>
          {Math.round(maxVal * f)}
        </text>
      ))}
      {type === "bar" &&
        series.map((p, i) => (
          <rect
            key={p.label}
            x={xFor(i) - barW / 2}
            y={yFor(p.value)}
            width={barW}
            height={padding.top + innerH - yFor(p.value)}
            fill={TOKENS.brassDark}
            rx="3"
          />
        ))}
      {type === "line" && (
        <>
          <polyline points={linePoints} fill="none" stroke={TOKENS.brassDark} strokeWidth="2" />
          {series.map((p, i) => (
            <circle key={p.label} cx={xFor(i)} cy={yFor(p.value)} r="3" fill={TOKENS.brassDark} />
          ))}
        </>
      )}
      {series.map((p, i) =>
        i % Math.max(1, Math.ceil(series.length / 10)) === 0 ? (
          <text key={p.label} x={xFor(i)} y={height - padding.bottom + 16} textAnchor="middle" fontSize="9" fill={TOKENS.inkSoft}>
            {p.label.slice(5)}
          </text>
        ) : null
      )}
    </svg>
  );
}

// ───────────────────────── Today report (daily shift dashboard) ─────────────────────────

const TODAY_CSS = `
.td-kpis { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 8px; }
@media (max-width: 1023px) { .td-kpis { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
@media (max-width: 639px) { .td-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); } .td-kpis > :last-child { grid-column: 1 / -1; } }
.td-kpi { border: 1px solid rgba(255,255,255,.9); background: rgba(255,255,255,.65); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); border-radius: 14px; padding: .7rem .8rem; display: flex; align-items: center; gap: 10px; box-shadow: 0 2px 10px rgba(27,36,48,.05); }
.td-meals { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
@media (max-width: 899px) { .td-meals { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 379px) { .td-meals { grid-template-columns: minmax(0, 1fr); } }
.td-move { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
.td-full { width: 100%; box-sizing: border-box; }
@media (max-width: 639px) { .td-datebar input, .td-range input { flex: 1; width: 100%; } }
`;

const MEAL_COVERAGE = {
  breakfast: ["B.B", "HB", "FB", "All-inclusive"],
  lunch: ["FB", "All-inclusive"],
  dinner: ["HB", "FB", "All-inclusive"],
};
const ROOM_STATUS_SHORT = { vacant_clean: "Clean", vacant_dirty: "Dirty", occupied: "Occupied", out_of_order: "Out of order" };
const TREND_COLORS = { checkins: "#4A7C59", checkouts: "#D98B3A", occupied: "#3B6FA0", revenue: "#B08968" };

function niceCeil(v) {
  if (v <= 4) return 4;
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return step * pow;
}
function compactNum(v) {
  if (Math.abs(v) >= 1000000) return `${Math.round(v / 100000) / 10}M`;
  if (Math.abs(v) >= 1000) return `${Math.round(v / 100) / 10}k`;
  return String(Math.round(v * 10) / 10);
}

function TrendChart({ series, type, color, isMoney }) {
  const ref = useRef(null);
  const [w, setW] = useState(600);
  const [active, setActive] = useState(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const measure = () => setW(Math.max(260, el.clientWidth));
    measure();
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(measure);
      ro.observe(el);
      return () => ro.disconnect();
    }
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const h = 240;
  const pad = { top: 14, right: 12, bottom: 28, left: isMoney ? 46 : 32 };
  const innerW = w - pad.left - pad.right;
  const innerH = h - pad.top - pad.bottom;
  const n = series.length;
  const maxVal = niceCeil(Math.max(1, ...series.map((p) => p.value)));
  const slot = n > 0 ? innerW / n : innerW;
  const xBar = (i) => pad.left + slot * i + slot / 2;
  const xLine = (i) => pad.left + (n > 1 ? (innerW * i) / (n - 1) : innerW / 2);
  const xFor = type === "bar" ? xBar : xLine;
  const yFor = (v) => pad.top + innerH - (v / maxVal) * innerH;
  const ticks = [0, 1, 2, 3, 4].map((t) => (maxVal * t) / 4);
  const labelEvery = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(innerW / 56))));
  const barW = Math.max(3, Math.min(30, slot * 0.62));

  const pickIndex = (e) => {
    const rect = ref.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    let i;
    if (type === "bar") i = Math.floor((x - pad.left) / slot);
    else i = n > 1 ? Math.round(((x - pad.left) / innerW) * (n - 1)) : 0;
    setActive(Math.max(0, Math.min(n - 1, i)));
  };

  const fmtVal = (v) => (isMoney ? fmtMoney(v) : String(v));
  const linePath = series.map((p, i) => `${i === 0 ? "M" : "L"}${xLine(i)},${yFor(p.value)}`).join(" ");
  const areaPath = n > 0 ? `${linePath} L${xLine(n - 1)},${yFor(0)} L${xLine(0)},${yFor(0)} Z` : "";
  const gid = `tg${color.replace("#", "")}`;
  const act = active !== null && series[active] ? series[active] : null;
  const tipLeft = act ? Math.max(60, Math.min(w - 60, xFor(active))) : 0;

  if (n === 0) return <div style={{ color: TOKENS.inkSoft, fontSize: "0.85rem", padding: "1.5rem 0", textAlign: "center" }}>Pick a valid date range.</div>;

  return (
    <div ref={ref} style={{ position: "relative", width: "100%" }}>
      <svg
        width={w}
        height={h}
        style={{ display: "block", touchAction: "pan-y", cursor: "crosshair" }}
        onPointerMove={pickIndex}
        onPointerDown={pickIndex}
        onPointerLeave={(e) => e.pointerType === "mouse" && setActive(null)}
        role="img"
        aria-label="Trend chart"
      >
        <defs>
          <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.35" />
            <stop offset="100%" stopColor={color} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.left} x2={w - pad.right} y1={yFor(t)} y2={yFor(t)} stroke={TOKENS.paperDim} strokeDasharray={t === 0 ? undefined : "3 4"} />
            <text x={pad.left - 6} y={yFor(t) + 4} textAnchor="end" fontSize="10" fill={TOKENS.inkSoft}>
              {compactNum(t)}
            </text>
          </g>
        ))}
        {type === "bar" &&
          series.map((p, i) => (
            <rect key={p.label} x={xBar(i) - barW / 2} y={yFor(p.value)} width={barW} height={Math.max(0, yFor(0) - yFor(p.value))} rx={Math.min(5, barW / 2)} fill={color} opacity={active === null || active === i ? 1 : 0.45} />
          ))}
        {type !== "bar" && (
          <>
            {type === "area" && <path d={areaPath} fill={`url(#${gid})`} />}
            <path d={linePath} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
            {n <= 31 && series.map((p, i) => <circle key={p.label} cx={xLine(i)} cy={yFor(p.value)} r={active === i ? 5 : 2.8} fill="#fff" stroke={color} strokeWidth="2" />)}
          </>
        )}
        {act && <line x1={xFor(active)} x2={xFor(active)} y1={pad.top} y2={yFor(0)} stroke={color} strokeOpacity="0.35" strokeDasharray="3 3" />}
        {series.map((p, i) =>
          i % labelEvery === 0 ? (
            <text key={p.label} x={xFor(i)} y={h - 8} textAnchor="middle" fontSize="10" fill={TOKENS.inkSoft}>
              {fmtDate(p.label)}
            </text>
          ) : null
        )}
      </svg>
      {act && (
        <div style={{ position: "absolute", top: 0, left: tipLeft, transform: "translateX(-50%)", background: "rgba(27,36,48,.92)", color: TOKENS.paper, borderRadius: 8, padding: "4px 9px", fontSize: "0.72rem", pointerEvents: "none", whiteSpace: "nowrap", boxShadow: "0 4px 12px rgba(0,0,0,.2)" }}>
          <span style={{ opacity: 0.75 }}>{fmtDateY(act.label)}</span> · <strong>{fmtVal(act.value)}</strong>
        </div>
      )}
    </div>
  );
}

function MovementList({ kind, rows, loading, mobile, rooms, guestName, isToday, onCheckIn, onAskCheckOut }) {
  const roomStatusBadge = (b) => {
    const r = rooms.find((x) => x.number === b.roomNumber);
    if (!r) return <span style={{ color: TOKENS.inkSoft }}>—</span>;
    const m = STATUS_META[r.status];
    return (
      <SoftBadge small color={m.color} bg={m.bg}>
        {ROOM_STATUS_SHORT[r.status] || m.label}
      </SoftBadge>
    );
  };
  const mealBadge = (b) => {
    const plan = b.mealPlans && b.mealPlans[0];
    return (
      <SoftBadge small color="#2F5F8F" bg="#DCE9F5">
        {plan || "Room only"}
      </SoftBadge>
    );
  };
  const action = (b, stretch) => {
    const st = stretch ? { flex: 1, justifyContent: "center", padding: "0.55rem 0.5rem" } : {};
    const base = { display: "inline-flex", alignItems: "center", gap: 5, whiteSpace: "nowrap", fontSize: "0.78rem", ...st };
    if (b.status === "checked_out") return <SoftBadge small color={TOKENS.occupied} bg={TOKENS.occupiedBg}>Checked out</SoftBadge>;
    if (kind === "in") {
      if (b.status === "checked_in") return <SoftBadge small color={TOKENS.clean} bg={TOKENS.cleanBg}>Checked in</SoftBadge>;
      if (!b.roomNumber) return <SoftBadge small color={TOKENS.dirty} bg={TOKENS.dirtyBg}>No room yet</SoftBadge>;
      if (!isToday || !onCheckIn) return <SoftBadge small color={TOKENS.reserved} bg={TOKENS.reservedBg}>Reserved</SoftBadge>;
      return (
        <button className="gx-btn" onClick={() => onCheckIn(b.id)} style={{ ...primaryBtn, ...base, background: TOKENS.clean }}>
          <Ico name="login" size={13} /> Check in
        </button>
      );
    }
    if (b.status === "checked_in") {
      if (!isToday || !onAskCheckOut) return <SoftBadge small color={TOKENS.clean} bg={TOKENS.cleanBg}>In-House</SoftBadge>;
      return (
        <button className="gx-btn" onClick={() => onAskCheckOut(b)} style={{ ...primaryBtn, ...base, background: "#C9722B" }}>
          <Ico name="logout" size={13} /> Check out
        </button>
      );
    }
    return <SoftBadge small color={TOKENS.dirty} bg={TOKENS.dirtyBg}>Not checked in</SoftBadge>;
  };

  if (loading) return <BookingsSkeleton mobile={mobile} />;
  if (rows.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "1.6rem 1rem", color: TOKENS.inkSoft }}>
        <div style={{ display: "inline-flex", padding: 12, borderRadius: "50%", background: TOKENS.paper, marginBottom: 8 }}>
          <Ico name={kind === "in" ? "login" : "logout"} size={22} color={TOKENS.brass} />
        </div>
        <div style={{ fontSize: "0.85rem" }}>No {kind === "in" ? "check-ins" : "check-outs"} on this day.</div>
      </div>
    );
  }

  if (mobile) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {rows.map((b) => (
          <div key={b.id} style={{ border: `1px solid ${TOKENS.paperDim}`, borderRadius: 12, padding: "0.75rem", background: "#fff" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: "1.02rem" }}>{roomLabel(b.roomNumber)}</div>
                <div style={{ fontWeight: 600, fontSize: "0.9rem", wordBreak: "break-word" }}>{guestName(b.guestId)}</div>
              </div>
              {roomStatusBadge(b)}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", margin: "8px 0" }}>
              {mealBadge(b)}
              {b.paymentMethod && (
                <span style={{ fontSize: "0.66rem", color: TOKENS.inkSoft, border: `1px solid ${TOKENS.paperDim}`, borderRadius: 999, padding: "2px 7px" }}>{paymentMethodLabel(b.paymentMethod)}</span>
              )}
              <span style={{ marginLeft: "auto", fontSize: "0.82rem", fontWeight: 700 }}>{Number(b.totalAmount) > 0 ? fmtMoney(Number(b.totalAmount)) : "—"}</span>
            </div>
            <div style={{ display: "flex" }}>{action(b, true)}</div>
          </div>
        ))}
      </div>
    );
  }

  const th = { textAlign: "left", fontSize: "0.68rem", fontWeight: 600, color: TOKENS.inkSoft, padding: "0.5rem 0.55rem", whiteSpace: "nowrap" };
  const td = { padding: "0.55rem", fontSize: "0.8rem", verticalAlign: "middle", borderTop: `1px solid ${TOKENS.paperDim}` };
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={th}>Room</th>
            <th style={th}>Guest</th>
            <th style={th}>Meal</th>
            <th style={th}>Total</th>
            <th style={th}>Room</th>
            <th style={{ ...th, textAlign: "right" }}></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((b) => (
            <tr key={b.id}>
              <td style={{ ...td, fontWeight: 700, whiteSpace: "nowrap" }}>{b.roomNumber || "—"}</td>
              <td style={{ ...td, maxWidth: 130, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={guestName(b.guestId)}>
                {guestName(b.guestId)}
              </td>
              <td style={td}>{mealBadge(b)}</td>
              <td style={{ ...td, whiteSpace: "nowrap" }}>{Number(b.totalAmount) > 0 ? fmtMoney(Number(b.totalAmount)) : "—"}</td>
              <td style={td}>{roomStatusBadge(b)}</td>
              <td style={{ ...td, textAlign: "right" }}>{action(b, false)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TodayReportTab({ rooms, bookings, roomRates, mealPlanRates, accessToken, hotelId, guestName, onCheckIn, onCheckOut }) {
  const mobile = useIsMobile();
  const [reportDate, setReportDate] = useState(todayISO());
  const isToday = reportDate === todayISO();
  const [moveTab, setMoveTab] = useState("in");
  const [confirmOut, setConfirmOut] = useState(null);

  const roomNumberById = useMemo(() => {
    const map = {};
    (rooms || []).forEach((r) => {
      map[r.id] = r.number;
    });
    return map;
  }, [rooms]);

  // The check-in/check-out room lists for the selected date are fetched with
  // two narrow, exact-date queries — not filtered out of the full bookings
  // array — so picking any date (past or future) costs the same regardless
  // of how much booking history the hotel has accumulated. Local/demo mode
  // (no hotelId) falls back to filtering the in-memory array.
  const [checkInRooms, setCheckInRooms] = useState([]);
  const [checkOutRooms, setCheckOutRooms] = useState([]);
  const [loadingLists, setLoadingLists] = useState(true);
  const [listError, setListError] = useState("");

  useEffect(() => {
    if (!hotelId) {
      setCheckInRooms(
        (bookings || [])
          .filter((b) => b.status !== "cancelled" && b.checkIn === reportDate)
          .sort((a, b) => (a.roomNumber || "").localeCompare(b.roomNumber || ""))
      );
      setCheckOutRooms(
        (bookings || [])
          .filter((b) => b.status !== "cancelled" && b.checkOut === reportDate)
          .sort((a, b) => (a.roomNumber || "").localeCompare(b.roomNumber || ""))
      );
      setLoadingLists(false);
      return;
    }
    let cancelled = false;
    setLoadingLists(true);
    setListError("");
    Promise.all([
      fetchCheckInsOnDate({ accessToken, hotelId, date: reportDate, roomNumberById }),
      fetchCheckOutsOnDate({ accessToken, hotelId, date: reportDate, roomNumberById }),
    ])
      .then(([ins, outs]) => {
        if (cancelled) return;
        setCheckInRooms(ins.sort((a, b) => (a.roomNumber || "").localeCompare(b.roomNumber || "")));
        setCheckOutRooms(outs.sort((a, b) => (a.roomNumber || "").localeCompare(b.roomNumber || "")));
      })
      .catch(() => {
        if (!cancelled) setListError("Couldn't load check-in/check-out rooms for this date — check your connection and try again.");
      })
      .finally(() => {
        if (!cancelled) setLoadingLists(false);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, hotelId, bookings, reportDate, roomNumberById]);

  const roomsReadyForCheckIn = isToday ? rooms.filter((r) => r.status === "vacant_clean").length : null;
  const checkInsToday = bookings.filter((b) => b.status !== "cancelled" && b.checkIn === reportDate).length;
  const checkOutsToday = bookings.filter((b) => b.status !== "cancelled" && b.checkOut === reportDate).length;
  const stayedToday = bookings.filter((b) => (b.status === "checked_in" || b.status === "checked_out") && b.checkIn <= reportDate && reportDate < b.checkOut);
  const occupiedToday = new Set(stayedToday.map((b) => b.roomNumber)).size;
  const inHouseGuests = stayedToday.reduce((sum, b) => sum + (b.persons || 1), 0);

  // Kitchen headcount = number of PEOPLE (persons on each booking), not rooms.
  const kitchen = useMemo(() => {
    const perPlan = {};
    GUEST_MEAL_PLAN_CHOICES.forEach((p) => (perPlan[p] = 0));
    let none = 0;
    bookings
      .filter((b) => b.status !== "cancelled" && b.checkIn <= reportDate && reportDate < b.checkOut)
      .forEach((b) => {
        const people = b.persons || 1;
        const plan = b.mealPlans && b.mealPlans[0];
        if (plan && perPlan[plan] !== undefined) perPlan[plan] += people;
        else none += people;
      });
    const sum = (plans) => plans.reduce((t, p) => t + (perPlan[p] || 0), 0);
    return {
      perPlan,
      breakfast: sum(MEAL_COVERAGE.breakfast),
      lunch: sum(MEAL_COVERAGE.lunch),
      dinner: sum(MEAL_COVERAGE.dinner),
      roomOnly: (perPlan["B.O"] || 0) + none,
    };
  }, [bookings, reportDate]);

  const [chartStart, setChartStart] = useState(addDaysISO(todayISO(), -6));
  const [chartEnd, setChartEnd] = useState(todayISO());
  const [chartMetric, setChartMetric] = useState("checkins");
  const [chartType, setChartType] = useState("area");

  const chartSeries = useMemo(() => {
    const days = isoDateRange(chartStart, chartEnd);
    return days.map((d) => {
      let value = 0;
      if (chartMetric === "checkins") {
        value = bookings.filter((b) => b.status !== "cancelled" && b.checkIn === d).length;
      } else if (chartMetric === "checkouts") {
        value = bookings.filter((b) => b.status !== "cancelled" && b.checkOut === d).length;
      } else if (chartMetric === "occupied") {
        const roomsToday = new Set(
          bookings
            .filter((b) => (b.status === "checked_in" || b.status === "checked_out") && b.checkIn <= d && d < b.checkOut)
            .map((b) => b.roomNumber)
        );
        value = roomsToday.size;
      } else if (chartMetric === "revenue") {
        value = bookings
          .filter((b) => (b.status === "checked_in" || b.status === "checked_out") && b.checkIn <= d && d < b.checkOut)
          .reduce((sum, b) => {
            const totalNights = Math.max(1, Math.round((new Date(b.checkOut) - new Date(b.checkIn)) / 86400000));
            const discountFactor = 1 - (Number(b.discountPercent) || 0) / 100;
            let perNight;
            if (Number(b.totalAmount) > 0) {
              perNight = (Number(b.totalAmount) / totalNights) * discountFactor;
            } else {
              const room = rooms.find((r) => r.number === b.roomNumber);
              const persons = b.persons || 1;
              perNight = room
                ? persons * (getRoomRate(room, roomRates) + mealPlanSurcharge(b.mealPlans, mealPlanRates)) * discountFactor
                : 0;
            }
            return sum + perNight;
          }, 0);
      }
      return { label: d, value: Math.round(value * 100) / 100 };
    });
  }, [bookings, rooms, roomRates, mealPlanRates, chartStart, chartEnd, chartMetric]);

  const chartTotal = chartSeries.reduce((t, p) => t + p.value, 0);
  const chartAvg = chartSeries.length ? chartTotal / chartSeries.length : 0;
  const chartPeak = chartSeries.reduce((best, p) => (p.value > (best ? best.value : -1) ? p : best), null);
  const isMoney = chartMetric === "revenue";
  const showVal = (v) => (isMoney ? fmtMoney(Math.round(v)) : String(Math.round(v * 10) / 10));
  const setPreset = (days) => {
    setChartEnd(todayISO());
    setChartStart(addDaysISO(todayISO(), -(days - 1)));
  };

  const kpis = [
    { label: "Occupied rooms", value: occupiedToday, icon: "bed", color: "#3B6FA0", bg: "#DCE9F5" },
    { label: "In-house guests", value: inHouseGuests, icon: "users", color: "#3B6FA0", bg: "#DCE9F5" },
    { label: isToday ? "Ready for check-in" : "Ready (today only)", value: isToday ? roomsReadyForCheckIn : "—", icon: "check", color: TOKENS.clean, bg: TOKENS.cleanBg },
    { label: isToday ? "Today's arrivals" : "Arrivals", value: checkInsToday, icon: "login", color: TOKENS.clean, bg: TOKENS.cleanBg },
    { label: isToday ? "Today's departures" : "Departures", value: checkOutsToday, icon: "logout", color: "#C9722B", bg: "#FBE7D2" },
  ];

  const meals = [
    { key: "breakfast", label: "Breakfast", emoji: "🥐", n: kitchen.breakfast, plans: MEAL_COVERAGE.breakfast },
    { key: "lunch", label: "Lunch", emoji: "🥗", n: kitchen.lunch, plans: MEAL_COVERAGE.lunch },
    { key: "dinner", label: "Dinner", emoji: "🍽️", n: kitchen.dinner, plans: MEAL_COVERAGE.dinner },
    { key: "roomOnly", label: "Room only", emoji: "🛏️", n: kitchen.roomOnly, plans: ["B.O"], extra: "no plan" },
  ];

  const sectionTitle = { fontSize: "0.75rem", color: TOKENS.brassDark, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8, fontWeight: 600 };
  const glassCard = { background: "rgba(255,255,255,.75)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)", border: "1px solid rgba(255,255,255,.9)", borderRadius: 16, padding: "0.9rem", boxShadow: "0 2px 12px rgba(27,36,48,.06)" };
  const dayWord = isToday ? "today" : "on this day";

  const listProps = { rooms, guestName, isToday, onCheckIn, onAskCheckOut: onCheckOut ? setConfirmOut : undefined, loading: loadingLists, mobile };

  return (
    <div>
      <style>{GUESTS_CSS}</style>
      <style>{TODAY_CSS}</style>

      <h2 style={{ fontFamily: "Fraunces, serif", fontSize: "1.3rem", margin: "0 0 0.75rem" }}>Today report</h2>

      <div className="td-datebar" style={{ display: "flex", gap: 8, alignItems: "flex-end", marginBottom: "1rem", flexWrap: "wrap" }}>
        <div style={{ flex: mobile ? "1 1 100%" : "0 0 auto" }}>
          <div style={{ fontSize: "0.7rem", color: TOKENS.inkSoft, marginBottom: 4 }}>Report date</div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <button className="gx-btn" onClick={() => setReportDate(addDaysISO(reportDate, -1))} style={{ ...ghostBtn, padding: "0.5rem 0.6rem", display: "inline-flex", background: "#fff" }} aria-label="Previous day">
              <Ico name="left" size={15} />
            </button>
            <input type="date" value={reportDate} onChange={(e) => e.target.value && setReportDate(e.target.value)} style={{ ...inputStyle, flex: mobile ? 1 : undefined }} />
            <button className="gx-btn" onClick={() => setReportDate(addDaysISO(reportDate, 1))} style={{ ...ghostBtn, padding: "0.5rem 0.6rem", display: "inline-flex", background: "#fff" }} aria-label="Next day">
              <Ico name="right" size={15} />
            </button>
            {!isToday && (
              <button className="gx-btn" onClick={() => setReportDate(todayISO())} style={ghostBtn}>
                Today
              </button>
            )}
          </div>
        </div>
      </div>

      {/* KPI bar */}
      <div style={{ background: "linear-gradient(135deg, rgba(176,137,104,.22), rgba(68,85,105,.12))", borderRadius: 18, padding: 10, marginBottom: "1.5rem" }}>
        <div className="td-kpis">
          {kpis.map((k) => (
            <div key={k.label} className="td-kpi">
              <span style={{ width: 36, height: 36, borderRadius: 11, background: k.bg, color: k.color, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Ico name={k.icon} size={18} />
              </span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: "block", fontSize: "1.45rem", fontWeight: 700, fontFamily: "Fraunces, serif", lineHeight: 1.1 }}>{k.value}</span>
                <span style={{ display: "block", fontSize: "0.7rem", color: TOKENS.inkSoft, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{k.label}</span>
              </span>
            </div>
          ))}
        </div>
      </div>

      {listError && <div style={{ color: TOKENS.oos, background: TOKENS.oosBg, borderRadius: 8, padding: "0.5rem 0.75rem", fontSize: "0.85rem", marginBottom: "0.75rem" }}>{listError}</div>}

      {/* Kitchen & dining */}
      <div style={sectionTitle}>Kitchen &amp; dining — headcount {dayWord}</div>
      <div className="td-meals" style={{ marginBottom: "1.75rem" }}>
        {meals.map((m) => (
          <div key={m.key} style={glassCard}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ width: 42, height: 42, borderRadius: 13, background: "#DCE9F5", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "1.35rem", flexShrink: 0 }} aria-hidden="true">
                {m.emoji}
              </span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: "1.6rem", fontWeight: 700, fontFamily: "Fraunces, serif", lineHeight: 1.05 }}>{m.n}</div>
                <div style={{ fontSize: "0.74rem", color: TOKENS.inkSoft }}>{m.label} · guests</div>
              </div>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 10 }}>
              {m.plans.map((p) => (
                <SoftBadge key={p} small color="#2F5F8F" bg="#DCE9F5">
                  {p} {kitchen.perPlan[p] || 0}
                </SoftBadge>
              ))}
              {m.extra && (
                <SoftBadge small color="#2F5F8F" bg="#DCE9F5">
                  {m.extra}{" "}
                  {kitchen.roomOnly - (kitchen.perPlan["B.O"] || 0)}
                </SoftBadge>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Movements */}
      <div style={sectionTitle}>Today's movements</div>
      {mobile ? (
        <div style={{ marginBottom: "1.75rem" }}>
          <div style={{ display: "flex", gap: 6, marginBottom: 10 }} role="tablist">
            {[
              { key: "in", label: "Check-ins", n: checkInRooms.length, color: TOKENS.clean, bg: TOKENS.cleanBg },
              { key: "out", label: "Check-outs", n: checkOutRooms.length, color: "#C9722B", bg: "#FBE7D2" },
            ].map((t) => {
              const act = moveTab === t.key;
              return (
                <button
                  key={t.key}
                  role="tab"
                  aria-selected={act}
                  className="gx-btn"
                  onClick={() => setMoveTab(t.key)}
                  style={{ ...ghostBtn, flex: 1, padding: "0.65rem 0.5rem", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, background: act ? t.bg : "#fff", color: act ? t.color : TOKENS.inkSoft, borderColor: act ? t.color : TOKENS.paperDim, fontWeight: act ? 700 : 400 }}
                >
                  {t.label}
                  <span style={{ fontSize: "0.68rem", borderRadius: 999, padding: "1px 7px", background: act ? "#fff" : TOKENS.paper }}>{t.n}</span>
                </button>
              );
            })}
          </div>
          <MovementList kind={moveTab} rows={moveTab === "in" ? checkInRooms : checkOutRooms} {...listProps} />
        </div>
      ) : (
        <div className="td-move" style={{ marginBottom: "1.75rem" }}>
          {[
            { kind: "in", title: `Check-ins ${dayWord}`, rows: checkInRooms, icon: "login", color: TOKENS.clean, bg: TOKENS.cleanBg },
            { kind: "out", title: `Check-outs ${dayWord}`, rows: checkOutRooms, icon: "logout", color: "#C9722B", bg: "#FBE7D2" },
          ].map((col) => (
            <div key={col.kind} style={{ ...glassCard, padding: "0.8rem 0.9rem", minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <span style={{ width: 28, height: 28, borderRadius: 9, background: col.bg, color: col.color, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                  <Ico name={col.icon} size={15} />
                </span>
                <div style={{ fontWeight: 600, fontSize: "0.9rem" }}>{col.title}</div>
                <SoftBadge small color={col.color} bg={col.bg}>
                  {col.rows.length}
                </SoftBadge>
              </div>
              <MovementList kind={col.kind} rows={col.rows} {...listProps} />
            </div>
          ))}
        </div>
      )}

      {/* Trends */}
      <div style={sectionTitle}>Trends &amp; analytics</div>
      <div style={{ ...glassCard, marginBottom: "1rem" }}>
        <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 6, marginBottom: 8 }} role="tablist">
          {CHART_METRICS.map((m) => {
            const act = chartMetric === m.key;
            return (
              <button
                key={m.key}
                role="tab"
                aria-selected={act}
                className="gx-btn"
                onClick={() => setChartMetric(m.key)}
                style={{ ...ghostBtn, whiteSpace: "nowrap", flexShrink: 0, background: act ? TREND_COLORS[m.key] : "#fff", color: act ? "#fff" : TOKENS.inkSoft, borderColor: act ? TREND_COLORS[m.key] : TOKENS.paperDim, fontWeight: act ? 600 : 400 }}
              >
                {m.label}
              </button>
            );
          })}
        </div>

        <div className="td-range" style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 10 }}>
          <label style={{ flex: mobile ? "1 1 45%" : "0 0 auto", fontSize: "0.7rem", color: TOKENS.inkSoft }}>
            <div style={{ marginBottom: 4 }}>From</div>
            <input type="date" value={chartStart} onChange={(e) => setChartStart(e.target.value)} style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }} />
          </label>
          <label style={{ flex: mobile ? "1 1 45%" : "0 0 auto", fontSize: "0.7rem", color: TOKENS.inkSoft }}>
            <div style={{ marginBottom: 4 }}>To</div>
            <input type="date" value={chartEnd} onChange={(e) => setChartEnd(e.target.value)} style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }} />
          </label>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", flex: mobile ? "1 1 100%" : "0 0 auto" }}>
            {[7, 14, 30].map((d) => (
              <button key={d} className="gx-btn" onClick={() => setPreset(d)} style={{ ...ghostBtn, background: "#fff", flex: mobile ? 1 : undefined }}>
                {d}d
              </button>
            ))}
            <select value={chartType} onChange={(e) => setChartType(e.target.value)} style={{ ...inputStyle, flex: mobile ? 1 : undefined }} aria-label="Chart type">
              <option value="area">Area</option>
              <option value="line">Line</option>
              <option value="bar">Bars</option>
            </select>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
          {[
            { label: isMoney || chartMetric === "occupied" ? (chartMetric === "occupied" ? "Average / day" : "Total") : "Total", value: chartMetric === "occupied" ? showVal(chartAvg) : showVal(chartTotal) },
            { label: chartMetric === "occupied" ? "Peak" : "Average / day", value: chartMetric === "occupied" ? showVal(chartPeak ? chartPeak.value : 0) : showVal(chartAvg) },
            { label: "Peak day", value: chartPeak && chartPeak.value > 0 ? fmtDate(chartPeak.label) : "—" },
          ].map((s) => (
            <div key={s.label} style={{ flex: "1 1 90px", background: TOKENS.paper, borderRadius: 10, padding: "0.5rem 0.7rem" }}>
              <div style={{ fontSize: "0.66rem", color: TOKENS.inkSoft }}>{s.label}</div>
              <div style={{ fontWeight: 700, fontSize: "0.95rem" }}>{s.value}</div>
            </div>
          ))}
        </div>

        <TrendChart series={chartSeries} type={chartType} color={TREND_COLORS[chartMetric]} isMoney={isMoney} />
        <div style={{ fontSize: "0.68rem", color: TOKENS.inkSoft, marginTop: 6 }}>Tap or hover the chart to see exact values.</div>
      </div>

      {confirmOut && (
        <ConfirmModal
          title="Check out guest?"
          message={`${guestName(confirmOut.guestId)} will be checked out of ${roomLabel(confirmOut.roomNumber)}. The room will be marked as needing cleaning.`}
          confirmLabel="Check out"
          cancelLabel="Not yet"
          onConfirm={() => {
            onCheckOut(confirmOut.id);
            setConfirmOut(null);
          }}
          onClose={() => setConfirmOut(null)}
        />
      )}
    </div>
  );
}

function FinanceLineChart({ rows }) {
  const width = 640;
  const height = 260;
  const padding = { top: 16, right: 16, bottom: 36, left: 56 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;
  const maxVal = Math.max(1, ...rows.map((r) => Math.max(r.revenue_total, r.expenses_total)));
  const stepX = rows.length > 1 ? innerW / (rows.length - 1) : innerW;
  const xFor = (i) => padding.left + (rows.length > 1 ? i * stepX : innerW / 2);
  const yFor = (v) => padding.top + innerH - (v / maxVal) * innerH;
  const lineFor = (field) => rows.map((r, i) => `${xFor(i)},${yFor(r[field])}`).join(" ");

  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", maxWidth: 640, height: "auto" }}>
      {[0, 0.25, 0.5, 0.75, 1].map((f) => (
        <line key={f} x1={padding.left} x2={width - padding.right} y1={padding.top + innerH * (1 - f)} y2={padding.top + innerH * (1 - f)} stroke={TOKENS.paperDim} strokeWidth="1" />
      ))}
      {[0, 0.25, 0.5, 0.75, 1].map((f) => (
        <text key={f} x={padding.left - 8} y={padding.top + innerH * (1 - f) + 4} textAnchor="end" fontSize="10" fill={TOKENS.inkSoft}>
          {Math.round(maxVal * f).toLocaleString()}
        </text>
      ))}
      <polyline points={lineFor("revenue_total")} fill="none" stroke={TOKENS.clean} strokeWidth="2.5" />
      <polyline points={lineFor("expenses_total")} fill="none" stroke={TOKENS.oos} strokeWidth="2.5" />
      {rows.map((r, i) =>
        i % Math.max(1, Math.ceil(rows.length / 10)) === 0 ? (
          <text key={r.entry_date} x={xFor(i)} y={height - padding.bottom + 16} textAnchor="middle" fontSize="9" fill={TOKENS.inkSoft}>
            {r.entry_date.slice(5)}
          </text>
        ) : null
      )}
      <circle cx={padding.left} cy={14} r="4" fill={TOKENS.clean} />
      <text x={padding.left + 10} y={18} fontSize="10" fill={TOKENS.inkSoft}>Revenue</text>
      <circle cx={padding.left + 80} cy={14} r="4" fill={TOKENS.oos} />
      <text x={padding.left + 90} y={18} fontSize="10" fill={TOKENS.inkSoft}>Expenses</text>
    </svg>
  );
}

// ---- Accountant console ----
// Fully separate from HotelReceptionApp's rooms/bookings/guests state — the
// accountant role only ever reads/writes the finance_daily table, scoped by
// RLS to their own hotel_id. See supabase/finance_setup.sql for the schema
// and policies this depends on.
function AccountantConsole({ supabaseSession, onLogout }) {
  const [tab, setTab] = useState("entry");
  const [rows, setRows] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const hotelId = supabaseSession && supabaseSession.hotelId;
  const token = supabaseSession && supabaseSession.access_token;

  const loadRows = async () => {
    if (!hotelId) return;
    try {
      const data = await supabaseRest(`finance_daily?hotel_id=eq.${hotelId}&order=entry_date.desc&limit=180`, { accessToken: token });
      setRows(data || []);
    } catch (e) {
      setError(`Couldn't load finance history: ${e.message}`);
    } finally {
      setLoaded(true);
    }
  };

  useEffect(() => {
    loadRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hotelId]);

  const flash = (msg) => {
    setNotice(msg);
    setTimeout(() => setNotice(""), 4000);
  };
  const flashError = (msg) => {
    setError(msg);
    setTimeout(() => setError(""), 6000);
  };

  // Saves one or many finance_daily rows at once (upsert on hotel_id+entry_date).
  const saveRows = async (draftRows) => {
    if (!hotelId) {
      flashError("You're not linked to a hotel yet — sign in with a real accountant account.");
      return false;
    }
    const payload = draftRows.map((r) => ({
      hotel_id: hotelId,
      entry_date: r.entry_date,
      ...Object.fromEntries(FINANCE_FIELD_KEYS.map((k) => [k, financeCleanNumber(r[k])])),
      revenue_reported_total: r.revenue_reported_total !== undefined && r.revenue_reported_total !== "" ? financeCleanNumber(r.revenue_reported_total) : null,
      expense_reported_total: r.expense_reported_total !== undefined && r.expense_reported_total !== "" ? financeCleanNumber(r.expense_reported_total) : null,
      balance_previous: r.balance_previous !== undefined && r.balance_previous !== "" ? financeCleanNumber(r.balance_previous) : null,
      balance_ending: r.balance_ending !== undefined && r.balance_ending !== "" ? financeCleanNumber(r.balance_ending) : null,
      revenue_total: financeRevenueTotal(r),
      expenses_total: financeExpenseTotal(r),
    }));
    try {
      // on_conflict must be spelled out here: finance_daily has its own `id`
      // primary key, so without this PostgREST would only de-dupe against
      // `id` (which new rows never collide on) instead of (hotel_id, entry_date).
      await supabaseRest("finance_daily?on_conflict=hotel_id,entry_date", {
        accessToken: token,
        method: "POST",
        body: payload,
        headers: { Prefer: "resolution=merge-duplicates,return=representation" },
      });
      await loadRows();
      return true;
    } catch (e) {
      flashError(`Couldn't save: ${e.message}`);
      return false;
    }
  };

  return (
    <div style={{ fontFamily: "Inter, sans-serif", background: TOKENS.paper, minHeight: "100vh", color: TOKENS.ink }}>
      <header
        style={{
          background: TOKENS.ink,
          color: TOKENS.paper,
          padding: "1.25rem 1.5rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "0.75rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: "0.75rem" }}>
          <span style={{ fontFamily: "Fraunces, serif", fontSize: "1.5rem", fontWeight: 600, letterSpacing: "0.01em" }}>Geisum Hotel</span>
          <span style={{ fontSize: "0.75rem", color: TOKENS.brass, letterSpacing: "0.08em", textTransform: "uppercase" }}>Accountant console</span>
        </div>
        <button
          onClick={onLogout}
          style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 8, padding: "0.4rem 0.8rem", color: TOKENS.paper, fontSize: "0.8rem", cursor: "pointer" }}
        >
          Sign out
        </button>
      </header>

      <nav style={{ display: "flex", gap: "0.25rem", padding: "0.75rem 1.5rem 0", borderBottom: `1px solid ${TOKENS.paperDim}`, background: TOKENS.paper, flexWrap: "wrap" }}>
        {[
          { id: "entry", label: "Daily entry" },
          { id: "import", label: "Import from Excel" },
          { id: "history", label: "History & chart" },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              border: "none",
              background: "transparent",
              padding: "0.6rem 1rem",
              fontFamily: "Inter, sans-serif",
              fontSize: "0.9rem",
              fontWeight: 500,
              color: tab === t.id ? TOKENS.ink : TOKENS.inkSoft,
              borderBottom: tab === t.id ? `2px solid ${TOKENS.brass}` : "2px solid transparent",
              cursor: "pointer",
              opacity: tab === t.id ? 1 : 0.6,
            }}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {error && <div style={{ background: TOKENS.oosBg, color: TOKENS.oos, padding: "0.5rem 1.5rem", fontSize: "0.85rem" }}>{error}</div>}
      {notice && <div style={{ background: TOKENS.cleanBg, color: TOKENS.clean, padding: "0.5rem 1.5rem", fontSize: "0.85rem" }}>{notice}</div>}

      <main style={{ padding: "1.5rem", maxWidth: 1100, margin: "0 auto" }}>
        {!loaded ? (
          <div style={{ color: TOKENS.inkSoft }}>Loading…</div>
        ) : (
          <>
            {tab === "entry" && (
              <FinanceDailyEntryTab
                existingRows={rows}
                onSave={async (row) => {
                  const ok = await saveRows([row]);
                  if (ok) flash(`تم حفظ يوم ${row.entry_date}.`);
                }}
              />
            )}
            {tab === "import" && (
              <FinanceExcelImportTab
                onSaveMany={async (draftRows) => {
                  const ok = await saveRows(draftRows);
                  if (ok) flash(`تم حفظ ورفع ${draftRows.length} يوم بنجاح.`);
                  return ok;
                }}
              />
            )}
            {tab === "history" && <FinanceHistoryTab rows={rows} hotelId={hotelId} token={token} />}
          </>
        )}
      </main>
    </div>
  );
}

function FinanceDailyEntryTab({ existingRows, onSave }) {
  const [form, setForm] = useState(emptyFinanceForm());
  const [saving, setSaving] = useState(false);

  // If the accountant picks a date that already has a saved entry, load it
  // for editing instead of starting from zero.
  useEffect(() => {
    const existing = existingRows.find((r) => r.entry_date === form.entry_date);
    if (existing) {
      const next = { entry_date: existing.entry_date };
      FINANCE_FIELD_KEYS.forEach((k) => (next[k] = Number(existing[k]) || 0));
      setForm(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.entry_date]);

  const revenueTotal = financeRevenueTotal(form);
  const expenseTotal = financeExpenseTotal(form);

  const setField = (key, value) => setForm((prev) => ({ ...prev, [key]: value === "" ? "" : Number(value) }));

  const submit = async () => {
    setSaving(true);
    await onSave(form);
    setSaving(false);
  };

  return (
    <div>
      <h2 style={{ fontFamily: "Fraunces, serif", fontSize: "1.3rem", marginBottom: "0.5rem" }}>Daily entry</h2>
      <div style={{ fontSize: "0.85rem", color: TOKENS.inkSoft, marginBottom: "1rem" }}>
        Pick a date — if it's already saved, the fields below load for editing. Totals update as you type.
      </div>

      <div style={{ marginBottom: "1rem" }}>
        <label style={{ display: "block", fontSize: "0.8rem", color: TOKENS.inkSoft, marginBottom: 4 }}>التاريخ</label>
        <input type="date" value={form.entry_date} onChange={(e) => setForm((p) => ({ ...p, entry_date: e.target.value }))} style={inputStyle} />
      </div>

      <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 260, background: TOKENS.cleanBg, padding: "1rem", borderRadius: 10 }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>الإيرادات (إجمالى: {revenueTotal.toLocaleString()})</div>
          {FINANCE_REVENUE_FIELDS.map((f) => (
            <div key={f.key} style={{ marginBottom: 8 }}>
              <label style={{ display: "block", fontSize: "0.78rem", color: TOKENS.inkSoft }}>{f.label}</label>
              <input type="number" value={form[f.key]} onChange={(e) => setField(f.key, e.target.value)} style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }} />
            </div>
          ))}
        </div>
        <div style={{ flex: 1, minWidth: 260, background: TOKENS.oosBg, padding: "1rem", borderRadius: 10 }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>المصروفات (إجمالى: {expenseTotal.toLocaleString()})</div>
          {FINANCE_EXPENSE_FIELDS.map((f) => (
            <div key={f.key} style={{ marginBottom: 8 }}>
              <label style={{ display: "block", fontSize: "0.78rem", color: TOKENS.inkSoft }}>{f.label}</label>
              <input type="number" value={form[f.key]} onChange={(e) => setField(f.key, e.target.value)} style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }} />
            </div>
          ))}
        </div>
      </div>

      <div style={{ ...cardStyle, marginTop: "1rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontWeight: 600 }}>صافى اليوم: {(revenueTotal - expenseTotal).toLocaleString()}</div>
        <button onClick={submit} disabled={saving} style={primaryBtn}>
          {saving ? "جاري الحفظ…" : "حفظ اليوم"}
        </button>
      </div>
    </div>
  );
}

function FinanceExcelImportTab({ onSaveMany }) {
  const fileInputRef = useRef(null);
  const [sheetNames, setSheetNames] = useState([]);
  const [workbook, setWorkbook] = useState(null);
  const [selectedSheet, setSelectedSheet] = useState("");
  const [headerRows, setHeaderRows] = useState([]); // raw rows 0..5 for column mapping
  const [columnMap, setColumnMap] = useState({}); // colIndex -> target field key
  const [dataStartRow, setDataStartRow] = useState(0);
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [previewRows, setPreviewRows] = useState([]);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setStatus("جاري قراءة الملف…");
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target.result, { type: "binary", cellDates: true });
        setWorkbook(wb);
        setSheetNames(wb.SheetNames);
        setSelectedSheet(wb.SheetNames[wb.SheetNames.length - 1]);
        setStatus("");
      } catch (err) {
        setStatus(`❌ تعذرت قراءة الملف: ${err.message}`);
      }
    };
    reader.readAsBinaryString(file);
  };

  // Whenever the chosen sheet changes, re-scan its header block and
  // re-guess the column mapping.
  useEffect(() => {
    if (!workbook || !selectedSheet) return;
    const ws = workbook.Sheets[selectedSheet];
    const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });
    const headerBlock = raw.slice(0, 6);
    setHeaderRows(headerBlock);

    const colCount = Math.max(0, ...headerBlock.map((r) => (r ? r.length : 0)));
    const guessed = {};
    for (let c = 0; c < colCount; c++) {
      const combined = headerBlock.map((r) => (r && r[c] != null ? String(r[c]) : "")).filter(Boolean).join(" ");
      guessed[c] = guessFinanceFieldForHeader(combined);
    }
    setColumnMap(guessed);

    // Guess the first data row: the row right after the last non-empty header row.
    let lastHeaderIdx = 0;
    headerBlock.forEach((r, i) => {
      if (r && r.some((cell) => cell !== null && cell !== "")) lastHeaderIdx = i;
    });
    setDataStartRow(lastHeaderIdx + 1);

    // Guess month/year from a sheet name like "9-2025" or "9-2025 ".
    const m = selectedSheet.match(/(\d{1,2})\s*-\s*(\d{4})/);
    if (m) {
      setMonth(Number(m[1]));
      setYear(Number(m[2]));
    }
  }, [workbook, selectedSheet]);

  const buildPreview = () => {
    if (!workbook || !selectedSheet) return;
    const ws = workbook.Sheets[selectedSheet];
    const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });
    const dateColIndex = Object.keys(columnMap).find((c) => columnMap[c] === "entry_date");

    const built = [];
    for (let r = dataStartRow; r < raw.length; r++) {
      const row = raw[r] || [];
      if (dateColIndex === undefined) continue;
      const rawDateVal = row[dateColIndex];
      if (rawDateVal === null || rawDateVal === undefined || rawDateVal === "") continue;

      let entry_date;
      if (rawDateVal instanceof Date) {
        entry_date = rawDateVal.toISOString().slice(0, 10);
      } else {
        const day = Math.round(financeCleanNumber(rawDateVal));
        if (!day || day < 1 || day > 31) continue;
        entry_date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      }

      const draft = emptyFinanceForm(entry_date);
      draft.revenue_reported_total = "";
      draft.expense_reported_total = "";
      draft.balance_previous = "";
      draft.balance_ending = "";
      Object.entries(columnMap).forEach(([colIdx, target]) => {
        if (target === "ignore" || target === "entry_date") return;
        draft[target] = financeCleanNumber(row[Number(colIdx)]);
      });
      built.push(draft);
    }
    setPreviewRows(built);
  };

  const updatePreviewCell = (idx, key, value) => {
    setPreviewRows((prev) => prev.map((r, i) => (i === idx ? { ...r, [key]: value === "" ? "" : Number(value) } : r)));
  };

  const saveAll = async () => {
    setSaving(true);
    const ok = await onSaveMany(previewRows);
    setSaving(false);
    if (ok) {
      setStatus(`🎯 تم حفظ ${previewRows.length} يوم في قاعدة البيانات.`);
      setPreviewRows([]);
    }
  };

  return (
    <div>
      <h2 style={{ fontFamily: "Fraunces, serif", fontSize: "1.3rem", marginBottom: "0.5rem" }}>Import from Excel</h2>
      <div style={{ fontSize: "0.85rem", color: TOKENS.inkSoft, marginBottom: "1rem" }}>
        ارفع ملف الشيت، اختر الشهر (تبويب) المطلوب، راجع تطابق الأعمدة، ثم راجع البيانات قبل الحفظ النهائى. أرقام فارغة أو
        بصيغة علمية (زى 1E+05) بيتم تنظيفها تلقائياً.
      </div>

      <div style={{ ...cardStyle, marginBottom: "1rem" }}>
        <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleFile} />
        {status && <div style={{ marginTop: 8, fontSize: "0.85rem" }}>{status}</div>}
      </div>

      {sheetNames.length > 0 && (
        <div style={{ ...cardStyle, marginBottom: "1rem" }}>
          <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", marginBottom: "0.75rem" }}>
            <div>
              <div style={{ fontSize: "0.78rem", color: TOKENS.inkSoft, marginBottom: 4 }}>ورقة الشيت (الشهر)</div>
              <select value={selectedSheet} onChange={(e) => setSelectedSheet(e.target.value)} style={inputStyle}>
                {sheetNames.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
            <div>
              <div style={{ fontSize: "0.78rem", color: TOKENS.inkSoft, marginBottom: 4 }}>شهر التاريخ (لو العمود رقم يوم فقط)</div>
              <input type="number" min="1" max="12" value={month} onChange={(e) => setMonth(Number(e.target.value))} style={{ ...inputStyle, width: 70 }} />
            </div>
            <div>
              <div style={{ fontSize: "0.78rem", color: TOKENS.inkSoft, marginBottom: 4 }}>السنة</div>
              <input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} style={{ ...inputStyle, width: 90 }} />
            </div>
            <div>
              <div style={{ fontSize: "0.78rem", color: TOKENS.inkSoft, marginBottom: 4 }}>أول صف بيانات (رقم الصف، يبدأ من 0)</div>
              <input type="number" min="0" value={dataStartRow} onChange={(e) => setDataStartRow(Number(e.target.value))} style={{ ...inputStyle, width: 90 }} />
            </div>
          </div>

          <div style={{ fontWeight: 600, marginBottom: 6 }}>تطابق الأعمدة</div>
          <div style={{ fontSize: "0.78rem", color: TOKENS.inkSoft, marginBottom: 8 }}>
            تم اقتراح التطابق تلقائياً حسب عناوين الأعمدة — راجعها وعدّل أي عمود غلط قبل المتابعة.
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 8, marginBottom: 8 }}>
            {Object.keys(columnMap).map((c) => {
              const headerText = headerRows.map((r) => (r && r[c] != null ? String(r[c]) : "")).filter(Boolean).join(" ").trim();
              if (!headerText && columnMap[c] === "ignore") return null;
              return (
                <div key={c} style={{ border: `1px solid ${TOKENS.paperDim}`, borderRadius: 8, padding: "0.5rem" }}>
                  <div style={{ fontSize: "0.72rem", color: TOKENS.inkSoft, marginBottom: 4 }}>
                    عمود {c} — {headerText || "(بدون عنوان)"}
                  </div>
                  <select
                    value={columnMap[c]}
                    onChange={(e) => setColumnMap((prev) => ({ ...prev, [c]: e.target.value }))}
                    style={{ ...inputStyle, width: "100%" }}
                  >
                    {FINANCE_MAP_TARGETS.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>

          <button onClick={buildPreview} style={ghostBtn}>معاينة البيانات</button>
        </div>
      )}

      {previewRows.length > 0 && (
        <div style={cardStyle}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>
            معاينة {previewRows.length} يوم — راجع وعدّل أي رقم قبل الحفظ
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%", fontSize: "0.75rem" }}>
              <thead>
                <tr>
                  <th style={thStyle}>التاريخ</th>
                  {FINANCE_REVENUE_FIELDS.map((f) => <th key={f.key} style={thStyle}>{f.label}</th>)}
                  {FINANCE_EXPENSE_FIELDS.map((f) => <th key={f.key} style={thStyle}>{f.label}</th>)}
                  <th style={thStyle}>إجمالى الإيراد (محسوب)</th>
                  <th style={thStyle}>إجمالى المصروفات (محسوب)</th>
                  <th style={thStyle}>إجمالى الإيراد (من الشيت)</th>
                </tr>
              </thead>
              <tbody>
                {previewRows.map((r, i) => {
                  const rev = financeRevenueTotal(r);
                  const reported = r.revenue_reported_total;
                  const mismatch = reported !== "" && reported !== undefined && Math.abs(Number(reported) - rev) > 1;
                  return (
                    <tr key={r.entry_date}>
                      <td style={tdStyle}>{r.entry_date}</td>
                      {FINANCE_REVENUE_FIELDS.map((f) => (
                        <td style={tdStyle} key={f.key}>
                          <input type="number" value={r[f.key]} onChange={(e) => updatePreviewCell(i, f.key, e.target.value)} style={{ ...inputStyle, width: 70, padding: "2px 4px" }} />
                        </td>
                      ))}
                      {FINANCE_EXPENSE_FIELDS.map((f) => (
                        <td style={tdStyle} key={f.key}>
                          <input type="number" value={r[f.key]} onChange={(e) => updatePreviewCell(i, f.key, e.target.value)} style={{ ...inputStyle, width: 70, padding: "2px 4px" }} />
                        </td>
                      ))}
                      <td style={tdStyle}>{rev.toLocaleString()}</td>
                      <td style={tdStyle}>{financeExpenseTotal(r).toLocaleString()}</td>
                      <td style={{ ...tdStyle, color: mismatch ? TOKENS.oos : TOKENS.inkSoft, fontWeight: mismatch ? 700 : 400 }}>
                        {reported === "" || reported === undefined ? "—" : Number(reported).toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <button onClick={saveAll} disabled={saving} style={{ ...primaryBtn, marginTop: 12 }}>
            {saving ? "جاري الحفظ…" : `حفظ ${previewRows.length} يوم فى قاعدة البيانات`}
          </button>
        </div>
      )}
    </div>
  );
}

const FINANCE_EXPORT_COLUMNS = [
  { header: "التاريخ", get: (r) => r.entry_date },
  { header: "سلف اسطاف", get: (r) => Number(r.expense_staff_advances) || 0 },
  { header: "ايداع البنك", get: (r) => Number(r.expense_bank_deposit) || 0 },
  { header: "م. تشغيل", get: (r) => Number(r.expense_operating) || 0 },
  { header: "جارى الشريك - م. مجدى", get: (r) => Number(r.expense_partner_magdy) || 0 },
  { header: "جارى الشريك - م. محب", get: (r) => Number(r.expense_partner_moheb) || 0 },
  { header: "جارى الشريك - م. بولا", get: (r) => Number(r.expense_partner_bola) || 0 },
  { header: "جارى الشريك - م. كاميل", get: (r) => Number(r.expense_partner_kamel) || 0 },
  { header: "ادوات مكتبيه مطبوعات", get: (r) => Number(r.expense_other) || 0 },
  { header: "مرتبات", get: (r) => Number(r.expense_salaries) || 0 },
  { header: "م. ثابته", get: (r) => Number(r.expense_fixed) || 0 },
  { header: "اجمالى المصروفات", get: (r) => Number(r.expenses_total) || 0 },
  { header: "الغرف", get: (r) => Number(r.revenue_rooms) || 0 },
  { header: "الكوفى شوب", get: (r) => Number(r.revenue_coffee_shop) || 0 },
  { header: "بار حمام السباحه", get: (r) => Number(r.revenue_pool_bar) || 0 },
  { header: "الشاطئ", get: (r) => Number(r.revenue_beach) || 0 },
  { header: "ايجارات", get: (r) => Number(r.revenue_rentals) || 0 },
  { header: "اخرى", get: (r) => Number(r.revenue_other) || 0 },
  { header: "اجمالى الايراد", get: (r) => Number(r.revenue_total) || 0 },
  { header: "صافى اليوم", get: (r) => (Number(r.revenue_total) || 0) - (Number(r.expenses_total) || 0) },
];

function FinanceHistoryTab({ rows, hotelId, token }) {
  const chartRows = useMemo(() => [...rows].sort((a, b) => a.entry_date.localeCompare(b.entry_date)).slice(-31), [rows]);
  const monthTotal = useMemo(() => {
    const rev = chartRows.reduce((s, r) => s + (Number(r.revenue_total) || 0), 0);
    const exp = chartRows.reduce((s, r) => s + (Number(r.expenses_total) || 0), 0);
    return { rev, exp, net: rev - exp };
  }, [chartRows]);

  const [fromDate, setFromDate] = useState(() => addDaysISO(todayISO(), -30));
  const [toDate, setToDate] = useState(() => todayISO());
  const [exporting, setExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState("");

  const exportRange = async () => {
    if (!hotelId) {
      setExportStatus("❌ لا يوجد hotel مرتبط بالحساب.");
      return;
    }
    if (fromDate > toDate) {
      setExportStatus("❌ تاريخ البداية بعد تاريخ النهاية.");
      return;
    }
    setExporting(true);
    setExportStatus("جاري تجهيز الملف…");
    try {
      const data = await supabaseRest(
        `finance_daily?hotel_id=eq.${hotelId}&entry_date=gte.${fromDate}&entry_date=lte.${toDate}&order=entry_date.asc`,
        { accessToken: token }
      );
      if (!data || data.length === 0) {
        setExportStatus("لا توجد بيانات محفوظة فى الفترة دى.");
        setExporting(false);
        return;
      }
      const aoa = [
        FINANCE_EXPORT_COLUMNS.map((c) => c.header),
        ...data.map((r) => FINANCE_EXPORT_COLUMNS.map((c) => c.get(r))),
      ];
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      ws["!cols"] = FINANCE_EXPORT_COLUMNS.map(() => ({ wch: 16 }));
      if (!ws["!views"]) ws["!views"] = [{ rightToLeft: true }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, `${fromDate}_${toDate}`.slice(0, 31));
      XLSX.writeFile(wb, `finance_${fromDate}_to_${toDate}.xlsx`);
      setExportStatus(`🎯 تم تصدير ${data.length} يوم.`);
    } catch (e) {
      setExportStatus(`❌ تعذر التصدير: ${e.message}`);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div>
      <h2 style={{ fontFamily: "Fraunces, serif", fontSize: "1.3rem", marginBottom: "0.5rem" }}>History & chart</h2>

      <div style={{ ...cardStyle, marginBottom: "1rem", display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "flex-end" }}>
        <div>
          <div style={{ fontSize: "0.78rem", color: TOKENS.inkSoft, marginBottom: 4 }}>من تاريخ</div>
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} style={inputStyle} />
        </div>
        <div>
          <div style={{ fontSize: "0.78rem", color: TOKENS.inkSoft, marginBottom: 4 }}>إلى تاريخ</div>
          <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} style={inputStyle} />
        </div>
        <button onClick={exportRange} disabled={exporting} style={primaryBtn}>
          {exporting ? "جاري التصدير…" : "تصدير Excel"}
        </button>
        {exportStatus && <div style={{ fontSize: "0.8rem", color: TOKENS.inkSoft }}>{exportStatus}</div>}
      </div>

      <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", marginBottom: "1rem" }}>
        <div style={{ ...cardStyle, flex: 1, minWidth: 160 }}>
          <div style={{ fontSize: "0.75rem", color: TOKENS.inkSoft }}>إجمالى الإيرادات (آخر {chartRows.length} يوم)</div>
          <div style={{ fontSize: "1.4rem", fontWeight: 700, color: TOKENS.clean }}>{monthTotal.rev.toLocaleString()}</div>
        </div>
        <div style={{ ...cardStyle, flex: 1, minWidth: 160 }}>
          <div style={{ fontSize: "0.75rem", color: TOKENS.inkSoft }}>إجمالى المصروفات</div>
          <div style={{ fontSize: "1.4rem", fontWeight: 700, color: TOKENS.oos }}>{monthTotal.exp.toLocaleString()}</div>
        </div>
        <div style={{ ...cardStyle, flex: 1, minWidth: 160 }}>
          <div style={{ fontSize: "0.75rem", color: TOKENS.inkSoft }}>صافى الربح</div>
          <div style={{ fontSize: "1.4rem", fontWeight: 700, color: monthTotal.net >= 0 ? TOKENS.clean : TOKENS.oos }}>{monthTotal.net.toLocaleString()}</div>
        </div>
      </div>

      {chartRows.length > 0 ? (
        <div style={{ ...cardStyle, marginBottom: "1rem" }}>
          <FinanceLineChart rows={chartRows} />
        </div>
      ) : (
        <div style={{ color: TOKENS.inkSoft, marginBottom: "1rem" }}>لا توجد بيانات محفوظة بعد.</div>
      )}

      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%", fontSize: "0.8rem" }}>
          <thead>
            <tr>
              <th style={thStyle}>التاريخ</th>
              <th style={thStyle}>إجمالى الإيراد</th>
              <th style={thStyle}>إجمالى المصروفات</th>
              <th style={thStyle}>صافى اليوم</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.entry_date}>
                <td style={tdStyle}>{r.entry_date}</td>
                <td style={tdStyle}>{Number(r.revenue_total).toLocaleString()}</td>
                <td style={tdStyle}>{Number(r.expenses_total).toLocaleString()}</td>
                <td style={tdStyle}>{(Number(r.revenue_total) - Number(r.expenses_total)).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const thStyle = { textAlign: "right", padding: "4px 8px", borderBottom: `1px solid ${TOKENS.paperDim}`, color: TOKENS.inkSoft, fontWeight: 600, whiteSpace: "nowrap" };
const tdStyle = { textAlign: "right", padding: "4px 8px", borderBottom: `1px solid ${TOKENS.paperDim}`, whiteSpace: "nowrap" };

function UsersTab({ extraUsers, onAddUser, onDeleteUser, supabaseSession }) {
  const [form, setForm] = useState({ email: "", displayName: "", password: "", role: "reception" });
  const [formError, setFormError] = useState("");
  const [formNote, setFormNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [removingId, setRemovingId] = useState(null);

  const submit = async () => {
    setFormError("");
    setFormNote("");
    setSubmitting(true);
    const result = await onAddUser(form.email, form.password, form.displayName, form.role);
    setSubmitting(false);
    if (!result.ok) {
      setFormError(result.error);
      return;
    }
    const accessLabel =
      form.role === "analyst" ? "view-only analytics access" : form.role === "accountant" ? "accountant (daily finance entry) access" : "reception access";
    setFormNote(`"${form.displayName.trim()}" can now sign in with ${accessLabel} using ${form.email.trim()}.`);
    setForm({ email: "", displayName: "", password: "", role: form.role });
  };

  const remove = async (id) => {
    setRemovingId(id);
    await onDeleteUser(id, { deleteAuthUser: true });
    setRemovingId(null);
  };

  return (
    <div>
      <h2 style={{ fontFamily: "Fraunces, serif", fontSize: "1.3rem", marginBottom: "0.5rem" }}>Users</h2>
      <div style={{ fontSize: "0.85rem", color: TOKENS.inkSoft, marginBottom: "1rem" }}>
        Add staff accounts with one of three access levels: reception (Rooms, Bookings, Guests, Housekeeping, Tickets —
        same as the main reception login), analytics view-only (sees the Analytics page but can't delete any
        records, add users, or edit pricing), or accountant (daily revenue/expense entry — by form or Excel upload —
        with no access to rooms, bookings, or guest data).
      </div>

      {!supabaseSession && (
        <div style={{ fontSize: "0.8rem", color: TOKENS.dirty, background: TOKENS.dirtyBg, borderRadius: 8, padding: "0.6rem 0.8rem", marginBottom: "1rem" }}>
          You're signed in with a local/demo account. New staff can only be created here if you sign in with a real
          Supabase manager account (email + password) — otherwise there's nowhere secure to save them.
        </div>
      )}

      <div style={cardStyle}>
        <div style={{ fontWeight: 600, marginBottom: 10 }}>Add a user</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "0.75rem" }}>
          <input
            placeholder="Full name"
            value={form.displayName}
            onChange={(e) => setForm({ ...form, displayName: e.target.value })}
            style={inputStyle}
          />
          <input
            placeholder="Email"
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            style={inputStyle}
          />
        </div>
        <div style={{ marginBottom: "0.75rem" }}>
          <input
            placeholder="Password (min 8 characters)"
            type="password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            style={{ ...inputStyle, width: "100%", boxSizing: "border-box" }}
          />
        </div>
        <div style={{ display: "flex", gap: 6, marginBottom: "0.75rem" }}>
          <button
            onClick={() => setForm({ ...form, role: "reception" })}
            style={{ ...ghostBtn, flex: 1, background: form.role === "reception" ? TOKENS.paperDim : "#fff" }}
          >
            Reception access
          </button>
          <button
            onClick={() => setForm({ ...form, role: "analyst" })}
            style={{ ...ghostBtn, flex: 1, background: form.role === "analyst" ? TOKENS.paperDim : "#fff" }}
          >
            Analytics (view only)
          </button>
          <button
            onClick={() => setForm({ ...form, role: "accountant" })}
            style={{ ...ghostBtn, flex: 1, background: form.role === "accountant" ? TOKENS.paperDim : "#fff" }}
          >
            Accountant
          </button>
        </div>
        {formError && (
          <div style={{ fontSize: "0.8rem", color: TOKENS.oos, background: TOKENS.oosBg, borderRadius: 8, padding: "0.5rem 0.7rem", marginBottom: 8 }}>
            {formError}
          </div>
        )}
        {formNote && (
          <div style={{ fontSize: "0.8rem", color: TOKENS.clean, background: TOKENS.cleanBg, borderRadius: 8, padding: "0.5rem 0.7rem", marginBottom: 8 }}>
            {formNote}
          </div>
        )}
        <button onClick={submit} disabled={submitting || !supabaseSession} style={primaryBtn}>
          {submitting ? "Adding…" : "Add user"}
        </button>
      </div>

      <div style={{ fontSize: "0.75rem", color: TOKENS.brassDark, textTransform: "uppercase", letterSpacing: "0.06em", margin: "1.25rem 0 8px", fontWeight: 600 }}>
        Staff at this hotel
      </div>
      {extraUsers.length === 0 ? (
        <div style={{ color: TOKENS.inkSoft, fontSize: "0.9rem" }}>No additional staff yet — the main reception login still works.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {extraUsers.map((u) => (
            <div key={u.id} style={{ ...cardStyle, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 600 }}>{u.username}</div>
                <div style={{ fontSize: "0.78rem", color: TOKENS.inkSoft }}>
                  {u.role === "analyst"
                    ? "Analytics access (view only)"
                    : u.role === "manager"
                    ? "Manager access"
                    : u.role === "accountant"
                    ? "Accountant access (daily finance entry)"
                    : "Reception access"}
                </div>
              </div>
              <button onClick={() => remove(u.id)} disabled={removingId === u.id} style={ghostBtn}>
                {removingId === u.id ? "Removing…" : "Remove"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RoomPricingTab({ roomRates, mealPlanRates, onSave, onSaveMealPlans }) {
  const [draft, setDraft] = useState(roomRates);
  const [mealDraft, setMealDraft] = useState(mealPlanRates);
  const [saved, setSaved] = useState(false);

  const dirty = JSON.stringify(draft) !== JSON.stringify(roomRates) || JSON.stringify(mealDraft) !== JSON.stringify(mealPlanRates);

  const submit = () => {
    const cleaned = {};
    ROOM_TYPES.forEach((t) => {
      const n = Number(draft[t]);
      cleaned[t] = Number.isFinite(n) && n >= 0 ? n : roomRates[t];
    });
    const cleanedMeals = {};
    MEAL_PLANS.forEach((p) => {
      const n = Number(mealDraft[p]);
      cleanedMeals[p] = Number.isFinite(n) && n >= 0 ? n : mealPlanRates[p];
    });
    onSave(cleaned);
    onSaveMealPlans(cleanedMeals);
    setDraft(cleaned);
    setMealDraft(cleanedMeals);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div>
      <h2 style={{ fontFamily: "Fraunces, serif", fontSize: "1.3rem", marginBottom: "0.5rem" }}>Room pricing</h2>
      <div style={{ fontSize: "0.85rem", color: TOKENS.inkSoft, marginBottom: "1rem" }}>
        Set the per-person nightly rate for each room category, plus per-person add-ons for meal plans. Updating a
        price applies immediately across the app and to future revenue calculations.
      </div>

      <div style={cardStyle}>
        <div style={{ fontWeight: 600, marginBottom: 10 }}>Room categories (per person / night)</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {ROOM_TYPES.map((type) => (
            <div key={type} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <div style={{ fontWeight: 500 }}>{type}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: "0.78rem", color: TOKENS.inkSoft }}>EGP</span>
                <input
                  type="number"
                  min="0"
                  value={draft[type]}
                  onChange={(e) => setDraft({ ...draft, [type]: e.target.value })}
                  style={{ ...inputStyle, width: 100 }}
                />
                <span style={{ fontSize: "0.78rem", color: TOKENS.inkSoft }}>/ person / night</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ ...cardStyle, marginTop: 12 }}>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>Meal plans (per person / night add-on)</div>
        <div style={{ fontSize: "0.78rem", color: TOKENS.inkSoft, marginBottom: 10 }}>
          Offered when booking any room type.
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {MEAL_PLANS.map((plan) => (
            <div key={plan} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <div style={{ fontWeight: 500 }}>{plan}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: "0.78rem", color: TOKENS.inkSoft }}>EGP</span>
                <input
                  type="number"
                  min="0"
                  value={mealDraft[plan]}
                  onChange={(e) => setMealDraft({ ...mealDraft, [plan]: e.target.value })}
                  style={{ ...inputStyle, width: 100 }}
                />
                <span style={{ fontSize: "0.78rem", color: TOKENS.inkSoft }}>/ person / night</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {saved && (
        <div style={{ fontSize: "0.8rem", color: TOKENS.clean, background: TOKENS.cleanBg, borderRadius: 8, padding: "0.5rem 0.7rem", marginTop: 12 }}>
          Prices saved.
        </div>
      )}
      <button onClick={submit} disabled={!dirty} style={{ ...primaryBtn, marginTop: 12 }}>
        Save prices
      </button>
    </div>
  );
}

const cardStyle = {
  background: "#fff",
  border: `1px solid ${TOKENS.paperDim}`,
  borderRadius: 10,
  padding: "0.9rem",
  marginBottom: 8,
};

const inputStyle = {
  border: `1px solid ${TOKENS.paperDim}`,
  borderRadius: 8,
  padding: "0.5rem 0.6rem",
  fontSize: "0.85rem",
  fontFamily: "Inter, sans-serif",
  background: "#fff",
  color: TOKENS.ink,
};

const primaryBtn = {
  background: TOKENS.ink,
  color: TOKENS.paper,
  border: "none",
  borderRadius: 8,
  padding: "0.5rem 0.9rem",
  fontSize: "0.82rem",
  fontWeight: 500,
  cursor: "pointer",
};

const ghostBtn = {
  background: "transparent",
  color: TOKENS.inkSoft,
  border: `1px solid ${TOKENS.paperDim}`,
  borderRadius: 8,
  padding: "0.5rem 0.9rem",
  fontSize: "0.82rem",
  cursor: "pointer",
};

function SystemLoginGate() {
  const [role, setRole] = useState(null);
  const [loggedInUsername, setLoggedInUsername] = useState("");
  const [supabaseSession, setSupabaseSession] = useState(null);
  const [form, setForm] = useState({ username: "", password: "" });
  const [loginError, setLoginError] = useState("");
  const [checking, setChecking] = useState(false);
  const [connTest, setConnTest] = useState({ status: "idle", message: "" });

  const testConnection = async () => {
    setConnTest({ status: "testing", message: "" });
    try {
      await supabaseRest("hotels?select=id&limit=1");
      setConnTest({ status: "ok", message: "Reached your Supabase project successfully." });
    } catch (e) {
      const isNetwork = e instanceof TypeError;
      setConnTest({
        status: "error",
        message: isNetwork
          ? "Could not reach Supabase from here — the connection was blocked (likely a network/CORS restriction in this environment)."
          : `Reached Supabase, but got an error: ${e.message}`,
      });
    }
  };

  const submit = async () => {
    const typedUsername = form.username.trim();

    // 1. Try the real Supabase database first, using the typed username as an email.
    if (typedUsername.includes("@")) {
      try {
        const session = await supabaseSignIn(typedUsername, form.password);
        const staffRows = await supabaseRest(
          `staff?user_id=eq.${session.user.id}&select=role,display_name,hotel_id`,
          { accessToken: session.access_token }
        );
        const staffRow = staffRows && staffRows[0];
        if (staffRow) {
          setSupabaseSession({ ...session, hotelId: staffRow.hotel_id });
          setLoggedInUsername(staffRow.display_name || typedUsername);
          setRole(
            staffRow.role === "analyst"
              ? "analyst"
              : staffRow.role === "manager"
              ? "manager"
              : staffRow.role === "accountant"
              ? "accountant"
              : "reception"
          );
          setLoginError("");
          return;
        }
        setLoginError("Signed in, but no staff record links this account to a hotel yet.");
        return;
      } catch (e) {
        if (e instanceof TypeError) {
          // Network/CORS-level failure reaching Supabase — fall through to local accounts below.
        } else if (e.status && e.status !== 400) {
          setLoginError(`Database error: ${e.message}`);
          return;
        }
        // Wrong credentials (400) — fall through and try local accounts too.
      }
    }

    // 2. Fall back to the built-in local accounts (pre-Supabase).
    const typedHash = sha256Hex(`${typedUsername}:${form.password}`);
    if (typedHash === AUTH_SYSTEM_HASH) {
      setRole("reception");
      setLoggedInUsername(typedUsername);
      setLoginError("");
      return;
    }
    if (typedHash === AUTH_ANALYTICS_HASH) {
      setRole("manager");
      setLoggedInUsername(typedUsername);
      setLoginError("");
      return;
    }
    setChecking(true);
    try {
      const result = await window.storage.get("hotel-app-state", true);
      const extraUsers = result && result.value ? JSON.parse(result.value).extraUsers || [] : [];
      const passwordHash = sha256Hex(form.password);
      const match = extraUsers.find(
        (u) => u.username.toLowerCase() === typedUsername.toLowerCase() && u.passwordHash === passwordHash
      );
      if (match) {
        setRole(match.role === "analyst" ? "analyst" : "reception");
        setLoggedInUsername(match.username);
        setLoginError("");
      } else {
        setLoginError("Incorrect username or password.");
      }
    } catch (e) {
      setLoginError("Incorrect username or password.");
    } finally {
      setChecking(false);
    }
  };

  if (role) {
    return (
      <HotelReceptionApp
        role={role}
        username={loggedInUsername}
        supabaseSession={supabaseSession}
        onLogout={() => {
          setRole(null);
          setLoggedInUsername("");
          setSupabaseSession(null);
          setForm({ username: "", password: "" });
        }}
      />
    );
  }

  return (
    <div
      style={{
        fontFamily: "Inter, sans-serif",
        backgroundImage: `linear-gradient(rgba(10,14,26,0.55), rgba(10,14,26,0.55)), url(${loginBg})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1.5rem",
      }}
    >
      <div style={{ width: 320, maxWidth: "100%" }}>
        <div style={{ textAlign: "center", marginBottom: "1.5rem" }}>
          <div style={{ fontFamily: "Fraunces, serif", fontSize: "1.8rem", fontWeight: 600, color: "#fff", textShadow: "0 2px 12px rgba(0,0,0,0.4)" }}>
            Geisum Hotel
          </div>
          <div style={{ fontSize: "0.75rem", color: "#F0E6D2", letterSpacing: "0.08em", textTransform: "uppercase", textShadow: "0 1px 6px rgba(0,0,0,0.4)" }}>
            Reception console
          </div>
        </div>
        <div style={cardStyle}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Sign in</div>
          <div style={{ fontSize: "0.8rem", color: TOKENS.inkSoft, marginBottom: 16 }}>
            Enter your credentials to access the reception system.
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 10 }}>
            <input
              placeholder="Username"
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              style={inputStyle}
              onKeyDown={(e) => e.key === "Enter" && submit()}
            />
            <input
              placeholder="Password"
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              style={inputStyle}
              onKeyDown={(e) => e.key === "Enter" && submit()}
            />
          </div>
          {loginError && (
            <div style={{ fontSize: "0.8rem", color: TOKENS.oos, background: TOKENS.oosBg, borderRadius: 8, padding: "0.5rem 0.7rem", marginBottom: 10 }}>
              {loginError}
            </div>
          )}
          <button onClick={submit} disabled={checking} style={{ ...primaryBtn, width: "100%" }}>
            {checking ? "Signing in…" : "Sign in"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function HotelReception() {
  return <SystemLoginGate />;
}
