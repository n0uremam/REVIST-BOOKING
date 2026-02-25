// ===== Branch WebApp URLs (your provided) =====
const BRANCH_API = {
  "Nasr City": "https://script.google.com/macros/s/AKfycbxwal_GJHeIhqhbFojUyt6a2yI8MKtwS0tg-YoPavgPF1rluPmzIElk9on9Uoxi1lpcDg/exec",
  "AUC": "https://script.google.com/macros/s/AKfycbwibhM0RPkWsKkUJQ9My0ycfHhS9oo6PoEZ5sWlZByB8sT7n-QLMVqUsIYU4BoR59Lr4A/exec",
  "Maadi": "https://script.google.com/macros/s/AKfycbyCBr6FPYhjTbndMvUCYNCSq9UseDPcbPQQLdol9KPTJnnnk1JXEi4DyW_bDrlYXylT1Q/exec",
  "Zayed": "https://script.google.com/macros/s/AKfycbymxUsSnwd7zYejyhiwuzuafJ9pfIzYqDTpOc9WIR-I3pMCMuJZ4a5XqPlyYmYTzmtv/exec",
  "October": "https://script.google.com/macros/s/AKfycbySjCDtGsHh94ukD1XpHVWwiqXc7kzdQoAVEQyCnf66cI6-NhIYbnLWnYNK63XmWLiaqQ/exec",
};

const BRANCHES = Object.keys(BRANCH_API);

// ===== UI =====
let lang = "en";
let selectedDateISO = "";
let selectedBranch = BRANCHES[0];

let customerCache = null; // { phone, name, carModel, ... , sourceBranch }
let availabilityCache = {}; // key: branch -> availability object

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

function setLang(newLang){
  lang = newLang;
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
  trans.forEach(el => el.textContent = el.dataset[lang]);
  toggleBtn.textContent = lang === "en" ? "AR" : "EN";
}
toggleBtn.addEventListener("click", () => setLang(lang === "en" ? "ar" : "en"));

// ===== JSONP helper (CORS-proof) =====
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

// ===== Simple fetch JSON (for create) =====
async function fetchJson(url) {
  const r = await fetch(url, { method: "GET", cache: "no-store" });
  const txt = await r.text();
  try { return JSON.parse(txt); } catch(e) {
    throw new Error("Non-JSON response");
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

// ===== Init branch select =====
function initBranches(){
  branchSelect.innerHTML = "";
  BRANCHES.forEach(b=>{
    const opt = document.createElement("option");
    opt.value = b;
    opt.textContent = (lang==="ar")
      ? (b==="Nasr City"?"مدينة نصر":b==="AUC"?"التجمع الخامس":b==="Maadi"?"المعادي":b==="Zayed"?"الشيخ زايد":"٦ أكتوبر")
      : b;
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

// Rebuild labels on language change
toggleBtn.addEventListener("click", () => {
  initBranches();
  if (availabilityCache[selectedBranch]) renderCalendar(selectedBranch);
});

// ===== Preload Ping + Availability =====
async function preloadBranchAvailability(branch){
  availMsg.className = "msg";
  availMsg.textContent = (lang==="ar") ? "جاري تحميل المواعيد..." : "Loading availability...";

  const api = BRANCH_API[branch];
  try {
    // ping normal JSON
    const ping = await fetchJson(api + "?action=ping&_=" + Date.now());
    const minDate = ping.minDate || isoTodayPlus(12);
    minDateText.textContent = (lang==="ar")
      ? `الحجز يبدأ من تاريخ ${formatDMY(minDate)}`
      : `Booking starts from ${formatDMY(minDate)}`;

    // availability via JSONP (Netlify-safe)
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
    availMsg.textContent = (lang==="ar") ? ("فشل تحميل المواعيد: " + err.message) : ("Availability error: " + err.message);
    calendar.innerHTML = "";
  }
}

// ===== Fast lookup across ALL branches (JSONP) =====
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
  if (hit) return hit;

  return { found: false };
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

function branchNameAr(b){
  if (b==="Nasr City") return "مدينة نصر";
  if (b==="AUC") return "التجمع الخامس";
  if (b==="Maadi") return "المعادي";
  if (b==="Zayed") return "الشيخ زايد";
  if (b==="October") return "٦ أكتوبر";
  return b;
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
function formatDMY(iso){
  const [y,m,d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function renderCalendar(branch){
  const av = availabilityCache[branch];
  if (!av || !av.days) return;

  calendar.innerHTML = "";
  av.days.forEach(day => {
    const div = document.createElement("div");
    div.className = "day " + (day.full ? "full" : "ok");
    div.dataset.iso = day.date;

    div.innerHTML = `
      <div class="d">${formatDMY(day.date)}</div>
      <div class="s">${day.full ? (lang==="ar"?"ممتلئ":"Full") : ((lang==="ar"?"متاح":"Available") + ` (${day.remaining})`)}</div>
    `;

    if (!day.full) {
      div.addEventListener("click", () => {
        [...calendar.querySelectorAll(".day")].forEach(x => x.classList.remove("selected"));
        div.classList.add("selected");
        selectedDateISO = day.date;
        createMsg.className = "msg";
        createMsg.textContent = (lang==="ar") ? ("اليوم المختار: " + formatDMY(day.date)) : ("Selected: " + formatDMY(day.date));
      });
    }

    calendar.appendChild(div);
  });
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
    await preloadBranchAvailability(selectedBranch);
    renderCalendar(selectedBranch);
    selectedDateISO = "";
    notesInput.value = "";
  } catch (err) {
    createMsg.className = "msg bad";
    createMsg.textContent = (lang==="ar") ? ("فشل إنشاء الحجز: " + err.message) : ("Booking failed: " + err.message);
  }
});
(async function init(){
  setLang("en");
  await preloadBranchAvailability(selectedBranch);
  renderCalendar(selectedBranch);
})();
