const BRANCH_API = {
  "Nasr City": "https://script.google.com/macros/s/AKfycbxwal_GJHeIhqhbFojUyt6a2yI8MKtwS0tg-YoPavgPF1rluPmzIElk9on9Uoxi1lpcDg/exec",
  "AUC": "https://script.google.com/macros/s/AKfycbwibhM0RPkWsKkUJQ9My0ycfHhS9oo6PoEZ5sWlZByB8sT7n-QLMVqUsIYU4BoR59Lr4A/exec",
  "Maadi": "https://script.google.com/macros/s/AKfycbyCBr6FPYhjTbndMvUCYNCSq9UseDPcbPQQLdol9KPTJnnnk1JXEi4DyW_bDrlYXylT1Q/exec",
  "Zayed": "https://script.google.com/macros/s/AKfycbymxUsSnwd7zYejyhiwuzuafJ9pfIzYqDTpOc9WIR-I3pMCMuJZ4a5XqPlyYmYTzmtv/exec",
  "October": "https://script.google.com/macros/s/AKfycbySjCDtGsHh94ukD1XpHVWwiqXc7kzdQoAVEQyCnf66cI6-NhIYbnLWnYNK63XmWLiaqQ/exec",
};
const BRANCHES = Object.keys(BRANCH_API);
const WEEK_DAYS = 7;
const LOOKUP_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const AVAIL_CACHE_TTL_MS = 3 * 60 * 1000;
const FETCH_TIMEOUT_MS = 9000;
let lang = "en";
let selectedBranch = BRANCHES[0];
let selectedDateISO = "";
let customerCache = null;
let minDateByBranch = {};
let weekStartISO = "";
let availabilityCache = {};
const phoneInput = document.getElementById("phoneInput");
const searchBtn = document.getElementById("searchBtn");
const lookupMsg = document.getElementById("lookupMsg");
const customerPanel = document.getElementById("customerPanel");
const cName = document.getElementById("cName");
const cModel = document.getElementById("cModel");
const cColor = document.getElementById("cColor");
const cYear = document.getElementById("cYear");
const cFilm = document.getElementById("cFilm");
const sourceBadgeText = document.getElementById("sourceBadgeText");
const branchSelect = document.getElementById("branchSelect");
const minDateText = document.getElementById("minDateText");
const availMsg = document.getElementById("availMsg");
const calendar = document.getElementById("calendar");
const notesInput = document.getElementById("notesInput");
const createBtn = document.getElementById("createBtn");
const createMsg = document.getElementById("createMsg");
const toggleBtn = document.getElementById("langToggle");
const trans = document.querySelectorAll("[data-en]");
const weekPrevBtn = document.getElementById("weekPrev");
const weekNextBtn = document.getElementById("weekNext");
const BRANCH_INFO = {
  "Nasr City": { ar:"مدينة نصر", en:"Nasr City", addr_ar:"خلف مول السراج", addr_en:"Behind El Serag Mall", map:"https://maps.app.goo.gl/g3zhYzNELks3YXa29" },
  "AUC": { ar:"التجمع الخامس", en:"The 5th Settlement", addr_ar:"شارع التسعين الجنوبي، مول الجامعة الأمريكية", addr_en:"South 90th Street, AUC Mall", map:"https://maps.app.goo.gl/ukuJkYmuQbeNfH4H7" },
  "Maadi": { ar:"المعادي", en:"Maadi", addr_ar:"محور حسب الله الكفراوي", addr_en:"Hassab Allah Kafrawy Axis", map:"https://maps.app.goo.gl/szmagQ9WdrUYetkM7" },
  "Zayed": { ar:"الشيخ زايد", en:"Sheikh Zayed", addr_ar:"وصلة دهشور، جميرا G21", addr_en:"Dahshur Link, Jumeirah G21", map:"https://maps.app.goo.gl/aDiZxX6Nte39SyQb8" },
  "October": { ar:"٦ أكتوبر", en:"6th of October", addr_ar:"المحور المركزي، شارع الخزان الأول", addr_en:"Central Axis, First Al-Khazan Street", map:"https://maps.app.goo.gl/mso2BCnqRNYPLMhU6" },
};
function branchName(b){ return lang==="ar" ? (BRANCH_INFO[b]?.ar || b) : (BRANCH_INFO[b]?.en || b); }
function fmtDateUI(iso){ return String(iso || ""); }
function proxyUrl(appscriptUrl) {
  return "/.netlify/functions/gs?url=" + encodeURIComponent(appscriptUrl);
}
async function fetchJsonWithTimeout(url, timeoutMs = FETCH_TIMEOUT_MS) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { method:"GET", cache:"no-store", signal: ctrl.signal });
    const txt = await r.text();
    return JSON.parse(txt);
  } finally {
    clearTimeout(t);
  }
}
function compareISO(a,b){ return String(a).localeCompare(String(b)); }
function addDaysISO(iso, days){
  const [y,m,d] = String(iso).split("-").map(Number);
  const dt = new Date(y, m-1, d);
  dt.setDate(dt.getDate() + days);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth()+1).padStart(2,"0");
  const dd = String(dt.getDate()).padStart(2,"0");
  return `${yy}-${mm}-${dd}`;
}
function isoTodayPlus(n){
  const dt = new Date();
  dt.setDate(dt.getDate()+n);
  const y = dt.getFullYear();
  const m = String(dt.getMonth()+1).padStart(2,"0");
  const d = String(dt.getDate()).padStart(2,"0");
  return `${y}-${m}-${d}`;
}
function normPhoneLocal(v){
  const d = String(v||"").replace(/\D/g,"");
  let local = d.startsWith("20") ? d.slice(2) : d;
  if (local.length === 10 && local.startsWith("1")) local = "0" + local;
  return local;
}
function setArrowIcons_(){
  if (!weekPrevBtn || !weekNextBtn) return;
  const prevIcon = weekPrevBtn.querySelector("i");
  const nextIcon = weekNextBtn.querySelector("i");
  if (!prevIcon || !nextIcon) return;
  if (lang === "ar") {
    prevIcon.className = "fa-solid fa-chevron-right";
    nextIcon.className = "fa-solid fa-chevron-left";
  } else {
    prevIcon.className = "fa-solid fa-chevron-left";
    nextIcon.className = "fa-solid fa-chevron-right";
  }
}
function setLang(newLang){
  lang = newLang;
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
  trans.forEach(el => el.textContent = el.dataset[lang]);
  toggleBtn.textContent = lang === "en" ? "AR" : "EN";
  setArrowIcons_();
  initBranches();
  if (weekStartISO) renderCalendar(selectedBranch, weekStartISO);
}
toggleBtn.addEventListener("click", () => setLang(lang === "en" ? "ar" : "en"));
function initBranches(){
  branchSelect.innerHTML = "";
  BRANCHES.forEach(b=>{
    const opt = document.createElement("option");
    opt.value = b;
    opt.textContent = branchName(b);
    branchSelect.appendChild(opt);
  });
  branchSelect.value = selectedBranch;
}
initBranches();
function availKey(branch, startISO){ return `${branch}|${startISO}`; }

