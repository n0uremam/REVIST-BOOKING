// ===== Branch WebApp URLs (your provided) =====
const BRANCH_API = {
  "Nasr City": "https://script.google.com/macros/s/AKfycbxwal_GJHeIhqhbFojUyt6a2yI8MKtwS0tg-YoPavgPF1rluPmzIElk9on9Uoxi1lpcDg/exec",
  "AUC": "https://script.google.com/macros/s/AKfycbwibhM0RPkWsKkUJQ9My0ycfHhS9oo6PoEZ5sWlZByB8sT7n-QLMVqUsIYU4BoR59Lr4A/exec",
  "Maadi": "https://script.google.com/macros/s/AKfycbyCBr6FPYhjTbndMvUCYNCSq9UseDPcbPQQLdol9KPTJnnnk1JXEi4DyW_bDrlYXylT1Q/exec",
  "Zayed": "https://script.google.com/macros/s/AKfycbymxUsSnwd7zYejyhiwuzuafJ9pfIzYqDTpOc9WIR-I3pMCMuJZ4a5XqPlyYmYTzmtv/exec",
  "October": "https://script.google.com/macros/s/AKfycbySjCDtGsHh94ukD1XpHVWwiqXc7kzdQoAVEQyCnf66cI6-NhIYbnLWnYNK63XmWLiaqQ/exec",
};

const BRANCHES = Object.keys(BRANCH_API);

// ===== UI State =====
let lang = "en";
let selectedDateISO = "";
let selectedBranch = BRANCHES[0];

let customerCache = null;       // { phone, name, carModel, carColor, carYear, filmType, sourceBranch }
let availabilityCache = {};     // branch -> availability object

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

// ===== Date Display =====
function fmtDateUI(iso) { return String(iso || ""); }

// ===== Language =====
function branchNameAr(b){
  if (b==="Nasr City") return "مدينة نصر";
  if (b==="AUC") return "التجمع الخامس";
  if (b==="Maadi") return "المعادي";
  if (b==="Zayed") return "الشيخ زايد";
  if (b==="October") return "٦ أكتوبر";
  return b;
}

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

// ===== JSONP helper (Netlify-safe) =====
function jsonp(url, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const cbName = "cb_" + Math.random().toString(36).slice(2);
    const script = document.createElement("script");
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("JSONP timeout"));
    }, timeoutMs);

    function cleanup() {
      clearTimeout(timer);
      if (script.parentNode) script.parentNode.removeChild(script);
      try { delete window[cbName]; } catch (e) { window[cbName] = undefined; }
    }

    window[cbName] = (data) => {
      cleanup();
      resolve(data);
    };

    script.onerror = () => {
      cleanup();
      reject(new Error("JSONP network error"));
    };

    const sep = url.includes("?") ? "&" : "?";
    script.src = url + sep + "callback=" + encodeURIComponent(cbName) + "&_=" + Date.now();
    document.body.appendChild(script);
  });
}

