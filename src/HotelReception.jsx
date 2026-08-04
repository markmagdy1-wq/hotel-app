import React, { useState, useEffect, useMemo } from "react";
import loginBg from "./assets/login-bg.jpg";

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
  { key: "other", label: "Others", color: "#6B7280", bg: "#E7E9EC" },
];
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

function MonthCalendar({ year, month, onMonthChange, highlightedDates, todayIso, onDayClick, selectedDate, legendLabel, rangeStart, rangeEnd }) {
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
        {(rangeStart !== undefined || rangeEnd !== undefined) ? (
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
  const [managerTab, setManagerTab] = useState("analytics");
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
            supabaseRest(`tickets?hotel_id=eq.${hid}&order=ticket_date.desc`, { accessToken: token }),
            supabaseRest(`maintenance_log?hotel_id=eq.${hid}`, { accessToken: token }),
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
        role: userRole === "analyst" ? "analyst" : "reception",
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

  const addTicket = async ({ persons, amountPaid, date, notes }) => {
    if (supabaseSession) {
      try {
        const [inserted] = await supabaseRest("tickets", {
          accessToken: supabaseSession.access_token,
          method: "POST",
          body: {
            hotel_id: supabaseSession.hotelId,
            persons: Number(persons) || 1,
            amount_paid: Number(amountPaid) || 0,
            ticket_date: date || todayISO(),
            notes: notes || "",
            created_by: supabaseSession.user.id,
          },
        });
        setTickets((ts) => [...ts, mapTicketFromDb(inserted)]);
      } catch (e) {
        flashError(`Couldn't save ticket: ${e.message}`);
      }
      return;
    }
    const next = [
      ...tickets,
      {
        id: uid(),
        persons: Number(persons) || 1,
        amountPaid: Number(amountPaid) || 0,
        date: date || todayISO(),
        notes: notes || "",
        createdBy: username,
      },
    ];
    setTickets(next);
    persist({ tickets: next });
  };

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

  const reserveRoom = async ({ roomNumber, guestId, newGuest, checkIn: ci, checkOut: co, checkInNow, persons, mealPlans, bookingType, discountPercent, totalAmount }) => {
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
            room_id: room.id,
            guest_id: finalGuestId,
            check_in: ci,
            check_out: co,
            persons: persons || 1,
            meal_plans: mealPlans || [],
            status: checkInNow ? "checked_in" : "reserved",
            booking_type: bookingType || "booking",
            discount: discountPercent || 0,
            total_amount: totalAmount || 0,
            created_by: supabaseSession.user.id,
          },
        });
        setBookings((bs) => [...bs, mapBookingFromDb(insertedBooking, { [room.id]: roomNumber })]);
        if (checkInNow) {
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
      } catch (e) {
        flashError(`Couldn't save booking: ${e.message}`);
      }
      return;
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
          <div style={{ display: "flex", alignItems: "baseline", gap: "0.75rem" }}>
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
          {managerTab === "analytics" && (
            <AnalyticsDashboard
              rooms={rooms}
              bookings={bookings}
              maintenanceLog={maintenanceLog}
              roomRates={roomRates}
              mealPlanRates={mealPlanRates}
              tickets={tickets}
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
            <TicketRecordsTab tickets={tickets} onDeleteTicket={deleteTicket} />
          )}
          {managerTab === "todayReport" && (
            <TodayReportTab rooms={rooms} bookings={bookings} roomRates={roomRates} mealPlanRates={mealPlanRates} />
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
          <div style={{ display: "flex", alignItems: "baseline", gap: "0.75rem" }}>
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
          {managerTab === "analytics" && (
            <AnalyticsDashboard
              rooms={rooms}
              bookings={bookings}
              maintenanceLog={maintenanceLog}
              roomRates={roomRates}
              mealPlanRates={mealPlanRates}
              tickets={tickets}
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
          {managerTab === "ticketRecords" && <TicketRecordsTab tickets={tickets} />}
          {managerTab === "todayReport" && (
            <TodayReportTab rooms={rooms} bookings={bookings} roomRates={roomRates} mealPlanRates={mealPlanRates} />
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
          { id: "tickets", label: "Tickets" },
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
          />
        )}
        {tab === "tickets" && <TicketsTab tickets={tickets} onAddTicket={addTicket} />}
        {tab === "todayReport" && (
          <TodayReportTab rooms={rooms} bookings={bookings} roomRates={roomRates} mealPlanRates={mealPlanRates} />
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

function RoomsTab({ rooms, counts, onSelect, activeBookingForRoom, guestName, checkoutCounts, roomRates, bookings }) {
  const floors = [...new Set(rooms.map((r) => r.floor))].sort();
  const maintenanceCount = rooms.filter(
    (r) => (checkoutCounts[r.number] || 0) - (r.maintenanceBaseline || 0) >= MAINTENANCE_THRESHOLD
  ).length;
  return (
    <div>
      <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1.5rem", flexWrap: "wrap" }}>
        {Object.entries(STATUS_META).map(([key, meta]) => (
          <div
            key={key}
            style={{
              background: "#fff",
              border: `1px solid ${TOKENS.paperDim}`,
              borderRadius: 10,
              padding: "0.6rem 0.9rem",
              display: "flex",
              alignItems: "center",
              gap: 8,
              flex: "1 1 140px",
            }}
          >
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: meta.color }} />
            <div>
              <div style={{ fontSize: "1.1rem", fontWeight: 600, fontFamily: "Fraunces, serif" }}>
                {counts[key] || 0}
              </div>
              <div style={{ fontSize: "0.7rem", color: TOKENS.inkSoft }}>{meta.label}</div>
            </div>
          </div>
        ))}
        <div
          style={{
            background: "#fff",
            border: `1px solid ${TOKENS.oos}`,
            borderRadius: 10,
            padding: "0.6rem 0.9rem",
            display: "flex",
            alignItems: "center",
            gap: 8,
            flex: "1 1 140px",
          }}
        >
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: TOKENS.oos }} />
          <div>
            <div style={{ fontSize: "1.1rem", fontWeight: 600, fontFamily: "Fraunces, serif", color: TOKENS.oos }}>
              {maintenanceCount}
            </div>
            <div style={{ fontSize: "0.7rem", color: TOKENS.oos }}>Needs maintenance</div>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", marginBottom: "1.5rem", fontSize: "0.72rem", color: TOKENS.inkSoft }}>
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
      </div>

      {floors.map((floor) => (
        <div key={floor} style={{ marginBottom: "1.75rem" }}>
          <div
            style={{
              fontSize: "0.75rem",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: TOKENS.brassDark,
              marginBottom: "0.6rem",
              fontWeight: 600,
            }}
          >
            {floor}00 rooms
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: "0.75rem" }}>
            {rooms
              .filter((r) => r.floor === floor)
              .map((room) => {
                const meta = STATUS_META[room.status];
                const booking = activeBookingForRoom(room.number);
                const needsMaintenance = (checkoutCounts[room.number] || 0) - (room.maintenanceBaseline || 0) >= MAINTENANCE_THRESHOLD;
                const today = todayISO();
                const checkoutToday = booking && booking.checkOut === today;
                const checkinToday =
                  !booking && bookings.some((b) => b.roomNumber === room.number && b.status === "reserved" && b.checkIn === today);
                const isOccupied = room.status === "occupied";
                const needsCleaning = room.status === "vacant_dirty";
                let dotColor = meta.color;
                if (checkoutToday) dotColor = "#D9A527"; // yellow — checking out today
                else if (isOccupied) dotColor = TOKENS.oos; // red — occupied
                else if (checkinToday) dotColor = TOKENS.clean; // green — arriving today, not checked in yet
                else if (needsMaintenance) dotColor = TOKENS.dirty; // orange — needs maintenance
                else if (needsCleaning) dotColor = "#3B6FA0"; // blue — needs cleaning
                return (
                  <button
                    key={room.number}
                    onClick={() => onSelect(room)}
                    style={{
                      textAlign: "left",
                      cursor: "pointer",
                      border: "none",
                      background: "transparent",
                      padding: 0,
                      position: "relative",
                    }}
                  >
                    <div
                      title={
                        checkoutToday
                          ? "Checking out today"
                          : isOccupied
                          ? "Occupied"
                          : checkinToday
                          ? "Arriving today"
                          : needsMaintenance
                          ? "Needs maintenance"
                          : needsCleaning
                          ? "Needs cleaning"
                          : undefined
                      }
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: "50%",
                        background: dotColor,
                        border: `1px solid ${TOKENS.paperDim}`,
                        margin: "0 auto -10px",
                        position: "relative",
                        zIndex: 1,
                      }}
                    />
                    <div
                      style={{
                        background: "#fff",
                        border: `1px solid ${TOKENS.paperDim}`,
                        borderTop: `3px solid ${meta.color}`,
                        borderRadius: 10,
                        padding: "1rem 0.75rem 0.75rem",
                        boxShadow: "0 1px 2px rgba(27,36,48,0.05)",
                        position: "relative",
                      }}
                    >
                      {needsMaintenance && (
                        <span
                          title={`Checked out ${checkoutCounts[room.number]} times — due for a maintenance check`}
                          style={{
                            position: "absolute",
                            top: 8,
                            right: 8,
                            width: 8,
                            height: 8,
                            borderRadius: "50%",
                            background: TOKENS.oos,
                          }}
                        />
                      )}
                      <div style={{ fontFamily: "Fraunces, serif", fontSize: "1.3rem", fontWeight: 600 }}>
                        {room.number}
                      </div>
                      <div style={{ fontSize: "0.72rem", color: TOKENS.inkSoft, marginBottom: 2 }}>{room.type}</div>
                      <div style={{ fontSize: "0.68rem", color: TOKENS.inkSoft, marginBottom: 8 }}>{fmtMoney(getRoomRate(room, roomRates))}/night</div>
                      <Pill status={room.status} />
                      {needsMaintenance && (
                        <div style={{ fontSize: "0.68rem", color: TOKENS.oos, marginTop: 6, fontWeight: 500 }}>
                          Due for maintenance check
                        </div>
                      )}
                      {booking && (
                        <div style={{ fontSize: "0.68rem", color: TOKENS.inkSoft, marginTop: 6 }}>
                          {guestName(booking.guestId)}
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
          </div>
        </div>
      ))}
    </div>
  );
}

function RoomDrawer({ room, onClose, onSetStatus, booking, guestName, onCheckOut, checkoutCounts, onPostponeMaintenance, guests, allBookings, onReserve, roomRates, mealPlanRates }) {
  const checkoutsSinceCheck = (checkoutCounts[room.number] || 0) - (room.maintenanceBaseline || 0);
  const needsMaintenance = checkoutsSinceCheck >= MAINTENANCE_THRESHOLD;
  const canReserve = room.status === "vacant_clean" || room.status === "vacant_dirty";
  const occupancyOptions = occupancyOptionsForType(room.type);
  const showMealPlans = true;

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
    if (guestMode === "new" && (!form.name || !form.nationalId)) {
      setFormError("Guest name and national ID / passport number are required.");
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
          width: 380,
          maxWidth: "92vw",
          background: TOKENS.paper,
          height: "100%",
          padding: "1.5rem",
          overflowY: "auto",
        }}
      >
        <button
          onClick={onClose}
          style={{ border: "none", background: "none", cursor: "pointer", fontSize: "0.85rem", color: TOKENS.inkSoft, marginBottom: 12 }}
        >
          ← Close
        </button>
        <div style={{ fontFamily: "Fraunces, serif", fontSize: "2rem", fontWeight: 600 }}>{room.number}</div>
        <div style={{ color: TOKENS.inkSoft, marginBottom: 12 }}>
          {room.type} · Floor {room.floor} · {fmtMoney(getRoomRate(room, roomRates))}/night
        </div>
        <Pill status={room.status} />

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
          <div style={{ marginTop: "1.25rem", background: "#fff", borderRadius: 10, padding: "0.9rem", border: `1px solid ${TOKENS.paperDim}` }}>
            <div style={{ fontSize: "0.75rem", color: TOKENS.inkSoft, marginBottom: 4 }}>Current guest</div>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>{guestName(booking.guestId)}</div>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                fontSize: "0.7rem",
                fontWeight: 600,
                color: bookingTypeMeta(booking.bookingType).color,
                background: bookingTypeMeta(booking.bookingType).bg,
                borderRadius: 999,
                padding: "2px 8px",
                marginBottom: 8,
              }}
            >
              {bookingTypeMeta(booking.bookingType).label}
            </div>
            {booking.discountPercent > 0 && (
              <div style={{ fontSize: "0.7rem", color: TOKENS.clean, marginBottom: 8 }}>
                {booking.discountPercent}% discount applied
              </div>
            )}
            <div style={{ fontSize: "0.8rem", color: TOKENS.inkSoft, marginBottom: 10 }}>
              {fmtDate(booking.checkIn)} → {fmtDate(booking.checkOut)}
            </div>
            <button
              onClick={() => onCheckOut(booking.id)}
              style={{
                width: "100%",
                background: TOKENS.ink,
                color: TOKENS.paper,
                border: "none",
                borderRadius: 8,
                padding: "0.55rem",
                cursor: "pointer",
                fontWeight: 500,
              }}
            >
              Check out
            </button>
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
                  placeholder="National ID / passport number"
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
                <input placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} style={inputStyle} />
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

        <div style={{ marginTop: "1.5rem" }} />
      </div>
    </div>
  );
}

