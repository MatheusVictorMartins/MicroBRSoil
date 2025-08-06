const fetchUserList = async (endpoint) => {
    const userList = [];
    await fetch(endpoint, {
        method: 'GET',
        headers: {
            'Accept': 'application/json',
        }
    })
        .then((res) => {
            return res.json();
        })
        .then((json) => {
            json.userList.forEach(element => {
                if (Object.values(element) != undefined || Object.values(element) != null) {
                    userList.push(Object.values(element));
                }
            });
        })
        .catch((err) => {
        });

        return userList;
}

window.addEventListener('DOMContentLoaded', async (event) => {
    const userList = await fetchUserList("auth/api/userList");
    generateUserTable(userList);
});

//alteração dinâmica da tabela de usuários //!protótipo
// const generateUserTable = (userList) =>{
//     const table = document.querySelector('.register-users-table table');
//     const tbody = table.getElementsByTagName('tbody')[0]
//     userList.forEach(element=>{
//         //criação de elementos
//         const row = document.createElement("tr");
//         const th = document.createElement("th");
//         const tdPassword = document.createElement("td");
//         const eyeIcon = document.createElement("span");
//         const tdDate = document.createElement("td");

//         const passwordText = document.createTextNode("********* ");

//         //appends
//         row.appendChild(th);
//         row.appendChild(tdPassword);
//         tdPassword.appendChild(passwordText);
//         tdPassword.appendChild(eyeIcon);
//         row.appendChild(tdDate);
        
//         //adição de dados da lista nos elementos
//         th.scope = "row"
//         th.innerHTML = element[1];

//         const regex = /-/ig;
//         let dateString = element[4].split("T");
//         tdDate.innerHTML = dateString[0].replace(regex, "/");

//         eyeIcon.className = "material-symbols-rounded txt-icon btn-visibility"
//         eyeIcon.innerHTML = "visibility";

//         tbody.appendChild(row);
//     });
// }

