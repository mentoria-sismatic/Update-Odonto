const API_URL = '/api';

document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        document.getElementById('splash-screen').style.opacity = '0';
        setTimeout(() => {
            document.getElementById('splash-screen').style.display = 'none';
        }, 500);
    }, 1000);

    setupNavigation();
    loadDashboard();
    loadPacientes();
    loadProcedimentos();
    loadConfig();
    setupRealTime();
    setupHeartbeat();
    checkSystemUpdates(false);

    // Set today for date filter
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('dash-date-start').value = today;
    document.getElementById('dash-date-end').value = today;

    // Add event listeners for forms
    document.getElementById('form-paciente').addEventListener('submit', savePaciente);
    document.getElementById('form-procedimento').addEventListener('submit', saveProcedimento);
    document.getElementById('form-config').addEventListener('submit', saveConfig);
    document.getElementById('form-consulta').addEventListener('submit', saveConsulta);

    // Dynamic total calculation for consulta
    document.getElementById('procedimentos-container').addEventListener('input', calculateTotal);
    
    // Auto fill price when procedure selected
    document.getElementById('procedimentos-container').addEventListener('change', (e) => {
        if(e.target.classList.contains('cons-item-nome')) {
            const list = document.getElementById('procedimentos-list');
            const options = list.options;
            let price = 0;
            for(let i=0; i<options.length; i++){
                if(options[i].value === e.target.value) {
                    price = parseFloat(options[i].dataset.preco);
                    break;
                }
            }
            const row = e.target.closest('.item-row');
            const priceInput = row.querySelector('.cons-item-preco');
            if(priceInput) priceInput.value = price.toFixed(2);
            calculateTotal();
        }
    });

    // Mobile PWA / App banner
    if (window.innerWidth <= 768 || navigator.userAgent.match(/Mobile/)) {
        setTimeout(showMobileBanner, 2000);
    }
});

function setupNavigation() {
    const links = document.querySelectorAll('.sidebar nav ul li');
    links.forEach(link => {
        link.addEventListener('click', () => {
            links.forEach(l => l.classList.remove('active'));
            link.classList.add('active');
            const targetPage = link.getAttribute('data-page');
            document.querySelectorAll('.page').forEach(page => {
                page.classList.remove('active');
                page.classList.add('hidden');
            });
            document.getElementById(targetPage).classList.remove('hidden');
            document.getElementById(targetPage).classList.add('active');

            if(targetPage === 'consultas') loadConsultas();
            if(targetPage === 'dashboard') loadDashboard();
        });
    });
}

// ---- HEARTBEAT ----
function setupHeartbeat() {
    const send = () => fetch(`${API_URL}/heartbeat`, { method: 'POST', cache: 'no-store' }).catch(() => {});
    send();
}

// ---- REAL-TIME (POLLING) ----
let _lastKnownTs = 0;

function setupRealTime() {
    setInterval(async () => {
        try {
            const res = await fetch(`${API_URL}/timestamp`, { cache: 'no-store' });
            const data = await res.json();
            if (_lastKnownTs === 0) {
                _lastKnownTs = data.ts;
                return;
            }
            if (data.ts > _lastKnownTs) {
                _lastKnownTs = data.ts;
                const activePage = document.querySelector('.page.active');
                if (activePage) {
                    const pageId = activePage.id;
                    if (pageId === 'dashboard') loadDashboard(false); // sem filtro no auto-refresh
                    if (pageId === 'consultas') { loadConsultas(); }
                    if (pageId === 'pacientes') loadPacientes();
                    if (pageId === 'procedimentos') loadProcedimentos();
                }
            }
        } catch (e) {
            // silencioso
        }
    }, 3000);
}

// ---- DASHBOARD ----
function limparFiltroDashboard() {
    const s = document.getElementById('dash-date-start');
    const e = document.getElementById('dash-date-end');
    if (s) s.value = '';
    if (e) e.value = '';
    loadDashboard(false);
}

async function loadDashboard(useFilter = true) {
    const start = document.getElementById('dash-date-start')?.value || '';
    const end = document.getElementById('dash-date-end')?.value || '';
    
    try {
        let url = `${API_URL}/consultas`;
        if (useFilter && start && end) url += `?data_inicio=${start}&data_fim=${end}`;
        
        const res = await fetch(url, { cache: 'no-store' });
        const consultas = await res.json();
        
        const pacRes = await fetch(`${API_URL}/pacientes`, { cache: 'no-store' });
        const pacientes = await pacRes.json();

        if (!Array.isArray(consultas) || !Array.isArray(pacientes)) return;

        let realizadas = 0;
        let faturamento = 0;
        let html = '';

        consultas.forEach((c, index) => {
            if (c.status === 'Realizado' || c.status === 'Finalizado') {
                realizadas++;
                faturamento += c.valor;
            }

            if(index < 10) { // Show only 10 recent
                let dataFormatada = '-';
                if (c.data_consulta) {
                    try {
                        const d = new Date(c.data_consulta);
                        dataFormatada = isNaN(d.getTime()) ? c.data_consulta : d.toLocaleString('pt-BR');
                    } catch(err) {
                        dataFormatada = c.data_consulta;
                    }
                }
                const badgeClass = `status-${c.status ? c.status.toLowerCase().replace(/ /g, '-') : 'pendente'}`;
                
                const pacId = c.paciente_id || '';
                html += `
                    <tr>
                        <td>${dataFormatada}</td>
                        <td><a onclick="mostrarHistoricoPaciente('${pacId}', '${(c.paciente_nome||'').replace(/'/g,"\\'")}')" style="color:var(--primary); font-weight:600; cursor:pointer; text-decoration:underline; text-decoration-color:transparent; transition:0.2s;" onmouseover="this.style.textDecorationColor='var(--primary)'" onmouseout="this.style.textDecorationColor='transparent'">${c.paciente_nome || '-'}</a></td>
                        <td><span class="badge ${badgeClass}">${c.status || 'Pendente'}</span></td>
                        <td>R$ ${(c.valor || 0).toFixed(2)}</td>
                    </tr>
                `;
            }
        });

        if (consultas.length === 0) {
            html = `<tr><td colspan="4" style="text-align:center; color:#7f8c8d; padding:20px;">Nenhum atendimento encontrado ${start && end ? 'neste período' : ''}.</td></tr>`;
        }

        document.querySelector('#table-dashboard tbody').innerHTML = html;

        document.getElementById('kpi-consultas').innerText = consultas.length;
        document.getElementById('kpi-realizadas').innerText = realizadas;
        document.getElementById('kpi-pacientes').innerText = pacientes.length;
        document.getElementById('kpi-faturamento').innerText = `R$ ${faturamento.toFixed(2)}`;

    } catch (e) {
        console.error('Error loading dashboard', e);
    }
}

// ---- PACIENTES ----
async function loadPacientes() {
    try {
        const res = await fetch(`${API_URL}/pacientes`);
        const pacientes = await res.json();
        
        const tbody = document.querySelector('#table-pacientes tbody');
        const datalist = document.getElementById('pacientes-list');
        tbody.innerHTML = '';
        datalist.innerHTML = '';

        pacientes.forEach(p => {
            const encodedPac = encodeURIComponent(JSON.stringify(p));
            tbody.innerHTML += `
                <tr>
                    <td><a onclick="mostrarHistoricoPaciente('${p.id}', '${p.nome.replace(/'/g,"\\'")}')" style="color:var(--primary); font-weight:600; cursor:pointer; text-decoration:underline; text-decoration-color:transparent; transition:0.2s;" onmouseover="this.style.textDecorationColor='var(--primary)'" onmouseout="this.style.textDecorationColor='transparent'" title="Ver Histórico Clínico">${p.nome}</a></td>
                    <td>${p.telefone}</td>
                    <td>${p.cpf || '-'}</td>
                    <td>${p.alergias || '-'}</td>
                    <td>
                        <button class="action-btn" onclick="editPaciente('${encodedPac}')" title="Editar"><i class="fa-solid fa-pen"></i></button>
                        <button class="action-btn" style="color: var(--accent-red)" onclick="deletePaciente(${p.id})" title="Excluir"><i class="fa-solid fa-trash"></i></button>
                    </td>
                </tr>
            `;
            datalist.innerHTML += `<option value="${p.nome}" data-id="${p.id}" data-tel="${p.telefone}" data-cpf="${p.cpf||''}" data-nasc="${p.data_nascimento||''}" data-alergias="${p.alergias||''}"></option>`;
        });

        // Atualiza os <select> de pacientes
        const pacSelects = document.querySelectorAll('select#cons-paciente');
        pacSelects.forEach(select => {
            const val = select.value;
            select.innerHTML = buildPacienteSelect(val);
        });

    } catch (e) {
        console.error('Error loading patients', e);
    }
}

