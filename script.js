(function () {
  "use strict";

  // =======================
  // BRANCHES (ONLINE)
  // =======================
  const BRANCHES = [
    { key: "Nasr",    nameAr: "مدينة نصر",     nameEn: "Nasr City",     api: "https://script.google.com/macros/s/AKfycbxwal_GJHeIhqhbFojUyt6a2yI8MKtwS0tg-YoPavgPF1rluPmzIElk9on9Uoxi1lpcDg/exec" },
    { key: "AUC",     nameAr: "التجمع الخامس", nameEn: "AUC",           api: "https://script.google.com/macros/s/AKfycbwibhM0RPkWsKkUJQ9My0ycfHhS9oo6PoEZ5sWlZByB8sT7n-QLMVqUsIYU4BoR59Lr4A/exec" },
    { key: "Maadi",   nameAr: "المعادي",       nameEn: "Maadi",         api: "https://script.google.com/macros/s/AKfycbyCBr6FPYhjTbndMvUCYNCSq9UseDPcbPQQLdol9KPTJnnnk1JXEi4DyW_bDrlYXylT1Q/exec" },
    { key: "Zayed",   nameAr: "الشيخ زايد",    nameEn: "Sheikh Zayed",  api: "https://script.google.com/macros/s/AKfycbymxUsSnwd7zYejyhiwuzuafJ9pfIzYqDTpOc9WIR-I3pMCMuJZ4a5XqPlyYmYTzmtv/exec" },
    { key: "October", nameAr: "٦ أكتوبر",      nameEn: "6th October",   api: "https://script.google.com/macros/s/AKfycbySjCDtGsHh94ukD1XpHVWwiqXc7kzdQoAVEQyCnf66cI6-NhIYbnLWnYNK63XmWLiaqQ/exec" },
  ];

  // Calendar window per page
  const DAYS_WINDOW = 28;

  // Cache TTL
  const AV_CACHE_TTL_MS = 60 * 1000;

  // Preload “dummy phone” (not used now; availability endpoint doesn’t need phone)
  const DEFAULT_START_DAYS = DAYS_WINDOW;

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

  let minISO = "";          // booking allowed from this date
  let currentStartISO = ""; // calendar start

  // Cache: (branchKey + startISO + days) -> { ts, availability }
  const avCache = new Map();

  // =======================
  // Helpers
  // =======================
  function t(en, ar){ return lang === "en" ? en : ar; }

  function toastMsg(msg) {
    toast.textContent = msg;
    toast.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => toast.classList.remove("show"), 4000);
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
      const preview = text.replace(/\s+/g, " ").slice(0, 160);
      throw new Error(`${branch.key} returned HTML (NOT JSON). Preview: ${preview}`);
    }

    try { return JSON.parse(text); }
    catch (e) {
      const preview = text.replace(/\s+/g, " ").slice(0, 180);
      throw new Error(`${branch.key} invalid JSON. Preview: ${preview}`);
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

  function getSelectedBookingBranch() {
    const key = bookingBranchEl ? bookingBranchEl.value : BRANCHES[0].key;
    return BRANCHES.find(b => b.key === key) || BRANCHES[0];
  }

  function fillBookingBranches() {
    const keep = bookingBranchEl.value || BRANCHES[0].key;
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

  function cacheKey(branchKey, startISO, days) {
    return `${branchKey}::${startISO}::${days}`;
  }

  function cacheGet(branchKey, startISO, days) {
    const k = cacheKey(branchKey, startISO, days);
    const x = avCache.get(k);
    if (!x) return null;
    if (Date.now() - x.ts > AV_CACHE_TTL_MS) return null;
    return x.availability;
  }

  function cacheSet(branchKey, startISO, days, availability) {
    const k = cacheKey(branchKey, startISO, days);
    avCache.set(k, { ts: Date.now(), availability });
  }

  function renderCalendar(avail, branch) {
    const days = (avail && avail.days) || [];
    if (!days.length) {
      resetCalendarUI(t("No available days.", "لا توجد أيام متاحة."));
      return;
    }

    const branchName = (lang === "en" ? branch.nameEn : branch.nameAr);

    calNote.textContent = t(
      `Booking branch: ${branchName} — ${days[0].date} → ${days[days.length - 1].date}`,
      `فرع الحجز: ${branchName} — ${days[0].date} → ${days[days.length - 1].date}`
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

  // =======================
  // API Workflows
  // =======================
  async function loadMinDate() {
    // Use first branch to get minDate (all should match)
    const res = await apiGet(BRANCHES[0], "action=ping&t=" + Date.now());
    if (!res || !res.ok || !res.minDate) throw new Error("ping failed: missing minDate");
    minISO = res.minDate;
    currentStartISO = res.minDate;

    ruleText.textContent = t(
      `Booking starts from ${minISO} (after 15 days).`,
      `الحجز يبدأ من تاريخ ${minISO} (بعد ١٥ يوم).`
    );
  }

  async function loadAvailabilityForSelectedBranch() {
    const branch = getSelectedBookingBranch();

    setPreloadStatus("loading");
    preloadText.textContent = t("Loading availability…", "جاري تحميل المواعيد…");
    resetCalendarUI(t("Loading…", "جاري التحميل…"));

    try {
      if (!minISO) await loadMinDate();

      // Ensure startISO is never before minISO
      if (currentStartISO < minISO) currentStartISO = minISO;

      // Cache
      const cached = cacheGet(branch.key, currentStartISO, DAYS_WINDOW);
      if (cached) {
        renderCalendar(cached, branch);
        setPreloadStatus("ok");
        preloadText.textContent = t("Availability ready", "المواعيد جاهزة");
        return;
      }

      const res = await apiGet(
        branch,
        `action=availability&start=${encodeURIComponent(currentStartISO)}&days=${DAYS_WINDOW}&t=${Date.now()}`
      );

      if (!res || !res.ok || !res.availability || !res.availability.ok) {
        throw new Error(`availability missing/invalid: ${JSON.stringify(res)}`);
      }

      cacheSet(branch.key, currentStartISO, DAYS_WINDOW, res.availability);

      renderCalendar(res.availability, branch);
      setPreloadStatus("ok");
      preloadText.textContent = t("Availability ready", "المواعيد جاهزة");

    } catch (e) {
      setPreloadStatus("bad");
      preloadText.textContent = t("Availability failed", "فشل تحميل المواعيد");

      const branchName = (lang === "en" ? branch.nameEn : branch.nameAr);
      resetCalendarUI(t(
        `Cannot load availability for ${branchName}.`,
        `تعذر تحميل مواعيد فرع ${branchName}.`
      ));

      toastMsg(
        t(
          `Availability error (${branchName})\n${String(e)}`,
          `خطأ تحميل المواعيد (${branchName})\n${String(e)}`
        )
      );
    }
  }

  async function lookupCustomerAllBranches(phone) {
    // Parallel lookup across all branches; first found wins
    const tasks = BRANCHES.map(b =>
      apiGet(b, `action=lookup&phone=${encodeURIComponent(phone)}&t=${Date.now()}`)
        .then(r => ({ branch: b, res: r }))
        .catch(err => ({ branch: b, err }))
    );

    const results = await Promise.all(tasks);

    for (const item of results) {
      if (item.res && item.res.ok && item.res.customer && item.res.customer.ok && item.res.customer.found) {
        return { branch: item.branch, customer: item.res.customer.customer };
      }
    }

    // If none found, show best error if all failed
    const anyOk = results.some(x => x.res && x.res.ok);
    if (!anyOk) {
      const msg = results.map(x => `${x.branch.key}: ${x.err ? String(x.err) : "no-res"}`).join("\n");
      throw new Error("All lookups failed:\n" + msg);
    }

    return null;
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
        phonePill.textContent = t(
          "Number not found — please contact any branch.",
          "❌ الرقم غير موجود — تواصل مع أي فرع"
        );
        return;
      }

      setCustomerUI(found.customer, found.branch);
      phonePill.textContent = t("Customer data found ✅", "✅ تم العثور على بياناتك");

    } catch (e) {
      phonePill.textContent = t("Connection error", "خطأ اتصال");
      toastMsg("LOOKUP_ERROR\n" + String(e));
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

      // ✅ GET create (no CORS preflight)
      const res = await apiGet(
        branch,
        `action=create&phone=${encodeURIComponent(phone)}&bookingDate=${encodeURIComponent(selectedISO)}&notes=${encodeURIComponent(notes)}&t=${Date.now()}`
      );

      if (!res || !res.ok) {
        toastMsg((res && res.message) ? res.message : t("Booking failed", "فشل إنشاء الحجز"));
        // refresh availability (maybe became full)
        await loadAvailabilityForSelectedBranch();
        return;
      }

      toastMsg(
        t(
          `Booked successfully ✅\nBranch: ${branch.nameEn}\n${res.orderId ? ("Order: " + res.orderId) : ""}`,
          `✅ تم الحجز بنجاح\nالفرع: ${branch.nameAr}\n${res.orderId ? ("أوردر: " + res.orderId) : ""}`
        )
      );

      // reset selection
      selectedISO = "";
      pickedDate.textContent = "—";
      notesEl.value = "";

      // refresh UI
      await loadAvailabilityForSelectedBranch();
      await searchCustomer();

    } catch (e) {
      toastMsg("CREATE_ERROR\n" + String(e));
    } finally {
      updateSubmitEnabled();
    }
  }

  // =======================
  // Events
  // =======================
  prevBtn.addEventListener("click", async () => {
    if (!minISO) return;
    const back = addDaysISO(currentStartISO, -DEFAULT_START_DAYS);
    currentStartISO = (back < minISO) ? minISO : back;
    await loadAvailabilityForSelectedBranch();
  });

  nextBtn.addEventListener("click", async () => {
    if (!minISO) return;
    currentStartISO = addDaysISO(currentStartISO, DEFAULT_START_DAYS);
    await loadAvailabilityForSelectedBranch();
  });

  bookingBranchEl.addEventListener("change", async () => {
    await loadAvailabilityForSelectedBranch();
  });

  let lookupTimer = null;
  phoneEl.addEventListener("input", () => {
    clearTimeout(lookupTimer);
    lookupTimer = setTimeout(searchCustomer, 220);
  });

  langToggle.addEventListener("click", async () => {
    lang = (lang === "ar") ? "en" : "ar";
    translateDOM();
    await loadAvailabilityForSelectedBranch();
    if (normEgyptPhone(phoneEl.value)) await searchCustomer();
  });

  submitBtn.addEventListener("click", createBooking);

  // =======================
  // Init
  // =======================
  translateDOM();
  fillBookingBranches();
  resetCustomerUI();
  resetCalendarUI(t("Loading availability…", "جاري تحميل المواعيد…"));
  loadAvailabilityForSelectedBranch();
})();
