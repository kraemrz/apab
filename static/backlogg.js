document.addEventListener("DOMContentLoaded", () => {
  loadCustomers();
});

/* =========================
   Ladda alla kunder
   ========================= */
async function loadCustomers() {
  const res = await fetch("/api/backlog/customers");
  const customers = await res.json();

  const list = document.getElementById("customerList");
  list.innerHTML = "";

  customers.forEach(c => {
    const btn = document.createElement("button");
    btn.className = "customer-btn";
    btn.textContent = `${c.customer} (${c.machines} maskiner)`;

    btn.onclick = () => {
    document.querySelectorAll(".customer-btn")
        .forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    loadCustomer(c.customer);
    };

    list.appendChild(btn);
  });
}

/* =========================
   Ladda vald kund
   ========================= */
async function loadCustomer(customer) {
  const res = await fetch(`/api/backlog/customer/${encodeURIComponent(customer)}`);
  const data = await res.json();

  document.getElementById("customerTitle").textContent = data.customer;

  const container = document.getElementById("customerDetails");
  container.innerHTML = "";

  data.machines.forEach(m => {
    container.innerHTML += `
      <div class="machine-block">
        <h4>Maskin ${m.machine}</h4>

        <strong>Inspektioner</strong>
        <ul>
          ${m.inspections.map(i => `
            <li>
              ${i.date}
              <button onclick="openInspection('${i.json_path}')">Öppna</button>
            </li>
          `).join("") || "<li>Inga inspektioner</li>"}
        </ul>

        <strong>Servicerapporter</strong>
        <ul>
          ${m.service_reports.map(r => `
            <li>
              ${r.date}
              <a href="/download_report?path=${encodeURIComponent(r.pdf_path)}" target="_blank">
                📄 ${r.filename}
              </a>
            </li>
          `).join("") || "<li>Inga servicerapporter</li>"}
        </ul>
      </div>
    `;
  });
}

/* =========================
   Öppna inspection (read-only)
   ========================= */
function openInspection(path) {
  window.open(
    `/inspection/view?path=${encodeURIComponent(path)}`,
    "_blank"
  );
}
