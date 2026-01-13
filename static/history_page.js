/* ============================================================
   STATE
   ============================================================ */

let currentRows = [];
let sortDir = 1;

/* ============================================================
   RENDER TABLE
   ============================================================ */
function renderTable(rows) {
  const tbody = document.getElementById("historyTableBody");
  tbody.innerHTML = "";

  if (!rows.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="empty">
          Inga träffar – justera filtren
        </td>
      </tr>`;
    return;
  }

  rows.forEach(row => {
    const tr = document.createElement("tr");

    /* ===============================
       INSPEKTION (JSON)
       =============================== */
    const inspectionCell = row.json_path
      ? `<a class="status ok"
            href="/inspection/view?path=${encodeURIComponent(row.json_path)}"
            target="_blank"
            onclick="event.stopPropagation()">
            ● Öppna
         </a>`
      : `<span class="status missing">● Saknas</span>`;

    /* ===============================
       RAPPORTER (PDF – FLERA)
       =============================== */
    let pdfCell = `<span class="status missing">● Inga rapporter</span>`;

    if (row.pdf_reports && row.pdf_reports.length > 0) {
      const count = row.pdf_reports.length;
      const listId = `pdf-list-${row.id}`;

      pdfCell = `
        <span class="pdf-badge"
              onclick="togglePdfList('${listId}'); event.stopPropagation();">
          🟢 ${count} rapport${count > 1 ? "er" : ""}
        </span>

        <div id="${listId}" class="pdf-list hidden">
          ${row.pdf_reports.map(r => `
            <div class="pdf-item">
              <a href="/download_report?path=${encodeURIComponent(r.pdf_path)}"
                target="_blank"
                onclick="event.stopPropagation()">
                📄 ${r.service_date}
              </a>
            </div>
          `).join("")}
        </div>
      `;
    }

    tr.innerHTML = `
      <td>${row.inspection_date}</td>
      <td>${row.customer}</td>
      <td>${row.machine_display}</td>
      <td>${inspectionCell}</td>
      <td>${pdfCell}</td>
    `;

    /* Klickbar rad → öppna inspection */
    tr.addEventListener("click", () => {
      if (!row.json_path) return;
      window.open(
        `/inspection/view?path=${encodeURIComponent(row.json_path)}`,
        "_blank"
      );
    });

    tbody.appendChild(tr);
  });
}

/* ============================================================
   SEARCH
   ============================================================ */

async function search() {
  const loading = document.getElementById("loading");
  if (loading) loading.style.display = "block";

  const customer = filterCustomer.value;
  const machine  = filterMachine.value;
  const from     = filterFrom.value;
  const to       = filterTo.value;

  const params = new URLSearchParams();
  if (customer) params.append("customer", customer);
  if (machine)  params.append("machine", machine);
  if (from)     params.append("from", from);
  if (to)       params.append("to", to);

  try {
    const res = await fetch("/api/inspection-history?" + params.toString());
    currentRows = await res.json();
    currentRows.sort((a, b) =>
      b.inspection_date.localeCompare(a.inspection_date)
    );
    console.log("API rows:", currentRows);
    renderTable(currentRows);
  } catch (err) {
    console.error("Sökfel:", err);
  }

  if (loading) loading.style.display = "none";
}

/* ============================================================
   SORTERING
   ============================================================ */

function sortTable(colIndex) {
  if (!currentRows.length) return;

  const keys = ["inspection_date", "customer", "machine_display"];
  const key = keys[colIndex];
  if (!key) return;

  currentRows.sort((a, b) => {
    const A = (a[key] || "").toString().toLowerCase();
    const B = (b[key] || "").toString().toLowerCase();
    return A.localeCompare(B) * sortDir;
  });

  sortDir = 1;
  renderTable(currentRows);
}

/* ============================================================
   GLOBAL CLICK HANDLER (fallback)
   ============================================================ */

document.addEventListener("click", e => {
  const openBtn = e.target.closest(".open-btn");
  if (openBtn) {
    const path = openBtn.dataset.path;
    window.open(
      `/inspection/view?path=${encodeURIComponent(path)}`,
      "_blank"
    );
  }
});

/* ============================================================
   ENTER = SÖK
   ============================================================ */

["filterCustomer", "filterMachine", "filterFrom", "filterTo"]
  .forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;

    el.addEventListener("keydown", e => {
      if (e.key === "Enter") search();
    });
  });

/* ============================================================
   INIT
   ============================================================ */

search();

function togglePdfList(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.toggle("hidden");
}

