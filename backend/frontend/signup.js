const form = document.getElementById("signupForm");
const statusEl = document.getElementById("status");

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  statusEl.textContent = "Creating account...";

  try{
    const firstName = document.getElementById("firstName").value.trim();
    const lastName = document.getElementById("lastName").value.trim();
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;

    const data = await api("/api/auth/signup", {
      method: "POST",
      body: JSON.stringify({ firstName, lastName, email, password })
    });

    setToken(data.token);
    statusEl.textContent = "Account created. Logging you in...";
    window.location.href = "/app.html"; 
  }catch(err){
    statusEl.textContent = err.message || "Sign up failed.";
  }
});
function showGoogleError(msg){
  const el = document.getElementById("googleErr");
  if (!el) return;
  el.textContent = msg;
  el.style.display = "block";
}

function startGoogle(mode){
  const url = baseUrl() + `/api/auth/google/start?mode=${encodeURIComponent(mode)}`;
  window.location.href = url;
}

document.getElementById("googleSignupBtn").addEventListener("click", (e) => {
  e.preventDefault();
  startGoogle("signup");
});

// Optional: show messages when redirected back with ?gerr=
(function(){
  const params = new URLSearchParams(location.search);
  const gerr = params.get("gerr");

  if (gerr === "account_exists") showGoogleError("Account already exists. Please log in.");
  if (gerr === "google_unverified") showGoogleError("Google email is not verified.");
  if (gerr === "google_failed") showGoogleError("Google sign up failed. Try again.");
})();

const googleBtn = document.getElementById("googleLoginBtn");

if (googleBtn) {

    googleBtn.onclick = () => {

        window.location.href =
            "/api/auth/google/start?mode=signup";

    };

}