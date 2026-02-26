// ============================================
// Abdo El Amir — Revisit Booking (Samsung-safe)
// - No JSONP (uses Netlify proxy) => fixes Samsung JSONP network error
// - Fast lookup: cache + selected branch first + early success
// ============================================

const BRANCH_API = {
  "Nasr City": "https://script.google.com/macros/s/AKfycbxwal_GJHeIhqhbFojUyt6a2yI8MKtwS0tg-YoPavgPF1rluPmzIElk9on9Uoxi1lpcDg/exec",
  "AUC": "https://script.google.com/macros/s/AKfycbwibhM0RPkWsKkUJQ9My0ycfHhS9oo6PoEZ5sWlZByB8sT7n-QLMVqUsIYU4BoR59Lr4A/exec",
  "Maadi": "https://script.google.com/macros/s/AKfycbyCBr6FPYhjTbndMvUCYNCSq9UseDPcbPQQLdol9KPTJnnnk1JXEi4DyW_bDrlYXylT1Q/exec",
  "Zayed": "https://script.google.com/macros/s/AKfycbymxUsSnwd7zYejyhiwuzuafJ9pfIzYqDTpOc9WIR-I3pMCMuJZ4a5XqPlyYmYTzmtv/exec",
  "October": "https://script.google.com/macros/s/AKfycbySjCDtGsHh94ukD1XpHVWwiqXc7kzdQoAVEQyCnf66cI6-NhIYbnLWnYNK63XmWLiaqQ/exec",
};
const BRANCHES = Object.keys(BRANCH_API);

// ===== Tuning (speed) =====
const AVAIL_DAYS = 30;
const LOOKUP_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 9000; // aim for < 1 sec on cache, few sec on network

// ===== UI state =====
let lang = "en";
let selectedBranch = BRANCHES[0];
let selectedDateISO = "";
let customerCache = null;
let availabilityCache = {};

// ===== DOM =====
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

function fmtDateUI(iso){ return String(iso || ""); }

// ===== Branch info (edit if needed) =====
const BRANCH_INFO = {
  "Nasr City": { ar:"مدينة نصر", en:"Nasr City", addr_ar:"خلف مول السراج", addr_en:"Behind El Serag Mall", map:"https://maps.app.goo.gl/g3zhYzNELks3YXa29" },
  "AUC": { ar:"التجمع الخامس", en:"AUC", addr_ar:"شارع التسعين الجنوبي، مول الجامعة الأمريكية", addr_en:"South 90th Street, AUC Mall", map:"https://maps.app.goo.gl/ukuJkYmuQbeNfH4H7" },
  "Maadi": { ar:"المعادي", en:"Maadi", addr_ar:"محور حسب الله الكفراوي", addr_en:"Hassab Allah Kafrawy Axis", map:"https://maps.app.goo.gl/szmagQ9WdrUYetkM7" },
  "Zayed": { ar:"الشيخ زايد", en:"Sheikh Zayed", addr_ar:"وصلة دهشور، جميرا G21", addr_en:"Dahshur Link, Jumeirah G21", map:"https://maps.app.goo.gl/aDiZxX6Nte39SyQb8" },
  "October": { ar:"٦ أكتوبر", en:"6th of October", addr_ar:"المحور المركزي، شارع الخزان الأول", addr_en:"Central Axis, First Al-Khazan Street", map:"https://maps.app.goo.gl/mso2BCnqRNYPLMhU6" },
};

function branchName(b){ return lang==="ar" ? (BRANCH_INFO[b]?.ar || b) : (BRANCH_INFO[b]?.en || b); }

// ===== Proxy fetch =====
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

function normPhoneLocal(v){
  const d = String(v||"").replace(/\D/g,"");
  let local = d.startsWith("20") ? d.slice(2) : d;
  if (local.length === 10 && local.startsWith("1")) local = "0" + local;
  return local;
}

function isoTodayPlus(n){
  const dt = new Date();
  dt.setDate(dt.getDate()+n);
  const y = dt.getFullYear();
  const m = String(dt.getMonth()+1).padStart(2,"0");
  const d = String(dt.getDate()).padStart(2,"0");
  return `${y}-${m}-${d}`;
}

// ===== Language toggle =====
function setLang(newLang){
  lang = newLang;
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
  trans.forEach(el => el.textContent = el.dataset[lang]);
  toggleBtn.textContent = lang === "en" ? "AR" : "EN";
  initBranches();
  if (availabilityCache[selectedBranch]) renderCalendar(selectedBranch);
}
toggleBtn.addEventListener("click", () => setLang(lang === "en" ? "ar" : "en"));

// ===== Branch select =====
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

