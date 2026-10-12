(function () {
  const adminToken = localStorage.getItem("admin_token") || "";

  if (!adminToken) {
    window.location.replace("./admin-login.html");
    return;
  }

  async function checkAdminAccess() {
    try {
      const res = await fetch(baseUrl() + "/api/admin/users", {
        method: "GET",
        headers: { Authorization: "Bearer " + adminToken }
      });

      if (res.status === 401 || res.status === 403) {
        localStorage.removeItem("admin_token");
        window.location.replace("./admin-login.html");
        return;
      }
    } catch (e) {
      // If server is down, do not redirect. Let admin page show its own error.
    }
  }

  document.addEventListener("DOMContentLoaded", checkAdminAccess);
})();