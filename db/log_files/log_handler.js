const fs = require('fs');
const path = require('path');

//função pra escrever log durante a execução
//tem que estar na mesma pasta que os logs vão ficar
//mensagens tem que começar com quebra de linha '\n'

const writeLog = (message) => {//string que deseja colocar no log
    const regex = /^\n.+/;
    if (message === null || message === undefined || typeof (message) != "string" || !regex.test(message)) {
        console.log("\nMensagem de log invalida, verifique formatação, mesagens devem começar com quebra de linha e não pode estar vazias")
    } else {
        const currentDate = new Date();
        const filePath = path.join(__dirname, `MicroSoilBR_database_${currentDate.getDate()}-${currentDate.getMonth()}-${currentDate.getFullYear()}.log`);
        const preString = `\n\n====================  ${currentDate.getHours()}h-${currentDate.getMinutes()}m-${currentDate.getSeconds()}s/${currentDate.getDate()}-${currentDate.getMonth()}-${currentDate.getFullYear()} ====================`
        fs.appendFile(filePath, preString + message, function (err) {
            if (err) {
                console.log("Erro ao salvar log - " + err);
            } else {
                console.log("\nLog salvo com sucesso");
            }
        })
    }
}

module.exports = writeLog;