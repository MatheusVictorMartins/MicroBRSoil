#!/usr/bin/env node
/**
 * Manual Database Insert Script
 *
 * This script lets you manually insert successful pipeline results
 * that were not recorded due to unexpected errors.
 *
 * Usage:
 *   node manual-db-insert.js <runId> [pipelineType] [userId]
 *
 * Examples:
 *   node manual-db-insert.js 25a64ee5-edc3-412c-a43e-8b163f2a413c
 *   node manual-db-insert.js 25a64ee5-edc3-412c-a43e-8b163f2a413c illumina
 *   node manual-db-insert.js 25a64ee5-edc3-412c-a43e-8b163f2a413c illumina 1
 *
 * Parameters:
 *   runId        - Upload/pipeline ID (UUID, required)
 *   pipelineType - Pipeline type: illumina, iontorrent, its (default: illumina)
 *   userId       - Owner user ID (optional; auto-detected when omitted)
 */


const path = require('path');
const fs = require('fs');
require('dotenv').config();

// Colors for console output
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m'
};

function log(message, type = 'info') {
    const timestamp = new Date().toISOString();
    const colorMap = {
        info: colors.blue,
        success: colors.green,
        warning: colors.yellow,
        error: colors.red,
        header: colors.cyan + colors.bright
    };
    const color = colorMap[type] || colors.reset;
    console.log(`${color}[${timestamp}] ${message}${colors.reset}`);
}

function printUsage() {
    console.log(`
${colors.cyan}${colors.bright}╔══════════════════════════════════════════════════════════════════╗
║            Manual Database Insert - MicroBRSoil                  ║
╚══════════════════════════════════════════════════════════════════╝${colors.reset}

${colors.yellow}Uso:${colors.reset}
  node manual-db-insert.js <runId> [pipelineType] [userId]

${colors.yellow}Parâmetros:${colors.reset}
  runId         ID do upload/pipeline (UUID, obrigatório)
  pipelineType  Tipo do pipeline: illumina, iontorrent, its (padrão: illumina)
  userId        ID do usuario owner (opcional; detectado automaticamente se omitido)

${colors.yellow}Exemplos:${colors.reset}
  node manual-db-insert.js 25a64ee5-edc3-412c-a43e-8b163f2a413c
  node manual-db-insert.js 25a64ee5-edc3-412c-a43e-8b163f2a413c illumina
  node manual-db-insert.js 25a64ee5-edc3-412c-a43e-8b163f2a413c iontorrent 1

${colors.yellow}Comandos especiais:${colors.reset}
  node manual-db-insert.js --list     Lista todos os runIds disponíveis
  node manual-db-insert.js --check <runId>  Verifica status do runId
`);
}

async function listAvailableRuns() {
    const resultsDir = path.join(__dirname, 'results');
    
    if (!fs.existsSync(resultsDir)) {
        log('Diretório de resultados não encontrado', 'error');
        return;
    }

    const entries = fs.readdirSync(resultsDir, { withFileTypes: true });
    const runs = [];

    for (const entry of entries) {
        if (entry.isDirectory() && entry.name.match(/^[a-f0-9-]{36}$/i)) {
            const runPath = path.join(resultsDir, entry.name);
            const statusPath = path.join(runPath, 'pipeline_status.json');
            
            let status = 'unknown';
            let pipelineType = 'unknown';
            let completedAt = 'N/A';
            
            if (fs.existsSync(statusPath)) {
                try {
                    const statusData = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
                    status = statusData.status || 'unknown';
                    pipelineType = statusData.pipeline_type || statusData.pipelineType || 'unknown';
                    completedAt = statusData.completed_at || statusData.completedAt || 'N/A';
                } catch (e) {
                    status = 'error reading status';
                }
            } else {
                status = 'no status file';
            }

            runs.push({
                runId: entry.name,
                status,
                pipelineType,
                completedAt
            });
        }
    }

    if (runs.length === 0) {
        log('Nenhum resultado de pipeline encontrado', 'warning');
        return;
    }

    console.log(`\n${colors.cyan}${colors.bright}╔══════════════════════════════════════════════════════════════════════════════════════════╗`);
    console.log(`║                              Pipelines Disponíveis                                       ║`);
    console.log(`╚══════════════════════════════════════════════════════════════════════════════════════════╝${colors.reset}\n`);

    console.log(`${'Run ID'.padEnd(40)} ${'Status'.padEnd(12)} ${'Type'.padEnd(12)} ${'Completed At'}`);
    console.log(`${'─'.repeat(40)} ${'─'.repeat(12)} ${'─'.repeat(12)} ${'─'.repeat(25)}`);

    for (const run of runs) {
        const statusColor = run.status === 'success' ? colors.green : 
                           run.status === 'error' ? colors.red : colors.yellow;
        console.log(`${run.runId.padEnd(40)} ${statusColor}${run.status.padEnd(12)}${colors.reset} ${run.pipelineType.padEnd(12)} ${run.completedAt}`);
    }

    console.log(`\n${colors.blue}Total: ${runs.length} pipelines encontrados${colors.reset}\n`);
}

