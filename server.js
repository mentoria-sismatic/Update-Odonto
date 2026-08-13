const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(__dirname));

// ====================================================
//   SISTEMA LIBERADO - SEM RESTRIÇÃO DE HARDWARE
// ====================================================



// ====================================================
//   BANCO DE DADOS
// ====================================================
const dbFile = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbFile, (err) => {
    if (err) {
        console.error('Erro ao abrir o banco de dados', err);
    } else {
        console.log('Banco de dados conectado');
        initDb();
    }
});

function initDb() {
    db.serialize(() => {
        db.run(`CREATE TABLE IF NOT EXISTS pacientes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL,
            telefone TEXT,
            cpf TEXT,
            data_nascimento TEXT,
            historico TEXT,
            alergias TEXT
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS procedimentos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            foto TEXT,
            nome TEXT NOT NULL,
            descricao TEXT,
            preco REAL
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS consultas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            paciente_id INTEGER,
            paciente_nome TEXT,
            telefone TEXT,
            itens TEXT,
            status TEXT,
            garantia TEXT,
            valor REAL,
            obs TEXT,
            data_criacao DATETIME DEFAULT CURRENT_TIMESTAMP,
            data_consulta DATETIME,
            FOREIGN KEY (paciente_id) REFERENCES pacientes(id)
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS configuracoes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            logo TEXT,
            nome_clinica TEXT,
            endereco TEXT,
            telefone TEXT,
            responsavel TEXT,
            cro TEXT,
            horario_inicio TEXT DEFAULT '08:00',
            horario_fim TEXT DEFAULT '18:00',
            intervalo_minutos INTEGER DEFAULT 60,
            dias_atendimento TEXT DEFAULT '1,2,3,4,5'
        )`);

        // Migration: add scheduling and update columns if missing
        db.run(`ALTER TABLE configuracoes ADD COLUMN horario_inicio TEXT DEFAULT '08:00'`, () => {});
        db.run(`ALTER TABLE configuracoes ADD COLUMN horario_fim TEXT DEFAULT '18:00'`, () => {});
        db.run(`ALTER TABLE configuracoes ADD COLUMN intervalo_minutos INTEGER DEFAULT 60`, () => {});
        db.run(`ALTER TABLE configuracoes ADD COLUMN dias_atendimento TEXT DEFAULT '1,2,3,4,5'`, () => {});
        db.run(`ALTER TABLE configuracoes ADD COLUMN update_url TEXT`, () => {});

        db.get("SELECT COUNT(*) AS count FROM configuracoes", (err, row) => {
            if (row && row.count === 0) {
                db.run(`INSERT INTO configuracoes (nome_clinica, endereco, telefone, responsavel, cro) VALUES (?, ?, ?, ?, ?)`,
                    ['Clínica Odontológica', 'Endereço da Clínica (Configure em Configurações)', 'Telefone Comercial', 'Cirurgião-Dentista', 'CRO-00000']
                );
            }
        });

        db.get("SELECT COUNT(*) AS count FROM procedimentos", (err, row) => {
            if (row && row.count === 0) {
                const defaultProcs = [
                    ['Avaliação Inicial', 'Consulta de diagnóstico e orçamento', 0],
                    ['Limpeza / Profilaxia', 'Raspagem supra e polimento', 150],
                    ['Restauração em Resina (1 face)', 'Restauração simples', 180],
                    ['Clareamento Dental (Caseiro)', 'Moldeiras e gel clareador', 600],
                    ['Clareamento Dental (Consultório)', 'Sessões a laser/LED', 1200],
                    ['Extração Simples', 'Exodontia de dente permanente', 150],
                    ['Extração de Siso', 'Exodontia de terceiro molar', 450],
                    ['Tratamento de Canal (Anterior)', 'Endodontia de incisivos/caninos', 400],
                    ['Tratamento de Canal (Posterior)', 'Endodontia de molares', 700],
                    ['Implante Dentário', 'Pino de titânio (fase cirúrgica)', 2000],
                    ['Coroa em Porcelana', 'Prótese fixa unitária', 1500],
                    ['Manutenção Ortodôntica', 'Troca de fios e borrachinhas', 120],
                    ['Raspagem Periodontal', 'Por sessão/hemi-arco', 200],
                    ['Aplicação de Flúor', 'Prevenção de cáries', 80]
                ];
                const stmt = db.prepare("INSERT INTO procedimentos (nome, descricao, preco) VALUES (?, ?, ?)");
                defaultProcs.forEach(proc => { stmt.run(proc); });
                stmt.finalize();
                console.log("Procedimentos padrão inseridos com sucesso.");
            }
        });
    });
}

