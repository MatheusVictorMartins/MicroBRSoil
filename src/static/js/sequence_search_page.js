const radios = document.querySelectorAll('input[name="btnradio"]')
        const text = document.getElementById("searchtype-text");

        function changeTextByChecked(){
            const selected = document.querySelector('input[name="btnradio"]:checked');
            let html_text = "";

            if(!selected){
                return;
            }
            switch(selected.id){
                case "btnradio1":
                    html_text = `<p class="description-text searchtype-des-text">*input 1-100 sequences; only complete ITS1 or ITS2</p>`;
                    break;
                case "btnradio2":
                    html_text = `<p class="description-text searchtype-des-text">*input 1-100 sequences; ITS1 or ITS2</p>`;
                    break;
                case "btnradio3":
                    html_text = `<p class="description-text searchtype-des-text">*input 1 sequence; ITS1 or ITS2</p>`;
                    break;
            }
            text.innerHTML = html_text;
        }
        radios.forEach(r => r.addEventListener("change", changeTextByChecked));
        changeTextByChecked();
