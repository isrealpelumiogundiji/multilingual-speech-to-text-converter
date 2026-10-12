const form = document.getElementById("loginForm");
const statusEl = document.getElementById("status");

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  statusEl.textContent = "Logging in...";

  try{
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;

    const data = await api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password })
    });
    if (data && data.token) {
      localStorage.setItem("token", data.token);
      localStorage.setItem("voxa_token", data.token);
      window.location.href = "/app.html";
      return;
    }

throw new Error("No token returned");

    setToken(data.token);
    statusEl.textContent = "Logged in.";
    window.location.href = "/app.html";
  }catch(err){
    statusEl.textContent = err.message || "Login failed.";
  }
});


  function showGoogleError(msg){
  const el = document.getElementById("googleErr");
  if (!el) return;
  el.textContent = msg;
  el.style.display = "block";
}

async function startGoogle(mode){
  try{
    const res = await fetch(
  baseUrl() + `/api/auth/google/start?mode=${encodeURIComponent(mode)}`,
  {
    method: "POST"
  }
);
    const data = await res.json().catch(() => ({}));

    if (!res.ok || !data.url){
      throw new Error(data.error || "Google sign in failed");
    }

    window.location.href = data.url;
  } catch (e){
    showGoogleError(e.message || "Google sign in failed");
  }
}

document.getElementById("googleLoginBtn").addEventListener("click", (e) => {
  e.preventDefault();
  window.location.href = "/api/auth/google/start?mode=login";
});

// Optional: show messages when redirected back with ?gerr=
(function(){
  const params = new URLSearchParams(location.search);
  const gerr = params.get("gerr");

  if (gerr === "no_account") showGoogleError("No account found. Please sign up.");
  if (gerr === "account_exists") showGoogleError("Account already exists. Please log in.");
  if (gerr === "google_unverified") showGoogleError("Google email is not verified.");
  if (gerr === "google_failed") showGoogleError("Google sign in failed. Try again.");
})();

const googleBtn = document.getElementById("googleLoginBtn");

if (googleBtn) {

    googleBtn.onclick = () => {

        window.location.href =
            "/api/auth/google/start?mode=login";

    };

}