const searchButon = document.querySelector(".btn-taxon-search");
const sequenceField = document.getElementById("tselect_sh");
// const tickButton = document.getElementById("tick_button");

///api/approximateResults
//`/sequence_search/api/result?tselect_sh=${sequenceField.value}`
searchButon.addEventListener('click', async ()=>{
    let sequenceResult;
    // if(tickButton.value == 0){
    //     sequenceResult = await fetchSequenceResult(`/sequence_search/api/result?tselect_sh=${sequenceField.value}`);
    // }else{
    //     sequenceResult = await fetchSimilarSequenceResult(`/sequence_search/api/approximateResults?tselect_sh=${sequenceField.value}`);
    // }
    sequenceResult = await fetchSequenceResult(`/sequence_search/api/result?tselect_sh=${sequenceField.value}`);
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

const fetchSimilarSequenceResult = async (endpoint) => {
    let result = [];
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
           json.foundSequences.forEach(element => {
            result.push(element);
           });
        })
        .catch((err) => {
            console.log("Erro\nerro: " + err);
        });
        return result;
}

