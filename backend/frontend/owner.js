function baseUrl() {
    return window.location.origin;
}

const token = localStorage.getItem("token");

if (!token) {
    location.href = "./admin-login.html";
}

async function api(path, options = {}) {

    options.headers = {
        ...(options.headers || {}),
        Authorization: "Bearer " + token,
        "Content-Type": "application/json"
    };

    const res = await fetch(baseUrl() + "/api/owner" + path, options);

    const data = await res.json();

    if (!res.ok) {
        throw new Error(data.error || "Request failed");
    }

    return data;
}

async function loadStats() {

    const stats = await api("/stats");

    document.getElementById("users").textContent = stats.totalUsers;
    document.getElementById("pro").textContent = stats.totalPro;
    document.getElementById("free").textContent = stats.totalFree;
    document.getElementById("admins").textContent = stats.totalAdmins;
    document.getElementById("payments").textContent = stats.totalPayments;
    document.getElementById("revenue").textContent =
        "₦" + Number(stats.revenue).toLocaleString();
}

async function loadUsers(search = "") {

    const data = await api(
        "/users?q=" + encodeURIComponent(search)
    );

    const tbody = document.getElementById("tbody");

    tbody.innerHTML = "";

    data.items.forEach(user => {

        const tr = document.createElement("tr");

        tr.innerHTML = `
            <td>${user.first_name} ${user.last_name}</td>
            <td>${user.email}</td>
            <td>${user.plan}</td>
            <td>${user.is_admin ? "Yes" : "No"}</td>
            <td>
<div class="actions">

${
user.is_admin
?
`
<button
class="remove-admin"
onclick="toggleAdmin(${user.id},true)">
🛡 Remove Admin
</button>`

:

`<button
class="make-admin"
onclick="toggleAdmin(${user.id},false)">
⭐ Make Admin
</button>`

}

</div>
</td>
        `;

        tbody.appendChild(tr);

    });

}

window.toggleAdmin = async function(id, current){

    const action = current
        ? "remove admin privileges from"
        : "make this user an admin";

    const ok = confirm(
        `Are you sure you want to ${action} this user?`
    );

    if (!ok) return;

    try {

        await api("/users/set-admin",{
            method:"POST",
            body:JSON.stringify({
                userId:id,
                isAdmin:current ? 0 : 1
            })
        });

        alert(
            current
                ? "Admin removed successfully."
                : "User is now an admin."
        );

        await loadStats();
        await loadUsers(
            document.getElementById("search").value
        );

    } catch(err){

        alert(err.message);

    }

}

document.getElementById("search").addEventListener("input", e => {
    loadUsers(e.target.value);
});

loadStats();
loadUsers();

document.getElementById("logoutBtn").addEventListener("click", () => {

    if (!confirm("Are you sure you want to logout?")) return;

    clearAdminToken();
    clearToken();

    window.location.href = "./admin-login.html";

});