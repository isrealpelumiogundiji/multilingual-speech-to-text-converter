const transcriptEl = $("transcript");
const translatedEl = $("translated");

const sttStatus = $("sttStatus");
const polishStatus = $("polishStatus");
const translateStatus = $("translateStatus");

const startBtn = $("startBtn");
const stopBtn = $("stopBtn");
const clearTranscriptBtn = $("clearTranscriptBtn");
const copyTranscriptBtn = $("copyTranscriptBtn");
const downloadBtn = $("downloadBtn");
const downloadFormat = $("downloadFormat");

const polishBtn = $("polishBtn");
const translateBtn = $("translateBtn");
const speakTranslationBtn = $("speakTranslationBtn");

const speechLangSelect = $("speechLang");
const polishStyle = $("polishStyle");
const fromLang = $("fromLang");
const toLang = $("toLang");

const planPill = $("planPill");
const userHello = $("userHello");
const loginLink = $("loginLink");
const signupLink = $("signupLink");

const vipNote = $("vipNote");
const upgradeBox = $("upgradeBox");
const upgradeBtn = $("upgradeBtn");

const menuBtn = $("menuBtn");
const drawer = $("drawer");
const drawerOverlay = $("drawerOverlay");
const closeDrawerBtn = $("closeDrawerBtn");
const logoutBtn = $("logoutBtn");

const historyList = $("historyList");
const loadMoreBtn = $("loadMoreBtn");

function setStatus(el, msg, good = false, bad = false){
  el.textContent = msg;
  el.classList.remove("status--good","status--bad");
  if(good) el.classList.add("status--good");
  if(bad) el.classList.add("status--bad");
}

function copyText(el){
  el.select();
  document.execCommand("copy");
}

function sanitizeTitle(t){
  const s = (t || "").replace(/\s+/g, " ").trim();
  if(!s) return "Untitled";
  return s.length > 42 ? s.slice(0, 42).trim() + "..." : s;
}

function autoTitleFromText(text){
  const clean = (text || "").replace(/\s+/g, " ").trim();
  if(!clean) return "Untitled";
  const parts = clean.split(/[.!?]\s/);
  const first = parts[0] || clean;
  return sanitizeTitle(first);
}

function openDrawer(){
  drawer.classList.add("open");
  drawerOverlay.classList.add("open");
}

function closeDrawer(){
  drawer.classList.remove("open");
  drawerOverlay.classList.remove("open");
}

menuBtn.addEventListener("click", openDrawer);
closeDrawerBtn.addEventListener("click", closeDrawer);
drawerOverlay.addEventListener("click", closeDrawer);

logoutBtn.addEventListener("click", () => {
  clearToken();
  window.location.href = "./login.html";
});

