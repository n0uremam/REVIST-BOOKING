(function () {
  "use strict";

  // =======================
  // BRANCHES (ONLINE)
  // =======================
  const BRANCHES = [
    { key: "Nasr",    nameAr: "مدينة نصر",     nameEn: "Nasr City",     api: "https://script.google.com/macros/s/AKfycbxwal_GJHeIhqhbFojUyt6a2yI8MKtwS0tg-YoPavgPF1rluPmzIElk9on9Uoxi1lpcDg/exec", enabled: true },
    { key: "AUC",     nameAr: "التجمع الخامس", nameEn: "AUC",           api: "https://script.google.com/macros/s/AKfycbwibhM0RPkWsKkUJQ9My0ycfHhS9oo6PoEZ5sWlZByB8sT7n-QLMVqUsIYU4BoR59Lr4A/exec", enabled: true },
    { key: "Maadi",   nameAr: "المعادي",       nameEn: "Maadi",         api: "https://script.google.com/macros/s/AKfycbyCBr6FPYhjTbndMvUCYNCSq9UseDPcbPQQLdol9KPTJnnnk1JXEi4DyW_bDrlYXylT1Q/exec", enabled: true },
    { key: "Zayed",   nameAr: "الشيخ زايد",    nameEn: "Sheikh Zayed",  api: "https://script.google.com/macros/s/AKfycbymxUsSnwd7zYejyhiwuzuafJ9pfIzYqDTpOc9WIR-I3pMCMuJZ4a5XqPlyYmYTzmtv/exec", enabled: true },
    { key: "October", nameAr: "٦ أكتوبر",      nameEn: "6th October",   api: "https://script.google.com/macros/s/AKfycbySjCDtGsHh94ukD1XpHVWwiqXc7kzdQoAVEQyCnf66cI6-NhIYbnLWnYNK63XmWLiaqQ/exec", enabled: true },
  ].filter(b => b.enabled);

  const DEFAULT_DAYS = 30;
  const AV_CACHE_TTL_MS = 60 * 1000;
  const PRELOAD_PHONE = "01000000000";

  // ===== UI =====
  const ruleText = document.getElementById("ruleText");

  const phoneEl = document.getElementById("phone");
  const phonePill = document.getElementById("phonePill");

  const bookingBranchEl = document.getElementById("bookingBranch");

  const preloadDot = document.getElementById("preloadDot");
  const preloadText = document.getElementById("preloadText");

  const sourceBadge = document.getElementById("sourceBadge");
  const sourceBranchName = document.getElementById("sourceBranchName");

  const cName = document.getElementById("cName");
  const cModel = document.getElementById("cModel");
  const cColor = document.getElementById("cColor");
  const cYear = document.getElementById("cYear");
  const cFilm = document.getElementById("cFilm");

  const calendarGrid = document.getElementById("calendarGrid");
  const calNote = document.getElementById("calNote");
  const pickedDate = document.getElementById("pickedDate");

  const prevBtn = document.getElementById("prevBtn");
  const nextBtn = document.getElementById("nextBtn");

  const notesEl = document.getElementById("notes");
  const submitBtn = document.getElementById("submitBtn");
  const toast = document.getElementById("toast");

  const langToggle = document.getElementById("langToggle");
  const langToggleText = document.getElementById("langToggleText");

  // ===== State =====
  let lang = "ar";
  let selectedISO = "";
  let customerFound = false;

  let minISO = "";
  let currentStartISO = "";

  // Cache availability per branch + startISO
  const avCache = new Map(); // startISO => {ts, byBranch}

  // =======================
  // Helpers
  // =======================
  function t(en, ar){ return lang === "en" ? en : ar; }

  function toastMsg(msg) {
    toast.textContent = msg;
    toast.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => toast.classList.remove("show"), 3600);
  }

  function setPreloadStatus(state) {
    preloadDot.classList.remove("ok", "bad");
    if (state === "ok") preloadDot.classList.add("ok");
    if (state === "bad") preloadDot.classList.add("bad");
  }

  function normEgyptPhone(p) {
    const d = String(p || "").replace(/\D/g, "");
    let local = d.startsWith("20") ? d.slice(2) : d;
    if (local.length === 10 && local.startsWith("1")) local = "0" + local;
    if (local.length !== 11) return "";
    if (!/^01[0125]\d{8}$/.test(local)) return "";
    return local;
  }

  function isoDate(d) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  function addDaysISO(iso, days) {
    const [y, m, d] = iso.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() + days);
    return isoDate(dt);
  }

  async function fetchWithTimeout(url, options, ms) {
    const ctrl = new AbortController();
    const tmr = setTimeout(() => ctrl.abort(), ms);
    try {
      return await fetch(url, { ...options, signal: ctrl.signal, cache: "no-store" });
    } finally {
      clearTimeout(tmr);
    }
  }

  // ✅ Robust JSON fetch: detect HTML/non-JSON and show a clear message