// ====================================================
//   TIMESTAMP (POLLING REAL-TIME)
// ====================================================
let lastUpdate = Date.now();

function notifyClients() {
    lastUpdate = Date.now();
}

app.get('/api/timestamp', (req, res) => {
    res.json({ ts: lastUpdate });
});

// ====================================================
// ====================================================
//   SERVER MONITORING (MANTÉM O SERVIDOR SEMPRE ATIVO)
// ====================================================
app.post('/api/heartbeat', (req, res) => {
    res.json({ ok: true });
});

app.post('/api/shutdown', (req, res) => {
    res.json({ ok: true });
});

// ====================================================
//   ROTAS PACIENTES
// ====================================================

app.get('/api/ip', (req, res) => {
    const os = require('os');
    const interfaces = os.networkInterfaces();
    let localIp = 'localhost';
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                localIp = iface.address;
            }
        }
    }
    res.json({ ip: localIp, port: 3030 });
});

app.get('/api/pacientes', (req, res) => {
    db.all("SELECT * FROM pacientes ORDER BY nome ASC", (err, rows) => {
        if (err) res.status(500).json({ error: err.message });
        else res.json(rows);
    });
});

app.post('/api/pacientes', (req, res) => {
    const { nome, telefone, cpf, data_nascimento, historico, alergias } = req.body;
    db.run(`INSERT INTO pacientes (nome, telefone, cpf, data_nascimento, historico, alergias) VALUES (?, ?, ?, ?, ?, ?)`,
        [nome, telefone, cpf, data_nascimento, historico, alergias],
        function(err) {
            if (err) res.status(500).json({ error: err.message });
            else { res.json({ id: this.lastID, nome, telefone }); notifyClients(); }
        }
    );
});

app.delete('/api/pacientes/:id', (req, res) => {
    db.run("DELETE FROM pacientes WHERE id = ?", req.params.id, function(err) {
        if (err) res.status(500).json({ error: err.message });
        else { res.json({ success: true }); notifyClients(); }
    });
});

app.put('/api/pacientes/:id', (req, res) => {
    const { nome, telefone, cpf, data_nascimento, historico, alergias } = req.body;
    db.run(`UPDATE pacientes SET nome = ?, telefone = ?, cpf = ?, data_nascimento = ?, historico = ?, alergias = ? WHERE id = ?`,
        [nome, telefone, cpf, data_nascimento, historico, alergias, req.params.id], function(err) {
        if (err) res.status(500).json({ error: err.message });
        else { res.json({ success: true }); notifyClients(); }
    });
});

// ====================================================
//   ROTAS PROCEDIMENTOS
// ====================================================
app.get('/api/procedimentos', (req, res) => {
    db.all("SELECT * FROM procedimentos ORDER BY nome ASC", (err, rows) => {
        if (err) res.status(500).json({ error: err.message });
        else res.json(rows);
    });
});

app.post('/api/procedimentos', (req, res) => {
    const { nome, descricao, preco, foto } = req.body;
    db.run(`INSERT INTO procedimentos (nome, descricao, preco, foto) VALUES (?, ?, ?, ?)`,
        [nome, descricao, preco, foto || null],
        function(err) {
            if (err) res.status(500).json({ error: err.message });
            else { res.json({ id: this.lastID }); notifyClients(); }
        }
    );
});

