const planPill = document.getElementById("planPill");

const firstNameEl = document.getElementById("firstName");
const lastNameEl = document.getElementById("lastName");
const sexEl = document.getElementById("sex");
const themeEl = document.getElementById("theme");

const profileStatus = document.getElementById("profileStatus");
const emailStatus = document.getElementById("emailStatus");
const passStatus = document.getElementById("passStatus");

function setS(el, msg){ el.textContent = msg; }

async function loadMe(){
  const me = await api("/api/me");
  planPill.textContent = (me.plan || "free").toUpperCase();
  firstNameEl.value = me.firstName || "";
  lastNameEl.value = me.lastName || "";
  sexEl.value = me.sex || "";
  themeEl.value =
  (localStorage.getItem("voxa_theme") || "system");
}

document.getElementById("saveProfileBtn").addEventListener("click", async () => {
  setS(profileStatus, "Saving...");

  try{
    await api("/api/me", {
      method: "PUT",
      body: JSON.stringify({
        firstName: firstNameEl.value.trim(),
        lastName: lastNameEl.value.trim(),
        sex: sexEl.value
      })
    });

    // Save selected theme
    localStorage.setItem("voxa_theme", themeEl.value);

if(themeEl.value === "system"){
  const actualTheme =
    window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";

  document.documentElement.setAttribute(
    "data-theme",
    actualTheme
  );
}else{
  document.documentElement.setAttribute(
    "data-theme",
    themeEl.value
  );
}

    setS(profileStatus, "Saved.");
  }catch(err){
    setS(profileStatus, err.message || "Save failed.");
  }
});

document.getElementById("changeEmailBtn").addEventListener("click", async () => {
  setS(emailStatus, "Updating...");
  try{
    await api("/api/me/email", {
      method: "PUT",
      body: JSON.stringify({ email: document.getElementById("newEmail").value.trim() })
    });
    setS(emailStatus, "Email updated.");
  }catch(err){
    setS(emailStatus, err.message || "Update failed.");
  }
});

document.getElementById("changePasswordBtn").addEventListener("click", async () => {
  setS(passStatus, "Updating...");
  try{
    await api("/api/me/password", {
      method: "PUT",
      body: JSON.stringify({
        currentPassword: document.getElementById("currentPassword").value,
        newPassword: document.getElementById("newPassword").value
      })
    });
    setS(passStatus, "Password updated.");
  }catch(err){
    setS(passStatus, err.message || "Update failed.");
  }
});

loadMe().catch(() => {
  clearToken();
  window.location.href = "./login.html";
});