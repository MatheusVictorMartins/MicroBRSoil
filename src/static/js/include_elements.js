document.addEventListener("DOMContentLoaded",() => {
    fetch("header.html")
    .then(response => response.text())
    .then(data => {
        document.getElementById("header-placeholder").innerHTML = data;
    });
});

document.addEventListener("DOMContentLoaded",() => {
    fetch("left_menu.html")
    .then(response => response.text())
    .then(data => {
        document.getElementById("leftmenu-placeholder").innerHTML = data;
    });
});