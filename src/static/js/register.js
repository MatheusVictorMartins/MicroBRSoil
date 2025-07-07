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
            console.log(userList);
        })
        .catch((err) => {
        })

        return userList;
}

window.addEventListener('DOMContentLoaded', async (event) => {
    await fetchUserList("auth/api/userList");
});