// Restore token if Paystack redirected back in a fresh context
(function hydrateTokenFromHash(){
  try{
    const hash = window.location.hash || "";
    if(!hash) return;

    // supports: #token=xxxxx
    const params = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
    const t = params.get("token") || "";

    if(t){
      // only set if not already present
      const existing = localStorage.getItem("token") || "";
      if(!existing) localStorage.setItem("token", t);
    }

    // clean up the hash so refresh does not repeat it
    if(t){
      history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  }catch{}
})();

let me = null;
let historyOffset = 0;
const historyLimit = 30;

function isLoggedIn(){
  return !!getToken();
}

function isPro(){
  if(!me) return false;
  if((me.plan || "").toLowerCase() !== "pro") return false;
  if(!me.proExpiresAt) return false;
  return new Date(me.proExpiresAt).getTime() > Date.now();
}

function refreshLocks(){
  const logged = isLoggedIn();
  const pro = isPro();

  vipNote.hidden = true;
  upgradeBox.hidden = true;

  if(!logged){
    polishBtn.disabled = true;
    translateBtn.disabled = true;
    vipNote.hidden = false;
    upgradeBox.hidden = false;
    return;
  }

  if(!pro){
    polishBtn.disabled = true;
    translateBtn.disabled = true;
    vipNote.hidden = false;
    upgradeBox.hidden = false;
    return;
  }

  polishBtn.disabled = false;
  translateBtn.disabled = false;
}

async function loadMe(){
  try{
    const meData = await api("/api/me");

    if(!meData || !meData.id){
      throw new Error("Invalid user response");
    }

    // IMPORTANT: update the global variable
    me = meData;

    localStorage.setItem("user", JSON.stringify(meData));

    // Update UI
    userHello.textContent = `Hi, ${meData.firstName || meData.email}`;
    planPill.textContent = (meData.plan || "free").toUpperCase();
    // Hide Login and Sign up when logged in
if (loginLink) loginLink.style.display = "none";
if (signupLink) signupLink.style.display = "none";

// Show logout button if you have it
if (logoutBtn) logoutBtn.style.display = "inline-flex";

    // Apply locks properly based on plan
    refreshLocks();

  }catch(err){
    console.error("loadMe failed:", err);

    // Only clear token if auth is actually invalid
    const msg = String(err?.message || "");
    if(msg.toLowerCase().includes("unauthorized") || msg.toLowerCase().includes("401")){
      clearToken();
    }

    me = null;
    userHello.textContent = "Hi, welcome to Voxa";
    planPill.textContent = "GUEST";

    refreshLocks();
  }
}

async function loadHistory(reset = false){
  if(!isLoggedIn()) return;
  if(reset){
    historyOffset = 0;
    historyList.innerHTML = "";
  }

  const data = await api(`/api/history?limit=${historyLimit}&offset=${historyOffset}`);
  const items = data.items || [];

  for(const it of items){
    const div = document.createElement("div");
    div.className = "historyItem";
    div.innerHTML = `
      <div class="historyTitle">${it.title || "Untitled"}</div>
      <div class="historyMeta">${new Date(it.created_at).toLocaleString()}</div>
    `;
    div.addEventListener("click", () => {
      transcriptEl.value = it.transcript || "";
      translatedEl.value = it.translated || it.polished || "";
      closeDrawer();
    });
    historyList.appendChild(div);
  }

  historyOffset += items.length;
  loadMoreBtn.disabled = items.length < historyLimit;
}

loadMoreBtn.addEventListener("click", () => loadHistory(false));

function cleanFilename(filename){
  const name = (filename || "voxa-transcript").replace(/[\\/:*?"<>|]/g, "").trim();
  return name || "voxa-transcript";
}

function downloadTxt(filename, text){
  const name = cleanFilename(filename);
  const blob = new Blob([text || ""], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name}.txt`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function downloadPdf(filename, text){
  const name = cleanFilename(filename);

  if (!window.jspdf || !window.jspdf.jsPDF){
    showToast("PDF library not loaded");
    return;
  }

  const doc = new window.jspdf.jsPDF();
  const marginX = 14;
  const startY = 18;
  const pageWidth = doc.internal.pageSize.getWidth();
  const maxWidth = pageWidth - marginX * 2;

  const lines = doc.splitTextToSize(String(text || ""), maxWidth);
  doc.text(lines, marginX, startY);

  doc.save(`${name}.pdf`);
}

async function downloadDocx(filename, text){
  const name = cleanFilename(filename);

  if (!window.docx || !window.saveAs){
    showToast("DOCX library not loaded");
    return;
  }

  const { Document, Packer, Paragraph, TextRun } = window.docx;

  const content = String(text || "");
  const parts = content.split(/\n\s*\n/).map(s => s.trim()).filter(Boolean);

  const paragraphs = parts.length
    ? parts.map(p => new Paragraph({ children: [new TextRun(p)] }))
    : [new Paragraph({ children: [new TextRun(content)] })];

  const doc = new Document({
    sections: [{ properties: {}, children: paragraphs }]
  });

  const blob = await Packer.toBlob(doc);
  window.saveAs(blob, `${name}.docx`);
}

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
let isRecording = false;
let finalText = "";

let translationUtterance = null;
let isSpeakingTranslation = false;
// Mobile stability helpers
let shouldRestart = false;       // true when user clicked Start, false when user clicked Stop
let isStarting = false;          // prevents double start
let lastFinalChunk = "";         // helps prevent duplicate final chunks

function initRecognition(){
  if(!SpeechRecognition){
    setStatus(sttStatus, "Speech recognition is not available in this browser. Use Chrome.", false, true);
    startBtn.disabled = true;
    return;
  }

  recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;

  recognition.onstart = () => {
    isRecording = true;
    isStarting = false;
    setStatus(sttStatus, "Listening...", true, false);
    startBtn.disabled = true;
    stopBtn.disabled = false;
  };

  recognition.onend = async () => {
    isRecording = false;
    stopBtn.disabled = true;
    startBtn.disabled = false;

    // On mobile, this happens a lot even while still talking.
    // If the user did not click Stop, restart automatically.
    if (shouldRestart) {
      try {
        setStatus(sttStatus, "Reconnecting mic...", false, false);
        startBtn.disabled = true;
        stopBtn.disabled = false;

        // small delay helps mobile Chrome
        setTimeout(() => {
          try {
            isStarting = true;
            recognition.start();
          } catch {}
        }, 250);
      } catch {}
      return;
    }

    // Normal stop
    setStatus(sttStatus, "Stopped.", false, false);

    // Save history only when user intentionally stopped
    if(isLoggedIn()){
      const text = transcriptEl.value.trim();
      if(text){
        const title = autoTitleFromText(text);
        try{
          await api("/api/history", {
            method: "POST",
            body: JSON.stringify({
              type: "transcript",
              title,
              text,
              resultText: ""
            })
          });
          await loadHistory(true);
        }catch{}
      }
    }
  };

  recognition.onerror = (e) => {
    // Some mobile errors are normal when it restarts
    const err = String(e.error || "");
    if (shouldRestart && (err === "no-speech" || err === "aborted" || err === "audio-capture")) {
      return;
    }
    setStatus(sttStatus, `Speech error: ${e.error || "unknown"}`, false, true);
  };

  recognition.onresult = (event) => {
    let interim = "";

    for(let i = event.resultIndex; i < event.results.length; i++){
      const r = event.results[i];
      const chunk = (r && r[0] && r[0].transcript) ? r[0].transcript : "";

      if (r.isFinal) {
  const cleaned = chunk.trim();
  if (cleaned) {
    finalText = appendWithWordOverlap(finalText, cleaned);
    if (!finalText.endsWith(" ")) finalText += " ";
  }
} else {
  interim += chunk;
}
    }

    // Never clear. Always render the final + interim
    transcriptEl.value = (finalText + interim).trim();
  };
}

function appendWithWordOverlap(existingText, newChunk) {
  const existing = String(existingText || "").trim();
  const chunk = String(newChunk || "").trim();
  if (!chunk) return existing;

  if (!existing) return chunk;

  const a = existing.split(/\s+/);
  const b = chunk.split(/\s+/);

  // Compare up to last 25 words of existing against start of chunk
  const maxCheck = Math.min(25, a.length, b.length);

  for (let k = maxCheck; k >= 1; k--) {
    const suffixA = a.slice(a.length - k).join(" ").toLowerCase();
    const prefixB = b.slice(0, k).join(" ").toLowerCase();
    if (suffixA === prefixB) {
      const remainder = b.slice(k).join(" ");
      return (existing + " " + remainder).trim();
    }
  }

  // If no overlap, just append normally
  return (existing + " " + chunk).trim();
}

const speechLangOptions = [
  ["Auto (browser default)", ""],

  ["English (Nigeria)", "en-NG"],
  ["English (US)", "en-US"],
  ["English (UK)", "en-GB"],
  ["English (Australia)", "en-AU"],
  ["English (Canada)", "en-CA"],
  ["English (India)", "en-IN"],
  ["English (South Africa)", "en-ZA"],

  ["French (France)", "fr-FR"],
  ["French (Canada)", "fr-CA"],

  ["Spanish (Spain)", "es-ES"],
  ["Spanish (Mexico)", "es-MX"],
  ["Spanish (US)", "es-US"],

  ["Portuguese (Brazil)", "pt-BR"],
  ["Portuguese (Portugal)", "pt-PT"],

  ["German", "de-DE"],
  ["Italian", "it-IT"],
  ["Dutch", "nl-NL"],

  ["Polish", "pl-PL"],
  ["Czech", "cs-CZ"],
  ["Slovak", "sk-SK"],
  ["Hungarian", "hu-HU"],
  ["Romanian", "ro-RO"],
  ["Bulgarian", "bg-BG"],
  ["Croatian", "hr-HR"],
  ["Serbian", "sr-RS"],
  ["Slovenian", "sl-SI"],
  ["Ukrainian", "uk-UA"],
  ["Russian", "ru-RU"],
  ["Greek", "el-GR"],

  ["Turkish", "tr-TR"],

  ["Arabic (Saudi)", "ar-SA"],
  ["Arabic (Egypt)", "ar-EG"],
  ["Arabic (UAE)", "ar-AE"],

  ["Hebrew", "he-IL"],

  ["Hindi", "hi-IN"],
  ["Bengali (Bangladesh)", "bn-BD"],
  ["Bengali (India)", "bn-IN"],
  ["Urdu (Pakistan)", "ur-PK"],
  ["Tamil (India)", "ta-IN"],
  ["Telugu (India)", "te-IN"],
  ["Marathi (India)", "mr-IN"],
  ["Gujarati (India)", "gu-IN"],
  ["Kannada (India)", "kn-IN"],
  ["Malayalam (India)", "ml-IN"],
  ["Punjabi (India)", "pa-IN"],

  ["Swahili (Kenya)", "sw-KE"],
  ["Swahili (Tanzania)", "sw-TZ"],
  ["Hausa (Nigeria)", "ha-NG"],
  ["Igbo (Nigeria)", "ig-NG"],
  ["Yoruba (Nigeria)", "yo-NG"],
  ["Amharic (Ethiopia)", "am-ET"],
  ["Afrikaans", "af-ZA"],

  ["Chinese (Simplified)", "zh-CN"],
  ["Chinese (Traditional)", "zh-TW"],
  ["Japanese", "ja-JP"],
  ["Korean", "ko-KR"],

  ["Indonesian", "id-ID"],
  ["Malay", "ms-MY"],
  ["Vietnamese", "vi-VN"],
  ["Thai", "th-TH"],
  ["Filipino", "fil-PH"],

  ["Danish", "da-DK"],
  ["Swedish", "sv-SE"],
  ["Norwegian", "no-NO"],
  ["Finnish", "fi-FI"],

  ["Irish", "ga-IE"],
  ["Welsh", "cy-GB"],

  ["Catalan", "ca-ES"]
];

function loadSpeechLangs(){
  speechLangSelect.innerHTML = "";
  for(const [label, code] of speechLangOptions){
    const opt = document.createElement("option");
    opt.value = code;
    opt.textContent = label;
    speechLangSelect.appendChild(opt);
  }
}

function loadTranslateLangs(){
  if(!fromLang || !toLang) return;

  fromLang.innerHTML = "";
  toLang.innerHTML = "";

  const list = speechLangOptions
    .map(([label, code]) => {
      const nice = label.replace(/\s*\(.*?\)\s*/g, "").trim();
      return [nice, code];
    })
    .filter((x, i, arr) => arr.findIndex(y => y[0] === x[0]) === i);

  // From can have Auto
  {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "Auto";
    fromLang.appendChild(opt);
  }

  for(const [label] of list){
    const optFrom = document.createElement("option");
    optFrom.value = label;
    optFrom.textContent = label;
    fromLang.appendChild(optFrom);

    const optTo = document.createElement("option");
    optTo.value = label;
    optTo.textContent = label;
    toLang.appendChild(optTo);
  }

  // Default To English
  const defaultTo = "English";
  for(const opt of toLang.options){
    if(opt.value === defaultTo){
      toLang.value = defaultTo;
      break;
    }
  }
}

speechLangSelect.addEventListener("change", () => {
  if(recognition) recognition.lang = speechLangSelect.value || undefined;
});

startBtn.addEventListener("click", () => {
  if(!recognition) return;

  // Keep what is already typed or recorded
  const existing = transcriptEl.value.trim();
  finalText = existing ? (existing + " ") : "";
  lastFinalChunk = "";

  shouldRestart = true;

  recognition.lang = speechLangSelect.value || undefined;

  if (isRecording || isStarting) return;

  try{
    isStarting = true;
    recognition.start();
  }catch{
    isStarting = false;
    setStatus(sttStatus, "Could not start. Try again.", false, true);
  }
});

stopBtn.addEventListener("click", () => {
  shouldRestart = false;
  isStarting = false;

  try{
    if(recognition) recognition.stop();
  }catch{}
});

clearTranscriptBtn.addEventListener("click", () => {
  finalText = "";
  transcriptEl.value = "";
  setStatus(sttStatus, "Cleared.", false, false);
});

copyTranscriptBtn.addEventListener("click", () => copyText(transcriptEl));

downloadBtn.addEventListener("click", async () => {
  const text = transcriptEl.value.trim();

  if (!text){
    showToast("Nothing to download");
    return;
  }

  const title = autoTitleFromText(text);
  const fmt = (downloadFormat?.value || "txt").toLowerCase();

  if (fmt === "pdf"){
    downloadPdf(title, text);
    return;
  }

  if (fmt === "docx"){
    await downloadDocx(title, text);
    return;
  }

  downloadTxt(title, text);
});

polishBtn.addEventListener("click", async () => {
  if(!isPro()){
    vipNote.hidden = false;
    upgradeBox.hidden = false;
    setStatus(polishStatus, "Upgrade to Pro to use Smart formatting.", false, true);
    return;
  }
  if(isRecording){
    setStatus(polishStatus, "Stop recording first.", false, true);
    return;
  }
  const text = transcriptEl.value.trim();
  if(!text){
    setStatus(polishStatus, "Nothing to format.", false, true);
    return;
  }

  try{
    setStatus(polishStatus, "Formatting...", false, false);
    const data = await api("/api/polish", {
      method: "POST",
      body: JSON.stringify({
        text,
        style: polishStyle.value || "neutral",
        language: speechLangSelect.value || ""
      })
    });
    transcriptEl.value = data.text || "";
    finalText = transcriptEl.value.trim() ? (transcriptEl.value.trim() + " ") : "";
    setStatus(polishStatus, "Done.", true, false);

    const title = autoTitleFromText(transcriptEl.value);
    await api("/api/history", {
      method: "POST",
      body: JSON.stringify({
        type: "polish",
        title,
        text,
        resultText: transcriptEl.value
      })
    });
    await loadHistory(true);
  }catch(err){
    setStatus(polishStatus, err.message || "Formatting failed.", false, true);
  }
});

translateBtn.addEventListener("click", async () => {
  if(!isPro()){
    vipNote.hidden = false;
    upgradeBox.hidden = false;
    setStatus(translateStatus, "Upgrade to Pro to use Translation.", false, true);
    return;
  }

  const text = transcriptEl.value.trim();
  const to = toLang.value.trim();
  const from = fromLang.value.trim();

  if(!text){
    setStatus(translateStatus, "Nothing to translate.", false, true);
    return;
  }
  if(!to){
    setStatus(translateStatus, "Enter a target language in To.", false, true);
    return;
  }

  try{
    setStatus(translateStatus, "Translating...", false, false);
    const data = await api("/api/translate", {
      method: "POST",
      body: JSON.stringify({ text, to, from })
    });
    translatedEl.value = data.text || "";
    setStatus(translateStatus, "Done.", true, false);

    const title = autoTitleFromText(text);
    await api("/api/history", {
      method: "POST",
      body: JSON.stringify({
        type: "translate",
        title,
        text,
        resultText: translatedEl.value
      })
    });
    await loadHistory(true);
  }catch(err){
    setStatus(translateStatus, err.message || "Translation failed.", false, true);
  }
});


if (speakTranslationBtn) {

  speakTranslationBtn.addEventListener("click", () => {

    // Stop if currently speaking
    if (isSpeakingTranslation) {
      speechSynthesis.cancel();
      return;
    }

    const text = translatedEl.value.trim();

    if (!text) {
      showToast("No translated text available");
      return;
    }

    translationUtterance = new SpeechSynthesisUtterance(text);

    // Try matching selected language
    const targetLang = toLang.value;

    const langMap = {
      English: "en-US",
      French: "fr-FR",
      Spanish: "es-ES",
      Portuguese: "pt-PT",
      German: "de-DE",
      Italian: "it-IT",
      Dutch: "nl-NL",
      Russian: "ru-RU",
      Arabic: "ar-SA",
      Hindi: "hi-IN",
      Bengali: "bn-BD",
      Urdu: "ur-PK",
      Yoruba: "yo-NG",
      Igbo: "ig-NG",
      Hausa: "ha-NG",
      Swahili: "sw-KE",
      Chinese: "zh-CN",
      Japanese: "ja-JP",
      Korean: "ko-KR",
      Turkish: "tr-TR"
    };

    translationUtterance.lang =
      langMap[targetLang] || "en-US";

    translationUtterance.onstart = () => {
      isSpeakingTranslation = true;
      speakTranslationBtn.textContent = "⏹ Stop";
    };

    translationUtterance.onend = () => {
      isSpeakingTranslation = false;
      speakTranslationBtn.textContent = "🔊 Speak";
    };

    translationUtterance.onerror = () => {
      isSpeakingTranslation = false;
      speakTranslationBtn.textContent = "🔊 Speak";
    };

    speechSynthesis.speak(translationUtterance);
  });

  speechSynthesis.addEventListener("voiceschanged", () => {});
}

const toast = $("toast");

function showToast(message, ms = 2200){
  if(!toast) return;
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => { toast.hidden = true; }, ms);
}

if (upgradeBtn){
  upgradeBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();

    // If not logged in, go to login first
    if(!getToken()){
      window.location.href = "./login.html";
      return;
    }

    // If logged in, go to the plan selection page
    window.location.href = "./upgrade.html";
  });
}

loadSpeechLangs();
loadTranslateLangs();
initRecognition();

const urlParams = new URLSearchParams(window.location.search);
const fromOauth = urlParams.get("oauth") === "1";

if(isLoggedIn()){
  loadMe()
    .then(() => loadHistory(true))
    .then(() => {
      if(fromOauth){
        window.history.replaceState({}, "", "/index.html");
      }
    })
    .catch((err) => {
      console.error("Boot failed:", err);

      const msg = String(err?.message || "");
      const lower = msg.toLowerCase();

      // Only clear token for real auth failures
      if(lower.includes("unauthorized") || lower.includes("401")){
        clearToken();
        me = null;
        refreshLocks();
        window.location.href = "./login.html";
        return;
      }

      // For any other error, keep token and just show locks
      refreshLocks();
    });
}else{
  me = null;
  userHello.textContent = "Hi, welcome to Voxa";
  planPill.textContent = "GUEST";
  if (meData.is_admin) {

    let btn = document.getElementById("adminDashboardBtn");

    if (!btn) {

        btn = document.createElement("button");

        btn.id = "adminDashboardBtn";
        btn.textContent = "Admin Dashboard";

        btn.onclick = () => {
            window.location.href = "./admin.html";
        };

        btn.style.position = "fixed";
        btn.style.right = "20px";
        btn.style.bottom = "20px";
        btn.style.zIndex = "9999";
        btn.style.padding = "12px 18px";
        btn.style.borderRadius = "8px";
        btn.style.border = "none";
        btn.style.cursor = "pointer";

        document.body.appendChild(btn);
    }
}
  refreshLocks();
}

window.addEventListener("beforeunload", () => {
  speechSynthesis.cancel();
});