async function apiGet(branch, params, retryOnce) {
  const url = branch.api + (branch.api.includes("?") ? "&" : "?") + params;

  let r;
  try {
    r = await fetchWithTimeout(url, { method: "GET" }, 15000);
  } catch (e) {
    if (!retryOnce) return apiGet(branch, params, true);
    throw new Error(`${branch.key} network/timeout`);
  }

  const text = await r.text();
  const ct = (r.headers.get("content-type") || "").toLowerCase();
  const looksHtml = ct.includes("text/html") || /^\s*</.test(text);

  if (!r.ok) throw new Error(`${branch.key} HTTP ${r.status}`);

  if (looksHtml) {
    const preview = text.replace(/\s+/g, " ").slice(0, 140);
    throw new Error(`${branch.key} returned HTML (NOT JSON). Preview: ${preview}`);
  }

  try { return JSON.parse(text); }
  catch (e) {
    const preview = text.replace(/\s+/g, " ").slice(0, 140);
    throw new Error(`${branch.key} invalid JSON. Preview: ${preview}`);
  }
}

async function apiCreate(branch, payload) {
  const qs = new URLSearchParams({
    action: "create",
    phone: payload.phone,
    bookingDate: payload.bookingDate,
    notes: payload.notes || ""
  }).toString();

  return await apiGet(branch, qs);
}

    const text = await r.text();
    const ct = (r.headers.get("content-type") || "").toLowerCase();
    const looksHtml = ct.includes("text/html") || /^\s*</.test(text);

    if (!r.ok) throw new Error(`${branch.key} HTTP ${r.status}`);

    if (looksHtml) {
      const preview = text.replace(/\s+/g, " ").slice(0, 120);
      throw new Error(`${branch.key} POST returned HTML (NOT JSON).\nPreview: ${preview}`);
    }

    try {
      return JSON.parse(text);
    } catch (e) {
      const preview = text.replace(/\s+/g, " ").slice(0, 140);
      throw new Error(`${branch.key} invalid JSON (POST).\nPreview: ${preview}`);
    }
  }

  function resetCustomerUI() {
    cName.textContent = "—";
    cModel.textContent = "—";
    cColor.textContent = "—";
    cYear.textContent = "—";
    cFilm.textContent = "—";
    customerFound = false;
    if (sourceBadge) sourceBadge.style.display = "none";
    if (sourceBranchName) sourceBranchName.textContent = "—";
    submitBtn.disabled = true;
  }

  function setCustomerUI(c, sourceBranch) {
    cName.textContent = c.name || "—";
    cModel.textContent = c.carModel || "—";
    cColor.textContent = c.carColor || "—";
    cYear.textContent = c.carYear || "—";
    cFilm.textContent = c.filmType || "—";
    customerFound = true;

    if (sourceBranch && sourceBadge && sourceBranchName) {
      sourceBadge.style.display = "flex";
      sourceBranchName.textContent = (lang === "en" ? sourceBranch.nameEn : sourceBranch.nameAr);
    }
  }

  function resetCalendarUI(note) {
    calendarGrid.innerHTML = "";
    calNote.textContent = note || "—";
    selectedISO = "";
    pickedDate.textContent = "—";
    submitBtn.disabled = true;
  }

  function updateSubmitEnabled() {
    submitBtn.disabled = !(customerFound && selectedISO);
  }

  function cacheGet_() {
    const x = avCache.get(currentStartISO);
    if (!x) return null;
    if (Date.now() - x.ts > AV_CACHE_TTL_MS) return null;
    return x.byBranch;
  }

  function cacheSet_(byBranch) {
    avCache.set(currentStartISO, { ts: Date.now(), byBranch });
  }

  function cacheDrop_() {
    avCache.delete(currentStartISO);
  }

  function getSelectedBookingBranch() {
    const key = bookingBranchEl ? bookingBranchEl.value : "Nasr";
    return BRANCHES.find(b => b.key === key) || BRANCHES[0];
  }

  function fillBookingBranches() {
    if (!bookingBranchEl) return;
    const keep = bookingBranchEl.value || "Nasr";
    bookingBranchEl.innerHTML = "";
    BRANCHES.forEach(b => {
      const opt = document.createElement("option");
      opt.value = b.key;
      opt.textContent = (lang === "en" ? b.nameEn : b.nameAr);
      bookingBranchEl.appendChild(opt);
    });
    bookingBranchEl.value = keep;
  }

  function translateDOM() {
    document.documentElement.lang = lang;
    document.documentElement.dir = (lang === "ar") ? "rtl" : "ltr";

    const trans = document.querySelectorAll("[data-en]");
    trans.forEach(el => {
      const v = el.dataset[lang];
      if (v != null) el.textContent = v;
    });

    document.querySelectorAll("[data-en-placeholder]").forEach(el => {
      const ph = (lang === "en" ? el.dataset.enPlaceholder : el.dataset.arPlaceholder);
      if (ph != null) el.setAttribute("placeholder", ph);
    });

    langToggleText.textContent = (lang === "ar") ? "EN" : "AR";
    fillBookingBranches();
  }

  function weekdayName(dt) {
    return (lang === "en")
      ? ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][dt.getDay()]
      : ["الأحد","الاثنين","الثلاثاء","الأربعاء","الخميس","الجمعة","السبت"][dt.getDay()];
  }

  function renderCalendarForBranch(avail, branch) {
    const days = (avail && avail.days) || [];
    if (!days.length) {
      resetCalendarUI(t("No days available", "لا توجد أيام"));
      return;
    }

    const branchName = (lang === "en" ? branch.nameEn : branch.nameAr);
    calNote.textContent = t(
      `Booking branch: ${branchName} — from ${days[0].date} to ${days[days.length - 1].date}`,
      `فرع الحجز: ${branchName} — من ${days[0].date} إلى ${days[days.length - 1].date}`
    );

    calendarGrid.innerHTML = "";

    days.forEach((d) => {
      const el = document.createElement("div");
      el.className = "day " + (d.full ? "full" : "available");

      const [Y, M, D] = d.date.split("-").map(Number);
      const dt = new Date(Y, M - 1, D);
      const label = `${weekdayName(dt)} ${String(D).padStart(2, "0")}/${String(M).padStart(2, "0")}`;

      const meta = d.full
        ? t(`Full (${d.count}/${d.capacity})`, `ممتلئ (${d.count}/${d.capacity})`)
        : t(`Available (${d.remaining} slots)`, `متاح (${d.remaining} أماكن)`);

      el.innerHTML = `<div class="d">${label}</div><div class="m">${meta}</div>`;

      if (!d.full) {
        el.addEventListener("click", () => {
          Array.from(calendarGrid.querySelectorAll(".day")).forEach(x => x.classList.remove("selected"));
          el.classList.add("selected");
          selectedISO = d.date;
          pickedDate.textContent = d.date;
          updateSubmitEnabled();
        });
      } else {
        el.style.cursor = "not-allowed";
      }

      calendarGrid.appendChild(el);
    });
  }

  async function loadMinDate() {
    const res = await apiGet(BRANCHES[0], "action=ping&t=" + Date.now());
    if (!res || !res.ok) throw new Error("Ping failed");
    minISO = res.minDate;
    currentStartISO = res.minDate;
    ruleText.textContent = t(
      `Booking starts from ${res.minDate} (after 15 days).`,
      `الحجز يبدأ من تاريخ ${res.minDate} (بعد ١٥ يوم).`
    );
  }

  // ✅ Preload availability for selected booking branch
  async function preloadAvailability() {
    setPreloadStatus("loading");
    preloadText.textContent = t("Loading availability…", "جاري تحميل المواعيد…");
    resetCalendarUI(t("Loading…", "جاري التحميل…"));

    try {
      if (!minISO) await loadMinDate();

      const branch = getSelectedBookingBranch();
      const cache = cacheGet_();

      if (cache && cache[branch.key]) {
        renderCalendarForBranch(cache[branch.key], branch);
        setPreloadStatus("ok");
        preloadText.textContent = t("Availability ready", "المواعيد جاهزة");
        return;
      }
const res = await apiCreate(branch, {
  phone,
  bookingDate: selectedISO,
  notes
});

      if (!res || !res.ok || !res.availability || !res.availability.ok) {
        throw new Error(`${branch.key} availability preload failed`);
      }

      const byBranch = (cache || {});
      byBranch[branch.key] = res.availability;
      cacheSet_(byBranch);

      renderCalendarForBranch(res.availability, branch);
      setPreloadStatus("ok");
      preloadText.textContent = t("Availability ready", "المواعيد جاهزة");

    } catch (e) {
      setPreloadStatus("bad");

      const branch = getSelectedBookingBranch();
      const branchName = (lang === "en" ? branch.nameEn : branch.nameAr);

      // ✅ Clear + actionable message
      preloadText.textContent = t("Availability failed", "فشل تحميل المواعيد");

      resetCalendarUI(
        t(
          `Cannot load availability for ${branchName}.`,
          `تعذر تحميل مواعيد فرع ${branchName}.`
        )
      );

      // ✅ This toast will show EXACT cause (HTML vs JSON, HTTP, etc.)
      toastMsg(
        t(
          `Branch "${branchName}" is not returning JSON.\nMake sure Web App is deployed to: Anyone.\n\nDetails:\n${String(e)}`,
          `فرع "${branchName}" لا يرجّع JSON.\nتأكد أن الـ Web App معمول Deploy على: Anyone.\n\nتفاصيل:\n${String(e)}`
        )
      );
    }
  }

  async function lookupCustomerAllBranches(phone) {
    const tasks = BRANCHES.map(b =>
      apiGet(b, `action=bootstrap&phone=${encodeURIComponent(phone)}&start=${encodeURIComponent(currentStartISO)}&days=${DEFAULT_DAYS}&t=${Date.now()}`)
        .then(r => ({ branch: b, res: r }))
        .catch(err => ({ branch: b, err }))
    );

    const results = await Promise.all(tasks);

    let found = null;
    for (const item of results) {
      if (item && item.res && item.res.ok) {
        const cust = item.res.customer;
        if (!found && cust && cust.ok && cust.found) {
          found = { branch: item.branch, customer: cust.customer };
        }
      }
    }
    return found;
  }

  async function searchCustomer() {
    resetCustomerUI();

    const phone = normEgyptPhone(phoneEl.value);
    if (!phone) {
      phonePill.textContent = t(
        "Enter a valid number (11 digits: 010/011/012/015).",
        "اكتب رقم صحيح (١١ رقم يبدأ 010/011/012/015)."
      );
      updateSubmitEnabled();
      return;
    }

    phonePill.textContent = t("Searching your data across branches…", "جاري البحث عن بياناتك في كل الفروع…");

    try {
      if (!minISO) await loadMinDate();
      const found = await lookupCustomerAllBranches(phone);

      if (!found) {
        phonePill.textContent = t("Number not found — please contact any branch.", "❌ الرقم غير موجود — تواصل مع أي فرع");
        return;
      }

      setCustomerUI(found.customer, found.branch);
      phonePill.textContent = t("Customer data found ✅", "✅ تم العثور على بياناتك");
    } catch (e) {
      phonePill.textContent = t("Connection error", "خطأ اتصال");
      toastMsg("CLIENT_ERROR\n" + String(e));
    }

    updateSubmitEnabled();
  }

  async function createBooking() {
    const phone = normEgyptPhone(phoneEl.value);
    const notes = String(notesEl.value || "").trim();

    if (!customerFound) return toastMsg(t("Please enter your phone first.", "لازم بياناتك تظهر الأول"));
    if (!selectedISO) return toastMsg(t("Pick an available day.", "اختار يوم متاح"));

    submitBtn.disabled = true;

    try {
      const branch = getSelectedBookingBranch();

      const res = await apiPost(branch, {
        action: "create",
        phone,
        bookingDate: selectedISO,
        notes
      });

      if (!res.ok) {
        toastMsg((res.message || t("Booking rejected", "تم رفض الحجز")) + (res.details ? "\n" + res.details : ""));
        cacheDrop_();
        await preloadAvailability();
        return;
      }

      toastMsg(
        t(`Booked successfully ✅\nBranch: ${branch.nameEn}\n${res.orderId || ""}`,
          `✅ تم الحجز بنجاح\nالفرع: ${branch.nameAr}\n${res.orderId || ""}`)
      );

      selectedISO = "";
      pickedDate.textContent = "—";
      notesEl.value = "";

      cacheDrop_();
      await preloadAvailability();
      await searchCustomer();

    } catch (e) {
      toastMsg("CLIENT_ERROR\n" + String(e));
    } finally {
      updateSubmitEnabled();
    }
  }

  prevBtn.addEventListener("click", async () => {
    if (!minISO) return;
    const back = addDaysISO(currentStartISO, -DEFAULT_DAYS);
    currentStartISO = (back < minISO) ? minISO : back;
    cacheDrop_();
    await preloadAvailability();
  });

  nextBtn.addEventListener("click", async () => {
    if (!minISO) return;
    currentStartISO = addDaysISO(currentStartISO, DEFAULT_DAYS);
    cacheDrop_();
    await preloadAvailability();
  });

  bookingBranchEl.addEventListener("change", async () => {
    cacheDrop_();
    await preloadAvailability();
  });

  let lookupTimer = null;
  phoneEl.addEventListener("input", () => {
    clearTimeout(lookupTimer);
    lookupTimer = setTimeout(searchCustomer, 280);
  });

  langToggle.addEventListener("click", async () => {
    lang = (lang === "ar") ? "en" : "ar";
    translateDOM();
    await preloadAvailability();
    if (normEgyptPhone(phoneEl.value)) await searchCustomer();
  });

  submitBtn.addEventListener("click", createBooking);

  // Init
  translateDOM();
  fillBookingBranches();
  resetCustomerUI();
  resetCalendarUI(t("Loading availability…", "جاري تحميل المواعيد…"));
  preloadAvailability();
})();

