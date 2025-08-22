 let filter_dropdown_activeted = false;

function createFilterDropDown(){
    const filter = document.getElementById("filter_dropdown");
    let html = "";
    if(filter_dropdown_activeted == false){
    html = `<div class="filters-dropdown basic-frame">
              <select class="form-select filter-item" aria-label="Default select example">
                <option selected>Filter 1</option>
                <option value=" ">filter</option>
                <option value=" ">filter</option>
                <option value=" ">filter</option>
              </select>
              <select class="form-select filter-item" aria-label="Default select example">
                <option selected>Filter 2</option>
                <option value=" ">filter</option>
                <option value=" ">filter</option>
                <option value=" ">filter</option>
              </select>
              <select class="form-select filter-item" aria-label="Default select example">
                <option selected>Filter 3</option>
                <option value=" ">filter</option>
                <option value=" ">filter</option>
                <option value=" ">filter</option>
              </select>
              <select class="form-select filter-item" aria-label="Default select example">
                <option selected>Filter 4</option>
                <option value=" ">filter</option>
                <option value=" ">filter</option>
                <option value=" ">filter</option>
              </select>
              <select class="form-select filter-item" aria-label="Default select example">
                <option selected>Filter 5</option>
                <option value=" ">filter</option>
                <option value=" ">filter</option>
                <option value=" ">filter</option>
              </select>
              <select class="form-select filter-item" aria-label="Default select example">
                <option selected>Filter 6</option>
                <option value=" ">filter</option>
                <option value=" ">filter</option>
                <option value=" ">filter</option>
              </select>
          </div>`;
          filter_dropdown_activeted = true;
    }
        else{
            html = "";
            filter_dropdown_activeted = false;
        }
    
    filter.innerHTML = html;
}