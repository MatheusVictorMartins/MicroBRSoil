const fetchSequenceResult = async (endpoint) => {
    let result;

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
           result = json.foundSequence;
        })
        .catch((err) => {
            writeLog(`\n[ERRO]\nMensagem de erro: ${err}`);
        });
        return result;
}

window.addEventListener('DOMContentLoaded', async (event) => {
    await fetchListData("/sequence_search/api/result");
});