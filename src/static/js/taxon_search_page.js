const search_select = document.getElementById("tx_srh_select");
        const search_box = document.getElementById("search-box");

        function updateSearchBox(){
            const value = search_select.value;
            let html = "";
            if(value == "sh"){
                    html = `<input type="text" name="tselect_sh" id="tselect_sh" class="text-input register-text-input" placeholder="Enter SH">`;
            }
                else if(value == "species"){
                        html = `<select class="form-select species-select search-select" aria-label="Default select example">
                                <option value="" selected disabled>Select a species...</option>
                                <option value="#">Item</option>
                                </select>`;
                }
                    else if(value == "genus"){
                        html = `<select class="form-select genus-select search-select" aria-label="Default select example">
                                <option value="" selected disabled>Select a genus...</option>
                                <option value="#">Item</option>
                                </select>`;
                    }

            search_box.innerHTML = html;
        }

        updateSearchBox();
        search_select.addEventListener("change",updateSearchBox);
