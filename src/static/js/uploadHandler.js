document.getElementById('submitAllBtn').addEventListener('click', async (e) => {
  e.preventDefault();

  const formData = new FormData();

  const csvFile = document.querySelector('#csvForm input[name="csv_file"]').files[0];
  if (csvFile) formData.append('csv_file', csvFile);

  const res = await fetch('/upload/profile', {
    method: 'POST',
    body: formData
  });

  const result = await res.text(); // ou .json() dependendo do retorno do servidor
  console.log(result);
});