function buildPacienteSelect(selectedNome) {
    const list = document.getElementById('pacientes-list');
    const opts = list ? Array.from(list.options) : [];
    let options = `<option value="">-- Selecione o Paciente --</option>`;
    opts.forEach(o => {
        const sel = (o.value === selectedNome) ? 'selected' : '';
        options += `<option value="${o.value}" data-id="${o.dataset.id}" data-tel="${o.dataset.tel}" data-cpf="${o.dataset.cpf}" data-nasc="${o.dataset.nasc}" data-alergias="${o.dataset.alergias}" ${sel}>${o.value} ${o.dataset.tel ? `(${o.dataset.tel})` : ''}</option>`;
    });
    options += `<option value="__novo__" ${selectedNome === '__novo__' ? 'selected' : ''}>✏️ Novo Paciente (digitar)</option>`;
    return options;
}

function onPacienteSelect(selectEl) {
    const customInput = document.getElementById('cons-paciente-custom');
    
    if (selectEl.value === '__novo__') {
        customInput.style.display = 'block';
        customInput.focus();
        document.getElementById('cons-paciente-id').value = '';
        document.getElementById('cons-telefone').value = '';
        document.getElementById('cons-cpf').value = '';
        document.getElementById('cons-nascimento').value = '';
        document.getElementById('cons-alergias').value = '';
    } else {
        customInput.style.display = 'none';
        const opt = selectEl.options[selectEl.selectedIndex];
        if (opt && opt.value !== '') {
            document.getElementById('cons-paciente-id').value = opt.dataset.id || '';
            document.getElementById('cons-telefone').value = opt.dataset.tel || '';
            document.getElementById('cons-cpf').value = opt.dataset.cpf || '';
            document.getElementById('cons-nascimento').value = opt.dataset.nasc || '';
            document.getElementById('cons-alergias').value = opt.dataset.alergias || '';
        } else {
            document.getElementById('cons-paciente-id').value = '';
            document.getElementById('cons-telefone').value = '';
            document.getElementById('cons-cpf').value = '';
            document.getElementById('cons-nascimento').value = '';
            document.getElementById('cons-alergias').value = '';
        }
    }
}

function autofillPaciente() {
    // Mantido por compatibilidade, mas substituído pelo onPacienteSelect

    const nome = document.getElementById('cons-paciente').value;
    const listOptions = document.getElementById('pacientes-list').options;
    let found = false;
    for(let i=0; i<listOptions.length; i++){
        if(listOptions[i].value === nome) {
            const opt = listOptions[i];
            document.getElementById('cons-paciente-id').value = opt.dataset.id;
            document.getElementById('cons-telefone').value = opt.dataset.tel;
            document.getElementById('cons-cpf').value = opt.dataset.cpf;
            document.getElementById('cons-nascimento').value = opt.dataset.nasc;
            document.getElementById('cons-alergias').value = opt.dataset.alergias;
            found = true;
            break;
        }
    }
    if (!found) {
        document.getElementById('cons-paciente-id').value = '';
    }
}

