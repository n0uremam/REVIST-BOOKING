"use strict";
const BRANCH_API = {
  "October":   "https://script.google.com/macros/s/AKfycbySjCDtGsHh94ukD1XpHVWwiqXc7kzdQoAVEQyCnf66cI6-NhIYbnLWnYNK63XmWLiaqQ/exec",
  "Zayed":     "https://script.google.com/macros/s/AKfycbymxUsSnwd7zYejyhiwuzuafJ9pfIzYqDTpOc9WIR-I3pMCMuJZ4a5XqPlyYmYTzmtv/exec",
  "Maadi":     "https://script.google.com/macros/s/AKfycbyCBr6FPYhjTbndMvUCYNCSq9UseDPcbPQQLdol9KPTJnnnk1JXEi4DyW_bDrlYXylT1Q/exec",
  "AUC":       "https://script.google.com/macros/s/AKfycbwibhM0RPkWsKkUJQ9My0ycfHhS9oo6PoEZ5sWlZByB8sT7n-QLMVqUsIYU4BoR59Lr4A/exec",
  "Nasr City": "https://script.google.com/macros/s/AKfycbxwal_GJHeIhqhbFojUyt6a2yI8MKtwS0tg-YoPavgPF1rluPmzIElk9on9Uoxi1lpcDg/exec"
};
const AVAIL_DAYS = 21;
const STEP_DAYS = 7;
const LOOKUP_DEBOUNCE_MS = 350;
let lang = "en";
const state = {
  phone: "",
  customer: null,
  sourceBranch: null,
  bookingBranch: null,
  minDateISO: null,
  startISO: null,
  selectedISO: null
};
const availabilityCache = new Map();
const pingCache = new Map();
const toggleBtn = document.getElementById("langToggle");
const transEls = document.querySelectorAll("[data-en]");
const phoneInput = document.getElementById("phoneInput");
const phoneHint = document.getElementById("phoneHint");
const lookupStatus = document.getElementById("lookupStatus");
const vName = document.getElementById("vName");
const vModel = document.getElementById("vModel");
const vColor = document.getElementById("vColor");
const vYear = document.getElementById("vYear");
const vFilm = document.getElementById("vFilm");
const sourceBadge = document.getElementById("sourceBadge");
const sourceBadgeText = document.getElementById("sourceBadgeText");
const branchSelect = document.getElementById("branchSelect");
const reloadAvailBtn = document.getElementById("reloadAvailBtn");
const availState = document.getElementById("availState");
const availStateText = document.getElementById("availStateText");
const daysWrap = document.getElementById("daysWrap");
const prevDays = document.getElementById("prevDays");
const nextDays = document.getElementById("nextDays");
const selectedDayText = document.getElementById("selectedDayText");
const notesInput = document.getElementById("notesInput");
const confirmBtn = document.getElementById("confirmBtn");
const minRuleText = document.getElementById("minRuleText");
const toast = document.getElementById("toast");
const revealEls = document.querySelectorAll(".reveal");
const io = new IntersectionObserver((entries) => {
  entries.forEach(e => {
    if (!e.isIntersecting) return;
    e.target.classList.add("visible");
    io.unobserve(e.target);
  });
}, { threshold: 0.2 });
revealEls.forEach(el => io.observe(el));
function setLang(newLang){
  lang = newLang;
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
  transEls.forEach(el => { el.textContent = el.dataset[lang]; });
  toggleBtn.innerHTML = `<i class="fa-solid fa-language"></i> ${lang === "en" ? "AR" : "EN"}`;
  renderSelectedText();
}
toggleBtn.addEventListener("click", () => setLang(lang === "en" ? "ar" : "en"));
function toastShow(msg){
  toast.textContent = msg;
  toast.style.display = "block";
  clearTimeout(toast._t);
  toast._t = setTimeout(() => toast.style.display = "none", 2600);
}
function normPhoneInput(v){
  const d = String(v || "").replace(/\D/g, "");
  let local = d.startsWith("20") ? d.slice(2) : d;
  if (local.length === 10 && local.startsWith("1")) local = "0" + local;
  return local.slice(0, 11);
}

