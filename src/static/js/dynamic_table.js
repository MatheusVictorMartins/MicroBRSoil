const data = [
    {"id": 1, "name": "Test", "age": 25},
    {"id": 2, "name": "Test2", "age": 40},
    {"id": 3, "name": "Sample", "age": 80}
];

function createTable(json, table_id) {
      const $table = $("test_table"); // Only for testing; link the table using the table_id parameter
      $table.empty();

      if (json.length === 0) return;

      // Header
      let header = "<tr>";
      $.each(Object.keys(json[0]), function(i, col) {
        header += `<th>${col}</th>`;
      });
      header += "</tr>";
      $table.append(header);

      // Rows
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
