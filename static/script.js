function toggleDark() {
  document.body.classList.toggle("dark");
}

document.getElementById("upload").addEventListener("change", function(event) {
  const reader = new FileReader();
  reader.onload = function(event) {
    mammoth.convertToHtml({ arrayBuffer: event.target.result })
      .then(function(result) {
        document.getElementById("full-content-html").value = result.value;
        fetch("/parse", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ html: result.value })
        })
        .then(res => res.json())
        .then(data => {
          document.getElementById("result").innerHTML = data.html;
          makeEditable();
        });
      });
  };
  reader.readAsArrayBuffer(event.target.files[0]);
});

function makeEditable() {
  const tables = document.querySelectorAll("#result table");
  tables.forEach(table => {
    const rows = table.rows;
    if (rows.length < 1) return;

    const header = rows[0];
    const headers = [...header.cells].map(cell =>
      cell.innerText.trim().toLowerCase()
    );

    //console.log("Tabell med", header.cells.length, "kolumner:", headers);


    const statusIdx = headers.findIndex(h => h.includes("status"));
    const commentIdx = headers.findIndex(h => h.includes("kommentar"));

    if (statusIdx >= 0 && commentIdx >= 0) {
      header.cells[statusIdx].innerText = "Status";
      header.cells[commentIdx].innerText = "Kommentar";

      for (let i = 1; i < rows.length; i++) {
        const statusCell = rows[i].cells[statusIdx];
        const commentCell = rows[i].cells[commentIdx];

        if (commentCell) {
          commentCell.contentEditable = "true";
          commentCell.classList.add("editable");

          commentCell.addEventListener("input", () => {
            const val = commentCell.innerText.trim().toUpperCase();
            statusCell.innerText = val === "U/A" ? "OK" : "Anm.";
          });
        }
      }
    }

    // Datum/Signatur (om tabellen har exakt 2 kolumner)
    if (headers.length === 2 &&
        headers[0].includes("datum") &&
        headers[1].includes("signatur")) {
      for (let i = 1; i < rows.length; i++) {
        rows[i].cells[0].contentEditable = "true";
        rows[i].cells[1].contentEditable = "true";
        rows[i].cells[0].classList.add("editable");
        rows[i].cells[1].classList.add("editable");
      }
    }
  });
}

function exportDoc() {
  const html = document.getElementById("result").innerHTML;

  fetch("/export", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ html })
  })
    .then(res => res.blob())
    .then(blob => {
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "inspektionsprotokoll.zip";
      a.click();
    });
}

