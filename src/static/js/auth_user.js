
// Criando variavel de logged no localStorage, apenas um placeholder para trocar no header
if (localStorage.getItem("logged") === null) {
    localStorage.setItem("logged", 'false');
}

const logged_status = localStorage.getItem("logged");
// A ideia deste código placeholder se da por: Uma variável armazenada no localStorage do navegador
// De forma que ela guarda apenas um valor booleano, o header e o left_menu apenas verificam ela
// E fazem as substituições necessárias. Com o backend implementado, precisamos apenas checar
// a questão do usuário, talvez utilizar cookies, sla, real não sei como funciona

function logoutUser(){
    localStorage.setItem("logged",'false');
    window.location.href = "../html/login.html";
}

function loginUser(){
    const email = document.getElementById("temail").value;
    const password = document.getElementById("tpassword").value;
    if(logged_status === 'false'){
        localStorage.setItem("logged",'true');
        window.location.href = "../html/index.html";
    }
}

function setHeaderItem(){
    const header_item = document.getElementById("header_item");
    let html = "";
    if(logged_status === 'true'){
        html = `<h2 class="welcome-message">Welcome User!</h2>`;
    }
        else if(logged_status === 'false'){
            html = `<button id="header-login-btn" onclick="ButtonGoTo('../html/login.html')" type="button" class="btn btn-warning btn-login"><span class="material-symbols-rounded btn-login-icon btn-icon">login</span>LOG IN</button>`;
        }

        header_item.innerHTML = html;
}

function setLogoutBtn(){
    const logout_btn = document.getElementById("btn-left-menu-logout");
    let html = "";

    if(logged_status === 'true'){
        html = `<button type="button" id="btn-left-menu-logout" class="btn btn-outline-light btn-left-menu" data-bs-toggle="modal" data-bs-target="#logout_modal"><span class="material-symbols-rounded btn_left_menu_icon btn-icon">door_open</span>LOGOUT</button>`;
    }
        else if(logged_status === 'false'){
            html = "";
        }
        
        logout_btn.innerHTML = html;
}