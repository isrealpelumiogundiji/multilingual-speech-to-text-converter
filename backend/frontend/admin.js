function baseUrl() {
  return window.location.origin;
}
const totalUsers = document.getElementById("totalUsers");
const totalPro = document.getElementById("totalPro");
const totalFree = document.getElementById("totalFree");
const totalAdmins = document.getElementById("totalAdmins");
const totalPayments = document.getElementById("totalPayments");
const revenue = document.getElementById("revenue");

const search = document.getElementById("search");
const tableBody = document.querySelector("#usersTable tbody");
const token = localStorage.getItem("token");

if (!token) {
    location.href = "/login.html";
}

async function api(path, options = {}) {

    options.headers = {
        ...(options.headers || {}),
        Authorization: "Bearer " + token,
        "Content-Type": "application/json"
    };

    const res = await fetch(
        baseUrl() + path,
        options
    );

    const data = await res.json();

    if (!res.ok) {
        throw new Error(data.error || "Request failed");
    }

    return data;
}

async function loadStats() {

    const stats = await api("/api/admin/stats");

    document.getElementById("users").textContent =
        stats.totalUsers;

    document.getElementById("pro").textContent =
        stats.totalPro;

    document.getElementById("free").textContent =
        stats.totalFree;

    document.getElementById("admins").textContent =
        stats.totalAdmins;

    document.getElementById("payments").textContent =
        stats.totalPayments;

    document.getElementById("revenue").textContent =
        "₦" + Number(stats.revenue).toLocaleString();

}

async function loadUsers(search = "") {

    const data = await api(
        "/api/admin/users?q=" +
        encodeURIComponent(search)
    );

    const tbody =
        document.getElementById("tbody");

    tbody.innerHTML = "";

    data.items.forEach(user => {

        const tr = document.createElement("tr");

        tr.innerHTML = `

<td>${user.first_name} ${user.last_name}</td>

<td>${user.email}</td>

<td>
    <span class="${user.plan === "pro" ? "plan-pro" : "plan-free"}">
        ${user.plan.toUpperCase()}
    </span>
</td>

<td>
    ${
        user.pro_expires_at
        ? new Date(user.pro_expires_at).toLocaleDateString()
        : "-"
    }
</td>

<td>${user.is_admin ? "Yes" : "No"}</td>

<td class="action-buttons">

${
user.plan === "pro"

?

`

<button
class="pro"
onclick="extendPlan(${user.id})">

➕ Extend 30 Days

</button>

<button
class="free"
onclick="togglePlan(${user.id},'pro')">

🔓 Make Free

</button>
`


:


`
<button
class="pro"
onclick="togglePlan(${user.id},'free')">

⭐️ Make Pro

</button>

`

}

</td>

`;

        tbody.appendChild(tr);

    });

}

async function togglePlan(id, current) {

    let body;

    if (current === "pro") {

        body = {
            userId: id,
            plan: "free"
        };

    } else {

        body = {
            userId: id,
            plan: "pro",
            days: 30
        };

    }

    await api(
        "/api/admin/users/set-plan",
        {
            method: "POST",
            body: JSON.stringify(body)
        }
    );

    await loadStats();
    await loadUsers(
        document.getElementById("search").value
    );

}

async function extendPlan(id){

    if(!confirm("Extend this user's Pro plan by 30 days?")){
        return;
    }

    await api(
        "/api/admin/users/set-plan",
        {
            method:"POST",
            body:JSON.stringify({
                userId:id,
                plan:"pro",
                days:30
            })
        }
    );

    alert("Pro subscription extended successfully.");

    await loadStats();

    await loadUsers(
        document.getElementById("search").value
    );

}

async function toggleAdmin(id, current) {

    await api(
        "/api/admin/users/set-admin",
        {
            method: "POST",
            body: JSON.stringify({
                userId: id,
                isAdmin: current ? 0 : 1
            })
        }
    );

    await loadUsers(
        document.getElementById("search").value
    );

}

