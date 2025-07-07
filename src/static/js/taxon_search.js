const fetchListData = async (endpoint) => {
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
            const speciesMap = [];
            const genusMap = [];
            json.speciesList.forEach(element => {
                if (Object.values(element)[0] != undefined || Object.values(element)[0] != null) {
                    speciesMap.push(Object.values(element)[0]);
                }
            });
            json.genusList.forEach(element => {
                if (Object.values(element)[0] != undefined || Object.values(element)[0] != null) {
                    genusMap.push(Object.values(element)[0]);
                }
            });
        })
        .catch((err) => {
            writeLog(`\nErro no fetchListData no ${path.dirname(__filename)}\nErro: ${err}`);
        });
}

window.addEventListener('DOMContentLoaded', async (event) => {
    await fetchListData("/taxon_search/api/getLists");
});