async function savePaciente(e) {
    e.preventDefault();
    const data = {
        nome: document.getElementById('pac-nome').value,
        telefone: document.getElementById('pac-telefone').value,
        cpf: document.getElementById('pac-cpf').value,
        data_nascimento: document.getElementById('pac-nascimento').value,
        alergias: document.getElementById('pac-alergias').value,
        historico: document.getElementById('pac-historico').value
    };

    const editId = document.getElementById('form-paciente').dataset.editId;

    if (editId) {
        await fetch(`${API_URL}/pacientes/${editId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        delete document.getElementById('form-paciente').dataset.editId;
        const btn = document.querySelector('#form-paciente button[type="submit"]');
        btn.innerHTML = '<i class="fa-solid fa-save"></i> Salvar Paciente';
    } else {
        await fetch(`${API_URL}/pacientes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
    }

    e.target.reset();
    loadPacientes();
    alert('Paciente salvo com sucesso!');
}

function editPaciente(encodedPac) {
    const p = JSON.parse(decodeURIComponent(encodedPac));
    document.getElementById('pac-nome').value = p.nome || '';
    document.getElementById('pac-telefone').value = p.telefone || '';
    document.getElementById('pac-cpf').value = p.cpf || '';
    document.getElementById('pac-nascimento').value = p.data_nascimento || '';
    document.getElementById('pac-alergias').value = p.alergias || '';
    document.getElementById('pac-historico').value = p.historico || '';
    
    document.getElementById('form-paciente').dataset.editId = p.id;
    
    const btn = document.querySelector('#form-paciente button[type="submit"]');
    btn.innerHTML = '<i class="fa-solid fa-save"></i> Salvar Alterações';
}

async function deletePaciente(id) {
    if(confirm('Tem certeza que deseja excluir este paciente?')) {
        try {
            await fetch(`${API_URL}/pacientes/${id}`, { method: 'DELETE' });
            loadPacientes();
        } catch(e) { console.error(e); }
    }
}

// ---- PROCEDIMENTOS ----
async function loadProcedimentos() {
    try {
        const res = await fetch(`${API_URL}/procedimentos`, { cache: 'no-store' });
        const procedimentos = await res.json();
        
        const tbody = document.querySelector('#table-procedimentos tbody');
        const datalist = document.getElementById('procedimentos-list');
        tbody.innerHTML = '';
        datalist.innerHTML = '';

        procedimentos.forEach(p => {
            tbody.innerHTML += `
                <tr>
                    <td>${p.nome}</td>
                    <td>${p.descricao || '-'}</td>
                    <td>R$ ${p.preco.toFixed(2)}</td>
                    <td>
                        <button class="action-btn" onclick="editProcedimento(${p.id}, '${p.nome}', '${p.descricao || ''}', ${p.preco})" title="Editar"><i class="fa-solid fa-pen"></i></button>
                        <button class="action-btn" style="color: var(--accent-red)" onclick="deleteProcedimento(${p.id})" title="Excluir"><i class="fa-solid fa-trash"></i></button>
                    </td>
                </tr>
            `;
            datalist.innerHTML += `<option value="${p.nome}" data-preco="${p.preco}"></option>`;
        });

        // Atualizar também todos os <select class="cons-item-nome"> já existentes na tela (nova consulta / edição)
        document.querySelectorAll('select.cons-item-nome').forEach(select => {
            const val = select.value;
            select.innerHTML = buildProcedimentoSelect(val);
        });

    } catch (e) {
        console.error('Error loading procedures', e);
    }
}

async function saveProcedimento(e) {
    e.preventDefault();
    const data = {
        nome: document.getElementById('proc-nome').value,
        preco: parseFloat(document.getElementById('proc-preco').value),
        descricao: document.getElementById('proc-desc').value
    };

    const editId = document.getElementById('form-procedimento').dataset.editId;

    if (editId) {
        await fetch(`${API_URL}/procedimentos/${editId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        delete document.getElementById('form-procedimento').dataset.editId;
        const btn = document.querySelector('#form-procedimento button[type="submit"]');
        btn.innerHTML = '<i class="fa-solid fa-plus"></i> Adicionar Procedimento';
    } else {
        await fetch(`${API_URL}/procedimentos`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
    }

    e.target.reset();
    loadProcedimentos();
    alert('Procedimento salvo com sucesso!');
}

async function deleteProcedimento(id) {
    if(confirm('Tem certeza que deseja excluir este procedimento?')) {
        try {
            await fetch(`${API_URL}/procedimentos/${id}`, { method: 'DELETE' });
            loadProcedimentos();
        } catch(e) { console.error(e); }
    }
}

function editProcedimento(id, nome, desc, preco) {
    document.getElementById('proc-nome').value = nome;
    document.getElementById('proc-desc').value = desc;
    document.getElementById('proc-preco').value = preco;
    
    document.getElementById('form-procedimento').dataset.editId = id;
    
    const btn = document.querySelector('#form-procedimento button[type="submit"]');
    btn.innerHTML = '<i class="fa-solid fa-save"></i> Salvar Alterações';
}

// ---- CONSULTAS ----
function buildProcedimentoSelect(selectedNome, selectedPreco) {
    // Pega todos os procedimentos do datalist
    const list = document.getElementById('procedimentos-list');
    const opts = list ? Array.from(list.options) : [];
    let options = `<option value="">-- Selecione um procedimento --</option>`;
    opts.forEach(o => {
        const sel = (o.value === selectedNome) ? 'selected' : '';
        options += `<option value="${o.value}" data-preco="${o.dataset.preco}" ${sel}>${o.value} — R$ ${parseFloat(o.dataset.preco || 0).toFixed(2)}</option>`;
    });
    options += `<option value="__outro__" ${selectedNome === '__outro__' ? 'selected' : ''}>✏️ Outro (digitar)</option>`;
    return options;
}

function addProcedimentoRow(selectedNome, selectedPreco) {
    const container = document.getElementById('procedimentos-container');
    const row = document.createElement('div');
    row.className = 'form-row item-row';
    row.innerHTML = `
        <div class="form-group" style="flex: 0.6;">
            <select class="cons-item-nome" onchange="onProcedimentoSelect(this)" required>
                ${buildProcedimentoSelect(selectedNome, selectedPreco)}
            </select>
            <input type="text" class="cons-item-nome-custom" placeholder="Nome do procedimento" style="margin-top:6px; display:none;">
        </div>
        <div class="form-group" style="flex: 0.2;">
            <input type="number" step="0.01" class="cons-item-preco" value="${selectedPreco || ''}" required placeholder="0.00" oninput="calculateTotal()">
        </div>
        <div class="form-group" style="flex: 0.1; display: flex; align-items: flex-end;">
            <button type="button" class="btn btn-secondary" style="color: var(--accent-red); padding: 0.8rem;" onclick="this.closest('.item-row').remove(); calculateTotal();"><i class="fa-solid fa-trash"></i></button>
        </div>
    `;
    container.appendChild(row);
    if (selectedNome) calculateTotal();
}

function onProcedimentoSelect(selectEl) {
    const row = selectEl.closest('.item-row');
    const customInput = row.querySelector('.cons-item-nome-custom');
    const precoInput = row.querySelector('.cons-item-preco');
    const opt = selectEl.options[selectEl.selectedIndex];

    if (selectEl.value === '__outro__') {
        customInput.style.display = 'block';
        customInput.focus();
        precoInput.value = '';
    } else {
        customInput.style.display = 'none';
        precoInput.value = opt?.dataset?.preco ? parseFloat(opt.dataset.preco).toFixed(2) : '';
    }
    calculateTotal();
}

function calculateTotal() {
    const prices = document.querySelectorAll('.cons-item-preco');
    let total = 0;
    prices.forEach(p => {
        const val = parseFloat(p.value);
        if(!isNaN(val)) total += val;
    });
    document.getElementById('cons-total').value = total.toFixed(2);
}

function resetFormConsulta() {
    document.getElementById('form-consulta').reset();
    document.getElementById('cons-data').value = '';
    document.getElementById('nova-consulta-slots-wrapper').style.display = 'none';
    document.getElementById('nova-consulta-slots').innerHTML = '';
    
    // Resetar select de pacientes
    const pacSelect = document.getElementById('cons-paciente');
    if (pacSelect) pacSelect.innerHTML = buildPacienteSelect('');
    const pacCustom = document.getElementById('cons-paciente-custom');
    if (pacCustom) pacCustom.style.display = 'none';
    
    document.getElementById('procedimentos-container').innerHTML = `
        <div class="form-row item-row">
            <div class="form-group" style="flex: 0.6;">
                <label>Procedimento</label>
                <select class="cons-item-nome" onchange="onProcedimentoSelect(this)" required>
                    ${buildProcedimentoSelect()}
                </select>
                <input type="text" class="cons-item-nome-custom" placeholder="Nome do procedimento" style="margin-top:6px; display:none;">
            </div>
            <div class="form-group" style="flex: 0.2;">
                <label>Preço (R$)</label>
                <input type="number" step="0.01" class="cons-item-preco" required placeholder="0.00" oninput="calculateTotal()">
            </div>
            <div class="form-group" style="flex: 0.1; display: flex; align-items: flex-end;">
                <button type="button" class="btn btn-secondary" style="color: var(--accent-red); padding: 0.8rem;" disabled><i class="fa-solid fa-trash"></i></button>
            </div>
        </div>
    `;
}

// ---- SLOTS NOVA CONSULTA ----
async function loadSlotsNovaConsulta() {
    const data = document.getElementById('cons-data-dia').value;
    const wrapper = document.getElementById('nova-consulta-slots-wrapper');
    const container = document.getElementById('nova-consulta-slots');

    // Limpar seleção anterior
    document.getElementById('cons-data').value = '';

    if (!data) { wrapper.style.display = 'none'; return; }

    // Bloquear fins de semana
    const d = new Date(data + 'T12:00:00');
    if (d.getDay() === 0 || d.getDay() === 6) {
        wrapper.style.display = 'flex';
        container.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:15px; color:#e74c3c; background:#fdecea; border-radius:8px;">
            <i class="fa-solid fa-ban"></i> Final de semana — selecione uma data de segunda a sexta.</div>`;
        return;
    }

    wrapper.style.display = 'block';
    container.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:15px; color:var(--text-light);"><i class="fa-solid fa-spinner fa-spin"></i> Carregando horários...</div>`;

    try {
        const res = await fetch(`${API_URL}/slots?data=${data}`, { cache: 'no-store' });
        const { slots } = await res.json();

        if (!slots || slots.length === 0) {
            container.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:15px; color:var(--text-light);">Nenhum horário configurado. Acesse Configurações.</div>`;
            return;
        }

        container.innerHTML = slots.map(slot => {
            if (slot.ocupado) {
                return `<div style="padding:12px 8px; text-align:center; background:#fdecea; color:#c0392b; border-radius:8px; font-weight:600; font-size:0.9rem; opacity:0.7;">
                    <i class="fa-solid fa-lock" style="font-size:0.8rem;"></i><br>${slot.hora}<br><small>Ocupado</small></div>`;
            } else {
                return `<div onclick="selecionarSlotNova(this, '${data}', '${slot.hora}')" style="padding:12px 8px; text-align:center; background:#e8f5e9; color:#27ae60; border-radius:8px; font-weight:600; font-size:0.9rem; cursor:pointer; border:2px solid transparent; transition:all 0.2s;" class="slot-nova-btn">
                    <i class="fa-solid fa-clock" style="font-size:0.8rem;"></i><br>${slot.hora}<br><small>Livre</small></div>`;
            }
        }).join('');
    } catch (e) {
        container.innerHTML = `<div style="grid-column:1/-1; color:red; padding:15px;">Erro ao carregar horários.</div>`;
    }
}

function selecionarSlotNova(el, data, hora) {
    document.querySelectorAll('.slot-nova-btn').forEach(b => {
        b.style.borderColor = 'transparent';
        b.style.background = '#e8f5e9';
        b.style.color = '#27ae60';
    });
    el.style.borderColor = 'var(--primary)';
    el.style.background = 'var(--primary)';
    el.style.color = 'white';
    // Salvar datetime no campo hidden
    document.getElementById('cons-data').value = `${data}T${hora}:00`;
}

async function saveConsulta(e) {
    e.preventDefault();
    
    const pacSelect = document.getElementById('cons-paciente');
    const pacCustom = document.getElementById('cons-paciente-custom');
    let pacienteNome = '';
    
    if (pacSelect.value === '__novo__') {
        pacienteNome = pacCustom.value;
    } else {
        pacienteNome = pacSelect.value;
    }
    
    const pacienteTel = document.getElementById('cons-telefone').value;
    let pacienteId = document.getElementById('cons-paciente-id').value;

    if (!pacienteNome) {
        alert('Por favor, informe o nome do paciente.');
        return;
    }

    if (!pacienteId && pacSelect.value === '__novo__') {
        const wantsToSave = confirm(`O paciente "${pacienteNome}" não está cadastrado.\nDeseja salvá-lo agora para manter no histórico de Pacientes?`);
        if (wantsToSave) {
            const pData = {
                nome: pacienteNome,
                telefone: pacienteTel,
                cpf: document.getElementById('cons-cpf').value,
                data_nascimento: document.getElementById('cons-nascimento').value,
                alergias: document.getElementById('cons-alergias').value,
                historico: 'Cadastrado via Nova Consulta.'
            };
            const pRes = await fetch(`${API_URL}/pacientes`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(pData)
            });
            const pNew = await pRes.json();
            if (pNew.id) pacienteId = pNew.id;
            loadPacientes();
        }
    }

    const items = [];
    document.querySelectorAll('.item-row').forEach(row => {
        const sel = row.querySelector('.cons-item-nome');
        const customInput = row.querySelector('.cons-item-nome-custom');
        let nome = '';
        if (sel && sel.tagName === 'SELECT') {
            nome = sel.value === '__outro__' ? (customInput?.value || '') : sel.value;
        } else if (sel) {
            nome = sel.value;
        }
        const preco = parseFloat(row.querySelector('.cons-item-preco')?.value);
        if (nome) items.push({ nome, preco: isNaN(preco) ? 0 : preco });
    });

    const data = {
        paciente_id: pacienteId || null,
        paciente_nome: pacienteNome,
        telefone: pacienteTel,
        data_consulta: document.getElementById('cons-data').value,
        status: document.getElementById('cons-status').value,
        garantia: document.getElementById('cons-garantia').value,
        valor: parseFloat(document.getElementById('cons-total').value) || 0,
        obs: document.getElementById('cons-obs').value,
        itens: items
    };

    if (!data.data_consulta) {
        alert('Por favor, selecione uma data e um horário disponível!');
        return;
    }
    await fetch(`${API_URL}/consultas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });

    alert('Consulta/Orçamento salvo com sucesso!');
    resetFormConsulta();
}

async function loadConsultas() {
    const filtroData   = document.getElementById('agenda-filtro-data')?.value || '';
    const filtroStatus = document.getElementById('agenda-filtro-status')?.value || '';

    try {
        let url = `${API_URL}/consultas`;
        if (filtroData) url += `?data_inicio=${filtroData}&data_fim=${filtroData}`;

        const res = await fetch(url, { cache: 'no-store' });
        let consultas = await res.json();
        if (!Array.isArray(consultas)) return;

        // Filtrar por status no front-end
        if (filtroStatus) consultas = consultas.filter(c => c.status === filtroStatus);

        const semResultado = document.getElementById('agenda-sem-resultado');
        if (semResultado) semResultado.style.display = consultas.length === 0 ? 'block' : 'none';

        let html = '';

        consultas.forEach(c => {
            const dataFormatada = c.data_consulta ? new Date(c.data_consulta).toLocaleString('pt-BR') : '-';
            const encodedData = encodeURIComponent(JSON.stringify(c));
            
            const isTerminal = (c.status === 'Finalizado' || c.status === 'Cancelado' || c.status === 'Faltou');
            const statusDropdown = `
                <select onchange="updateStatus(${c.id}, this.value, '${c.paciente_nome.replace(/'/g,"\\'")}', this)" 
                    class="status-select ${c.status.replace(/\s+/g, '-').toLowerCase()}"
                    ${isTerminal ? 'disabled style="opacity:0.7; cursor:not-allowed;" data-travado="true"' : ''}>
                    <option value="Agendado" ${c.status==='Agendado'?'selected':''}>Agendado</option>
                    <option value="Em Andamento" ${c.status==='Em Andamento'?'selected':''}>Em Andamento</option>
                    <option value="Realizado" ${c.status==='Realizado'?'selected':''}>Realizado</option>
                    <option value="Finalizado" ${c.status==='Finalizado'?'selected':''}>Finalizado</option>
                    <option value="Cancelado" ${c.status==='Cancelado'?'selected':''}>Cancelado</option>
                    <option value="Faltou" ${c.status==='Faltou'?'selected':''}>Faltou</option>
                </select>
            `;
            
            const pacId = c.paciente_id || '';
            html += `
                <tr>
                    <td>#${c.id}</td>
                    <td>${dataFormatada}</td>
                    <td><a onclick="mostrarHistoricoPaciente('${pacId}', '${c.paciente_nome.replace(/'/g,"\\'")}')" style="color:var(--primary); font-weight:600; cursor:pointer; text-decoration:underline; text-decoration-color:transparent; transition:0.2s;" onmouseover="this.style.textDecorationColor='var(--primary)'" onmouseout="this.style.textDecorationColor='transparent'">${c.paciente_nome}</a></td>
                    <td>${statusDropdown}</td>
                    <td>R$ ${c.valor.toFixed(2)}</td>
                    <td>
                        <button class="action-btn" onclick="generatePDF('${encodedData}')" title="Gerar PDF"><i class="fa-solid fa-file-pdf"></i></button>
                        <button class="action-btn" style="color: #3498db" onclick="promptAtestado('${encodedData}')" title="Gerar Atestado"><i class="fa-solid fa-file-medical"></i></button>
                        <button class="action-btn" style="color: #9b59b6" onclick="promptAtestadoComparecimento('${encodedData}')" title="Atestado Comparecimento"><i class="fa-solid fa-business-time"></i></button>
                        <button class="action-btn" style="color: #25D366" onclick="sendWhatsapp('${encodedData}')" title="Enviar WhatsApp"><i class="fa-brands fa-whatsapp"></i></button>
                    </td>
                </tr>
            `;
        });
        document.querySelector('#table-todas-consultas tbody').innerHTML = html;
    } catch (e) {
        console.error('Error loading consultas', e);
    }
}

function limparFiltroAgenda() {
    const d = document.getElementById('agenda-filtro-data');
    const s = document.getElementById('agenda-filtro-status');
    if (d) d.value = '';
    if (s) s.value = '';
    loadConsultas();
}

async function updateStatus(id, newStatus, pacienteNome, selectEl) {
    // Bloquear se já era Finalizado, Cancelado ou Faltou
    if (selectEl && selectEl.dataset.travado === 'true') {
        alert('Este atendimento já foi encerrado e não pode ter seu status alterado.');
        return;
    }

    try {
        await fetch(`${API_URL}/consultas/${id}/status`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: newStatus })
        });

        // Se for status terminal: travar o campo
        if (newStatus === 'Finalizado' || newStatus === 'Cancelado' || newStatus === 'Faltou') {
            if (selectEl) {
                selectEl.disabled = true;
                selectEl.dataset.travado = 'true';
                selectEl.style.opacity = '0.7';
                selectEl.style.cursor = 'not-allowed';
            }
        }

        // Se finalizou: perguntar sobre retorno
        if (newStatus === 'Finalizado') {
            mostrarConfirmacaoRetorno(id, pacienteNome);
        }

        // Se cancelou ou faltou: oferecer antecipação ao próximo
        if (newStatus === 'Cancelado' || newStatus === 'Faltou') {
            verificarAntecipacao(id);
        }
    } catch (e) {
        console.error('Error updating status', e);
    }
}

// ---- ANTECIPAÇÃO DE ATENDIMENTO ----
async function verificarAntecipacao(consultaCanceladaId) {
    try {
        const res = await fetch(`${API_URL}/consultas`, { cache: 'no-store' });
        const todas = await res.json();
        if (!Array.isArray(todas)) return;

        // Achar a consulta cancelada/faltou
        const cancelada = todas.find(c => c.id == consultaCanceladaId);
        if (!cancelada || !cancelada.data_consulta) return;

        const dataLiberada = new Date(cancelada.data_consulta);
        const diaLiberado = dataLiberada.toISOString().split('T')[0];

        // Buscar próximos agendados no mesmo dia, depois do horário liberado
        const proximos = todas.filter(c =>
            c.status === 'Agendado' &&
            c.id != consultaCanceladaId &&
            c.data_consulta
        ).filter(c => {
            const d = new Date(c.data_consulta);
            const dia = d.toISOString().split('T')[0];
            return dia === diaLiberado && d > dataLiberada;
        }).sort((a, b) => new Date(a.data_consulta) - new Date(b.data_consulta));

        if (proximos.length === 0) return; // Nenhum próximo, não exibir modal

        mostrarModalAntecipacao(cancelada, proximos);
    } catch (e) {
        console.error('Erro ao verificar antecipação', e);
    }
}

function mostrarModalAntecipacao(consultaLiberada, proximosPacientes) {
    const old = document.getElementById('modal-antecipacao');
    if (old) old.remove();

    const horaLiberada = new Date(consultaLiberada.data_consulta)
        .toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const diaFormatado = new Date(consultaLiberada.data_consulta)
        .toLocaleDateString('pt-BR');

    // Montar a lista de pacientes
    let pacientesHtml = '';
    proximosPacientes.forEach((p, idx) => {
        const horaAtual = new Date(p.data_consulta)
            .toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
            
        const tel = (p.telefone || '').replace(/\D/g, '');
        const msgWpp = encodeURIComponent(
            `Olá ${p.paciente_nome}! 😊\n\nHouve uma desistência e temos um horário disponível hoje às *${horaLiberada}*.\n\nVocê teria interesse em adiantar seu atendimento (que está marcado para as ${horaAtual})?\n\nResponda SIM para confirmarmos! 🦷`
        );
        const wppUrl = `https://api.whatsapp.com/send?phone=55${tel}&text=${msgWpp}`;

        pacientesHtml += `
            <div style="background:#f8f9fa; border:1px solid #e9ecef; border-radius:10px; padding:15px; margin-bottom:12px;">
                <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                    <div>
                        <p style="margin:0; font-size:1.1rem; font-weight:700; color:#2c3e50;">
                            ${idx + 1}. <i class="fa-solid fa-user" style="color:var(--primary); font-size:0.9rem;"></i> ${p.paciente_nome}
                        </p>
                        <p style="margin:4px 0 0; color:#7f8c8d; font-size:0.9rem;">
                            <i class="fa-solid fa-clock"></i> Agendado para: <strong>${horaAtual}</strong>
                        </p>
                        <p style="margin:2px 0 0; color:#7f8c8d; font-size:0.9rem;">
                            <i class="fa-solid fa-phone"></i> ${p.telefone || '—'}
                        </p>
                    </div>
                </div>
                <div style="display:flex; gap:8px; margin-top:12px;">
                    <button onclick="abrirWppAntecipacao('${wppUrl}')"
                        style="flex:1; padding:10px; background:#25D366; color:white; border:none; border-radius:8px; font-weight:700; font-size:0.85rem; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:6px;">
                        <i class="fa-brands fa-whatsapp" style="font-size:1.1rem;"></i> Oferecer
                    </button>
                    <button onclick="confirmarAntecipacao(${p.id}, '${consultaLiberada.data_consulta}', '${p.paciente_nome}')"
                        style="flex:1; padding:10px; background:var(--primary); color:white; border:none; border-radius:8px; font-weight:700; font-size:0.85rem; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:6px;">
                        <i class="fa-solid fa-calendar-check"></i> Antecipar
                    </button>
                </div>
            </div>
        `;
    });

    const modal = document.createElement('div');
    modal.id = 'modal-antecipacao';
    modal.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.65); z-index:10003; display:flex; align-items:center; justify-content:center; padding:20px;';
    modal.innerHTML = `
        <div style="background:white; border-radius:16px; max-width:480px; width:100%; padding:28px; box-shadow:0 20px 60px rgba(0,0,0,0.3); animation:fadeInUp 0.25s ease; max-height: 90vh; display:flex; flex-direction:column;">
            
            <div style="display:flex; align-items:center; gap:12px; margin-bottom:16px; flex-shrink:0;">
                <div style="width:52px; height:52px; background:#fff3e0; border-radius:50%; display:flex; align-items:center; justify-content:center; flex-shrink:0;">
                    <i class="fa-solid fa-bolt" style="font-size:1.5rem; color:#f39c12;"></i>
                </div>
                <div>
                    <h2 style="margin:0; font-size:1.2rem; color:#2c3e50;">Horário Liberado!</h2>
                    <p style="margin:2px 0 0; color:#7f8c8d; font-size:0.88rem;">${diaFormatado} — ${horaLiberada} disponível</p>
                </div>
            </div>

            <p style="color:#5d6d7e; font-size:0.92rem; margin:0 0 16px; line-height:1.5; flex-shrink:0;">
                Abaixo estão os próximos pacientes agendados para hoje. Se um não aceitar, você pode oferecer ao próximo.
            </p>

            <!-- Lista com scroll -->
            <div style="overflow-y:auto; flex-grow:1; margin-bottom:18px; padding-right:5px; margin-right:-5px;">
                ${pacientesHtml}
            </div>

            <button onclick="document.getElementById('modal-antecipacao').remove()"
                style="padding:14px; background:#f1f3f5; color:#2c3e50; border:none; border-radius:10px; font-weight:700; font-size:0.95rem; cursor:pointer; width:100%; flex-shrink:0;">
                <i class="fa-solid fa-xmark"></i> Fechar
            </button>
        </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
}

function abrirWppAntecipacao(url) {
    window.open(url, '_blank');
}

async function confirmarAntecipacao(consultaId, novaDataHora, pacienteNome) {
    try {
        await fetch(`${API_URL}/consultas/${consultaId}/reagendar`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data_consulta: novaDataHora })
        });
        document.getElementById('modal-antecipacao')?.remove();
        const horaFormatada = new Date(novaDataHora).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        // Mostrar feedback inline sem usar alert()
        mostrarToast(`✅ ${pacienteNome} reagendado para ${horaFormatada}!`, 'success');
    } catch (e) {
        mostrarToast('Erro ao reagendar consulta.', 'error');
    }
}

function mostrarToast(msg, tipo) {
    const old = document.getElementById('toast-msg');
    if (old) old.remove();
    const toast = document.createElement('div');
    toast.id = 'toast-msg';
    const cor = tipo === 'success' ? '#2ecc71' : '#e74c3c';
    toast.style.cssText = `position:fixed;bottom:30px;left:50%;transform:translateX(-50%);background:${cor};color:white;padding:14px 28px;border-radius:30px;font-weight:700;font-size:0.95rem;z-index:10099;box-shadow:0 8px 20px rgba(0,0,0,0.2);animation:fadeInUp 0.3s ease;`;
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
}

// ---- NOTIFICAÇÕES (Toast) ----
function showToast(msg) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerText = msg;
    document.body.appendChild(toast);
    setTimeout(() => { toast.classList.add('show'); }, 100);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ---- HISTÓRICO DO PACIENTE ----
async function mostrarHistoricoPaciente(pacienteId, pacienteNome) {
    try {
        const res = await fetch(`${API_URL}/consultas`, { cache: 'no-store' });
        const todas = await res.json();
        
        let historico = todas.filter(c => {
            if (pacienteId && c.paciente_id) return c.paciente_id == pacienteId;
            return c.paciente_nome === pacienteNome;
        });

        historico.sort((a, b) => new Date(b.data_consulta || 0) - new Date(a.data_consulta || 0));

        let html = '';
        if (historico.length === 0) {
            html = `<p style="text-align:center; color:#7f8c8d; padding: 20px;">Nenhum histórico encontrado para este paciente.</p>`;
        } else {
            historico.forEach(c => {
                const data = c.data_consulta ? new Date(c.data_consulta).toLocaleString('pt-BR') : 'Data Indefinida';
                const statusColor = c.status === 'Finalizado' ? '#27ae60' : (c.status === 'Cancelado' || c.status === 'Faltou' ? '#e74c3c' : '#f39c12');
                
                let itensHtml = '';
                try {
                    const itens = JSON.parse(c.itens || '[]');
                    if (itens.length > 0) {
                        itensHtml = '<ul style="margin:8px 0 0; padding-left:20px; color:#555; font-size:0.9rem;">';
                        itens.forEach(it => {
                            itensHtml += `<li>${it.nome} <span style="color:#888;">(R$ ${parseFloat(it.preco || 0).toFixed(2)})</span></li>`;
                        });
                        itensHtml += '</ul>';
                    } else {
                        itensHtml = '<p style="margin:8px 0 0; color:#888; font-size:0.9rem; font-style:italic;">Nenhum procedimento registrado.</p>';
                    }
                } catch(e) {
                    itensHtml = '<p style="margin:8px 0 0; color:#888; font-size:0.9rem; font-style:italic;">Nenhum procedimento registrado.</p>';
                }

                html += `
                    <div style="background:#f8f9fa; border:1px solid #e9ecef; border-radius:10px; padding:15px; margin-bottom:12px;">
                        <div style="display:flex; justify-content:space-between; align-items:flex-start; border-bottom:1px solid #dee2e6; padding-bottom:8px; margin-bottom:8px;">
                            <div>
                                <h4 style="margin:0; color:#2c3e50; font-size:1.05rem;"><i class="fa-regular fa-calendar" style="color:var(--primary); margin-right:6px;"></i> ${data}</h4>
                            </div>
                            <div style="text-align:right;">
                                <span style="background:${statusColor}20; color:${statusColor}; padding:4px 8px; border-radius:12px; font-size:0.8rem; font-weight:700;">${c.status}</span>
                                <div style="margin-top:4px; font-weight:700; color:#2c3e50; font-size:0.95rem;">R$ ${c.valor.toFixed(2)}</div>
                            </div>
                        </div>
                        <div>
                            <strong style="font-size:0.9rem; color:#2c3e50;">Procedimentos Realizados:</strong>
                            ${itensHtml}
                        </div>
                        ${c.obs ? `<div style="margin-top:8px; font-size:0.85rem; color:#666; background:#fff; padding:8px; border-radius:6px; border-left:3px solid #ccc;"><strong>Obs:</strong> ${c.obs}</div>` : ''}
                    </div>
                `;
            });
        }

        const modal = document.createElement('div');
        modal.id = 'modal-historico-paciente';
        modal.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.65); z-index:10005; display:flex; align-items:center; justify-content:center; padding:20px;';
        modal.innerHTML = `
            <div style="background:white; border-radius:16px; max-width:550px; width:100%; padding:28px; box-shadow:0 20px 60px rgba(0,0,0,0.3); animation:fadeInUp 0.25s ease; max-height:90vh; display:flex; flex-direction:column;">
                
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; flex-shrink:0;">
                    <div>
                        <h2 style="margin:0; font-size:1.4rem; color:#2c3e50;"><i class="fa-solid fa-clock-rotate-left" style="color:var(--primary); margin-right:8px;"></i> Histórico do Paciente</h2>
                        <p style="margin:4px 0 0; color:#7f8c8d; font-size:1rem; font-weight:600;">${pacienteNome}</p>
                    </div>
                    <button onclick="document.getElementById('modal-historico-paciente').remove()" style="background:none; border:none; font-size:1.5rem; color:#aaa; cursor:pointer; padding:5px;"><i class="fa-solid fa-xmark"></i></button>
                </div>

                <div style="overflow-y:auto; flex-grow:1; padding-right:5px; margin-right:-5px;">
                    ${html}
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });

    } catch (e) {
        console.error('Erro ao buscar histórico', e);
        showToast('Erro ao carregar histórico do paciente.');
    }
}

