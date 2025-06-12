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
      document.getElementById("result").innerHTML = data.html;
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