app.delete('/api/procedimentos/:id', (req, res) => {
    db.run("DELETE FROM procedimentos WHERE id = ?", req.params.id, function(err) {
        if (err) res.status(500).json({ error: err.message });
        else { res.json({ success: true }); notifyClients(); }
    });
});

app.put('/api/procedimentos/:id', (req, res) => {
    const { nome, preco, descricao } = req.body;
    db.run("UPDATE procedimentos SET nome = ?, preco = ?, descricao = ? WHERE id = ?",
        [nome, preco, descricao, req.params.id], function(err) {
        if (err) res.status(500).json({ error: err.message });
        else { res.json({ success: true }); notifyClients(); }
    });
});

// ====================================================
//   ROTAS CONSULTAS
// ====================================================
app.get('/api/consultas', (req, res) => {
    const { data_inicio, data_fim } = req.query;
    let query = "SELECT * FROM consultas";
    let params = [];
    if (data_inicio && data_fim) {
        query += " WHERE date(data_consulta) BETWEEN ? AND ? ORDER BY data_consulta DESC";
        params = [data_inicio, data_fim];
    } else {
        query += " ORDER BY id DESC";
    }
    db.all(query, params, (err, rows) => {
        if (err) res.status(500).json({ error: err.message });
        else res.json(rows);
    });
});

app.post('/api/consultas', (req, res) => {
    const { paciente_id, paciente_nome, telefone, itens, status, garantia, valor, obs, data_consulta } = req.body;
    db.run(`INSERT INTO consultas (paciente_id, paciente_nome, telefone, itens, status, garantia, valor, obs, data_consulta) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [paciente_id, paciente_nome, telefone, JSON.stringify(itens), status, garantia, valor, obs, data_consulta],
        function(err) {
            if (err) res.status(500).json({ error: err.message });
            else { res.json({ id: this.lastID }); notifyClients(); }
        }
    );
});

app.put('/api/consultas/:id/status', (req, res) => {
    const { status } = req.body;
    db.run("UPDATE consultas SET status = ? WHERE id = ?", [status, req.params.id], function(err) {
        if (err) res.status(500).json({ error: err.message });
        else { res.json({ success: true }); notifyClients(); }
    });
});

app.put('/api/consultas/:id/reagendar', (req, res) => {
    const { data_consulta } = req.body;
    db.run("UPDATE consultas SET data_consulta = ? WHERE id = ?", [data_consulta, req.params.id], function(err) {
        if (err) res.status(500).json({ error: err.message });
        else { res.json({ success: true }); notifyClients(); }
    });
});

app.delete('/api/consultas/:id', (req, res) => {
    db.run("DELETE FROM consultas WHERE id = ?", req.params.id, function(err) {
        if (err) res.status(500).json({ error: err.message });
        else { res.json({ success: true }); notifyClients(); }
    });
});

// ====================================================
//   ROTAS CONFIGURAÇÕES
// ====================================================
app.get('/api/configuracoes', (req, res) => {
    db.get("SELECT * FROM configuracoes ORDER BY id DESC LIMIT 1", (err, row) => {
        if (err) res.status(500).json({ error: err.message });
        else res.json(row || {});
    });
});

app.post('/api/configuracoes', (req, res) => {
    const { logo, nome_clinica, endereco, telefone, responsavel, cro, horario_inicio, horario_fim, intervalo_minutos, dias_atendimento } = req.body;
    db.run("DELETE FROM configuracoes", () => {
        db.run(`INSERT INTO configuracoes (logo, nome_clinica, endereco, telefone, responsavel, cro, horario_inicio, horario_fim, intervalo_minutos, dias_atendimento) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [logo, nome_clinica, endereco, telefone, responsavel, cro,
             horario_inicio || '08:00', horario_fim || '18:00',
             intervalo_minutos || 60, dias_atendimento || '1,2,3,4,5'],
            function(err) {
                if (err) res.status(500).json({ error: err.message });
                else { res.json({ id: this.lastID }); notifyClients(); }
            }
        );
    });
});