// ---- CONFIRMAÇÃO DE RETORNO (modal nativo mobile-friendly) ----

function mostrarConfirmacaoRetorno(consultaId, pacienteNome) {
    // Remove modal anterior se existir
    const old = document.getElementById('modal-confirma-retorno');
    if (old) old.remove();

    const modal = document.createElement('div');
    modal.id = 'modal-confirma-retorno';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.65);z-index:10002;display:flex;align-items:center;justify-content:center;padding:20px;';
    modal.innerHTML = `
        <div style="background:white;border-radius:16px;max-width:380px;width:100%;padding:30px;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,0.3);animation:fadeInUp 0.25s ease;">
            <div style="width:64px;height:64px;background:#e8f5e9;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 16px;">
                <i class="fa-solid fa-check" style="font-size:2rem;color:#2ecc71;"></i>
            </div>
            <h2 style="margin:0 0 8px;color:#2c3e50;font-size:1.3rem;">Consulta Finalizada!</h2>
            <p style="color:#7f8c8d;margin:0 0 24px;line-height:1.5;">
                Paciente <strong>${pacienteNome || ''}</strong> atendido com sucesso.<br>
                Deseja agendar um retorno?
            </p>
            <div style="display:flex;gap:12px;">
                <button onclick="document.getElementById('modal-confirma-retorno').remove(); abrirModalRetorno(${consultaId}, '${(pacienteNome||'').replace(/'/g,"\\'")}')"
                    style="flex:1;padding:14px;background:var(--primary);color:white;border:none;border-radius:10px;font-weight:700;font-size:1rem;cursor:pointer;">
                    <i class="fa-solid fa-calendar-plus"></i> Sim, Agendar
                </button>
                <button onclick="document.getElementById('modal-confirma-retorno').remove()"
                    style="flex:1;padding:14px;background:#f1f3f5;color:#2c3e50;border:none;border-radius:10px;font-weight:700;font-size:1rem;cursor:pointer;">
                    <i class="fa-solid fa-xmark"></i> Não
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    // Fechar ao clicar fora
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
}

// ---- CONFIGURAÇÕES ----
async function loadConfig() {
    try {
        const res = await fetch(`${API_URL}/configuracoes`, { cache: 'no-store' });
        const cfg = await res.json();
        if(cfg.id) {
            document.getElementById('cfg-nome').value = cfg.nome_clinica || '';
            document.getElementById('cfg-telefone').value = cfg.telefone || '';
            document.getElementById('cfg-endereco').value = cfg.endereco || '';
            document.getElementById('cfg-resp').value = cfg.responsavel || '';
            document.getElementById('cfg-cro').value = cfg.cro || '';
            document.getElementById('cfg-horario-inicio').value = cfg.horario_inicio || '08:00';
            document.getElementById('cfg-horario-fim').value = cfg.horario_fim || '18:00';
            document.getElementById('cfg-intervalo').value = cfg.intervalo_minutos || '60';
            if (cfg.nome_clinica) {
                document.getElementById('dash-subtitle').innerText = `Resumo da clínica ${cfg.nome_clinica}`;
            }
        }
    } catch (e) {
        console.error('Error loading config', e);
    }
}

async function saveConfig(e) {
    e.preventDefault();
    const data = {
        nome_clinica: document.getElementById('cfg-nome').value,
        telefone: document.getElementById('cfg-telefone').value,
        endereco: document.getElementById('cfg-endereco').value,
        responsavel: document.getElementById('cfg-resp').value,
        cro: document.getElementById('cfg-cro').value,
        horario_inicio: document.getElementById('cfg-horario-inicio').value,
        horario_fim: document.getElementById('cfg-horario-fim').value,
        intervalo_minutos: parseInt(document.getElementById('cfg-intervalo').value),
        logo: ''
    };

    await fetch(`${API_URL}/configuracoes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });

    mostrarToast('✅ Configurações salvas com sucesso!', 'success');
}