branchSelect.addEventListener("change", async () => {
  selectedBranch = branchSelect.value;
  selectedDateISO = "";
  createMsg.textContent = "";
  await preloadBranchAvailability(selectedBranch);
  renderCalendar(selectedBranch);
});

// ===== Availability (NO JSONP) =====
async function preloadBranchAvailability(branch){
  availMsg.className = "msg";
  availMsg.textContent = (lang==="ar") ? "جاري تحميل المواعيد..." : "Loading availability...";

  const api = BRANCH_API[branch];

  try {
    const ping = await fetchJsonWithTimeout(proxyUrl(api + "?action=ping"), 9000);
    const minDate = ping.minDate || isoTodayPlus(12);

    minDateText.textContent = (lang==="ar")
      ? `الحجز يبدأ من تاريخ ${fmtDateUI(minDate)}`
      : `Booking starts from ${fmtDateUI(minDate)}`;

    const av = await fetchJsonWithTimeout(
      proxyUrl(api + `?action=availability&start=${encodeURIComponent(minDate)}&days=${encodeURIComponent(AVAIL_DAYS)}`),
      12000
    );

    if (!av || !av.ok || !av.availability || !av.availability.days) throw new Error("Bad availability response");

    availabilityCache[branch] = av.availability;
    availMsg.className = "msg ok";
    availMsg.textContent = (lang==="ar") ? "تم تحميل المواعيد" : "Availability loaded";

  } catch (e) {
    availabilityCache[branch] = null;
    calendar.innerHTML = "";
    availMsg.className = "msg bad";
    availMsg.textContent = (lang==="ar")
      ? ("فشل تحميل المواعيد: " + (e?.message || e))
      : ("Availability error: " + (e?.message || e));
  }
}

// ===== Ultra-fast lookup (cache + staged) =====
function cacheKey(phone){ return "ae_lookup_" + phone; }

