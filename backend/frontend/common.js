
function baseUrl() {
  const host = window.location.hostname;

  // Local dev (your backend runs on 3000)
  if (host === "localhost" || host === "127.0.0.1") {
    return "http://localhost:3000";
  }

  // Production (Render backend)
  return "";
}

function $(id){ return document.getElementById(id); }

function getToken(){
  return (
    localStorage.getItem("voxa_token") ||
    localStorage.getItem("token") ||
    ""
  );
}

function setToken(token){
  localStorage.setItem("voxa_token", token);
  localStorage.setItem("token", token);
}

function clearToken(){
  localStorage.removeItem("voxa_token");
  localStorage.removeItem("token");
}

function getAdminToken(){
  try { return localStorage.getItem("admin_token") || ""; } catch { return ""; }
}

function setAdminToken(t){
  try {
    if(t) localStorage.setItem("admin_token", t);
    else localStorage.removeItem("admin_token");
  } catch {}
}

function clearAdminToken(){
  try { localStorage.removeItem("admin_token"); } catch {}
}


async function api(path, opts = {}){
  const headers = Object.assign(
    { "Content-Type": "application/json" },
    opts.headers || {}
  );

  const token = getToken();
  if(token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(baseUrl() + path, { ...opts, headers });
  const data = await res.json().catch(() => ({}));

  if(!res.ok){
    throw new Error(data?.error || `Request failed (${res.status})`);
  }
  return data;
}
document.addEventListener("DOMContentLoaded", () => {
  const overlay = document.getElementById("drawerOverlay");
  const drawer = document.getElementById("drawer");

  if (overlay) {
    overlay.classList.remove("open");
    overlay.style.display = "none";
    overlay.style.pointerEvents = "none";
  }

  if (drawer) drawer.classList.remove("open");
});

(function(){

  function applyTheme(){

    const savedTheme =
      localStorage.getItem("voxa_theme") || "system";

    let theme = savedTheme;

    if(savedTheme === "system"){
      theme = window.matchMedia(
        "(prefers-color-scheme: dark)"
      ).matches
        ? "dark"
        : "light";
    }

    document.documentElement.setAttribute(
      "data-theme",
      theme
    );
  }

  applyTheme();

  window.matchMedia(
    "(prefers-color-scheme: dark)"
  ).addEventListener(
    "change",
    applyTheme
  );

})();
document.addEventListener("DOMContentLoaded", () => {

    document.querySelectorAll("button").forEach(btn => {

        btn.addEventListener("mouseenter", () => {
            btn.style.transform = "translateY(-2px)";
            btn.style.boxShadow = "0 8px 18px rgba(0,0,0,.18)";
        });

        btn.addEventListener("mouseleave", () => {
            btn.style.transform = "";
            btn.style.boxShadow = "";
        });

        btn.addEventListener("mousedown", () => {
            btn.style.transform = "scale(.97)";
        });

        btn.addEventListener("mouseup", () => {
            btn.style.transform = "translateY(-2px)";
        });

    });

});