// ---- SISTEMA DE ATUALIZAÇÃO AUTOMÁTICA ----
let _latestUpdateData = null;

async function checkSystemUpdates(manual = false) {
    try {
        if (manual) mostrarToast('🔍 Verificando se há atualizações...', 'info');
        const res = await fetch(`${API_URL}/check-update`, { cache: 'no-store' });
        const data = await res.json();
        
        if (data.currentVersion && document.getElementById('cfg-versao-atual')) {
            document.getElementById('cfg-versao-atual').innerText = `v${data.currentVersion}`;
        }

        if (data.hasUpdate) {
            _latestUpdateData = data;
            
            const banner = document.getElementById('update-banner');
            const versionSpan = document.getElementById('update-banner-version');
            if (banner && versionSpan) {
                versionSpan.innerText = `v${data.latestVersion}`;
                banner.style.display = 'flex';
            }

            if (manual) {
                abrirModalAtualizacao();
            }
        } else {
            if (manual) {
                mostrarToast('✅ Seu sistema já está na versão mais recente!', 'success');
            }
        }
    } catch (e) {
        if (manual) mostrarToast('Não foi possível verificar atualizações no momento.', 'error');
    }
}

function abrirModalAtualizacao() {
    if (!_latestUpdateData) return;
    document.getElementById('modal-update-version').innerText = _latestUpdateData.latestVersion;
    document.getElementById('modal-update-changelog').innerText = _latestUpdateData.changelog || 'Melhorias de desempenho e correções gerais.';
    
    // Resetar progresso
    document.getElementById('update-progress-container').style.display = 'none';
    document.getElementById('btn-start-update').style.display = 'inline-block';
    document.getElementById('btn-cancel-update').style.display = 'inline-block';
    
    document.getElementById('modal-update').style.display = 'flex';
}

