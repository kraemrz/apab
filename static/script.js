
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
          html += "<table><tbody>";
          section.table.forEach((row, rowIndex) => {
            html += "<tr>";
            row.forEach((cell, colIndex) => {
              if (rowIndex === 0) {
                html += `<th>${cell}</th>`;
              } else if (section.title === "Datum för utförd inspektion") {
                html += `<td contenteditable>${cell}</td>`;
              } else {
                if (colIndex === 2) {
                  // Kommentar-fältet – redigerbart med live-uppdatering
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
