document.addEventListener("DOMContentLoaded",() => {
    fetch("header.html")
    .then(response => response.text())
    .then(data => {
        document.getElementById("header-placeholder").innerHTML = data;
    });
});