async function applySystemUpdate() {
    if (!_latestUpdateData || !_latestUpdateData.files) {
        mostrarToast('Nenhum arquivo disponível para download automático.', 'error');
        return;
    }

    const progressContainer = document.getElementById('update-progress-container');
    const progressBar = document.getElementById('update-progress-bar');
    const statusText = document.getElementById('update-status-text');
    const btnStart = document.getElementById('btn-start-update');
    const btnCancel = document.getElementById('btn-cancel-update');

    btnStart.style.display = 'none';
    btnCancel.style.display = 'none';
    progressContainer.style.display = 'block';
    
    progressBar.style.width = '40%';
    statusText.innerText = 'Baixando e instalando atualização...';

    try {
        const res = await fetch(`${API_URL}/apply-update`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                files: _latestUpdateData.files,
                version: _latestUpdateData.latestVersion
            })
        });
        const result = await res.json();

        if (result.success) {
            progressBar.style.width = '100%';
            statusText.innerText = '✅ Atualização concluída com sucesso! Recarregando...';
            mostrarToast('✅ Sistema atualizado com sucesso!', 'success');
            
            setTimeout(() => {
                window.location.reload();
            }, 1800);
        } else {
            throw new Error(result.error || 'Erro na instalação.');
        }
    } catch (e) {
        progressContainer.style.display = 'none';
        btnStart.style.display = 'inline-block';
        btnCancel.style.display = 'inline-block';
        mostrarToast('Erro ao instalar atualização: ' + e.message, 'error');
    }
}

// ====================================================
//   AGENDAMENTO DE RETORNO
// ====================================================
function abrirModalRetorno(consultaId, pacienteNome) {
    document.getElementById('retorno-consulta-id').value = consultaId;
    document.getElementById('modal-retorno-paciente').textContent = `Paciente: ${pacienteNome || ''}`;
    document.getElementById('retorno-hora-selecionada').value = '';
    document.getElementById('retorno-slots-container').innerHTML = `<p style="color:var(--text-light); text-align:center; padding:20px;"><i class="fa-solid fa-calendar-day"></i> Selecione uma data para ver os horários</p>`;

    // Pre-selecionar próximo dia útil
    const today = new Date();
    let next = new Date(today);
    next.setDate(next.getDate() + 1);
    while (next.getDay() === 0 || next.getDay() === 6) next.setDate(next.getDate() + 1);
    document.getElementById('retorno-data').value = next.toISOString().split('T')[0];
    document.getElementById('retorno-data').min = new Date().toISOString().split('T')[0];

    const modal = document.getElementById('modal-retorno');
    modal.style.display = 'flex';
    loadSlotsRetorno();
}

async function loadSlotsRetorno() {
    const data = document.getElementById('retorno-data').value;
    if (!data) return;

    // Verificar se é dia útil
    const d = new Date(data + 'T12:00:00');
    if (d.getDay() === 0 || d.getDay() === 6) {
        document.getElementById('retorno-slots-container').innerHTML = `
            <div style="text-align:center; padding:20px; color:#e74c3c;">
                <i class="fa-solid fa-ban" style="font-size:2rem; margin-bottom:10px;"></i>
                <p>Finais de semana não são atendidos.<br>Por favor, selecione uma data de segunda a sexta.</p>
            </div>`;
        return;
    }

    document.getElementById('retorno-slots-container').innerHTML = `<p style="text-align:center; padding:20px; color:var(--text-light);"><i class="fa-solid fa-spinner fa-spin"></i> Carregando horários...</p>`;

    try {
        const res = await fetch(`${API_URL}/slots?data=${data}`, { cache: 'no-store' });
        const { slots } = await res.json();

        if (!slots || slots.length === 0) {
            document.getElementById('retorno-slots-container').innerHTML = `<p style="text-align:center; color:var(--text-light); padding:20px;">Nenhum horário configurado. Acesse Configurações.</p>`;
            return;
        }

        let html = `<label style="font-weight:600; display:block; margin-bottom:12px;">Horários disponíveis:</label>
            <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(90px, 1fr)); gap:10px;">`;

        slots.forEach(slot => {
            if (slot.ocupado) {
                html += `<div style="padding:12px 8px; text-align:center; background:#f8d7da; color:#c0392b; border-radius:8px; font-weight:600; font-size:0.9rem; opacity:0.7;">
                    <i class="fa-solid fa-lock" style="font-size:0.8rem;"></i><br>${slot.hora}<br><small>Ocupado</small></div>`;
            } else {
                html += `<div onclick="selecionarSlot(this, '${slot.hora}')" style="padding:12px 8px; text-align:center; background:#e8f5e9; color:#2ecc71; border-radius:8px; font-weight:600; font-size:0.9rem; cursor:pointer; border:2px solid transparent; transition:all 0.2s;" class="slot-btn">
                    <i class="fa-solid fa-clock" style="font-size:0.8rem;"></i><br>${slot.hora}<br><small>Livre</small></div>`;
            }
        });

        html += '</div>';
        document.getElementById('retorno-slots-container').innerHTML = html;
    } catch (e) {
        document.getElementById('retorno-slots-container').innerHTML = `<p style="color:red; padding:20px;">Erro ao carregar horários.</p>`;
    }
}