function loadCache(phone){
  try {
    const raw = localStorage.getItem(cacheKey(phone));
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (!obj || !obj.t || !obj.data) return null;
    if ((Date.now() - obj.t) > LOOKUP_CACHE_TTL_MS) return null;
    return obj.data; // { customer, sourceBranch }
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
  const res = await fetchJsonWithTimeout(
    proxyUrl(api + `?action=lookup&phone=${encodeURIComponent(phone)}`),
    9000
  );
  if (res && res.ok && res.customer && res.customer.ok && res.customer.found) {
    return { found:true, branch, customer: res.customer.customer };
  }
  return { found:false };
}

async function lookupFast(phone){
  // 1) Selected branch first (fast path)
  try {
    const first = await lookupBranch(phone, selectedBranch);
    if (first.found) return first;
  } catch {}

  // 2) Early success parallel (resolve on first found)
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

  // 0) Instant cache => typically < 1 second
  const cached = loadCache(phone);
  if (cached && cached.customer && cached.sourceBranch) {
    customerCache = { phone, ...cached.customer, sourceBranch: cached.sourceBranch };
    setCustomerUI(cached.customer, cached.sourceBranch);
    lookupMsg.className = "msg ok";
    lookupMsg.textContent = (lang==="ar") ? "تم تحميل البيانات فورًا" : "Loaded instantly";

    // background refresh (silent)
    lookupFast(phone).then(hit=>{
      if (hit && hit.found) {
        customerCache = { phone, ...hit.customer, sourceBranch: hit.branch };
        setCustomerUI(hit.customer, hit.branch);
        saveCache(phone, { customer: hit.customer, sourceBranch: hit.branch });
      }
    });
    return;
  }

  // Show searching
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

// ===== Calendar render =====
function renderCalendar(branch){
  const av = availabilityCache[branch];
  if (!av || !av.days) return;

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
}

/* =========================================
   SUCCESS WIDGET (after booking) — with QR
   ========================================= */
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

  const style = document.createElement("style");
  style.textContent = `
    #successModal{position:fixed;inset:0;z-index:10000;display:none}
    #successModal.show{display:block}
    .sm-backdrop{position:absolute;inset:0;background:rgba(0,0,0,.65);backdrop-filter:blur(8px)}
    .sm-box{
      position:absolute;left:50%;top:50%;
      transform:translate(-50%,-50%);
      width:min(720px, calc(100% - 24px));
      background:linear-gradient(145deg,#0f0f0f,#060606);
      border:1px solid rgba(255,255,255,.09);
      border-radius:18px;
      box-shadow:0 30px 90px rgba(0,0,0,.7);
      padding:14px;
    }
    .sm-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}
    .sm-title{display:flex;align-items:center;gap:10px;font-weight:900}
    .sm-title i{color:var(--ok)}
    .sm-x{background:transparent;border:1px solid rgba(255,255,255,.10);color:#fff;border-radius:12px;padding:8px 10px;cursor:pointer}
    .sm-x:hover{border-color:rgba(201,162,77,.25);transform:translateY(-1px)}
    .sm-body{padding:6px 6px 2px}

    .sm-top{display:grid;grid-template-columns:1.3fr .7fr;gap:12px;align-items:stretch;margin-bottom:12px}
    .sm-id{
      border:1px solid rgba(255,255,255,.08);
      background:rgba(255,255,255,.03);
      border-radius:16px;
      padding:12px;
    }
    .sm-id span{color:var(--muted);font-weight:900}
    .sm-id-row{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:10px}
    .sm-id-row b{font-size:1.05rem}
    .sm-mini{margin-top:8px;color:var(--muted);font-weight:900}

    .sm-copy{
      border:1px solid rgba(255,255,255,.12);
      background:rgba(255,255,255,.06);
      color:#fff;border-radius:14px;
      padding:10px 12px;font-weight:900;cursor:pointer;
      display:inline-flex;gap:10px;align-items:center;
      transition:.2s ease;
      white-space:nowrap;
    }
    .sm-copy:hover{transform:translateY(-1px);border-color:rgba(201,162,77,.25)}

    .sm-qr{
      border:1px solid rgba(255,255,255,.08);
      background:rgba(255,255,255,.03);
      border-radius:16px;
      padding:10px;
      display:flex;flex-direction:column;align-items:center;justify-content:center;
      gap:8px;
    }
    .sm-qr img{width:200px;height:200px;border-radius:14px;background:#fff}
    .sm-qr-cap{color:var(--muted);font-weight:900}

    .sm-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
    .sm-line{
      display:flex;justify-content:space-between;gap:12px;
      padding:10px 10px;border:1px solid rgba(255,255,255,.07);
      background:rgba(255,255,255,.03);border-radius:14px;
    }
    .sm-line span{color:var(--muted);font-weight:900}
    .sm-line b{font-weight:900}

    .sm-loc{
      margin-top:12px;
      border:1px solid rgba(255,255,255,.08);
      background:rgba(255,255,255,.03);
      border-radius:16px;
      padding:12px;
    }
    .sm-loc-head{display:flex;align-items:center;gap:10px;margin-bottom:8px}
    .sm-loc-head i{color:var(--gold)}
    .sm-loc-body{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
    .sm-map-btn{
      text-decoration:none;
      display:inline-flex;align-items:center;gap:10px;
      padding:10px 12px;border-radius:14px;
      border:1px solid rgba(255,255,255,.10);
      background:rgba(255,255,255,.06);
      color:#fff;font-weight:900;
      transition:.2s ease;
    }
    .sm-map-btn:hover{transform:translateY(-1px);border-color:rgba(201,162,77,.25)}

    .sm-inst{
      margin-top:12px;
      display:flex;gap:10px;align-items:flex-start;
      padding:12px;border-radius:16px;
      background:rgba(201,162,77,.10);
      border:1px solid rgba(201,162,77,.22);
      color:var(--gold);
      font-weight:900;
      line-height:1.7;
    }
    .sm-inst i{margin-top:2px}

    .sm-actions{display:flex;justify-content:flex-end;margin-top:12px}
    .sm-btn{
      border:none;cursor:pointer;border-radius:14px;
      padding:12px 14px;font-weight:900;display:inline-flex;gap:10px;align-items:center;
      transition:.2s ease;
    }
    .sm-ok{background:var(--gold);color:#000}
    .sm-ok:hover{transform:translateY(-1px);box-shadow:0 12px 30px rgba(201,162,77,.22)}

    @media(max-width:820px){
      .sm-top{grid-template-columns:1fr}
      .sm-grid{grid-template-columns:1fr}
      .sm-qr img{width:180px;height:180px}
    }
  `;
  document.head.appendChild(style);

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

  // labels
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

  // values
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

// ===== Create booking =====
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
    "&filmType=" + encodeURIComponent(customerCache.filmType || "");

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

    await preloadBranchAvailability(selectedBranch);
    renderCalendar(selectedBranch);

    selectedDateISO = "";
    notesInput.value = "";

  } catch (e) {
    createMsg.className = "msg bad";
    createMsg.textContent = (lang==="ar") ? ("فشل إنشاء الحجز: " + (e?.message || e)) : ("Booking failed: " + (e?.message || e));
  } finally {
    createBtn.disabled = false;
    createBtn.style.opacity = "1";
  }
});

// ===== Init =====
(async function init(){
  setLang("en");
  await preloadBranchAvailability(selectedBranch);
  renderCalendar(selectedBranch);
})();
