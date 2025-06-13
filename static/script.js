
document.getElementById("upload").addEventListener("change", function (e) {
  const file = e.target.files[0];
  if (!file) return;

  const formData = new FormData();
  formData.append("file", file);

  fetch("/upload", {
    method: "POST",
    body: formData,
  })
    .then((res) => res.json())
    .then((data) => {
    let html = "";

    for (const section of data) {
      html += `<h2>${section.title}</h2>`;

      if (section.subtitle && section.subtitle !== "N/A") {
        html += `<p><em>${section.subtitle}</em></p>`;
      }

      if (section.table && section.table.length) {
        const isNATable = section.table.length === 1 && section.table[0].length === 1 && section.table[0][0] === "N/A";
        const isStandard3Cols = section.table[0].length === 3;

        if (isNATable) {
          html += `<table class="na-table"><tbody><tr><td>N/A</td></tr></tbody></table>`;
        } else {
          html += `<table>`;
          if (isStandard3Cols) {
            html += `<colgroup>
              <col class="col-status" />
              <col class="col-action" />
              <col class="col-comment" />
            </colgroup>`;
          }
          html += `<tbody>`;
          section.table.forEach((row, rowIndex) => {
            html += "<tr>";
            row.forEach((cell, colIndex) => {
              if (rowIndex === 0) {
                html += `<th>${cell}</th>`;
              } else if (section.title === "Datum för utförd inspektion" || section.title === "DATE & SIGNATURE") {
                html += `<td contenteditable>${cell}</td>`;
              } else {
                if (colIndex === 2) {
                  html += `<td contenteditable oninput="updateStatus(this)">${cell}</td>`;
                } else {
                  html += `<td>${cell}</td>`;
                }
              }
            });
            html += "</tr>";
          });
          html += "</tbody></table>";
        }
      }
    }

    document.getElementById("result").innerHTML = html;
  });
});

function toggleDark() {
  document.body.classList.toggle("dark-mode");
}

function exportDoc() {
  const html = document.getElementById("result").innerHTML;

  fetch("/export", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ html }),
  })
    .then((res) => res.blob())
    .then((blob) => {
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "inspektionsprotokoll.zip";
      a.click();
      window.URL.revokeObjectURL(url);
    });
}

function updateStatus(cell) {
  const row = cell.parentElement;
  const statusCell = row.children[0];
  const comment = cell.textContent.trim().toUpperCase();
  if (comment === "U/A") {
    statusCell.textContent = "OK";
  } else {
    statusCell.textContent = "Anm.";
  }
}