function selecionarSlot(el, hora) {
    document.querySelectorAll('.slot-btn').forEach(b => {
        b.style.borderColor = 'transparent';
        b.style.background = '#e8f5e9';
        b.style.color = '#2ecc71';
    });
    el.style.borderColor = 'var(--primary)';
    el.style.background = 'var(--primary)';
    el.style.color = 'white';
    document.getElementById('retorno-hora-selecionada').value = hora;
}

async function confirmarRetorno() {
    const data = document.getElementById('retorno-data').value;
    const hora = document.getElementById('retorno-hora-selecionada').value;
    const consultaOrigemId = document.getElementById('retorno-consulta-id').value;

    if (!data) { alert('Selecione uma data!'); return; }
    if (!hora) { alert('Selecione um horário!'); return; }

    // Buscar dados da consulta original para criar o retorno
    try {
        const resAll = await fetch(`${API_URL}/consultas`, { cache: 'no-store' });
        const todas = await resAll.json();
        const original = todas.find(c => c.id == consultaOrigemId);
        if (!original) { alert('Consulta não encontrada.'); return; }

        const dataHora = `${data}T${hora}:00`;
        const novaConsulta = {
            paciente_id: original.paciente_id,
            paciente_nome: original.paciente_nome,
            telefone: original.telefone,
            data_consulta: dataHora,
            status: 'Agendado',
            garantia: `Retorno da consulta #${consultaOrigemId}`,
            valor: 0,
            obs: `Retorno agendado após finalizamento da consulta #${consultaOrigemId}`,
            itens: []
        };

        await fetch(`${API_URL}/consultas`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(novaConsulta)
        });

        fecharModalRetorno();
        alert(`✅ Retorno agendado para ${data.split('-').reverse().join('/')} às ${hora}!`);
    } catch (err) {
        alert('Erro ao agendar retorno.');
    }
}

function fecharModalRetorno() {
    document.getElementById('modal-retorno').style.display = 'none';
}

// ---- PDF & WHATSAPP ----
function buildClinicHeaderHtml(config) {
    const nome = config.nome_clinica || 'Clínica Odontológica';
    const endereco = config.endereco ? `<p style="margin: 4px 0 0 0; color: #555;">${config.endereco}</p>` : '';
    const telefone = config.telefone ? `<p style="margin: 4px 0 0 0; color: #555;">Telefone: ${config.telefone}</p>` : '';
    return `
        <h1 style="color: #0ca789; margin: 0; font-size: 1.8rem;">${nome}</h1>
        ${endereco}
        ${telefone}
    `;
}

async function generatePDF(encodedConsulta) {
    const consulta = JSON.parse(decodeURIComponent(encodedConsulta));
    
    let config = {};
    try {
        const res = await fetch(`${API_URL}/configuracoes`, { cache: 'no-store' });
        config = await res.json();
    } catch(e) {}

    const itemsParsed = typeof consulta.itens === 'string' ? JSON.parse(consulta.itens) : consulta.itens;
    
    let itemsHtml = itemsParsed.map(i => `
        <tr>
            <td style="padding: 10px; border-bottom: 1px solid #ddd;">${i.nome}</td>
            <td style="padding: 10px; border-bottom: 1px solid #ddd; text-align: right;">R$ ${i.preco.toFixed(2)}</td>
        </tr>
    `).join('');

    const respText = config.responsavel ? ` | Resp: ${config.responsavel}` : '';
    const croText = config.cro ? ` CRO: ${config.cro}` : '';

    const html = `
        <div style="border-bottom: 2px solid #0ca789; padding-bottom: 20px; margin-bottom: 20px; text-align: center;">
            ${buildClinicHeaderHtml(config)}
            ${(respText || croText) ? `<p style="margin: 5px 0 0 0; color: #555;">${respText}${croText}</p>` : ''}
        </div>
        
        <h2>Recibo / Orçamento #${consulta.id}</h2>
        <p><strong>Paciente:</strong> ${consulta.paciente_nome}</p>
        <p><strong>Data da Consulta:</strong> ${consulta.data_consulta ? new Date(consulta.data_consulta).toLocaleString('pt-BR') : '-'}</p>
        <p><strong>Status:</strong> ${consulta.status}</p>
        
        <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
            <thead>
                <tr style="background: #f4f8f8;">
                    <th style="padding: 10px; text-align: left; border-bottom: 1px solid #ddd;">Procedimento</th>
                    <th style="padding: 10px; text-align: right; border-bottom: 1px solid #ddd;">Valor</th>
                </tr>
            </thead>
            <tbody>
                ${itemsHtml}
            </tbody>
        </table>
        
        <h3 style="text-align: right; margin-top: 20px; color: #0ca789;">Total: R$ ${consulta.valor.toFixed(2)}</h3>
        
        <div style="margin-top: 40px; padding: 20px; background: #f9f9f9; border-radius: 8px;">
            <p><strong>Observações:</strong> ${consulta.obs || 'Sem observações.'}</p>
            <p><strong>Garantia/Retorno:</strong> ${consulta.garantia || '-'}</p>
        </div>
    `;

    const printArea = document.getElementById('print-area');
    printArea.innerHTML = html;
    printArea.style.display = 'block';

    const opt = {
        margin:       10,
        filename:     `recibo_odonto_${consulta.id}.pdf`,
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2 },
        jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    html2pdf().set(opt).from(printArea).save().then(() => {
        printArea.style.display = 'none';
    });
}

async function promptAtestado(encodedConsulta) {
    const consulta = JSON.parse(decodeURIComponent(encodedConsulta));
    const dias = prompt('Quantos dias de repouso? (Ex: 2)');
    if (!dias) return;
    
    let cid = prompt('Qual o CID (opcional)? Deixe em branco se não quiser informar.');
    
    let cpf = '';
    try {
        const res = await fetch(`${API_URL}/pacientes`, { cache: 'no-store' });
        const pacientes = await res.json();
        const pac = pacientes.find(p => p.id == consulta.paciente_id || p.nome === consulta.paciente_nome);
        if (pac && pac.cpf) cpf = pac.cpf;
    } catch(e){}

    if (!cpf) {
        cpf = prompt('CPF/RG do paciente não encontrado. Digite o documento para constar no atestado:');
    }

    generateAtestadoPDF(consulta, dias, cid, cpf);
}

async function generateAtestadoPDF(consulta, dias, cid, cpf) {
    let config = {};
    try {
        const res = await fetch(`${API_URL}/configuracoes`, { cache: 'no-store' });
        config = await res.json();
    } catch(e) {}

    const dataAtual = new Date().toLocaleDateString('pt-BR');
    const cidText = cid ? ` por motivo de doença (CID 10: ${cid}),` : `,`;

    const html = `
        <div style="border: 2px solid #0ca789; padding: 40px; border-radius: 10px; text-align: center; max-width: 800px; margin: 0 auto; line-height: 1.6;">
            ${buildClinicHeaderHtml(config)}
            <hr style="margin: 30px 0; border: 1px solid #ddd;">
            
            <h2 style="text-align: center; margin-bottom: 40px; text-decoration: underline;">ATESTADO ODONTOLÓGICO</h2>
            
            <p style="text-align: justify; font-size: 1.2rem; line-height: 1.8;">
                Atesto para os devidos fins que o(a) Sr(a). <strong>${consulta.paciente_nome}</strong>, inscrito(a) no CPF/RG sob o nº <strong>${cpf || '______________'}</strong>, 
                foi submetido(a) a tratamento odontológico nesta clínica na data de <strong>${dataAtual}</strong>${cidText} necessitando de 
                <strong>${dias}</strong> dia(s) de repouso a partir desta data, para sua plena recuperação.
            </p>

            <div style="margin-top: 80px; text-align: center;">
                <p>_________________________________________________</p>
                <p style="margin: 5px 0;"><strong>${config.responsavel || 'Cirurgião-Dentista'}</strong></p>
                <p style="margin: 0;">CRO: ${config.cro || '______________'}</p>
            </div>
            
            <p style="text-align: right; margin-top: 60px; color: #777;">
                Local e Data: ________________________, ${dataAtual}
            </p>
        </div>
    `;

    const printArea = document.getElementById('print-area');
    printArea.innerHTML = html;
    printArea.style.display = 'block';

    const opt = {
        margin:       10,
        filename:     `atestado_${consulta.paciente_nome.replace(/\\s+/g, '_')}.pdf`,
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2 },
        jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    html2pdf().set(opt).from(printArea).save().then(() => {
        printArea.style.display = 'none';
    });
}

