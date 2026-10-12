(function () {

  const form = document.getElementById("adminLoginForm");
  const emailEl = document.getElementById("email");
  const passEl = document.getElementById("password");
  const msgEl = document.getElementById("msg");
  const submitBtn = document.getElementById("submitBtn");

  function setMsg(text, good) {
    msgEl.textContent = text || "";
    msgEl.classList.remove("status--good", "status--bad");

    if (good === true) {
      msgEl.classList.add("status--good");
    }

    if (good === false) {
      msgEl.classList.add("status--bad");
    }
  }

  async function adminLogin(email, password) {

    const res = await fetch(baseUrl() + "/api/auth/admin/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        email,
        password
      })
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || "Admin login failed");
    }

    return data;
  }

  form.addEventListener("submit", async (e) => {

    e.preventDefault();

    setMsg("");

    const email = emailEl.value.trim().toLowerCase();
    const password = passEl.value;

    if (!email || !password) {
      setMsg("Enter email and password.", false);
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Signing in...";

    try {

      const result = await adminLogin(email, password);

      // Save admin token
      setToken(result.token);
      setAdminToken(result.token);

      setMsg("Login successful.", true);

      setTimeout(() => {

        if (result.role === "owner") {
          window.location.href = "./owner.html";
        } else {
          window.location.href = "./admin.html";
        }

      }, 500);

    } catch (err) {

      setMsg(err.message || "Admin login failed.", false);

    } finally {

      submitBtn.disabled = false;
      submitBtn.textContent = "Log in";

    }

  });

})();