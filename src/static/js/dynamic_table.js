const data = [
    {"id": 1, "name": "Teste", "age": 25},
    {"id": 2, "name": "Teste2", "age": 40},
    {"id": 3, "name": "kkkkkkk", "age": 80}
];

function createTable(json, table_id) {
      const $table = $("test_table"); // Apenas para teste, tem que achar uma forma de linkar a tabela pelo parametro table_id
      $table.empty();

      if (json.length === 0) return;

      // Cabeçalho
      let header = "<tr>";
      $.each(Object.keys(json[0]), function(i, col) {
        header += `<th>${col}</th>`;
      });
      header += "</tr>";
      $table.append(header);

      // Linhas
      $.each(json, function(i, item) {
        let row = "<tr>";
        $.each(item, function(key, value) {
          row += `<td>${value}</td>`;
        });
        row += "</tr>";
        $table.append(row);
      });
    }

    createTable(data,"");