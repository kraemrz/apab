
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


  document.getElementById("exportForm").addEventListener("submit", function(e) {
  const html = document.getElementById("result").innerHTML;  // Justera selektor vid behov
  document.getElementById("htmlInput").value = html;
  });


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

document.addEventListener("focusin", function (e) {
  if (e.target.tagName === "TD" && e.target.hasAttribute("contenteditable")) {
    // Delay krävs för att tabb ska fungera först
    setTimeout(() => {
      const range = document.createRange();
      range.selectNodeContents(e.target);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }, 0);
  }
});

document.addEventListener("keydown", function (e) {
  const isEditable = e.target.tagName === "TD" && e.target.hasAttribute("contenteditable");

  if (!isEditable) return;

  // Ctrl + Enter → ny rad i cell
  if (e.key === "Enter" && e.ctrlKey) {
    e.preventDefault();
    document.execCommand("insertLineBreak");
    return;
  }

  // Enter (utan Ctrl/Shift) → hoppa till nästa rad
  if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey) {
    e.preventDefault();

    const td = e.target;
    const row = td.parentElement;
    const table = row.closest("table");
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