async function checkRunStatus(runId) {
    const resultsDir = path.join(__dirname, 'results', runId);
    
    if (!fs.existsSync(resultsDir)) {
        log(`Diretório de resultados não encontrado para runId: ${runId}`, 'error');
        return null;
    }

    const expectedFiles = {
        alpha: 'alpha_diversity_metrics.csv',
        otu: 'otu_table.csv',
        taxonomy: 'tax_table.csv',
        metadata: 'sample_metadata.csv',
        status: 'pipeline_status.json'
    };

    console.log(`\n${colors.cyan}${colors.bright}╔══════════════════════════════════════════════════════════════════╗`);
    console.log(`║                    Status do Pipeline                            ║`);
    console.log(`╚══════════════════════════════════════════════════════════════════╝${colors.reset}\n`);

    console.log(`${colors.bright}Run ID:${colors.reset} ${runId}`);
    console.log(`${colors.bright}Diretório:${colors.reset} ${resultsDir}\n`);

    console.log(`${colors.bright}Arquivos:${colors.reset}`);
    
    const foundFiles = {};
    for (const [key, filename] of Object.entries(expectedFiles)) {
        const filePath = path.join(resultsDir, filename);
        const exists = fs.existsSync(filePath);
        const icon = exists ? `${colors.green}✓${colors.reset}` : `${colors.red}✗${colors.reset}`;
        console.log(`  ${icon} ${filename}`);
        if (exists) foundFiles[key] = filePath;
    }

    // Read status file if exists
    if (foundFiles.status) {
        try {
            const statusData = JSON.parse(fs.readFileSync(foundFiles.status, 'utf8'));
            console.log(`\n${colors.bright}Pipeline Status:${colors.reset}`);
            console.log(`  Status: ${statusData.status === 'success' ? colors.green : colors.red}${statusData.status}${colors.reset}`);
            console.log(`  Type: ${statusData.pipeline_type || statusData.pipelineType || 'N/A'}`);
            console.log(`  Completed At: ${statusData.completed_at || statusData.completedAt || 'N/A'}`);
            
            if (statusData.error) {
                console.log(`  ${colors.red}Error: ${statusData.error}${colors.reset}`);
            }
        } catch (e) {
            log(`Erro ao ler arquivo de status: ${e.message}`, 'error');
        }
    }

    // Check database for existing records
    try {
        const pool = require('./db/db');
        const result = await pool.query(
            'SELECT result_id, run_id, soil_id, created_at FROM microbrsoil_db.pipeline_results WHERE run_id = $1',
            [runId]
        );

        console.log(`\n${colors.bright}Registro no Banco de Dados:${colors.reset}`);
        if (result.rows.length > 0) {
            const record = result.rows[0];
            console.log(`  ${colors.green}✓ Registro encontrado${colors.reset}`);
            console.log(`    Result ID: ${record.result_id}`);
            console.log(`    Soil ID: ${record.soil_id || 'N/A'}`);
            console.log(`    Created At: ${record.created_at}`);
        } else {
            console.log(`  ${colors.yellow}✗ Nenhum registro encontrado no banco${colors.reset}`);
            console.log(`  ${colors.cyan}→ Use este script para inserir os resultados${colors.reset}`);
        }
    } catch (e) {
        console.log(`\n${colors.red}Erro ao verificar banco de dados: ${e.message}${colors.reset}`);
    }

    console.log('');
    return foundFiles;
}

