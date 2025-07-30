// === Filuppladdning via knapp och drag & drop ===
const dropZone = document.getElementById("drop-zone");
const fileInput = document.getElementById("upload");

dropZone.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (file) uploadFile(file);
});

dropZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropZone.classList.add("dragover");
});

dropZone.addEventListener("dragleave", () => {
  dropZone.classList.remove("dragover");
});

dropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropZone.classList.remove("dragover");
  const file = e.dataTransfer.files[0];
  if (file && file.name.endsWith(".docx")) {
    uploadFile(file);
  } else {
    alert("Endast .docx-filer stöds.");
  }
});

// === Filuppladdning: skicka till server och rendera resultat ===
function uploadFile(file) {
  const formData = new FormData();
  formData.append("file", file);

  // START 🟡 Sätt filnamn (utan filändelse) i hidden input för export
  const baseFileName = file.name.replace(/\.[^/.]+$/, ""); // tar bort .docx eller .pdf
  document.getElementById("filenameInput").value = baseFileName;
  // SLUT 🟡
  
  fetch("/upload", {
    method: "POST",
    body: formData,
  })
    .then((res) => res.json())
    .then((data) => {
      let html = "";

      for (const section of data) {
        html += `<div class="station-block"><h2>${section.title}</h2>`;

        if (section.subtitle && section.subtitle !== "N/A") {
          html += `<p><em>${section.subtitle}</em></p>`;
        }

        if (section.table && section.table.length) {
          const isNATable = section.table.length === 1 && section.table[0][0] === "N/A";
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
                } else if (
                  section.title === "Datum för utförd inspektion" ||
                  section.title === "DATE & SIGNATURE"
                ) {
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

        html += `</div>`;
      }

      document.getElementById("result").innerHTML = html;
    });
}

// === Exportera till Word: samla HTML och posta ===
document.getElementById("exportForm").addEventListener("submit", function (e) {
  const html = document.getElementById("result").innerHTML;
  document.getElementById("htmlInput").value = html;
});



// === Mörkt läge ===
function toggleDark() {
  document.body.classList.toggle("dark-mode");
}

// === Kommentar-kolumn påverkar Status ===
function updateStatus(cell) {
  const row = cell.parentElement;
  const statusCell = row.children[0];
  const comment = cell.textContent.trim().toUpperCase();
  statusCell.textContent = comment === "U/A" ? "OK" : "Anm.";
}

// === Markera all text automatiskt i cell vid fokus ===
document.addEventListener("focusin", function (e) {
  if (e.target.tagName === "TD" && e.target.hasAttribute("contenteditable")) {
    setTimeout(() => {
      const range = document.createRange();
      range.selectNodeContents(e.target);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }, 0);
  }
});

// === Navigera och redigera med Enter och Ctrl+Enter ===
document.addEventListener("keydown", function (e) {
  const isEditable = e.target.tagName === "TD" && e.target.hasAttribute("contenteditable");
  if (!isEditable) return;

  // Ctrl + Enter → ny rad
  if (e.key === "Enter" && e.ctrlKey) {
    e.preventDefault();
    document.execCommand("insertLineBreak");
    return;
  }

  // Enter → gå till nästa rad i samma kolumn
  if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey) {
    e.preventDefault();

    const td = e.target;
    const row = td.parentElement;
    const colIndex = Array.from(row.children).indexOf(td);
    let nextRow = row.nextElementSibling;

    while (nextRow) {
      const nextCell = nextRow.children[colIndex];
      if (nextCell && nextCell.hasAttribute("contenteditable")) {
        nextCell.focus();
        return;
      }
      nextRow = nextRow.nextElementSibling;
    }
  }
});
