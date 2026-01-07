function renderTable(rows) {
  const tbody = document.getElementById("historyTableBody");
  tbody.innerHTML = "";

  if (!rows || rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5">Inga träffar</td></tr>`;
    return;
  }

  rows.forEach(row => {
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>${row.inspection_date}</td>
      <td>${row.customer}</td>
      <td>${row.machine}</td>
      <td>
        ${row.json_path ? "🟢 JSON" : "⚪"}
        ${row.docx_path ? " 📄 Word" : ""}
      </td>
      <td>
        ${row.json_path ? `
          <button class="open-btn" data-path="${row.json_path}">
            Öppna
          </button>
        ` : ""}
        ${row.docx_path ? `
          <button class="download-btn" data-path="${row.docx_path}">
            Word
          </button>
        ` : ""}
      </td>
    `;

    tbody.appendChild(tr);
  });
}

async function search() {
  const customer = document.getElementById("filterCustomer").value;
  const machine = document.getElementById("filterMachine").value;
  const from = document.getElementById("filterFrom").value;
  const to = document.getElementById("filterTo").value;

  const params = new URLSearchParams();
  if (customer) params.append("customer", customer);
  if (machine) params.append("machine", machine);
  if (from) params.append("from", from);
  if (to) params.append("to", to);

  const res = await fetch("/api/inspection-history?" + params.toString());
  const data = await res.json();

  renderTable(data);
}

/* === Klick-hantering === */
document.addEventListener("click", (e) => {

  // Öppna inspection (read-only)
  const openBtn = e.target.closest(".open-btn");
  if (openBtn) {
    const path = openBtn.dataset.path;
    window.open(
      `/inspection/view?path=${encodeURIComponent(path)}`,
      "_blank"
    );
    return;
  }

  // Ladda ner Word
  const dlBtn = e.target.closest(".download-btn");
  if (dlBtn) {
    const path = dlBtn.dataset.path;
    window.open(`/download_report?path=${encodeURIComponent(path)}`);
    return;
  }
});

// Initial load
search();
