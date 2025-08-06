const searchButon = document.querySelector(".btn-taxon-search");
const sequenceField = document.getElementById("tselect_sh");
searchButon.addEventListener('click', async ()=>{
    const sequenceResult = await fetchSequenceResult(`/sequence_search/api/result?tselect_sh=${sequenceField.value}`);
    console.log(sequenceResult);
});

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
            console.log("Erro\nerro: " + err);
        });
        return result;
}

