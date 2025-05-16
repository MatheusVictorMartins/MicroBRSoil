document.addEventListener("DOMContentLoaded",() => {
    fetch("/header")
    .then(response => response.text())
    .then(data => {
        document.getElementById("header-placeholder").innerHTML = data;
    });
});

document.addEventListener("DOMContentLoaded",() => {
    fetch("/left_menu")
    .then(response => response.text())
    .then(data => {
        document.getElementById("leftmenu-placeholder").innerHTML = data;
    });
});