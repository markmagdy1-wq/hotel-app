import React, { useState, useEffect, useMemo } from "react";

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
};

const STATUS_META = {
  vacant_clean: { label: "Vacant · clean", color: TOKENS.clean, bg: TOKENS.cleanBg },
  vacant_dirty: { label: "Vacant · needs cleaning", color: TOKENS.dirty, bg: TOKENS.dirtyBg },
  occupied: { label: "Occupied", color: TOKENS.occupied, bg: TOKENS.occupiedBg },
  out_of_order: { label: "Out of order", color: TOKENS.oos, bg: TOKENS.oosBg },
};

const ROOM_TYPES = ["One Bedroom", "Two Bedrooms", "Three Bedrooms"];
const ROOM_RATES = { "One Bedroom": 500, "Two Bedrooms": 400, "Three Bedrooms": 350 }; // per person, per night
const MEAL_PLANS = ["HB", "FB", "All-inclusive"];
const MEAL_PLAN_RATES = { HB: 150, FB: 250, "All-inclusive": 400 }; // per person, per night add-on
const MAINTENANCE_THRESHOLD = 3;
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
      const type = i <= 2 ? "One Bedroom" : i <= 4 ? "Two Bedrooms" : "Three Bedrooms";
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
  if (type === "One Bedroom") return [1, 2];
  if (type === "Two Bedrooms") return [1, 2, 3];
  if (type === "Three Bedrooms") return [1, 2, 3];
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
  }, []);

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
  const updateRoomRates = (next) => {
    setRoomRates(next);
    persist({ roomRates: next });
  };
  const updateMealPlanRates = (next) => {
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

  const addTicket = ({ persons, amountPaid, date, notes }) => {
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

  const deleteTicket = (id) => {
    const next = tickets.filter((t) => t.id !== id);
    setTickets(next);
    persist({ tickets: next });
  };

  const setRoomStatus = (number, status, notes) => {
    const next = rooms.map((r) =>
      r.number === number ? { ...r, status, notes: notes !== undefined ? notes : r.notes } : r
    );
    updateRooms(next);
    if (selectedRoom && selectedRoom.number === number) {
      setSelectedRoom({ ...selectedRoom, status, notes: notes !== undefined ? notes : selectedRoom.notes });
    }
  };

  const postponeMaintenance = (number) => {
    const currentCount = bookings.filter((b) => b.roomNumber === number && b.status === "checked_out").length;
    const nextRooms = rooms.map((r) => (r.number === number ? { ...r, maintenanceBaseline: currentCount } : r));
    const nextLog = [...maintenanceLog, { id: uid(), roomNumber: number, date: todayISO() }];
    setRooms(nextRooms);
    setMaintenanceLog(nextLog);
    persist({ rooms: nextRooms, maintenanceLog: nextLog });
    if (selectedRoom && selectedRoom.number === number) {
      setSelectedRoom({ ...selectedRoom, maintenanceBaseline: currentCount });
    }
  };

  const markCleanedToday = (number) => {
    const next = rooms.map((r) => (r.number === number ? { ...r, lastCleanedDate: todayISO() } : r));
    updateRooms(next);
  };

  const activeBookingForRoom = (number) =>
    bookings.find((b) => b.roomNumber === number && b.status === "checked_in");

  const guestName = (guestId) => guests.find((g) => g.id === guestId)?.name || "Unknown guest";

  const checkIn = (bookingId) => {
    const booking = bookings.find((b) => b.id === bookingId);
    if (!booking) return;
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

  const checkOut = (bookingId) => {
    const booking = bookings.find((b) => b.id === bookingId);
    if (!booking) return;
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

  const cancelBooking = (bookingId) => {
    const nextBookings = bookings.map((b) =>
      b.id === bookingId ? { ...b, status: "cancelled" } : b
    );
    updateBookings(nextBookings);
  };

  const deleteBookingRecord = (bookingId) => {
    const nextBookings = bookings.filter((b) => b.id !== bookingId);
    updateBookings(nextBookings);
  };

  const reserveRoom = ({ roomNumber, guestId, newGuest, checkIn: ci, checkOut: co, checkInNow, persons, mealPlans }) => {
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
              The Front Desk
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
            { id: "users", label: "Users" },
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
          {managerTab === "users" && (
            <UsersTab
              extraUsers={extraUsers}
              onAddUser={addUser}
              onDeleteUser={deleteUser}
              supabaseSession={supabaseSession}
            />
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
              The Front Desk
            </span>
            <span style={{ fontSize: "0.75rem", color: TOKENS.brass, letterSpacing: "0.08em", textTransform: "uppercase" }}>
              Analytics · view only
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
        <main style={{ padding: "1.5rem", maxWidth: 1100, margin: "0 auto" }}>
          <AnalyticsDashboard
            rooms={rooms}
            bookings={bookings}
            maintenanceLog={maintenanceLog}
            roomRates={roomRates}
            mealPlanRates={mealPlanRates}
            tickets={tickets}
            guestName={guestName}
          />
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
            The Front Desk
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
            onCreate={(b) => {
              updateBookings([...bookings, { ...b, createdBy: username }]);
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
              updateGuests([...guests, g]);
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

function RoomsTab({ rooms, counts, onSelect, activeBookingForRoom, guestName, checkoutCounts, roomRates }) {
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
            Floor {floor}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: "0.75rem" }}>
            {rooms
              .filter((r) => r.floor === floor)
              .map((room) => {
                const meta = STATUS_META[room.status];
                const booking = activeBookingForRoom(room.number);
                const needsMaintenance = (checkoutCounts[room.number] || 0) - (room.maintenanceBaseline || 0) >= MAINTENANCE_THRESHOLD;
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
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: "50%",
                        background: TOKENS.paperDim,
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
  const showMealPlans = room.type === "Two Bedrooms";

  const [guestMode, setGuestMode] = useState(guests.length ? "existing" : "new");
  const [form, setForm] = useState({
    guestId: "",
    name: "",
    phone: "",
    email: "",
    nationalId: "",
    checkIn: todayISO(),
    checkOut: addDaysISO(todayISO(), 1),
    checkInNow: true,
    persons: occupancyOptions[0],
    mealPlans: [],
  });
  const [formError, setFormError] = useState("");

  const nights = form.checkOut > form.checkIn ? Math.round((new Date(form.checkOut) - new Date(form.checkIn)) / 86400000) : 0;
  const estimatedTotal =
    nights * form.persons * (getRoomRate(room, roomRates) + mealPlanSurcharge(form.mealPlans, mealPlanRates));

  const toggleMealPlan = (plan) => {
    setForm((f) => ({
      ...f,
      mealPlans: f.mealPlans.includes(plan) ? f.mealPlans.filter((p) => p !== plan) : [...f.mealPlans, plan],
    }));
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
            <div style={{ fontWeight: 600, marginBottom: 8 }}>{guestName(booking.guestId)}</div>
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
                <input placeholder="National ID / passport number" value={form.nationalId} onChange={(e) => setForm({ ...form, nationalId: e.target.value })} style={inputStyle} />
                <input placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} style={inputStyle} />
                <input placeholder="Email (optional)" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} style={inputStyle} />
              </div>
            )}

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
                  {MEAL_PLANS.map((plan) => (
                    <label key={plan} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.82rem" }}>
                      <input type="checkbox" checked={form.mealPlans.includes(plan)} onChange={() => toggleMealPlan(plan)} />
                      {plan} <span style={{ color: TOKENS.inkSoft, fontSize: "0.75rem" }}>(+{fmtMoney(mealPlanRates[plan] || 0)}/person/night)</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {nights > 0 && (
              <div style={{ fontSize: "0.78rem", color: TOKENS.inkSoft, marginBottom: 8 }}>
                Estimated total: <strong style={{ color: TOKENS.ink }}>{fmtMoney(estimatedTotal)}</strong> for {nights} {nights === 1 ? "night" : "nights"}
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

        <div style={{ marginTop: "1.5rem" }}>
          <div style={{ fontSize: "0.75rem", color: TOKENS.inkSoft, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Set status
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {Object.entries(STATUS_META).map(([key, meta]) => (
              <button
                key={key}
                onClick={() => onSetStatus(key)}
                disabled={room.status === key}
                style={{
                  textAlign: "left",
                  border: `1px solid ${room.status === key ? meta.color : TOKENS.paperDim}`,
                  background: room.status === key ? meta.bg : "#fff",
                  borderRadius: 8,
                  padding: "0.55rem 0.75rem",
                  cursor: room.status === key ? "default" : "pointer",
                  fontSize: "0.85rem",
                  color: room.status === key ? meta.color : TOKENS.ink,
                }}
              >
                {meta.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function BookingsTab({ bookings, allBookings, rooms, guests, guestName, onCheckIn, onCheckOut, onCancel, showNew, setShowNew, onCreate, roomRates, mealPlanRates }) {
  const [form, setForm] = useState({ roomNumber: "", guestId: "", checkIn: todayISO(), checkOut: "", persons: 1, mealPlans: [] });
  const [formError, setFormError] = useState("");

  const availableRooms = rooms.filter((r) => r.status !== "out_of_order");
  const selectedRoom = rooms.find((r) => r.number === form.roomNumber);
  const occupancyOptions = selectedRoom ? occupancyOptionsForType(selectedRoom.type) : [1];
  const showMealPlans = selectedRoom && selectedRoom.type === "Two Bedrooms";

  const pickRoom = (roomNumber) => {
    const room = rooms.find((r) => r.number === roomNumber);
    const opts = room ? occupancyOptionsForType(room.type) : [1];
    setForm({ ...form, roomNumber, persons: opts[0], mealPlans: [] });
  };

  const toggleMealPlan = (plan) => {
    setForm((f) => ({
      ...f,
      mealPlans: f.mealPlans.includes(plan) ? f.mealPlans.filter((p) => p !== plan) : [...f.mealPlans, plan],
    }));
  };

  const submit = () => {
    setFormError("");
    if (!form.roomNumber || !form.guestId || !form.checkOut) {
      setFormError("Fill in room, guest, and check-out date.");
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
    onCreate({
      id: uid(),
      roomNumber: form.roomNumber,
      guestId: form.guestId,
      checkIn: form.checkIn,
      checkOut: form.checkOut,
      persons: form.persons,
      partySize: form.persons,
      mealPlans: showMealPlans ? form.mealPlans : [],
      status: "reserved",
    });
    setForm({ roomNumber: "", guestId: "", checkIn: todayISO(), checkOut: "", persons: 1, mealPlans: [] });
  };

  const liveConflict =
    form.roomNumber && form.checkIn && form.checkOut && form.checkOut > form.checkIn
      ? findConflict(allBookings, form.roomNumber, form.checkIn, form.checkOut)
      : null;

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
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "0.75rem" }}>
            <select value={form.roomNumber} onChange={(e) => pickRoom(e.target.value)} style={inputStyle}>
              <option value="">Room…</option>
              {availableRooms.map((r) => (
                <option key={r.number} value={r.number}>
                  {r.number} · {r.type}
                </option>
              ))}
            </select>
            <select value={form.guestId} onChange={(e) => setForm({ ...form, guestId: e.target.value })} style={inputStyle}>
              <option value="">Guest…</option>
              {guests.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
            <input type="date" value={form.checkIn} onChange={(e) => setForm({ ...form, checkIn: e.target.value })} style={inputStyle} />
            <input type="date" value={form.checkOut} onChange={(e) => setForm({ ...form, checkOut: e.target.value })} style={inputStyle} />
          </div>

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
                {MEAL_PLANS.map((plan) => (
                  <label key={plan} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.82rem" }}>
                    <input type="checkbox" checked={form.mealPlans.includes(plan)} onChange={() => toggleMealPlan(plan)} />
                    {plan} <span style={{ color: TOKENS.inkSoft, fontSize: "0.75rem" }}>(+{fmtMoney((mealPlanRates && mealPlanRates[plan]) || 0)}/person/night)</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {guests.length === 0 && (
            <div style={{ fontSize: "0.8rem", color: TOKENS.dirty, marginBottom: 8 }}>Add a guest first, on the Guests tab.</div>
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
              <div style={{ fontSize: "0.8rem", color: TOKENS.inkSoft }}>
                {fmtDate(b.checkIn)} → {fmtDate(b.checkOut)} ·{" "}
                {b.status === "checked_in" ? "In house" : "Reserved"}
              </div>
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

  const submit = () => {
    if (!form.name) return;
    onCreate({ id: uid(), ...form });
    setForm({ name: "", phone: "", email: "", nationalId: "", notes: "" });
  };

  const guestRoom = (guestId) => {
    const b = bookings.find((bk) => bk.guestId === guestId && bk.status === "checked_in");
    return b ? b.roomNumber : null;
  };

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
          <button onClick={submit} style={primaryBtn}>
            Save guest
          </button>
        </div>
      )}

      {guests.length === 0 && <div style={{ color: TOKENS.inkSoft, fontSize: "0.9rem" }}>No guests yet.</div>}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {guests.map((g) => {
          const room = guestRoom(g.id);
          return (
            <div key={g.id} style={cardStyle}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
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

  const recentTickets = [...tickets].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 25);

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

      <div style={{ fontSize: "0.75rem", color: TOKENS.brassDark, textTransform: "uppercase", letterSpacing: "0.06em", margin: "1.25rem 0 8px", fontWeight: 600 }}>
        Recent tickets
      </div>
      {recentTickets.length === 0 ? (
        <div style={{ color: TOKENS.inkSoft, fontSize: "0.9rem" }}>No tickets logged yet.</div>
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

function AnalyticsDashboard({ rooms, bookings, maintenanceLog, onLogout, roomRates, mealPlanRates, tickets, onDeleteTicket, guestName, onDeleteBooking }) {
  const [rangeStart, setRangeStart] = useState(startOfMonthISO());
  const [rangeEnd, setRangeEnd] = useState(todayISO());

  const applyPreset = (preset) => {
    const today = todayISO();
    if (preset === "today") {
      setRangeStart(today);
      setRangeEnd(today);
    } else if (preset === "week") {
      setRangeStart(addDaysISO(today, -6));
      setRangeEnd(today);
    } else if (preset === "month") {
      setRangeStart(startOfMonthISO());
      setRangeEnd(today);
    }
  };

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
        const persons = b.persons || 1;
        const nightlyPerPerson = perPersonRate + mealPlanSurcharge(b.mealPlans, mealPlanRates);
        return sum + bNights * persons * nightlyPerPerson;
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

  const reservationsInRange = useMemo(
    () =>
      bookings
        .filter((b) => b.checkIn >= rangeStart && b.checkIn < rangeEndExclusive)
        .sort((a, b) => b.checkIn.localeCompare(a.checkIn)),
    [bookings, rangeStart, rangeEndExclusive]
  );

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

      <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
        <button onClick={() => applyPreset("today")} style={ghostBtn}>Today</button>
        <button onClick={() => applyPreset("week")} style={ghostBtn}>Last 7 days</button>
        <button onClick={() => applyPreset("month")} style={ghostBtn}>This month</button>
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

      <div style={{ overflowX: "auto", marginBottom: "1.75rem" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${TOKENS.paperDim}`, textAlign: "left" }}>
              <th style={{ padding: "0.5rem 0.4rem", color: TOKENS.inkSoft, fontWeight: 500 }}>Room</th>
              <th style={{ padding: "0.5rem 0.4rem", color: TOKENS.inkSoft, fontWeight: 500 }}>Type</th>
              <th style={{ padding: "0.5rem 0.4rem", color: TOKENS.inkSoft, fontWeight: 500 }}>Reservations</th>
              <th style={{ padding: "0.5rem 0.4rem", color: TOKENS.inkSoft, fontWeight: 500 }}>Nights occupied</th>
              <th style={{ padding: "0.5rem 0.4rem", color: TOKENS.inkSoft, fontWeight: 500 }}>Maintenance</th>
              <th style={{ padding: "0.5rem 0.4rem", color: TOKENS.inkSoft, fontWeight: 500 }}>Revenue</th>
            </tr>
          </thead>
          <tbody>
            {perRoom.map((r) => (
              <tr key={r.room.number} style={{ borderBottom: `1px solid ${TOKENS.paperDim}` }}>
                <td style={{ padding: "0.5rem 0.4rem", fontWeight: 600 }}>{r.room.number}</td>
                <td style={{ padding: "0.5rem 0.4rem", color: TOKENS.inkSoft }}>{r.room.type}</td>
                <td style={{ padding: "0.5rem 0.4rem" }}>{r.reservations}</td>
                <td style={{ padding: "0.5rem 0.4rem" }}>{r.nights}</td>
                <td style={{ padding: "0.5rem 0.4rem" }}>{r.maintenance}</td>
                <td style={{ padding: "0.5rem 0.4rem" }}>{fmtMoney(r.revenue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ fontSize: "0.75rem", color: TOKENS.brassDark, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8, fontWeight: 600 }}>
        Reservation records in range
      </div>
      {reservationsInRange.length === 0 ? (
        <div style={{ color: TOKENS.inkSoft, fontSize: "0.9rem", marginBottom: "1.5rem" }}>No reservations starting in this range.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: "1.5rem" }}>
          {reservationsInRange.map((b) => (
            <div key={b.id} style={{ ...cardStyle, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <div>
                <div style={{ fontWeight: 600 }}>
                  Room {b.roomNumber} · {guestName(b.guestId)}
                </div>
                <div style={{ fontSize: "0.78rem", color: TOKENS.inkSoft }}>
                  {fmtDate(b.checkIn)} → {fmtDate(b.checkOut)} ·{" "}
                  {b.status === "checked_in" ? "In house" : b.status === "checked_out" ? "Checked out" : b.status === "cancelled" ? "Cancelled" : "Reserved"}
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
          Offered when booking a Two Bedrooms room.
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
        background: TOKENS.paper,
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1.5rem",
      }}
    >
      <div style={{ width: 320, maxWidth: "100%" }}>
        <div style={{ textAlign: "center", marginBottom: "1.5rem" }}>
          <div style={{ fontFamily: "Fraunces, serif", fontSize: "1.8rem", fontWeight: 600, color: TOKENS.ink }}>
            The Front Desk
          </div>
          <div style={{ fontSize: "0.75rem", color: TOKENS.brassDark, letterSpacing: "0.08em", textTransform: "uppercase" }}>
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
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${TOKENS.paperDim}` }}>
            <button
              onClick={testConnection}
              disabled={connTest.status === "testing"}
              style={{ ...ghostBtn, width: "100%", fontSize: "0.75rem" }}
            >
              {connTest.status === "testing" ? "Testing…" : "Test database connection"}
            </button>
            {connTest.status === "ok" && (
              <div style={{ fontSize: "0.75rem", color: TOKENS.clean, background: TOKENS.cleanBg, borderRadius: 8, padding: "0.5rem 0.7rem", marginTop: 8 }}>
                {connTest.message}
              </div>
            )}
            {connTest.status === "error" && (
              <div style={{ fontSize: "0.75rem", color: TOKENS.oos, background: TOKENS.oosBg, borderRadius: 8, padding: "0.5rem 0.7rem", marginTop: 8 }}>
                {connTest.message}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function HotelReception() {
  return <SystemLoginGate />;
}