document
.getElementById("search")
.addEventListener("input", e => {

    loadUsers(e.target.value);

});

async function loadPayments() {

    const data = await api("/api/admin/payments");

    const tbody = document.getElementById("paymentsBody");

    tbody.innerHTML = "";

    data.items.forEach(payment => {

        const tr = document.createElement("tr");

        tr.innerHTML = `
            <td>${payment.first_name || ""} ${payment.last_name || ""}</td>
            <td>${payment.email || ""}</td>
            <td>${payment.plan}</td>
            <td>₦${(Number(payment.amount) / 100).toLocaleString()}</td>
            <td>${payment.status}</td>
            <td>${new Date(payment.created_at).toLocaleString()}</td>
        `;

        tbody.appendChild(tr);

    });

}

async function loadAnalytics() {

    const data = await api("/api/admin/analytics");

    document.getElementById("todayUsers").textContent =
        data.todayUsers;

    document.getElementById("todayRevenue").textContent =
        "₦" + Number(data.todayRevenue).toLocaleString();

    document.getElementById("totalTranscripts").textContent =
        data.transcripts;

    document.getElementById("totalTranslations").textContent =
        data.translations;

    document.getElementById("totalFormatting").textContent =
        data.formatting;

}

let revenueChart;
let usersChart;

async function loadCharts() {

    const data = await api("/api/admin/charts");

    const revenueLabels = data.revenue.map(r => r.day);
    const revenueValues = data.revenue.map(r => Number(r.total));

    const userLabels = data.users.map(r => r.day);
    const userValues = data.users.map(r => Number(r.total));

    if (revenueChart) revenueChart.destroy();

    revenueChart = new Chart(
        document.getElementById("revenueChart"),
        {
            type: "line",
            data: {
                labels: revenueLabels,
                datasets: [{
                    label: "Revenue (₦)",
                    data: revenueValues,
                    borderWidth: 3,
                    tension: 0.3
                }]
            },
            options: {
                responsive: true
            }
        }
    );

    if (usersChart) usersChart.destroy();

    usersChart = new Chart(
        document.getElementById("usersChart"),
        {
            type: "bar",
            data: {
                labels: userLabels,
                datasets: [{
                    label: "New Users",
                    data: userValues,
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true
            }
        }
    );

}

loadStats();
loadAnalytics();
loadCharts();
loadUsers();
loadPayments();
setInterval(() => {
    loadStats();
    loadAnalytics();
    loadCharts();
}, 30000);

// ===========================
// Sidebar Navigation
// ===========================

const pages = {
    dashboard: document.getElementById("dashboardPage"),
    users: document.getElementById("usersPage"),
    payments: document.getElementById("paymentsPage")
};

function openPage(name){

    Object.values(pages).forEach(page=>{
        page.style.display="none";
    });

    pages[name].style.display="block";

    document.querySelectorAll(".sidebar .nav").forEach(btn=>{
        btn.classList.remove("active");
    });

    if(name==="dashboard")
        document.getElementById("navDashboard").classList.add("active");

    if(name==="users")
        document.getElementById("navUsers").classList.add("active");

    if(name==="payments")
        document.getElementById("navPayments").classList.add("active");
}

document.getElementById("navDashboard").onclick=()=>openPage("dashboard");
document.getElementById("navUsers").onclick=()=>openPage("users");
document.getElementById("navPayments").onclick=()=>openPage("payments");

document.getElementById("logoutBtn").onclick=function(){

    if(!confirm("Logout from admin dashboard?"))
        return;

    clearToken();
    clearAdminToken();

    location.href="admin-login.html";
};

document.getElementById("navAnalytics").onclick = () => {

    openPage("dashboard");

    setTimeout(() => {

        document.getElementById("todayUsers")
            .scrollIntoView({
                behavior: "smooth"
            });

    }, 100);

};

document.getElementById("navSettings").onclick = () => {

    alert(
`Voxa Settings

Coming Soon

• SMTP
• Paystack
• AI Limits
• App Settings`
    );

};