// GET /api/slots?data=YYYY-MM-DD  — retorna horários disponíveis para o dia
app.get('/api/slots', (req, res) => {
    const { data } = req.query;
    if (!data) return res.status(400).json({ error: 'data obrigatória' });

    db.get("SELECT * FROM configuracoes ORDER BY id DESC LIMIT 1", (err, cfg) => {
        if (err || !cfg) return res.json({ slots: [] });

        const inicio = cfg.horario_inicio || '08:00';
        const fim = cfg.horario_fim || '18:00';
        const intervalo = parseInt(cfg.intervalo_minutos) || 60;

        // Gerar todos os slots do dia
        const toMin = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
        const toStr = m => `${String(Math.floor(m / 60)).padStart(2,'0')}:${String(m % 60).padStart(2,'0')}`;

        const slots = [];
        for (let m = toMin(inicio); m < toMin(fim); m += intervalo) {
            slots.push(toStr(m));
        }

        // Buscar hor��rios já ocupados na data
        db.all(
            `SELECT data_consulta FROM consultas WHERE date(data_consulta) = ? AND status NOT IN ('Cancelado','Faltou')`,
            [data],
            (err2, rows) => {
                const ocupados = (rows || []).map(r => {
                    const d = new Date(r.data_consulta);
                    return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
                });
                const disponiveis = slots.map(s => ({ hora: s, ocupado: ocupados.includes(s) }));
                res.json({ slots: disponiveis });
            }
        );
    });
});


// ====================================================
// Rota IP mantida na parte superior do arquivo
// ====================================================

// ====================================================
//   SISTEMA DE ATUALIZAÇÃO AUTOMÁTICA VIA NUVEM
// ====================================================
const UPDATE_SERVER_URL = 'https://raw.githubusercontent.com/mentoria-sismatic/Update-Odonto/master/version.json';

function getLocalVersion() {
    try {
        const pkgPath = path.join(__dirname, 'package.json');
        if (fs.existsSync(pkgPath)) {
            const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
            if (pkg.version) return pkg.version;
        }
    } catch (e) {}
    return '1.0.0';
}

function isNewerVersion(current, latest) {
    if (!current || !latest) return false;
    const c = current.split('.').map(Number);
    const l = latest.split('.').map(Number);
    for (let i = 0; i < Math.max(c.length, l.length); i++) {
        const cv = c[i] || 0;
        const lv = l[i] || 0;
        if (lv > cv) return true;
        if (lv < cv) return false;
    }
    return false;
}

function fetchRemoteFile(urlStr) {
    return new Promise((resolve, reject) => {
        const https = require('https');
        const http = require('http');

        // Tentar GitHub API instantânea para ignorar 5 min de cache CDN
        const match = urlStr.match(/raw\.githubusercontent\.com\/([^\/]+)\/([^\/]+)\/([^\/]+)\/(.+)/);
        if (match) {
            const [, owner, repo, branch, filePath] = match;
            const apiUrl = 'https://api.github.com/repos/' + owner + '/' + repo + '/contents/' + filePath + '?ref=' + branch;
            const req = https.get(apiUrl, { headers: { 'User-Agent': 'Sismatc-Odonto-Updater' } }, (res) => {
                if (res.statusCode === 200) {
                    let body = '';
                    res.on('data', chunk => body += chunk);
                    res.on('end', () => {
                        try {
                            const json = JSON.parse(body);
                            if (json.content) return resolve(Buffer.from(json.content, 'base64').toString('utf8'));
                        } catch (e) {}
                        fallbackGet();
                    });
                    return;
                }
                fallbackGet();
            });
            req.on('error', fallbackGet);
            req.setTimeout(4000, fallbackGet);
            return;
        }

        fallbackGet();

        function fallbackGet() {
            const sep = urlStr.includes('?') ? '&' : '?';
            const fullUrl = urlStr + sep + 't=' + Date.now();

            const get = (targetUrl, hops = 0) => {
                if (hops > 5) return reject(new Error('Muitos redirecionamentos'));
                const client = targetUrl.startsWith('https') ? https : http;
                const req = client.get(targetUrl, (res) => {
                    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                        return get(res.headers.location, hops + 1);
                    }
                    if (res.statusCode !== 200) {
                        return reject(new Error('Status ' + res.statusCode));
                    }
                    let body = '';
                    res.on('data', chunk => body += chunk);
                    res.on('end', () => resolve(body));
                });
                req.on('error', reject);
                req.setTimeout(6000, () => { req.destroy(); reject(new Error('Timeout')); });
            };
            get(fullUrl);
        }
    });
}

