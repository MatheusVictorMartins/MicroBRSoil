const fs = require('fs');
const path = require('path');
const callsite = require('callsite');//usado para pegar o stack de funções

//função pra escrever log durante a execução
//tem que estar na mesma pasta que os logs vão ficar
//mensagens tem que começar com quebra de linha '\n'
//pega o nome da função, arquivo, caminho e linha da função que chamou, logo tu só precisa passar a mensagem

const writeLog = (message) => {//string que deseja colocar no log
    const regex = /^\n.+/;
    const stack = callsite();//deixa encontrar a função que chamou essa
    if (message === null || message === undefined || typeof (message) != "string" || !regex.test(message)) {
        console.log("\nMensagem de log invalida, verifique formatação, mesagens devem começar com quebra de linha e não pode estar vazias")
    } else {
        const currentDate = new Date();
        const filePath = path.join(__dirname, `MicroBrSoil_database_${currentDate.getDate()}-${currentDate.getMonth()}-${currentDate.getFullYear()}.log`);
        const callerInfo = {
            function: stack[1].getFunctionName() || '<anonymous>',
            fileName: stack[1].getFileName(),
            line: stack[1].getLineNumber(),
            functionFilePath: path.basename(stack[1].getFileName())
        };
        const preString = `\n\n====================  ${currentDate.getHours()}h-${currentDate.getMinutes()}m-${currentDate.getSeconds()}s/${currentDate.getDate()}-${currentDate.getMonth()}-${currentDate.getFullYear()} ====================` +
            `\nfunção: ${callerInfo.function}` +
            `\narquivo: ${callerInfo.fileName}` +
            `\nlinha: ${callerInfo.line}` +
            `\ncaminho: ${callerInfo.functionFilePath}`
        fs.appendFile(filePath, preString + message, function (err) {
            if (err) {
                console.log("Erro ao salvar log - " + err);
            } else {
                console.log("\nLog salvo com sucesso");
            }
        });
    }
}

module.exports = writeLog;