async function promptAtestadoComparecimento(encodedConsulta) {
    const consulta = JSON.parse(decodeURIComponent(encodedConsulta));
    const entrada = prompt('Data/Hora de entrada? (Ex: 14/10/2023 às 14:00)');
    if (!entrada) return;
    
    const saida = prompt('Data/Hora de saída? (Ex: 14/10/2023 às 15:30)');
    if (!saida) return;
    
    let cpf = '';
    try {
        const res = await fetch(`${API_URL}/pacientes`, { cache: 'no-store' });
        const pacientes = await res.json();
        const pac = pacientes.find(p => p.id == consulta.paciente_id || p.nome === consulta.paciente_nome);
        if (pac && pac.cpf) cpf = pac.cpf;
    } catch(e){}

    if (!cpf) {
        cpf = prompt('CPF/RG do paciente não encontrado. Digite o documento para constar no atestado:');
    }

    generateAtestadoComparecimentoPDF(consulta, entrada, saida, cpf);
}

async function generateAtestadoComparecimentoPDF(consulta, entrada, saida, cpf) {
    let config = {};
    try {
        const res = await fetch(`${API_URL}/configuracoes`, { cache: 'no-store' });
        config = await res.json();
    } catch(e) {}

    const dataAtual = new Date().toLocaleDateString('pt-BR');

    const html = `
        <div style="border: 2px solid #0ca789; padding: 40px; border-radius: 10px; text-align: center; max-width: 800px; margin: 0 auto; line-height: 1.6;">
            ${buildClinicHeaderHtml(config)}
            <hr style="margin: 30px 0; border: 1px solid #ddd;">
            
            <h2 style="text-align: center; margin-bottom: 40px; text-decoration: underline;">ATESTADO DE COMPARECIMENTO</h2>
            
            <p style="text-align: justify; font-size: 1.2rem; line-height: 1.8;">
                Atesto para os devidos fins que o(a) Sr(a). <strong>${consulta.paciente_nome}</strong>, inscrito(a) no CPF/RG sob o nº <strong>${cpf || '______________'}</strong>, 
                esteve presente nesta clínica para tratamento e/ou avaliação odontológica, com entrada em <strong>${entrada}</strong> e saída em <strong>${saida}</strong>.
            </p>

            <div style="margin-top: 80px; text-align: center;">
                <p>_________________________________________________</p>
                <p style="margin: 5px 0;"><strong>${config.responsavel || 'Cirurgião-Dentista'}</strong></p>
                <p style="margin: 0;">CRO: ${config.cro || '______________'}</p>
            </div>
            
            <p style="text-align: right; margin-top: 60px; color: #777;">
                Local e Data: ________________________, ${dataAtual}
            </p>
        </div>
    `;

    const printArea = document.getElementById('print-area');
    printArea.innerHTML = html;
    printArea.style.display = 'block';

    const opt = {
        margin:       10,
        filename:     `atestado_comparecimento_${consulta.paciente_nome.replace(/\\s+/g, '_')}.pdf`,
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2 },
        jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    html2pdf().set(opt).from(printArea).save().then(() => {
        printArea.style.display = 'none';
    });
}

function sendWhatsapp(encodedConsulta) {
    const consulta = JSON.parse(decodeURIComponent(encodedConsulta));
    
    if(!consulta.telefone) {
        alert("Paciente sem telefone cadastrado!");
        return;
    }

    const itemsParsed = typeof consulta.itens === 'string' ? JSON.parse(consulta.itens) : consulta.itens;
    let procList = itemsParsed.map(i => `- ${i.nome}: R$ ${i.preco.toFixed(2)}`).join('%0A');
    
    let msg = `Olá ${consulta.paciente_nome}!%0ASegue o resumo do seu atendimento odontológico:%0A%0A`;
    msg += `*Status:* ${consulta.status}%0A`;
    if(consulta.data_consulta) msg += `*Data:* ${new Date(consulta.data_consulta).toLocaleString('pt-BR')}%0A`;
    msg += `%0A*Procedimentos:*%0A${procList}%0A%0A*Valor Total: R$ ${consulta.valor.toFixed(2)}*%0A%0A`;
    if(consulta.garantia) msg += `*Retorno/Garantia:* ${consulta.garantia}%0A`;
    msg += `%0AAgradecemos a preferência!`;

    let phone = consulta.telefone.replace(/\D/g, ''); // Remover não-números
    if(phone.length === 11 || phone.length === 10) {
        if(!phone.startsWith('55')) phone = '55' + phone;
    }

    const url = `https://api.whatsapp.com/send?phone=${phone}&text=${msg}`;
    window.open(url, '_blank');
}

// ---- MOBILE ACCESS ----
function showMobileBanner() {
    if (document.getElementById('mobile-banner')) return;
    const banner = document.createElement('div');
    banner.id = 'mobile-banner';
    banner.style.position = 'fixed';
    banner.style.bottom = '0';
    banner.style.left = '0';
    banner.style.width = '100%';
    banner.style.backgroundColor = 'var(--primary)';
    banner.style.color = 'var(--white)';
    banner.style.padding = '15px';
    banner.style.textAlign = 'center';
    banner.style.zIndex = '9999';
    banner.style.boxShadow = '0 -4px 10px rgba(0,0,0,0.1)';
    banner.innerHTML = `
        <div style="font-weight: 600; margin-bottom: 8px; font-size: 1.1rem;"><i class="fa-solid fa-mobile-screen"></i> Baixe o App Web!</div>
        <div style="font-size: 0.9rem; margin-bottom: 12px;">Para uma experiência completa como aplicativo, clique nas opções do seu navegador (três pontinhos) e selecione <strong>"Adicionar à tela inicial"</strong>.</div>
        <button onclick="document.getElementById('mobile-banner').remove()" style="background: rgba(255,255,255,0.2); border: none; padding: 8px 20px; color: white; border-radius: 6px; cursor: pointer; font-weight: bold;">Entendi</button>
    `;
    document.body.appendChild(banner);
}

async function showMobileAccess() {
    try {
        const res = await fetch('/api/ip?t=' + Date.now(), { cache: 'no-store' });
        if (!res.ok) {
            alert("Atenção: A funcionalidade de IP precisa que você reinicie o sistema (Feche esta janela, aguarde 10 segundos e abra novamente no ícone).");
            return;
        }
        const data = await res.json();
        const url = `http://${data.ip}:3030`;
        
        const modal = document.createElement('div');
        modal.id = 'modal-qr';
        modal.style.position = 'fixed';
        modal.style.inset = '0';
        modal.style.backgroundColor = 'rgba(0,0,0,0.65)';
        modal.style.display = 'flex';
        modal.style.alignItems = 'center';
        modal.style.justifyContent = 'center';
        modal.style.zIndex = '10010';
        modal.innerHTML = `
            <div style="background: white; padding: 30px; border-radius: 16px; max-width: 400px; text-align: center; box-shadow: 0 20px 60px rgba(0,0,0,0.3); margin: 20px; animation: fadeInUp 0.25s ease;">
                <h2 style="margin-bottom: 10px; color: #2c3e50;"><i class="fa-solid fa-mobile-screen-button"></i> Acesso Mobile</h2>
                <p style="color:#7f8c8d; font-size:0.95rem; margin-bottom:20px;">
                    Certifique-se de que o celular está no mesmo Wi-Fi que este computador e escaneie o código abaixo com a câmera:
                </p>
                
                <div id="qrcode-container" style="display:inline-block; padding:15px; background:white; border:2px solid #ecf0f1; border-radius:10px; margin-bottom:20px;"></div>
                
                <p style="color:#95a5a6; font-size:0.85rem; margin-bottom:20px;">Ou digite no navegador:<br><strong style="color:var(--primary); font-size: 1.1rem;">${url}</strong></p>

                <button onclick="document.getElementById('modal-qr').remove()" style="padding:12px; width:100%; background:#f1f3f5; color:#2c3e50; border:none; border-radius:10px; font-weight:700; font-size:1rem; cursor:pointer;">
                    <i class="fa-solid fa-xmark"></i> Fechar
                </button>
            </div>
        `;
        document.body.appendChild(modal);

        // Gera o QR Code dentro da div
        new QRCode(document.getElementById("qrcode-container"), {
            text: url,
            width: 200,
            height: 200,
            colorDark : "#2c3e50",
            colorLight : "#ffffff",
            correctLevel : QRCode.CorrectLevel.H
        });
    } catch (e) {
        alert("Erro detalhado: " + e.message);
        console.error(e);
    }
}