// ===== Fetch JSON (create) =====
async function fetchJson(url) {
  const r = await fetch(url, { method: "GET", cache: "no-store" });
  const txt = await r.text();
  try { return JSON.parse(txt); } catch(e) { throw new Error("Non-JSON response"); }
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

// ===== Branch Select =====
function initBranches(){
  branchSelect.innerHTML = "";
  BRANCHES.forEach(b=>{
    const opt = document.createElement("option");
    opt.value = b;
    opt.textContent = (lang==="ar") ? branchNameAr(b) : b;
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

// ===== Availability preload =====
async function preloadBranchAvailability(branch){
  availMsg.className = "msg";
  availMsg.textContent = (lang==="ar") ? "جاري تحميل المواعيد..." : "Loading availability...";

  const api = BRANCH_API[branch];
  try {
    const ping = await fetchJson(api + "?action=ping&_=" + Date.now());
    const minDate = ping.minDate || isoTodayPlus(12);

    minDateText.textContent = (lang==="ar")
      ? `الحجز يبدأ من تاريخ ${fmtDateUI(minDate)}`
      : `Booking starts from ${fmtDateUI(minDate)}`;

    const days = 30;
    const url = api + "?action=availability_jsonp&start=" + encodeURIComponent(minDate) + "&days=" + days;
    const res = await jsonp(url, 20000);

    if (!res || !res.ok || !res.availability) throw new Error("Bad availability response");

    availabilityCache[branch] = res.availability;

    availMsg.className = "msg ok";
    availMsg.textContent = (lang==="ar") ? "تم تحميل المواعيد" : "Availability loaded";
  } catch (err) {
    availabilityCache[branch] = null;
    availMsg.className = "msg bad";
    availMsg.textContent = (lang==="ar")
      ? ("فشل تحميل المواعيد: " + err.message)
      : ("Availability error: " + err.message);
    calendar.innerHTML = "";
  }
}

// ===== Lookup across all branches =====
async function lookupAcrossBranches(phone){
  const tasks = BRANCHES.map(async (b) => {
    const api = BRANCH_API[b];
    const url = api + "?action=lookup_jsonp&phone=" + encodeURIComponent(phone);
    try {
      const res = await jsonp(url, 12000);
      if (res && res.ok && res.customer && res.customer.ok && res.customer.found) {
        return { found: true, branch: b, customer: res.customer.customer };
      }
      return { found: false };
    } catch(e){
      return { found: false };
    }
  });

  const results = await Promise.all(tasks);
  const hit = results.find(x => x && x.found);
  return hit ? hit : { found: false };
}

function setCustomerUI(customer, sourceBranch){
  customerPanel.classList.remove("hidden");
  cName.textContent  = customer.name || "—";
  cModel.textContent = customer.carModel || "—";
  cColor.textContent = customer.carColor || "—";
  cYear.textContent  = customer.carYear || "—";
  cFilm.textContent  = customer.filmType || "—";

  sourceBadgeText.textContent = (lang==="ar")
    ? ("البيانات من: " + branchNameAr(sourceBranch))
    : ("Source: " + sourceBranch);
}

searchBtn.addEventListener("click", async () => {
  const phone = normPhoneLocal(phoneInput.value);

  lookupMsg.className = "msg";
  createMsg.textContent = "";

  if (!phone) {
    lookupMsg.className = "msg bad";
    lookupMsg.textContent = (lang==="ar") ? "اكتب رقم موبايل صحيح" : "Enter a valid phone";
    return;
  }

  lookupMsg.textContent = (lang==="ar") ? "جاري البحث..." : "Searching...";
  customerPanel.classList.add("hidden");
  customerCache = null;

  const hit = await lookupAcrossBranches(phone);
  if (!hit.found) {
    lookupMsg.className = "msg bad";
    lookupMsg.textContent = (lang==="ar") ? "الرقم غير موجود في البيانات" : "Customer not found";
    return;
  }

  lookupMsg.className = "msg ok";
  lookupMsg.textContent = (lang==="ar") ? "تم العثور على بيانات العميل" : "Customer found";

  customerCache = { phone, ...hit.customer, sourceBranch: hit.branch };
  setCustomerUI(hit.customer, hit.branch);
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
   CONFIRMATION WIDGET (AFTER BOOKING SUCCESS)
   ========================================= */

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
        <div class="sm-id">
          <span id="smIdLabel">Booking ID</span>
          <div class="sm-id-row">
            <b id="smIdValue">—</b>
            <button class="sm-copy" id="smCopy">
              <i class="fa-regular fa-copy"></i>
              <span id="smCopyText">Copy</span>
            </button>
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

        <div class="sm-hint" id="smHint">
          <i class="fa-solid fa-shield-halved"></i>
          <span id="smHintText">Your booking has been saved successfully.</span>
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

  // Inject premium CSS
  const style = document.createElement("style");
  style.textContent = `
    #successModal{position:fixed;inset:0;z-index:10000;display:none}
    #successModal.show{display:block}
    .sm-backdrop{position:absolute;inset:0;background:rgba(0,0,0,.65);backdrop-filter:blur(8px)}
    .sm-box{
      position:absolute;left:50%;top:50%;
      transform:translate(-50%,-50%);
      width:min(560px, calc(100% - 24px));
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
    .sm-id{
      border:1px solid rgba(255,255,255,.08);
      background:rgba(255,255,255,.03);
      border-radius:16px;
      padding:12px;
      margin-bottom:12px;
    }
    .sm-id span{color:var(--muted);font-weight:900}
    .sm-id-row{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:10px}
    .sm-id-row b{font-size:1.05rem}
    .sm-copy{
      border:1px solid rgba(255,255,255,.12);
      background:rgba(255,255,255,.06);
      color:#fff;border-radius:14px;
      padding:10px 12px;font-weight:900;cursor:pointer;
      display:inline-flex;gap:10px;align-items:center;
      transition:.2s ease;
    }
    .sm-copy:hover{transform:translateY(-1px);border-color:rgba(201,162,77,.25)}
    .sm-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
    .sm-line{
      display:flex;justify-content:space-between;gap:12px;
      padding:10px 10px;border:1px solid rgba(255,255,255,.07);
      background:rgba(255,255,255,.03);border-radius:14px;
    }
    .sm-line span{color:var(--muted);font-weight:900}
    .sm-line b{font-weight:900}
    .sm-hint{
      margin-top:12px;
      display:flex;gap:10px;align-items:center;
      padding:10px 12px;border-radius:14px;
      background:rgba(36,211,102,.10);
      border:1px solid rgba(36,211,102,.22);
      color:var(--ok);
      font-weight:900;
    }
    .sm-actions{display:flex;justify-content:flex-end;margin-top:12px}
    .sm-btn{
      border:none;cursor:pointer;border-radius:14px;
      padding:12px 14px;font-weight:900;display:inline-flex;gap:10px;align-items:center;
      transition:.2s ease;
    }
    .sm-ok{background:var(--gold);color:#000}
    .sm-ok:hover{transform:translateY(-1px);box-shadow:0 12px 30px rgba(201,162,77,.22)}
    @media(max-width:720px){ .sm-grid{grid-template-columns:1fr} }
  `;
  document.head.appendChild(style);

  return modal;
}

function openSuccessModal_(data){
  const modal = ensureSuccessModal_();
  const isAr = (lang === "ar");

  // Labels
  document.getElementById("smTitle").textContent = isAr ? "تم تأكيد الحجز" : "Booking Confirmed";
  document.getElementById("smIdLabel").textContent = isAr ? "رقم الحجز" : "Booking ID";
  document.getElementById("smCopyText").textContent = isAr ? "نسخ" : "Copy";

  document.getElementById("smBranchK").textContent = isAr ? "الفرع" : "Branch";
  document.getElementById("smDateK").textContent   = isAr ? "التاريخ" : "Date";
  document.getElementById("smPhoneK").textContent  = isAr ? "الموبايل" : "Phone";
  document.getElementById("smNameK").textContent   = isAr ? "الاسم" : "Name";
  document.getElementById("smCarK").textContent    = isAr ? "السيارة" : "Car";
  document.getElementById("smNotesK").textContent  = isAr ? "ملاحظات" : "Notes";

  document.getElementById("smHintText").textContent = isAr
    ? "تم حفظ الحجز بنجاح."
    : "Your booking has been saved successfully.";

  document.getElementById("smOkText").textContent = isAr ? "تم" : "Done";

  // Values
  document.getElementById("smIdValue").textContent = data.orderId || "—";
  document.getElementById("smBranchV").textContent = isAr ? branchNameAr(data.branch) : data.branch;
  document.getElementById("smDateV").textContent   = fmtDateUI(data.dateISO);
  document.getElementById("smPhoneV").textContent  = data.phone || "—";
  document.getElementById("smNameV").textContent   = data.name || "—";
  document.getElementById("smCarV").textContent    = [data.carModel, data.carColor, data.carYear].filter(Boolean).join(" • ") || "—";
  document.getElementById("smNotesV").textContent  = data.notes || "—";

  // Show modal and handlers
  modal.classList.add("show");

  const close = () => modal.classList.remove("show");

  const onClose = () => close();
  const onOk = () => close();
  const onBackdrop = () => close();
  const onKey = (e) => { if (e.key === "Escape") close(); };

  const closeBtn = document.getElementById("smClose");
  const okBtn = document.getElementById("smOk");
  const backdrop = modal.querySelector(".sm-backdrop");
  const copyBtn = document.getElementById("smCopy");

  // Clean previous listeners (safe reset)
  closeBtn.onclick = null;
  okBtn.onclick = null;
  backdrop.onclick = null;
  copyBtn.onclick = null;

  closeBtn.onclick = onClose;
  okBtn.onclick = onOk;
  backdrop.onclick = onBackdrop;

  // Copy ID
  copyBtn.onclick = async () => {
    try {
      await navigator.clipboard.writeText(String(data.orderId || ""));
      copyBtn.innerHTML = `<i class="fa-solid fa-check"></i><span>${isAr ? "تم النسخ" : "Copied"}</span>`;
      setTimeout(() => {
        copyBtn.innerHTML = `<i class="fa-regular fa-copy"></i><span>${isAr ? "نسخ" : "Copy"}</span>`;
      }, 1200);
    } catch {
      // fallback
      alert(isAr ? "لم يتم النسخ" : "Copy failed");
    }
  };

  document.addEventListener("keydown", onKey, { once: true });
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

  const api = BRANCH_API[selectedBranch];
  const url =
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
    "&_=" + Date.now();

  createMsg.textContent = (lang==="ar") ? "جاري إنشاء الحجز..." : "Creating booking...";

  try {
    const res = await fetchJson(url);
    if (!res || !res.ok) throw new Error(res && res.message ? res.message : "Create failed");

    createMsg.className = "msg ok";
    createMsg.textContent = (lang==="ar")
      ? ("تم تأكيد الحجز. رقم: " + res.orderId)
      : ("Booking confirmed. ID: " + res.orderId);

    // ✅ Success confirmation widget AFTER sending booking
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

    // refresh availability quickly
    await preloadBranchAvailability(selectedBranch);
    renderCalendar(selectedBranch);

    // reset
    selectedDateISO = "";
    notesInput.value = "";

  } catch (err) {
    createMsg.className = "msg bad";
    createMsg.textContent = (lang==="ar")
      ? ("فشل إنشاء الحجز: " + err.message)
      : ("Booking failed: " + err.message);
  }
});

// ===== First load =====
(async function init(){
  setLang("en");
  await preloadBranchAvailability(selectedBranch);
  renderCalendar(selectedBranch);
})();