function isValidEgyptPhone(p){
  return /^01[0125]\d{8}$/.test(p);
}
function formatDMY(iso){
  const [y,m,d] = String(iso).split("-");
  return `${Number(d)}/${Number(m)}/${y}`;
}
function todayISO(){
  const dt = new Date();
  const y = dt.getFullYear();
  const m = String(dt.getMonth()+1).padStart(2,"0");
  const d = String(dt.getDate()).padStart(2,"0");
  return `${y}-${m}-${d}`;
}
function addDaysISO(iso, n){
  const [y,m,d] = iso.split("-").map(Number);
  const dt = new Date(y, m-1, d);
  dt.setDate(dt.getDate()+n);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth()+1).padStart(2,"0");
  const dd = String(dt.getDate()).padStart(2,"0");
  return `${yy}-${mm}-${dd}`;
}
function debounce(fn, ms=300){
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}
function buildUrl(base, params){
  const u = new URL(base);
  Object.entries(params).forEach(([k,v]) => u.searchParams.set(k, String(v)));
  return u.toString();
}
async function fetchWithTimeout(url, timeoutMs=25000){
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try{
    const res = await fetch(url, { method:"GET", signal: ctrl.signal, cache:"no-store" });
    const txt = await res.text();
    return { ok:true, status:res.status, text:txt };
  }catch(e){
    return { ok:false, error:String(e) };
  }finally{
    clearTimeout(t);
  }
}
async function apiGet(base, params){
  const url = buildUrl(base, params);
  const r = await fetchWithTimeout(url, 25000);
  if (!r.ok) throw new Error("network/timeout");
  let j;
  try{ j = JSON.parse(r.text); }
  catch(e){ throw new Error("bad-json"); }
  return j;
}
function initBranches(){
  branchSelect.innerHTML = "";
  Object.keys(BRANCH_API).forEach(name => {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = (lang === "ar")
      ? (name === "Nasr City" ? "مدينة نصر" :
         name === "AUC" ? "التجمع الخامس" :
         name === "Maadi" ? "المعادي" :
         name === "Zayed" ? "الشيخ زايد" :
         name === "October" ? "٦ أكتوبر" : name)
      : name;
    branchSelect.appendChild(opt);
  });
  branchSelect.value = state.bookingBranch;
}
branchSelect.addEventListener("change", async () => {
  state.bookingBranch = branchSelect.value;
  state.selectedISO = null;
  renderSelectedText();
  await loadAvailabilityForSelectedBranch(true);
});
reloadAvailBtn.addEventListener("click", async () => {
  const key = cacheKey(state.bookingBranch, state.startISO, AVAIL_DAYS);
  availabilityCache.delete(key);
  await loadAvailabilityForSelectedBranch(true);
});
prevDays.addEventListener("click", async () => {
  state.startISO = addDaysISO(state.startISO, -STEP_DAYS);
  if (state.startISO < state.minDateISO) state.startISO = state.minDateISO;
  state.selectedISO = null;
  renderSelectedText();
  await loadAvailabilityForSelectedBranch(true);
});
nextDays.addEventListener("click", async () => {
  state.startISO = addDaysISO(state.startISO, STEP_DAYS);
  state.selectedISO = null;
  renderSelectedText();
  await loadAvailabilityForSelectedBranch(true);
});
async function pingAllBranches(){
  const tasks = Object.entries(BRANCH_API).map(async ([branch, base]) => {
    try{
      const j = await apiGet(base, { action:"ping" });
      if (j && j.ok) pingCache.set(branch, j);
    }catch(e){
    }
  });
  await Promise.allSettled(tasks);
  let maxMin = addDaysISO(todayISO(), 12);
  pingCache.forEach(v => {
    if (v.minDate && v.minDate > maxMin) maxMin = v.minDate;
  });
  state.minDateISO = maxMin;
  state.startISO = state.minDateISO;
  minRuleText.textContent = (lang === "ar")
    ? `الحجز يبدأ من تاريخ ${formatDMY(state.minDateISO)} (بعد ${daysDiff(todayISO(), state.minDateISO)} يوم).`
    : `Booking starts from ${formatDMY(state.minDateISO)} (in ${daysDiff(todayISO(), state.minDateISO)} days).`;
}
function daysDiff(aISO, bISO){
  const [ay,am,ad] = aISO.split("-").map(Number);
  const [by,bm,bd] = bISO.split("-").map(Number);
  const a = new Date(ay,am-1,ad).getTime();
  const b = new Date(by,bm-1,bd).getTime();
  return Math.max(0, Math.round((b-a)/(24*3600*1000)));
}
function cacheKey(branch, startISO, days){ return `${branch}|${startISO}|${days}`; }
async function getAvailability(branch, startISO, days){
  const base = BRANCH_API[branch];
  const key = cacheKey(branch, startISO, days);
  if (availabilityCache.has(key)) return availabilityCache.get(key);
  const prom = apiGet(base, { action:"availability", start:startISO, days })
    .then(j => {
      if (!j || !j.ok || !j.availability || !j.availability.ok) throw new Error("bad-availability");
      return j.availability;
    });

  availabilityCache.set(key, prom);
  return prom;
}
async function preloadAllAvailability(){
  const tasks = Object.keys(BRANCH_API).map(async (b) => {
    try{ await getAvailability(b, state.startISO, AVAIL_DAYS); } catch(e) {}
  });
  await Promise.allSettled(tasks);
}
function setAvailState(kind, text){
  const dot = availState.querySelector(".dot");
  dot.className = "dot " + (kind === "ok" ? "dot-ok" : kind === "bad" ? "dot-bad" : "dot-warn");
  availStateText.textContent = text;
}
async function loadAvailabilityForSelectedBranch(showToastOnFail=false){
  setAvailState("warn", lang === "ar" ? "جاري تحميل المواعيد..." : "Loading availability...");
  daysWrap.innerHTML = "";
  try{
    const av = await getAvailability(state.bookingBranch, state.startISO, AVAIL_DAYS);
    renderDays(av.days);
    setAvailState("ok", lang === "ar" ? "تم تحميل المواعيد." : "Availability loaded.");
  }catch(e){
    setAvailState("bad", lang === "ar" ? "فشل تحميل المواعيد." : "Failed to load availability.");
    if (showToastOnFail) toastShow(lang === "ar" ? "حصل خطأ في تحميل المواعيد" : "Availability error");
  }
}
function renderDays(days){
  daysWrap.innerHTML = "";
  days.forEach(d => {
    const el = document.createElement("div");
    el.className = "day" + (state.selectedISO === d.date ? " selected" : "");
    el.dataset.iso = d.date;
    const title = document.createElement("div");
    title.className = "d";
    title.textContent = formatDMY(d.date);
    const meta = document.createElement("div");
    meta.className = "meta";
    meta.textContent = (lang === "ar")
      ? `السعة: ${d.capacity} — المحجوز: ${d.count}`
      : `Cap: ${d.capacity} — Booked: ${d.count}`;
    const pill = document.createElement("div");
    pill.className = "pill " + (d.full ? "full" : "ok");
    pill.innerHTML = d.full
      ? `<i class="fa-solid fa-ban"></i> ${lang === "ar" ? "ممتلئ" : "Full"}`
      : `<i class="fa-solid fa-check"></i> ${lang === "ar" ? "متاح" : "Available"} (${d.remaining})`;
    el.appendChild(title);
    el.appendChild(meta);
    el.appendChild(pill);
    el.addEventListener("click", () => {
      if (d.full) {
        toastShow(lang === "ar" ? "اليوم ده ممتلئ، اختار يوم تاني" : "This day is full. Pick another.");
        return;
      }
      state.selectedISO = d.date;
      renderSelectedText();
      Array.from(daysWrap.children).forEach(c => c.classList.toggle("selected", c.dataset.iso === state.selectedISO));
    });
    daysWrap.appendChild(el);
  });
}
function renderSelectedText(){
  if (!state.selectedISO){
    selectedDayText.textContent = (lang === "ar") ? "لم يتم اختيار يوم" : "No day selected";
    return;
  }
  selectedDayText.textContent = (lang === "ar")
    ? `اليوم المختار: ${formatDMY(state.selectedISO)}`
    : `Selected: ${formatDMY(state.selectedISO)}`;
}
async function lookupAcrossBranches(phone){
  const entries = Object.entries(BRANCH_API);
  const tasks = entries.map(([branch, base]) =>
    apiGet(base, { action:"lookup", phone })
      .then(res => ({ branch, res }))
  );
  const settled = await Promise.allSettled(tasks);
  for (const s of settled){
    if (s.status !== "fulfilled") continue;
    const { branch, res } = s.value;
    if (res && res.ok && res.customer && res.customer.found && res.customer.customer){
      return { ok:true, fromBranch: branch, customer: res.customer.customer };
    }
  }
  return { ok:false };
}
function setCustomerUI(customer){
  vName.textContent  = customer?.name || "—";
  vModel.textContent = customer?.carModel || "—";
  vColor.textContent = customer?.carColor || "—";
  vYear.textContent  = customer?.carYear || "—";
  vFilm.textContent  = customer?.filmType || "—";
}
const onPhoneInput = debounce(async () => {
  const raw = phoneInput.value;
  const p = normPhoneInput(raw);
  phoneInput.value = p;
  state.phone = p;
  if (p.length < 11){
    phoneHint.textContent = (lang === "ar") ? "اكتب رقم 11 رقم (01xxxxxxxxx)" : "Enter 11 digits (01xxxxxxxxx)";
    lookupStatus.style.display = "none";
    sourceBadge.style.display = "none";
    setCustomerUI(null);
    state.customer = null;
    state.sourceBranch = null;
    confirmBtn.disabled = true;
    return;
  }
  if (!isValidEgyptPhone(p)){
    phoneHint.textContent = (lang === "ar") ? "رقم غير صحيح" : "Invalid number";
    lookupStatus.style.display = "none";
    sourceBadge.style.display = "none";
    setCustomerUI(null);
    state.customer = null;
    state.sourceBranch = null;
    confirmBtn.disabled = true;
    return;
  }
  phoneHint.textContent = (lang === "ar") ? "جاري البحث..." : "Searching...";
  lookupStatus.style.display = "inline-flex";
  lookupStatus.textContent = (lang === "ar") ? "جاري تحميل بيانات العميل..." : "Loading customer...";
  confirmBtn.disabled = true;
  try{
    const r = await lookupAcrossBranches(p);
    if (!r.ok){
      setCustomerUI(null);
      lookupStatus.textContent = (lang === "ar") ? "الرقم غير موجود — تواصل مع الفرع" : "Not found — contact branch";
      sourceBadge.style.display = "none";
      state.customer = null;
      state.sourceBranch = null;
      confirmBtn.disabled = true;
      phoneHint.textContent = (lang === "ar") ? "لم يتم العثور على بيانات" : "No data found";
      return;
    }
    state.customer = r.customer;
    state.sourceBranch = r.fromBranch;
    setCustomerUI(state.customer);
    lookupStatus.textContent = (lang === "ar") ? "تم العثور على البيانات" : "Data found";
    phoneHint.textContent = (lang === "ar") ? "جاهز للحجز" : "Ready";
    sourceBadge.style.display = "inline-flex";
    sourceBadgeText.textContent = (lang === "ar")
      ? `البيانات من: ${arabBranchName(r.fromBranch)}`
      : `Data from: ${r.fromBranch}`;
    confirmBtn.disabled = false;
  }catch(e){
    setCustomerUI(null);
    lookupStatus.textContent = (lang === "ar") ? "خطأ في البحث" : "Lookup error";
    sourceBadge.style.display = "none";
    state.customer = null;
    state.sourceBranch = null;
    confirmBtn.disabled = true;
    phoneHint.textContent = (lang === "ar") ? "حاول مرة أخرى" : "Try again";
  }
}, LOOKUP_DEBOUNCE_MS);
phoneInput.addEventListener("input", onPhoneInput);
function arabBranchName(name){
  if (name === "Nasr City") return "مدينة نصر";
  if (name === "AUC") return "التجمع الخامس";
  if (name === "Maadi") return "المعادي";
  if (name === "Zayed") return "الشيخ زايد";
  if (name === "October") return "٦ أكتوبر";
  return name;
}
confirmBtn.addEventListener("click", async () => {
  if (!state.customer || !isValidEgyptPhone(state.phone)){
    toastShow(lang === "ar" ? "اكتب رقم صحيح أولاً" : "Enter a valid phone first");
    return;
  }
  if (!state.selectedISO){
    toastShow(lang === "ar" ? "اختار يوم الحجز" : "Pick a day");
    return;
  }
  confirmBtn.disabled = true;
  const branch = state.bookingBranch;
  const base = BRANCH_API[branch];
  try{
    const j = await apiGet(base, {
      action: "create",
      phone: state.phone,
      bookingDate: state.selectedISO,
      notes: notesInput.value || "",
      name: state.customer.name || "",
      carModel: state.customer.carModel || "",
      carColor: state.customer.carColor || "",
      carYear: state.customer.carYear || "",
      filmType: state.customer.filmType || ""
    });
    if (j && j.ok){
      toastShow(lang === "ar"
        ? `تم تأكيد الحجز ✅ (${formatDMY(state.selectedISO)})`
        : `Booking confirmed ✅ (${formatDMY(state.selectedISO)})`
      );
      availabilityCache.delete(cacheKey(branch, state.startISO, AVAIL_DAYS));
      await loadAvailabilityForSelectedBranch(false);
      state.selectedISO = null;
      renderSelectedText();
      notesInput.value = "";
    } else {
      const msg = (j && j.message) ? String(j.message) : "ERROR";
      if (msg === "FULL"){
        toastShow(lang === "ar" ? "اليوم ده ممتلئ — اختار يوم تاني" : "Day is full — pick another");
      } else {
        toastShow(lang === "ar" ? `فشل إنشاء الحجز: ${msg}` : `Booking failed: ${msg}`);
      }
    }
  }catch(e){
    toastShow(lang === "ar" ? "CLIENT_ERROR: Network/Timeout" : "CLIENT_ERROR: Network/Timeout");
  }finally{
    confirmBtn.disabled = false;
  }
});
(async function init(){
  setLang(lang);
  initBranches();
  phoneHint.textContent = (lang === "ar") ? "اكتب رقم 11 رقم (01xxxxxxxxx)" : "Enter 11 digits (01xxxxxxxxx)";
  confirmBtn.disabled = true;
  await pingAllBranches();
  minRuleText.textContent = (lang === "ar")
    ? `الحجز يبدأ من تاريخ ${formatDMY(state.minDateISO)} (بعد ${daysDiff(todayISO(), state.minDateISO)} يوم).`
    : `Booking starts from ${formatDMY(state.minDateISO)} (in ${daysDiff(todayISO(), state.minDateISO)} days).`;
  preloadAllAvailability().catch(() => {});
  await loadAvailabilityForSelectedBranch(false);
})();