app.get('/api/check-update', async (req, res) => {
    const currentVer = getLocalVersion();
    try {
        const data = await fetchRemoteFile(UPDATE_SERVER_URL);
        const info = JSON.parse(data);
        const latestVersion = info.version || currentVer;
        const hasUpdate = isNewerVersion(currentVer, latestVersion);
        
        res.json({
            currentVersion: currentVer,
            latestVersion: latestVersion,
            hasUpdate: hasUpdate,
            changelog: info.changelog || 'Melhorias de desempenho e estabilidade.',
            files: info.files || null,
            downloadUrl: info.downloadUrl || null
        });
    } catch (err) {
        console.error('Check update error:', err.message);
        res.json({ currentVersion: currentVer, latestVersion: currentVer, hasUpdate: false });
    }
});

app.post('/api/apply-update', async (req, res) => {
    let { files, version } = req.body;
    if (!files || typeof files !== 'object') {
        return res.status(400).json({ error: 'Nenhum arquivo fornecido para atualização.' });
    }

    try {
        const updatedFiles = [];
        const allowedFiles = ['server.js', 'app.js', 'index.html', 'style.css'];

        for (const [filename, url] of Object.entries(files)) {
            if (!allowedFiles.includes(filename)) continue;

            const targetPath = path.join(__dirname, filename);
            try {
                const content = await fetchRemoteFile(url);
                if (content && content.length > 30) {
                    fs.writeFileSync(targetPath, content, 'utf8');
                    updatedFiles.push(filename);
                }
            } catch (errFile) {
                console.error(`Erro ao atualizar ${filename}:`, errFile.message);
            }
        }

        // Se a versão não veio no req.body, busca no version.json do servidor
        if (!version) {
            try {
                const remoteData = await fetchRemoteFile(UPDATE_SERVER_URL);
                const remoteInfo = JSON.parse(remoteData);
                if (remoteInfo && remoteInfo.version) {
                    version = remoteInfo.version;
                }
            } catch (e) {}
        }

        // Atualizar versão em package.json
        if (version) {
            try {
                const pkgPath = path.join(__dirname, 'package.json');
                if (fs.existsSync(pkgPath)) {
                    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
                    pkg.version = version;
                    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2), 'utf8');
                }
            } catch (errPkg) {
                console.error('Erro ao atualizar package.json:', errPkg.message);
            }
        }

        res.json({
            success: true,
            updatedFiles: updatedFiles,
            message: `Atualização realizada com sucesso! ${updatedFiles.length} arquivo(s) atualizado(s).`
        });
    } catch (e) {
        res.status(500).json({ error: 'Erro ao aplicar atualização: ' + e.message });
    }
});

// ====================================================
//   START
// ====================================================
const PORT = 3030;
app.listen(PORT, () => {
    console.log(`Sismatc Odonto rodando na porta ${PORT}`);
    console.log('Acesse: http://localhost:3030');
});