function BookingsTab({ bookings, allBookings, rooms, guests, guestName, onCheckIn, onCheckOut, onCancel, showNew, setShowNew, onReserve, roomRates, mealPlanRates }) {
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

  const submit = () => {
    setFormError("");
    if (!form.roomNumber || !form.checkOut) {
      setFormError("Fill in room and check-out date.");
      return;
    }
    if (guestMode === "existing" && !form.guestId) {
      setFormError("Choose a guest, or switch to \"New guest\".");
      return;
    }
    if (guestMode === "new" && (!form.name || !form.nationalId)) {
      setFormError("Guest name and national ID / passport number are required.");
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
    const clash = findConflict(allBookings, form.roomNumber, form.checkIn, form.checkOut);
    if (clash) {
      setFormError(
        `Room ${form.roomNumber} is already booked for ${guestName(clash.guestId)} from ${fmtDate(clash.checkIn)} to ${fmtDate(clash.checkOut)}. Pick different dates or another room.`
      );
      return;
    }
    onReserve({
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
      discountPercent,
      totalAmount: grossTotal,
    });
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
      discountPercent: 0,
      totalAmount: "",
    });
    setDuplicateGuestWarning("");
    setSelectingCheckout(false);
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

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <h2 style={{ fontFamily: "Fraunces, serif", fontSize: "1.3rem", margin: 0 }}>Bookings</h2>
        <button onClick={() => setShowNew(!showNew)} style={primaryBtn}>
          {showNew ? "Cancel" : "New booking"}
        </button>
      </div>

      {showNew && (
        <div style={cardStyle}>
          <div style={{ marginBottom: "0.75rem" }}>
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

          <div style={{ marginBottom: "0.75rem" }}>
            <div style={{ fontSize: "0.7rem", color: TOKENS.inkSoft, marginBottom: 4 }}>
              {selectingCheckout ? "Now click the check-out day" : "Click a day for check-in"}
            </div>
            <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", alignItems: "flex-start" }}>
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
              <div style={{ ...cardStyle, flex: "1 1 200px", minWidth: 200, margin: 0 }}>
                <div style={{ fontSize: "0.72rem", color: TOKENS.inkSoft, marginBottom: 6 }}>
                  {form.checkIn && form.checkOut
                    ? `Available rooms, ${fmtDate(form.checkIn)} → ${fmtDate(form.checkOut)}`
                    : "Pick check-in and check-out to see available rooms"}
                </div>
                {form.checkIn && form.checkOut && rangeAvailableRooms.length === 0 && (
                  <div style={{ color: TOKENS.inkSoft, fontSize: "0.8rem" }}>No rooms free for these dates.</div>
                )}
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {rangeAvailableRooms.map((r) => (
                    <button
                      key={r.number}
                      type="button"
                      onClick={() => pickRoom(r.number)}
                      style={{
                        ...ghostBtn,
                        textAlign: "left",
                        padding: "0.4rem 0.6rem",
                        background: form.roomNumber === r.number ? TOKENS.paperDim : "#fff",
                      }}
                    >
                      {r.number} · {r.type}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "0.75rem" }}>
            <div>
              <div style={{ fontSize: "0.7rem", color: TOKENS.inkSoft, marginBottom: 4 }}>Check-in</div>
              <input type="date" value={form.checkIn} onChange={(e) => setForm({ ...form, checkIn: e.target.value })} style={{ ...inputStyle, width: "100%" }} />
            </div>
            <div>
              <div style={{ fontSize: "0.7rem", color: TOKENS.inkSoft, marginBottom: 4 }}>Check-out</div>
              <input type="date" value={form.checkOut} onChange={(e) => setForm({ ...form, checkOut: e.target.value })} style={{ ...inputStyle, width: "100%" }} />
            </div>
            <select value={form.roomNumber} onChange={(e) => pickRoom(e.target.value)} style={{ ...inputStyle, gridColumn: "1 / -1" }}>
              <option value="">Room…</option>
              {roomOptions.map(({ room: r, checkingOut }) => (
                <option key={r.number} value={r.number}>
                  {r.number} · {r.type}
                  {checkingOut ? " (check out)" : ""}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: "flex", gap: 8, marginBottom: "0.75rem" }}>
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
            <select value={form.guestId} onChange={(e) => setForm({ ...form, guestId: e.target.value })} style={{ ...inputStyle, width: "100%", marginBottom: "0.75rem" }}>
              <option value="">Select guest…</option>
              {guests.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: "0.75rem" }}>
              <input placeholder="Full name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={inputStyle} />
              <input
                placeholder="National ID / passport number"
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
              <input placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} style={inputStyle} />
              <input placeholder="Email (optional)" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} style={inputStyle} />
            </div>
          )}

          {selectedRoom && (
            <div style={{ marginBottom: "0.75rem" }}>
              <div style={{ fontSize: "0.7rem", color: TOKENS.inkSoft, marginBottom: 4 }}>
                How many people ({selectedRoom.type})?
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
          )}

          {showMealPlans && (
            <div style={{ marginBottom: "0.75rem" }}>
              <div style={{ fontSize: "0.7rem", color: TOKENS.inkSoft, marginBottom: 4 }}>Meal plan</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.82rem" }}>
                  <input type="radio" name="bookingsTabMealPlan" checked={form.mealPlans.length === 0} onChange={() => selectMealPlan(null)} />
                  None
                </label>
                {GUEST_MEAL_PLAN_CHOICES.map((plan) => (
                  <label key={plan} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.82rem" }}>
                    <input type="radio" name="bookingsTabMealPlan" checked={form.mealPlans[0] === plan} onChange={() => selectMealPlan(plan)} />
                    {plan}{" "}
                    <span style={{ color: TOKENS.inkSoft, fontSize: "0.75rem" }}>
                      {FREE_MEAL_PLANS.includes(plan) ? "(no charge)" : `(+${fmtMoney((mealPlanRates && mealPlanRates[plan]) || 0)}/person/night)`}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div style={{ marginBottom: "0.75rem" }}>
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

          <div style={{ marginBottom: "0.75rem" }}>
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
            <div style={{ fontSize: "0.78rem", color: TOKENS.inkSoft, marginBottom: "0.75rem" }}>
              Total to charge: <strong style={{ color: TOKENS.ink }}>{fmtMoney(estimatedTotal)}</strong>
              {discountPercent > 0 && (
                <>
                  {" "}
                  <span style={{ textDecoration: "line-through", color: TOKENS.inkSoft }}>{fmtMoney(grossTotal)}</span>{" "}
                  <span style={{ color: TOKENS.clean }}>(−{discountPercent}%)</span>
                </>
              )}
            </div>
          )}

          {!formError && liveConflict && (
            <div style={{ fontSize: "0.8rem", color: TOKENS.dirty, background: TOKENS.dirtyBg, borderRadius: 8, padding: "0.5rem 0.7rem", marginBottom: 8 }}>
              Heads up: room {form.roomNumber} is already booked for {guestName(liveConflict.guestId)} in that window.
            </div>
          )}
          {formError && (
            <div style={{ fontSize: "0.8rem", color: TOKENS.oos, background: TOKENS.oosBg, borderRadius: 8, padding: "0.5rem 0.7rem", marginBottom: 8 }}>
              {formError}
            </div>
          )}
          <button onClick={submit} style={primaryBtn} disabled={!!liveConflict}>
            Create booking
          </button>
        </div>
      )}

      {bookings.length === 0 && !showNew && (
        <div style={{ color: TOKENS.inkSoft, fontSize: "0.9rem" }}>No upcoming or active bookings.</div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {bookings.map((b) => (
          <div key={b.id} style={{ ...cardStyle, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
            <div>
              <div style={{ fontWeight: 600 }}>
                Room {b.roomNumber} · {guestName(b.guestId)}
              </div>
              <div style={{ fontSize: "0.8rem", color: TOKENS.inkSoft, marginBottom: 4 }}>
                {fmtDate(b.checkIn)} → {fmtDate(b.checkOut)} ·{" "}
                {b.status === "checked_in" ? "In house" : "Reserved"}
              </div>
              <span
                style={{
                  display: "inline-flex",
                  fontSize: "0.68rem",
                  fontWeight: 600,
                  color: bookingTypeMeta(b.bookingType).color,
                  background: bookingTypeMeta(b.bookingType).bg,
                  borderRadius: 999,
                  padding: "2px 8px",
                }}
              >
                {bookingTypeMeta(b.bookingType).label}
              </span>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              {b.status === "reserved" && (
                <>
                  <button onClick={() => onCheckIn(b.id)} style={primaryBtn}>
                    Check in
                  </button>
                  <button onClick={() => onCancel(b.id)} style={ghostBtn}>
                    Cancel
                  </button>
                </>
              )}
              {b.status === "checked_in" && (
                <button onClick={() => onCheckOut(b.id)} style={primaryBtn}>
                  Check out
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function GuestsTab({ guests, search, setSearch, showNew, setShowNew, onCreate, bookings, rooms }) {
  const [form, setForm] = useState({ name: "", phone: "", email: "", nationalId: "", notes: "" });
  const [formError, setFormError] = useState("");
  const [expandedGuestId, setExpandedGuestId] = useState(null);

  const submit = () => {
    setFormError("");
    if (!form.name) return;
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

  const guestRoom = (guestId) => {
    const b = bookings.find((bk) => bk.guestId === guestId && bk.status === "checked_in");
    return b ? b.roomNumber : null;
  };

  const guestBookings = (guestId) =>
    bookings.filter((bk) => bk.guestId === guestId).sort((a, b) => b.checkIn.localeCompare(a.checkIn));

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: 8 }}>
        <h2 style={{ fontFamily: "Fraunces, serif", fontSize: "1.3rem", margin: 0 }}>Guests</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <input placeholder="Search guests…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ ...inputStyle, width: 180 }} />
          <button onClick={() => setShowNew(!showNew)} style={primaryBtn}>
            {showNew ? "Cancel" : "Add guest"}
          </button>
        </div>
      </div>

      {showNew && (
        <div style={cardStyle}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "0.75rem" }}>
            <input placeholder="Full name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={inputStyle} />
            <input placeholder="National ID / passport number" value={form.nationalId} onChange={(e) => setForm({ ...form, nationalId: e.target.value })} style={inputStyle} />
            <input placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} style={inputStyle} />
            <input placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} style={inputStyle} />
            <input placeholder="Notes (preferences, etc.)" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} style={{ ...inputStyle, gridColumn: "1 / -1" }} />
          </div>
          {formError && (
            <div style={{ fontSize: "0.8rem", color: TOKENS.oos, background: TOKENS.oosBg, borderRadius: 8, padding: "0.5rem 0.7rem", marginBottom: "0.75rem" }}>
              ⚠ {formError}
            </div>
          )}
          <button onClick={submit} style={primaryBtn}>
            Save guest
          </button>
        </div>
      )}

      {guests.length === 0 && <div style={{ color: TOKENS.inkSoft, fontSize: "0.9rem" }}>No guests yet.</div>}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {guests.map((g) => {
          const room = guestRoom(g.id);
          const history = guestBookings(g.id);
          const isExpanded = expandedGuestId === g.id;
          return (
            <div key={g.id} style={cardStyle}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{g.name}</div>
                  <div style={{ fontSize: "0.8rem", color: TOKENS.inkSoft }}>
                    {[g.phone, g.email].filter(Boolean).join(" · ") || "No contact info"}
                  </div>
                  {g.nationalId && (
                    <div style={{ fontSize: "0.76rem", color: TOKENS.inkSoft, marginTop: 2 }}>ID: {g.nationalId}</div>
                  )}
                  {g.notes && <div style={{ fontSize: "0.78rem", color: TOKENS.inkSoft, marginTop: 4 }}>{g.notes}</div>}
                </div>
                {room && <Pill status="occupied" />}
              </div>
              {room && <div style={{ fontSize: "0.75rem", color: TOKENS.brassDark, marginTop: 6 }}>Currently in room {room}</div>}
              <button
                onClick={() => setExpandedGuestId(isExpanded ? null : g.id)}
                style={{ ...ghostBtn, marginTop: 8, fontSize: "0.75rem", padding: "0.35rem 0.75rem" }}
              >
                {isExpanded ? "Hide reservations" : `View reservations (${history.length})`}
              </button>
              {isExpanded && (
                <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
                  {history.length === 0 && (
                    <div style={{ color: TOKENS.inkSoft, fontSize: "0.8rem" }}>No reservations on record for this guest.</div>
                  )}
                  {history.map((b) => (
                    <div key={b.id} style={{ background: TOKENS.paper, border: `1px solid ${TOKENS.paperDim}`, borderRadius: 8, padding: "0.6rem 0.75rem" }}>
                      <div style={{ fontWeight: 600, fontSize: "0.85rem" }}>
                        Room {b.roomNumber} · {fmtDate(b.checkIn)} → {fmtDate(b.checkOut)}
                      </div>
                      <div style={{ fontSize: "0.76rem", color: TOKENS.inkSoft, marginTop: 2 }}>
                        {b.status === "checked_in" ? "In house" : b.status === "checked_out" ? "Checked out" : b.status === "cancelled" ? "Cancelled" : "Reserved"}
                        {" · "}
                        {b.persons || 1} {(b.persons || 1) === 1 ? "person" : "persons"}
                        {b.mealPlans && b.mealPlans[0] ? ` · ${b.mealPlans[0]}` : ""}
                        {b.discountPercent > 0 ? ` · ${b.discountPercent}% discount` : ""}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                        <span
                          style={{
                            fontSize: "0.68rem",
                            fontWeight: 600,
                            color: bookingTypeMeta(b.bookingType).color,
                            background: bookingTypeMeta(b.bookingType).bg,
                            borderRadius: 999,
                            padding: "2px 8px",
                          }}
                        >
                          {bookingTypeMeta(b.bookingType).label}
                        </span>
                        {Number(b.totalAmount) > 0 && (
                          <span style={{ fontSize: "0.76rem", color: TOKENS.ink, fontWeight: 600 }}>{fmtMoney(Number(b.totalAmount))}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function HousekeepingTab({ rooms, username, onMarkClean, checkoutCounts, onPostponeMaintenance, activeBookingForRoom, guestName, onMarkCleanedToday }) {
  const needsCleaning = rooms.filter((r) => r.status === "vacant_dirty");
  const outOfOrder = rooms.filter((r) => r.status === "out_of_order");
  const needsMaintenance = rooms
    .filter((r) => (checkoutCounts[r.number] || 0) - (r.maintenanceBaseline || 0) >= MAINTENANCE_THRESHOLD)
    .sort((a, b) => (checkoutCounts[b.number] || 0) - (checkoutCounts[a.number] || 0));
  const today = todayISO();
  const dailyClean = rooms.filter((r) => r.status === "occupied" && r.lastCleanedDate !== today);

  return (
    <div>
      <h2 style={{ fontFamily: "Fraunces, serif", fontSize: "1.3rem", marginBottom: "1rem" }}>Housekeeping</h2>

      <div style={{ fontSize: "0.85rem", color: TOKENS.inkSoft, marginBottom: 12 }}>
        {needsCleaning.length} room{needsCleaning.length === 1 ? "" : "s"} waiting on cleaning · {dailyClean.length} occupied room{dailyClean.length === 1 ? "" : "s"} due for daily service
        {username ? ` · logging as ${username}` : ""}
      </div>

      <div style={{ fontSize: "0.75rem", color: TOKENS.occupied, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8, fontWeight: 600 }}>
        Daily cleaning — occupied rooms
      </div>
      {dailyClean.length === 0 ? (
        <div style={{ color: TOKENS.inkSoft, fontSize: "0.9rem", marginBottom: "1.5rem" }}>
          Every occupied room has been serviced today.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: "1.5rem" }}>
          {dailyClean.map((r) => {
            const b = activeBookingForRoom(r.number);
            return (
              <div key={r.number} style={{ ...cardStyle, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                <div>
                  <div style={{ fontWeight: 600 }}>
                    Room {r.number} <span style={{ fontWeight: 400, color: TOKENS.inkSoft }}>· {r.type}</span>
                  </div>
                  {b && (
                    <div style={{ fontSize: "0.78rem", color: TOKENS.inkSoft }}>
                      {guestName(b.guestId)} · staying {fmtDate(b.checkIn)} → {fmtDate(b.checkOut)}
                    </div>
                  )}
                </div>
                <button onClick={() => onMarkCleanedToday(r.number)} style={primaryBtn}>
                  Mark cleaned today
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ fontSize: "0.75rem", color: TOKENS.dirty, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8, fontWeight: 600 }}>
        Vacant rooms waiting on cleaning
      </div>
      {needsCleaning.length === 0 ? (
        <div style={{ color: TOKENS.inkSoft, fontSize: "0.9rem", marginBottom: "1.5rem" }}>All vacant rooms are clean.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: "1.5rem" }}>
          {needsCleaning.map((r) => (
            <div key={r.number} style={{ ...cardStyle, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 600 }}>
                  Room {r.number} <span style={{ fontWeight: 400, color: TOKENS.inkSoft }}>· {r.type}</span>
                </div>
                <Pill status="vacant_dirty" />
              </div>
              <button onClick={() => onMarkClean(r.number)} style={primaryBtn}>
                Mark clean
              </button>
            </div>
          ))}
        </div>
      )}

      {needsMaintenance.length > 0 && (
        <>
          <div style={{ fontSize: "0.75rem", color: TOKENS.oos, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8, fontWeight: 600 }}>
            Due for a maintenance check
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: "1.5rem" }}>
            {needsMaintenance.map((r) => (
              <div key={r.number} style={{ ...cardStyle, border: `1px solid ${TOKENS.oos}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                <div>
                  <div style={{ fontWeight: 600 }}>
                    Room {r.number} <span style={{ fontWeight: 400, color: TOKENS.inkSoft }}>· {r.type}</span>
                  </div>
                  <div style={{ fontSize: "0.75rem", color: TOKENS.inkSoft }}>
                    {(checkoutCounts[r.number] || 0) - (r.maintenanceBaseline || 0)} checkouts since last check
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span
                    style={{
                      fontSize: "0.72rem",
                      fontWeight: 500,
                      color: TOKENS.oos,
                      background: TOKENS.oosBg,
                      borderRadius: 20,
                      padding: "3px 10px",
                    }}
                  >
                    Maintenance due
                  </span>
                  <button onClick={() => onPostponeMaintenance(r.number)} style={ghostBtn}>
                    Postpone
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {outOfOrder.length > 0 && (
        <>
          <div style={{ fontSize: "0.75rem", color: TOKENS.brassDark, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8, fontWeight: 600 }}>
            Out of order
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {outOfOrder.map((r) => (
              <div key={r.number} style={cardStyle}>
                <div style={{ fontWeight: 600 }}>
                  Room {r.number} <span style={{ fontWeight: 400, color: TOKENS.inkSoft }}>· {r.type}</span>
                </div>
                <Pill status="out_of_order" />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function TicketsTab({ tickets, onAddTicket }) {
  const [form, setForm] = useState({ persons: 1, amountPaid: "", date: todayISO(), notes: "" });
  const [formError, setFormError] = useState("");

  const submit = () => {
    setFormError("");
    if (!form.persons || Number(form.persons) < 1) {
      setFormError("Enter how many persons the ticket covers.");
      return;
    }
    if (form.amountPaid === "" || Number(form.amountPaid) < 0) {
      setFormError("Enter the amount paid.");
      return;
    }
    onAddTicket({ persons: form.persons, amountPaid: form.amountPaid, date: form.date, notes: form.notes });
    setForm({ persons: 1, amountPaid: "", date: todayISO(), notes: "" });
  };

  const today = todayISO();
  const todaysTickets = tickets.filter((t) => t.date === today);
  const todaysPersons = todaysTickets.reduce((s, t) => s + t.persons, 0);
  const todaysRevenue = todaysTickets.reduce((s, t) => s + t.amountPaid, 0);

  const [recentStart, setRecentStart] = useState(todayISO());
  const [recentEnd, setRecentEnd] = useState(todayISO());
  const recentEndExclusive = addDaysISO(recentEnd, 1);
  const recentTickets = [...tickets]
    .filter((t) => t.date >= recentStart && t.date < recentEndExclusive)
    .sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div>
      <h2 style={{ fontFamily: "Fraunces, serif", fontSize: "1.3rem", marginBottom: "0.5rem" }}>Tickets</h2>
      <div style={{ fontSize: "0.85rem", color: TOKENS.inkSoft, marginBottom: "1rem" }}>
        Log walk-in / day tickets — how many people came in and how much they paid.
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "0.75rem", marginBottom: "1.5rem" }}>
        {[
          { label: "Tickets today", value: todaysTickets.length },
          { label: "Persons today", value: todaysPersons },
          { label: "Revenue today", value: fmtMoney(todaysRevenue) },
        ].map((c) => (
          <div key={c.label} style={{ background: "#fff", border: `1px solid ${TOKENS.paperDim}`, borderRadius: 10, padding: "0.9rem" }}>
            <div style={{ fontSize: "1.2rem", fontWeight: 600, fontFamily: "Fraunces, serif" }}>{c.value}</div>
            <div style={{ fontSize: "0.72rem", color: TOKENS.inkSoft }}>{c.label}</div>
          </div>
        ))}
      </div>

      <div style={cardStyle}>
        <div style={{ fontWeight: 600, marginBottom: 10 }}>New ticket</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "0.75rem" }}>
          <div>
            <div style={{ fontSize: "0.7rem", color: TOKENS.inkSoft, marginBottom: 4 }}>Persons</div>
            <input
              type="number"
              min="1"
              value={form.persons}
              onChange={(e) => setForm({ ...form, persons: e.target.value })}
              style={{ ...inputStyle, width: "100%" }}
            />
          </div>
          <div>
            <div style={{ fontSize: "0.7rem", color: TOKENS.inkSoft, marginBottom: 4 }}>Amount paid (EGP)</div>
            <input
              type="number"
              min="0"
              value={form.amountPaid}
              onChange={(e) => setForm({ ...form, amountPaid: e.target.value })}
              style={{ ...inputStyle, width: "100%" }}
            />
          </div>
          <div>
            <div style={{ fontSize: "0.7rem", color: TOKENS.inkSoft, marginBottom: 4 }}>Date</div>
            <input
              type="date"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
              style={{ ...inputStyle, width: "100%" }}
            />
          </div>
          <div>
            <div style={{ fontSize: "0.7rem", color: TOKENS.inkSoft, marginBottom: 4 }}>Notes (optional)</div>
            <input
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              style={{ ...inputStyle, width: "100%" }}
            />
          </div>
        </div>
        {formError && (
          <div style={{ fontSize: "0.8rem", color: TOKENS.oos, background: TOKENS.oosBg, borderRadius: 8, padding: "0.5rem 0.7rem", marginBottom: 8 }}>
            {formError}
          </div>
        )}
        <button onClick={submit} style={primaryBtn}>
          Add ticket
        </button>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", margin: "1.25rem 0 8px", flexWrap: "wrap", gap: 8 }}>
        <div style={{ fontSize: "0.75rem", color: TOKENS.brassDark, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>
          Recent tickets
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: "0.7rem", color: TOKENS.inkSoft, marginBottom: 4 }}>From</div>
            <input type="date" value={recentStart} onChange={(e) => setRecentStart(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <div style={{ fontSize: "0.7rem", color: TOKENS.inkSoft, marginBottom: 4 }}>To</div>
            <input type="date" value={recentEnd} onChange={(e) => setRecentEnd(e.target.value)} style={inputStyle} />
          </div>
          <button
            onClick={() => {
              setRecentStart(todayISO());
              setRecentEnd(todayISO());
            }}
            style={ghostBtn}
          >
            Today
          </button>
        </div>
      </div>
      {recentTickets.length === 0 ? (
        <div style={{ color: TOKENS.inkSoft, fontSize: "0.9rem" }}>No tickets logged in this range.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {recentTickets.map((t) => (
            <div key={t.id} style={{ ...cardStyle, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <div>
                <div style={{ fontWeight: 600 }}>
                  {t.persons} {t.persons === 1 ? "person" : "persons"} · {fmtMoney(t.amountPaid)}
                </div>
                <div style={{ fontSize: "0.78rem", color: TOKENS.inkSoft }}>
                  {fmtDate(t.date)}
                  {t.notes ? ` · ${t.notes}` : ""}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const ROOM_FILTERS = [
  { key: "active", label: "Active only" },
  { key: "all", label: "All rooms" },
  { key: "reservations", label: "Reservations" },
  { key: "checkins", label: "Check-in" },
  { key: "checkouts", label: "Check-out" },
  { key: "occupied", label: "Occupied" },
  { key: "maintenance", label: "Maintenance" },
  { key: "revenue", label: "Revenue" },
];

function AnalyticsDashboard({ rooms, bookings, maintenanceLog, onLogout, roomRates, mealPlanRates, tickets, onDeleteTicket, guestName, onDeleteBooking }) {
  const [rangeStart, setRangeStart] = useState(startOfMonthISO());
  const [rangeEnd, setRangeEnd] = useState(todayISO());
  const [calYear, setCalYear] = useState(() => Number(todayISO().slice(0, 4)));
  const [calMonth, setCalMonth] = useState(() => Number(todayISO().slice(5, 7)) - 1);

  const reservedDates = useMemo(() => {
    const set = new Set();
    bookings
      .filter((b) => b.status === "reserved" || b.status === "checked_in")
      .forEach((b) => {
        let d = b.checkIn;
        while (d < b.checkOut) {
          set.add(d);
          d = addDaysISO(d, 1);
        }
      });
    return set;
  }, [bookings]);

  const [selectedDate, setSelectedDate] = useState(null);

  const dayBookings = useMemo(() => {
    if (!selectedDate) return [];
    return bookings
      .filter((b) => b.status !== "cancelled" && b.checkIn <= selectedDate && selectedDate < b.checkOut)
      .sort((a, b) => a.roomNumber.localeCompare(b.roomNumber));
  }, [bookings, selectedDate]);

  const rangeEndExclusive = addDaysISO(rangeEnd, 1);

  const perRoom = useMemo(() => {
    return rooms.map((room) => {
      const roomBookings = bookings.filter((b) => b.roomNumber === room.number && b.status !== "cancelled");
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
  }, [rooms, bookings, maintenanceLog, rangeStart, rangeEndExclusive, roomRates, mealPlanRates]);

  const totals = perRoom.reduce(
    (acc, r) => ({
      reservations: acc.reservations + r.reservations,
      nights: acc.nights + r.nights,
      maintenance: acc.maintenance + r.maintenance,
      revenue: acc.revenue + r.revenue,
    }),
    { reservations: 0, nights: 0, maintenance: 0, revenue: 0 }
  );

  const ticketsInRange = useMemo(
    () =>
      (tickets || [])
        .filter((t) => t.date >= rangeStart && t.date < rangeEndExclusive)
        .sort((a, b) => b.date.localeCompare(a.date)),
    [tickets, rangeStart, rangeEndExclusive]
  );
  const ticketTotals = ticketsInRange.reduce(
    (acc, t) => ({ count: acc.count + 1, persons: acc.persons + t.persons, revenue: acc.revenue + t.amountPaid }),
    { count: 0, persons: 0, revenue: 0 }
  );
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

      <div style={{ marginBottom: "1.5rem" }}>
        <div style={{ fontSize: "0.75rem", color: TOKENS.brassDark, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8, fontWeight: 600 }}>
          Reservation calendar
        </div>
        <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", alignItems: "flex-start" }}>
          <MonthCalendar
            year={calYear}
            month={calMonth}
            onMonthChange={(y, m) => {
              setCalYear(y);
              setCalMonth(m);
              setSelectedDate(null);
            }}
            highlightedDates={reservedDates}
            todayIso={todayISO()}
            onDayClick={setSelectedDate}
            selectedDate={selectedDate}
          />
          <div style={{ ...cardStyle, flex: "1 1 260px", minWidth: 240, margin: 0 }}>
            {!selectedDate && (
              <div style={{ color: TOKENS.inkSoft, fontSize: "0.82rem" }}>Click a day on the calendar to see its reservations.</div>
            )}
            {selectedDate && (
              <>
                <div style={{ fontWeight: 600, marginBottom: 8 }}>{fmtDate(selectedDate)}</div>
                {dayBookings.length === 0 && (
                  <div style={{ color: TOKENS.inkSoft, fontSize: "0.82rem" }}>No reservations on this day.</div>
                )}
                {dayBookings.map((b) => (
                  <div key={b.id} style={{ padding: "0.5rem 0", borderBottom: `1px solid ${TOKENS.paperDim}` }}>
                    <div style={{ fontWeight: 600, fontSize: "0.85rem" }}>Room {b.roomNumber} · {guestName(b.guestId)}</div>
                    <div style={{ fontSize: "0.75rem", color: TOKENS.inkSoft, marginBottom: 4 }}>
                      {fmtDate(b.checkIn)} → {fmtDate(b.checkOut)} · {b.status.replace("_", " ")}
                    </div>
                    <span
                      style={{
                        display: "inline-flex",
                        fontSize: "0.66rem",
                        fontWeight: 600,
                        color: bookingTypeMeta(b.bookingType).color,
                        background: bookingTypeMeta(b.bookingType).bg,
                        borderRadius: 999,
                        padding: "2px 8px",
                      }}
                    >
                      {bookingTypeMeta(b.bookingType).label}
                    </span>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
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
                  Room {b.roomNumber} · {guestName(b.guestId)}
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

function TicketRecordsTab({ tickets, onDeleteTicket }) {
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

function TodayReportTab({ rooms, bookings, roomRates, mealPlanRates }) {
  const [reportDate, setReportDate] = useState(todayISO());
  const isToday = reportDate === todayISO();

  const roomsReadyForCheckIn = isToday ? rooms.filter((r) => r.status === "vacant_clean").length : null;
  const checkInsToday = bookings.filter((b) => b.status !== "cancelled" && b.checkIn === reportDate).length;
  const checkOutsToday = bookings.filter((b) => b.status !== "cancelled" && b.checkOut === reportDate).length;
  const occupiedToday = new Set(
    bookings
      .filter((b) => (b.status === "checked_in" || b.status === "checked_out") && b.checkIn <= reportDate && reportDate < b.checkOut)
      .map((b) => b.roomNumber)
  ).size;

  const mealPlanCounts = useMemo(() => {
    const counts = {};
    GUEST_MEAL_PLAN_CHOICES.forEach((p) => (counts[p] = 0));
    bookings
      .filter((b) => b.status !== "cancelled" && b.checkIn <= reportDate && reportDate < b.checkOut)
      .forEach((b) => {
        const plan = b.mealPlans && b.mealPlans[0];
        if (plan && counts[plan] !== undefined) counts[plan] += 1;
      });
    return counts;
  }, [bookings, reportDate]);

  const [chartStart, setChartStart] = useState(addDaysISO(todayISO(), -6));
  const [chartEnd, setChartEnd] = useState(todayISO());
  const [chartMetric, setChartMetric] = useState("checkins");
  const [chartType, setChartType] = useState("bar");

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

  return (
    <div>
      <h2 style={{ fontFamily: "Fraunces, serif", fontSize: "1.3rem", marginBottom: "1rem" }}>Today report</h2>

      <div style={{ marginBottom: "1.25rem" }}>
        <div style={{ fontSize: "0.7rem", color: TOKENS.inkSoft, marginBottom: 4 }}>Report date</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)} style={inputStyle} />
          {!isToday && (
            <button onClick={() => setReportDate(todayISO())} style={ghostBtn}>
              Today
            </button>
          )}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "0.75rem", marginBottom: "1.75rem" }}>
        {[
          { label: isToday ? "Rooms ready for check-in" : "Rooms ready for check-in (today only)", value: isToday ? roomsReadyForCheckIn : "—" },
          { label: isToday ? "Check-ins today" : "Check-ins on this day", value: checkInsToday },
          { label: isToday ? "Check-outs today" : "Check-outs on this day", value: checkOutsToday },
          { label: isToday ? "Occupied rooms today" : "Occupied rooms on this day", value: occupiedToday },
        ].map((c) => (
          <div key={c.label} style={{ background: "#fff", border: `1px solid ${TOKENS.paperDim}`, borderRadius: 10, padding: "0.9rem" }}>
            <div style={{ fontSize: "1.5rem", fontWeight: 600, fontFamily: "Fraunces, serif" }}>{c.value}</div>
            <div style={{ fontSize: "0.72rem", color: TOKENS.inkSoft }}>{c.label}</div>
          </div>
        ))}
      </div>

      <div style={{ fontSize: "0.75rem", color: TOKENS.brassDark, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8, fontWeight: 600 }}>
        Meal plan breakdown — guests on property {isToday ? "today" : "this day"}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: "0.75rem", marginBottom: "1.75rem" }}>
        {GUEST_MEAL_PLAN_CHOICES.map((plan) => (
          <div key={plan} style={{ ...cardStyle, margin: 0, textAlign: "center" }}>
            <div style={{ fontSize: "1.3rem", fontWeight: 600, fontFamily: "Fraunces, serif" }}>{mealPlanCounts[plan] || 0}</div>
            <div style={{ fontSize: "0.72rem", color: TOKENS.inkSoft }}>{plan}</div>
          </div>
        ))}
      </div>

      <div style={{ fontSize: "0.75rem", color: TOKENS.brassDark, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8, fontWeight: 600 }}>
        Trends
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "flex-end", marginBottom: "1rem", flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: "0.7rem", color: TOKENS.inkSoft, marginBottom: 4 }}>From</div>
          <input type="date" value={chartStart} onChange={(e) => setChartStart(e.target.value)} style={inputStyle} />
        </div>
        <div>
          <div style={{ fontSize: "0.7rem", color: TOKENS.inkSoft, marginBottom: 4 }}>To</div>
          <input type="date" value={chartEnd} onChange={(e) => setChartEnd(e.target.value)} style={inputStyle} />
        </div>
        <div>
          <div style={{ fontSize: "0.7rem", color: TOKENS.inkSoft, marginBottom: 4 }}>Metric</div>
          <select value={chartMetric} onChange={(e) => setChartMetric(e.target.value)} style={inputStyle}>
            {CHART_METRICS.map((m) => (
              <option key={m.key} value={m.key}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <div style={{ fontSize: "0.7rem", color: TOKENS.inkSoft, marginBottom: 4 }}>Chart type</div>
          <select value={chartType} onChange={(e) => setChartType(e.target.value)} style={inputStyle}>
            <option value="bar">Bar</option>
            <option value="line">Line</option>
          </select>
        </div>
      </div>
      <div style={{ ...cardStyle, margin: 0 }}>
        <SimpleChart series={chartSeries} type={chartType} />
      </div>
    </div>
  );
}

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
    const accessLabel = form.role === "analyst" ? "view-only analytics access" : "reception access";
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
        Add staff accounts with one of two access levels: reception (Rooms, Bookings, Guests, Housekeeping, Tickets —
        same as the main reception login) or analytics view-only (sees the Analytics page but can't delete any
        records, add users, or edit pricing).
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
                  {u.role === "analyst" ? "Analytics access (view only)" : u.role === "manager" ? "Manager access" : "Reception access"}
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
          setRole(staffRow.role === "analyst" ? "analyst" : staffRow.role === "manager" ? "manager" : "reception");
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