function getAvailFromCache(branch, startISO){
  const k = availKey(branch, startISO);
  const obj = availabilityCache[k];
  if (!obj) return null;
  if ((Date.now() - obj.t) > AVAIL_CACHE_TTL_MS) return null;
  return obj.av;
}
function setAvailCache(branch, startISO, av){
  availabilityCache[availKey(branch,startISO)] = { t: Date.now(), av };
}
function updateMinDateUI_(minDate){
  minDateText.textContent = (lang==="ar")
    ? `الحجز يبدأ من تاريخ ${fmtDateUI(minDate)}`
    : `Booking starts from ${fmtDateUI(minDate)}`;
}
async function bootstrapBranchWeek_(branch, startISO){
  const api = BRANCH_API[branch];
  const cached = getAvailFromCache(branch, startISO);
  if (cached && cached.days) return { ok:true, minDate:minDateByBranch[branch], availability: cached };
  const url = api + `?action=bootstrap&start=${encodeURIComponent(startISO)}&days=${encodeURIComponent(WEEK_DAYS)}`;
  const data = await fetchJsonWithTimeout(proxyUrl(url), 12000);
  if (!data || !data.ok || !data.availability || !data.availability.days) {
    throw new Error("Bad bootstrap response");
  }
  const minDate = data.minDate || isoTodayPlus(12);
  minDateByBranch[branch] = minDate;
  setAvailCache(branch, startISO, data.availability);
  return { ok:true, minDate, availability: data.availability };
}
async function ensureMinDateForBranch(branch){
  if (minDateByBranch[branch]) return minDateByBranch[branch];
  const api = BRANCH_API[branch];
  try {
    const ping = await fetchJsonWithTimeout(proxyUrl(api + "?action=ping"), 9000);
    const minDate = ping.minDate || isoTodayPlus(12);
    minDateByBranch[branch] = minDate;
    return minDate;
  } catch {
    const minDate = isoTodayPlus(12);
    minDateByBranch[branch] = minDate;
    return minDate;
  }
}
function preloadAllBranchesWeek_(startISO){
  BRANCHES.forEach(async (b) => {
    try {
      const minDate = await ensureMinDateForBranch(b);
      const safeStart = (compareISO(startISO, minDate) < 0) ? minDate : startISO;
      await bootstrapBranchWeek_(b, safeStart);
    } catch {}
  });
}
async function preloadSelectedBranchWeek_(branch, startISO){
  availMsg.className = "msg";
  availMsg.textContent = (lang==="ar") ? "جاري تحميل المواعيد..." : "Loading availability...";

  const minDate = await ensureMinDateForBranch(branch);
  updateMinDateUI_(minDate);
  const safeStart = (compareISO(startISO, minDate) < 0) ? minDate : startISO;
  try {
    const boot = await bootstrapBranchWeek_(branch, safeStart);
    availMsg.className = "msg ok";
    availMsg.textContent = (lang==="ar") ? "تم تحميل المواعيد" : "Availability loaded";
    return { startISO: safeStart, availability: boot.availability };
  } catch (e) {
    calendar.innerHTML = "";
    availMsg.className = "msg bad";
    availMsg.textContent = (lang==="ar")
      ? ("فشل تحميل المواعيد: " + (e?.message || e))
      : ("Availability error: " + (e?.message || e));
    return { startISO: safeStart, availability: null };
  }
}
async function renderCalendar(branch, startISO){
  const minDate = await ensureMinDateForBranch(branch);
  updateMinDateUI_(minDate);
  let safeStart = startISO || minDate;
  if (compareISO(safeStart, minDate) < 0) safeStart = minDate;
  weekStartISO = safeStart;
  const loaded = await preloadSelectedBranchWeek_(branch, safeStart);
  const av = loaded.availability;
  if (!av || !av.days) return;

  if (weekPrevBtn) {
    const prev = addDaysISO(weekStartISO, -7);
    weekPrevBtn.disabled = (compareISO(prev, minDate) < 0);
    weekPrevBtn.style.opacity = weekPrevBtn.disabled ? "0.45" : "1";
  }
  calendar.innerHTML = "";
  av.days.forEach(day => {
    const div = document.createElement("div");
    div.className = "day " + (day.full ? "full" : "ok");
    div.dataset.iso = day.date;
    div.innerHTML = `
      <div class="d">${fmtDateUI(day.date)}</div>
      <div class="s">${
        day.full
          ? (lang==="ar" ? "ممتلئ" : "Full")
          : ((lang==="ar" ? "متاح" : "Available") + ` (${day.remaining})`)
      }</div>
    `;
    if (!day.full) {
      div.addEventListener("click", () => {
        [...calendar.querySelectorAll(".day")].forEach(x => x.classList.remove("selected"));
        div.classList.add("selected");
        selectedDateISO = day.date;
        createMsg.className = "msg";
        createMsg.textContent = (lang==="ar")
          ? ("اليوم المختار: " + fmtDateUI(day.date))
          : ("Selected: " + fmtDateUI(day.date));
      });
    }
    calendar.appendChild(div);
  });
  preloadAllBranchesWeek_(weekStartISO);
  const next = addDaysISO(weekStartISO, 7);
  bootstrapBranchWeek_(branch, next).catch(()=>{});
}
branchSelect.addEventListener("change", async () => {
  selectedBranch = branchSelect.value;
  selectedDateISO = "";
  createMsg.textContent = "";

  const minDate = await ensureMinDateForBranch(selectedBranch);
  weekStartISO = minDate;
  await renderCalendar(selectedBranch, weekStartISO);
});
if (weekPrevBtn) {
  weekPrevBtn.addEventListener("click", async () => {
    const minDate = await ensureMinDateForBranch(selectedBranch);
    const prev = addDaysISO(weekStartISO, -7);
    if (compareISO(prev, minDate) < 0) return;

    selectedDateISO = "";
    await renderCalendar(selectedBranch, prev);
  });
}
if (weekNextBtn) {
  weekNextBtn.addEventListener("click", async () => {
    const next = addDaysISO(weekStartISO, 7);
    selectedDateISO = "";
    await renderCalendar(selectedBranch, next);
  });
}
function cacheKey(phone){ return "ae_lookup_" + phone; }
function loadCache(phone){
  try {
    const raw = localStorage.getItem(cacheKey(phone));
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (!obj || !obj.t || !obj.data) return null;
    if ((Date.now() - obj.t) > LOOKUP_CACHE_TTL_MS) return null;
    return obj.data;
  } catch { return null; }
}
function saveCache(phone, data){
  try { localStorage.setItem(cacheKey(phone), JSON.stringify({ t: Date.now(), data })); } catch {}
}
function setCustomerUI(customer, sourceBranch){
  customerPanel.classList.remove("hidden");
  cName.textContent  = customer.name || "—";
  cModel.textContent = customer.carModel || "—";
  cColor.textContent = customer.carColor || "—";
  cYear.textContent  = customer.carYear || "—";
  cFilm.textContent  = customer.filmType || "—";
  sourceBadgeText.textContent = (lang==="ar")
    ? ("البيانات من: " + (BRANCH_INFO[sourceBranch]?.ar || sourceBranch))
    : ("Source: " + (BRANCH_INFO[sourceBranch]?.en || sourceBranch));
}
async function lookupBranch(phone, branch){
  const api = BRANCH_API[branch];
  const url = api + `?action=lookup&phone=${encodeURIComponent(phone)}`;
  const res = await fetchJsonWithTimeout(proxyUrl(url), 9000);
  if (res && res.ok && res.customer && res.customer.ok && res.customer.found) {
    return { found:true, branch, customer: res.customer.customer };
  }
  return { found:false };
}
async function lookupFast(phone){
  try {
    const first = await lookupBranch(phone, selectedBranch);
    if (first.found) return first;
  } catch {}
  const others = BRANCHES.filter(b => b !== selectedBranch);
  return await new Promise((resolve) => {
    let done = false;
    let pending = others.length;
    if (!pending) return resolve({ found:false });
    others.forEach(async (b) => {
      try {
        const hit = await lookupBranch(phone, b);
        if (!done && hit.found) { done = true; return resolve(hit); }
      } catch {}
      pending--;
      if (!done && pending <= 0) resolve({ found:false });
    });
  });
}
searchBtn.addEventListener("click", async () => {
  const phone = normPhoneLocal(phoneInput.value);
  createMsg.textContent = "";
  lookupMsg.className = "msg";
  if (!phone) {
    lookupMsg.className = "msg bad";
    lookupMsg.textContent = (lang==="ar") ? "اكتب رقم موبايل صحيح" : "Enter a valid phone";
    return;
  }
  const cached = loadCache(phone);
  if (cached && cached.customer && cached.sourceBranch) {
    customerCache = { phone, ...cached.customer, sourceBranch: cached.sourceBranch };
    setCustomerUI(cached.customer, cached.sourceBranch);
    lookupMsg.className = "msg ok";
    lookupMsg.textContent = (lang==="ar") ? "تم تحميل البيانات فورًا" : "Loaded instantly";
    lookupFast(phone).then(hit=>{
      if (hit && hit.found) {
        customerCache = { phone, ...hit.customer, sourceBranch: hit.branch };
        setCustomerUI(hit.customer, hit.branch);
        saveCache(phone, { customer: hit.customer, sourceBranch: hit.branch });
      }
    });
    return;
  }
  lookupMsg.textContent = (lang==="ar") ? "جاري البحث..." : "Searching...";
  customerPanel.classList.add("hidden");
  customerCache = null;

  const hit = await lookupFast(phone);
  if (!hit.found) {
    lookupMsg.className = "msg bad";
    lookupMsg.textContent = (lang==="ar") ? "الرقم غير موجود في البيانات" : "Customer not found";
    return;
  }
  customerCache = { phone, ...hit.customer, sourceBranch: hit.branch };
  setCustomerUI(hit.customer, hit.branch);
  saveCache(phone, { customer: hit.customer, sourceBranch: hit.branch });
  lookupMsg.className = "msg ok";
  lookupMsg.textContent = (lang==="ar") ? "تم العثور على بيانات العميل" : "Customer found";
});
function qrUrl_(text){
  const data = encodeURIComponent(text);
  return `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=8&data=${data}`;
}
function ensureSuccessModal_(){
  let modal = document.getElementById("successModal");
  if (modal) return modal;
  modal = document.createElement("div");
  modal.id = "successModal";
  modal.innerHTML = `
    <div class="sm-backdrop"></div>
    <div class="sm-box" role="dialog" aria-modal="true">
      <div class="sm-head">
        <div class="sm-title">
          <i class="fa-solid fa-circle-check"></i>
          <span id="smTitle">Booking Confirmed</span>
        </div>
        <button class="sm-x" id="smClose" aria-label="Close">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>
      <div class="sm-body">
        <div class="sm-top">
          <div class="sm-id">
            <span id="smIdLabel">Booking ID</span>
            <div class="sm-id-row">
              <b id="smIdValue">—</b>
              <button class="sm-copy" id="smCopy">
                <i class="fa-regular fa-copy"></i>
                <span id="smCopyText">Copy</span>
              </button>
            </div>
            <div class="sm-mini" id="smMini">—</div>
          </div>
          <div class="sm-qr">
            <img id="smQrImg" alt="QR" />
            <div class="sm-qr-cap" id="smQrCap">Scan</div>
          </div>
        </div>
        <div class="sm-grid">
          <div class="sm-line"><span id="smBranchK">Branch</span><b id="smBranchV">—</b></div>
          <div class="sm-line"><span id="smDateK">Date</span><b id="smDateV">—</b></div>
          <div class="sm-line"><span id="smPhoneK">Phone</span><b id="smPhoneV">—</b></div>
          <div class="sm-line"><span id="smNameK">Name</span><b id="smNameV">—</b></div>
          <div class="sm-line"><span id="smCarK">Car</span><b id="smCarV">—</b></div>
          <div class="sm-line"><span id="smNotesK">Notes</span><b id="smNotesV">—</b></div>
        </div>
        <div class="sm-loc">
          <div class="sm-loc-head">
            <i class="fa-solid fa-location-dot"></i>
            <b id="smLocTitle">Location</b>
          </div>
          <div class="sm-loc-body">
            <div id="smLocAddr">—</div>
            <a id="smLocMap" target="_blank" class="sm-map-btn" href="#">
              <i class="fa-solid fa-map"></i>
              <span id="smMapText">Open Map</span>
            </a>
          </div>
        </div>
        <div class="sm-inst" id="smInst">
          <i class="fa-solid fa-shield-halved"></i>
          <div class="sm-inst-txt" id="smInstText">—</div>
        </div>
      </div>
      <div class="sm-actions">
        <button class="sm-btn sm-ok" id="smOk">
          <i class="fa-solid fa-check"></i>
          <span id="smOkText">Done</span>
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  return modal;
}
function openSuccessModal_(data){
  const modal = ensureSuccessModal_();
  const isAr = (lang === "ar");
  const bi = BRANCH_INFO[data.branch] || {};
  const branchLabel = isAr ? (bi.ar || data.branch) : (bi.en || data.branch);
  const addr = isAr ? (bi.addr_ar || "—") : (bi.addr_en || "—");
  const mapUrl = bi.map || "#";
  const instruction_ar = `تقدر تزور فرع ${bi.ar || data.branch} من الساعة 10 صباحًا إلى 1 ظهرًا. حضرتك بس تسيب العربية هناك، وفريق الـ Operation هيستلمها ويتابع كل حاجة ويهتم بيها بالكامل.`;
  const instruction_en = `You can visit ${bi.en || data.branch} branch from 10:00 AM to 1:00 PM. Please leave the car there, and our Operation team will receive it and handle everything end-to-end.`;
  const instr = isAr ? instruction_ar : instruction_en;
  document.getElementById("smTitle").textContent = isAr ? "تم تأكيد الحجز" : "Booking Confirmed";
  document.getElementById("smIdLabel").textContent = isAr ? "رقم الحجز" : "Booking ID";
  document.getElementById("smCopyText").textContent = isAr ? "نسخ" : "Copy";
  document.getElementById("smBranchK").textContent = isAr ? "الفرع" : "Branch";
  document.getElementById("smDateK").textContent = isAr ? "التاريخ" : "Date";
  document.getElementById("smPhoneK").textContent = isAr ? "الموبايل" : "Phone";
  document.getElementById("smNameK").textContent = isAr ? "الاسم" : "Name";
  document.getElementById("smCarK").textContent = isAr ? "السيارة" : "Car";
  document.getElementById("smNotesK").textContent = isAr ? "ملاحظات" : "Notes";
  document.getElementById("smLocTitle").textContent = isAr ? "الموقع" : "Location";
  document.getElementById("smMapText").textContent = isAr ? "فتح الخريطة" : "Open Map";
  document.getElementById("smOkText").textContent = isAr ? "تم" : "Done";
  document.getElementById("smQrCap").textContent = isAr ? "امسح الكود" : "Scan QR";
  document.getElementById("smIdValue").textContent = data.orderId || "—";
  document.getElementById("smMini").textContent = isAr
    ? `الفرع: ${branchLabel} • التاريخ: ${fmtDateUI(data.dateISO)}`
    : `Branch: ${branchLabel} • Date: ${fmtDateUI(data.dateISO)}`;
  document.getElementById("smBranchV").textContent = branchLabel;
  document.getElementById("smDateV").textContent   = fmtDateUI(data.dateISO);
  document.getElementById("smPhoneV").textContent  = data.phone || "—";
  document.getElementById("smNameV").textContent   = data.name || "—";
  document.getElementById("smCarV").textContent    = [data.carModel, data.carColor, data.carYear].filter(Boolean).join(" • ") || "—";
  document.getElementById("smNotesV").textContent  = data.notes || "—";
  document.getElementById("smLocAddr").textContent = addr;
  document.getElementById("smLocMap").href = mapUrl;
  document.getElementById("smInstText").textContent = instr;
  const qrText = `Abdo El Amir Booking\nID: ${data.orderId}\nBranch: ${branchLabel}\nDate: ${fmtDateUI(data.dateISO)}\nPhone: ${data.phone || ""}`;
  document.getElementById("smQrImg").src = qrUrl_(qrText);
  modal.classList.add("show");
  const close = () => modal.classList.remove("show");
  document.getElementById("smClose").onclick = close;
  document.getElementById("smOk").onclick = close;
  modal.querySelector(".sm-backdrop").onclick = close;
  const copyBtn = document.getElementById("smCopy");
  copyBtn.onclick = async () => {
    try {
      await navigator.clipboard.writeText(String(data.orderId || ""));
      copyBtn.innerHTML = `<i class="fa-solid fa-check"></i><span>${isAr ? "تم النسخ" : "Copied"}</span>`;
      setTimeout(() => {
        copyBtn.innerHTML = `<i class="fa-regular fa-copy"></i><span>${isAr ? "نسخ" : "Copy"}</span>`;
      }, 1200);
    } catch {
      alert(isAr ? "لم يتم النسخ" : "Copy failed");
    }
  };
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); }, { once:true });
}
createBtn.addEventListener("click", async () => {
  createMsg.className = "msg";
  if (!customerCache) {
    createMsg.className = "msg bad";
    createMsg.textContent = (lang==="ar") ? "ابحث عن العميل أولاً" : "Search customer first";
    return;
  }
  if (!selectedDateISO) {
    createMsg.className = "msg bad";
    createMsg.textContent = (lang==="ar") ? "اختر يوم الحجز" : "Pick a booking day";
    return;
  }
  createBtn.disabled = true;
  createBtn.style.opacity = "0.75";
  const api = BRANCH_API[selectedBranch];
  const bi = BRANCH_INFO[selectedBranch] || {};
  const mapUrl = bi.map || "";
  const createUrl =
    api +
    "?action=create" +
    "&phone=" + encodeURIComponent(customerCache.phone) +
    "&bookingDate=" + encodeURIComponent(selectedDateISO) +
    "&notes=" + encodeURIComponent(notesInput.value || "") +
    "&name=" + encodeURIComponent(customerCache.name || "") +
    "&carModel=" + encodeURIComponent(customerCache.carModel || "") +
    "&carColor=" + encodeURIComponent(customerCache.carColor || "") +
    "&carYear=" + encodeURIComponent(customerCache.carYear || "") +
    "&filmType=" + encodeURIComponent(customerCache.filmType || "") +
    "&lang=" + encodeURIComponent(lang) +
    "&branch=" + encodeURIComponent(branchName(selectedBranch)) +
    "&mapUrl=" + encodeURIComponent(mapUrl);
  createMsg.textContent = (lang==="ar") ? "جاري إنشاء الحجز..." : "Creating booking...";
  try {
    const res = await fetchJsonWithTimeout(proxyUrl(createUrl), 12000);
    if (!res || !res.ok) throw new Error(res && res.message ? res.message : "Create failed");
    createMsg.className = "msg ok";
    createMsg.textContent = (lang==="ar")
      ? ("تم تأكيد الحجز. رقم: " + res.orderId)
      : ("Booking confirmed. ID: " + res.orderId);
    openSuccessModal_({
      orderId: res.orderId,
      branch: selectedBranch,
      dateISO: selectedDateISO,
      phone: customerCache.phone,
      name: customerCache.name,
      carModel: customerCache.carModel,
      carColor: customerCache.carColor,
      carYear: customerCache.carYear,
      notes: notesInput.value || ""
    });
    await renderCalendar(selectedBranch, weekStartISO);
    selectedDateISO = "";
    notesInput.value = "";
  } catch (e) {
    createMsg.className = "msg bad";
    createMsg.textContent = (lang==="ar")
      ? ("فشل إنشاء الحجز: " + (e?.message || e))
      : ("Booking failed: " + (e?.message || e));
  } finally {
    createBtn.disabled = false;
    createBtn.style.opacity = "1";
  }
});
(async function init(){
  setLang("en");
  await ensureMinDateForBranch(selectedBranch);
  weekStartISO = minDateByBranch[selectedBranch] || isoTodayPlus(12);
  await renderCalendar(selectedBranch, weekStartISO);
  preloadAllBranchesWeek_(weekStartISO);
})();