async function insertPipelineResults(runId, pipelineType, userId) {
    const resultsDir = path.join(__dirname, 'results', runId);
    
    log(`Iniciando inserção manual para runId: ${runId}`, 'header');
    log(`Pipeline Type: ${pipelineType}`, 'info');
    log(`User ID: ${userId ?? 'auto'}`, 'info');
    log(`Diretório: ${resultsDir}`, 'info');

    // Verify directory exists
    if (!fs.existsSync(resultsDir)) {
        log(`Diretório de resultados não encontrado: ${resultsDir}`, 'error');
        process.exit(1);
    }

    // Check for status file
    const statusPath = path.join(resultsDir, 'pipeline_status.json');
    if (fs.existsSync(statusPath)) {
        try {
            const statusData = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
            if (statusData.status !== 'success') {
                log(`Pipeline não concluído com sucesso. Status: ${statusData.status}`, 'warning');
                const readline = require('readline');
                const rl = readline.createInterface({
                    input: process.stdin,
                    output: process.stdout
                });
                
                const answer = await new Promise(resolve => {
                    rl.question(`${colors.yellow}Deseja continuar mesmo assim? (s/N): ${colors.reset}`, resolve);
                });
                rl.close();
                
                if (answer.toLowerCase() !== 's' && answer.toLowerCase() !== 'y') {
                    log('Operação cancelada pelo usuário', 'info');
                    process.exit(0);
                }
            }
            
            // Use pipeline type from status file if not specified
            if (statusData.pipeline_type || statusData.pipelineType) {
                pipelineType = statusData.pipeline_type || statusData.pipelineType;
                log(`Pipeline type detectado do arquivo de status: ${pipelineType}`, 'info');
            }
        } catch (e) {
            log(`Aviso: Não foi possível ler arquivo de status: ${e.message}`, 'warning');
        }
    } else {
        log('Arquivo de status não encontrado - continuando sem verificação de status', 'warning');
    }

    // Check if already in database
    try {
        const pool = require('./db/db');
        const existingResult = await pool.query(
            'SELECT result_id, soil_id FROM microbrsoil_db.pipeline_results WHERE run_id = $1',
            [runId]
        );

        if (existingResult.rows.length > 0) {
            log(`Registro já existe no banco de dados!`, 'warning');
            log(`Result ID: ${existingResult.rows[0].result_id}`, 'info');
            log(`Soil ID: ${existingResult.rows[0].soil_id || 'N/A'}`, 'info');
            
            const readline = require('readline');
            const rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout
            });
            
            const answer = await new Promise(resolve => {
                rl.question(`${colors.yellow}Deseja deletar o registro existente e criar um novo? (s/N): ${colors.reset}`, resolve);
            });
            rl.close();
            
            if (answer.toLowerCase() === 's' || answer.toLowerCase() === 'y') {
                log('Deletando registro existente...', 'info');
                await pool.query('DELETE FROM microbrsoil_db.pipeline_results WHERE run_id = $1', [runId]);
                log('Registro deletado com sucesso', 'success');
            } else {
                log('Operação cancelada pelo usuário', 'info');
                process.exit(0);
            }
        }
    } catch (e) {
        log(`Erro ao verificar registro existente: ${e.message}`, 'error');
    }

    // Process pipeline results using existing function
    try {
        log('Processando resultados do pipeline...', 'info');
        
        const { processPipelineResults } = require('./db/db_functions/pipeline_data_functions');
        
        const result = await processPipelineResults(runId, resultsDir, pipelineType, userId);

        console.log(`\n${colors.green}${colors.bright}╔══════════════════════════════════════════════════════════════════╗`);
        console.log(`║                    Inserção Concluída!                           ║`);
        console.log(`╚══════════════════════════════════════════════════════════════════╝${colors.reset}\n`);

        log(`Run ID: ${result.runId}`, 'success');
        log(`Pipeline Type: ${result.pipelineType}`, 'success');
        log(`Pipeline Result ID: ${result.pipelineResultId}`, 'success');
        log(`Soil ID: ${result.soilId || 'N/A'}`, 'success');
        
        if (result.processedRecords) {
            log(`Alpha Records: ${result.processedRecords.alphaRecords || 0}`, 'info');
            log(`Sample Records: ${result.processedRecords.sampleRecords || 0}`, 'info');
        }

        if (result.resultFiles) {
            log(`Arquivos processados: ${result.resultFiles.join(', ')}`, 'info');
        }

        if (result.missingFiles && result.missingFiles.length > 0) {
            log(`Arquivos não encontrados: ${result.missingFiles.join(', ')}`, 'warning');
        }

        // Finaliza script
        log('Processamento concluido', 'info');
        process.exit(0);

    } catch (error) {
        log(`Erro ao processar resultados: ${error.message}`, 'error');
        console.error(error.stack);
        process.exit(1);
    }
}

// Main execution
async function main() {
    const args = process.argv.slice(2);

    if (args.length === 0) {
        printUsage();
        process.exit(1);
    }

    // Handle special commands
    if (args[0] === '--list' || args[0] === '-l') {
        await listAvailableRuns();
        process.exit(0);
    }

    if (args[0] === '--check' || args[0] === '-c') {
        if (!args[1]) {
            log('Por favor, forneça um runId para verificar', 'error');
            process.exit(1);
        }
        await checkRunStatus(args[1]);
        try {
            const pool = require('./db/db');
        } catch (e) { /* ignore */ }
        process.exit(0);
    }

    if (args[0] === '--help' || args[0] === '-h') {
        printUsage();
        process.exit(0);
    }

    // Validate runId format (UUID)
    const runId = args[0];
    if (!runId.match(/^[a-f0-9-]{36}$/i)) {
        log(`runId inválido: ${runId}`, 'error');
        log('O runId deve ser um UUID válido (ex: 25a64ee5-edc3-412c-a43e-8b163f2a413c)', 'info');
        process.exit(1);
    }

    const pipelineType = args[1] || 'illumina';
    const parsedUserId = args[2] ? Number.parseInt(args[2], 10) : null;
    const userId = Number.isNaN(parsedUserId) ? null : parsedUserId;

    // Validate pipeline type
    const validTypes = ['illumina', 'iontorrent', 'its'];
    if (!validTypes.includes(pipelineType.toLowerCase())) {
        log(`Pipeline type inválido: ${pipelineType}`, 'error');
        log(`Tipos válidos: ${validTypes.join(', ')}`, 'info');
        process.exit(1);
    }

    await insertPipelineResults(runId, pipelineType.toLowerCase(), userId);
}

main().catch(error => {
    log(`Erro fatal: ${error.message}`, 'error');
    console.error(error.stack);
    process.exit(1);
});
