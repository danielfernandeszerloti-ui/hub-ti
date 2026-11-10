// Hub de TI — Grupo Zerbini
// Painel único com o que precisa de atenção no Helpdesk, na Gestão de Ativos e nas Solicitações de Compra.
// Os números vêm da função hub_resumo() do banco, que respeita as regras de acesso de quem está logado.
"use strict";
const VERSAO = "1.0.0";
const CFG = window.HUB_CONFIG;
const URL_ = CFG.sistemas;
const sb = supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey, { auth: { persistSession: true, autoRefreshToken: true, storageKey: "hub-ti-auth" } });

const S = { user: null, d: null, erro: "", semAcesso: false, carregando: false, filtro: "tudo", ultima: null };
const L = { etapa: "email", email: lsGet("hub_email") || "", senha: false, msg: "" };

// ---------- utilidades ----------
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const ICON = n => `<svg class="i"><use href="#i-${n}"/></svg>`;
const num = v => Number(v || 0);
const brl = v => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const cod = id => "#" + String(id).padStart(4, "0");
function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { } }
const hojeISO = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const diasAte = d => Math.round((new Date(String(d).slice(0, 10) + "T12:00:00") - new Date(hojeISO() + "T12:00:00")) / 864e5);
const fDia = d => d ? String(d).slice(0, 10).split("-").reverse().slice(0, 2).join("/") : "";
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
function tempo(ms) {   // duração legível: "3 h", "2 d"
  const m = Math.abs(ms) / 6e4; if (m < 60) return Math.max(1, Math.round(m)) + " min";
  const h = m / 60; if (h < 24) return Math.round(h) + " h"; return Math.round(h / 24) + " d";
}
function rel(iso) { return iso ? tempo(Date.now() - new Date(iso).getTime()) : ""; }
const link = {
  chamado: id => `${URL_.helpdesk}/chamado/${encodeURIComponent(id)}`,
  hd: p => `${URL_.helpdesk}/${p || ""}`,
  ativo: disp => `${URL_.ativos}/#${encodeURIComponent(disp)}`,
  onb: n => `${URL_.ativos}/#onb-${encodeURIComponent(n)}`,
  aprov: () => `${URL_.ativos}/#aprovacoes`,
  ga: () => `${URL_.ativos}/`,
  sol: id => `${URL_.compras}/#s/${encodeURIComponent(id)}`,
  fc: v => `${URL_.compras}/${v ? "#v/" + v : ""}`,
};
const TIPO = { notebook: "Notebook", desktop: "Desktop", celular: "Celular", tablet: "Tablet", impressora: "Impressora", coletor: "Coletor", monitor: "Monitor", periferico: "Periférico", switch: "Switch", servidor: "Servidor", roteador: "Roteador", firewall: "Firewall", access_point: "Access point", nobreak: "Nobreak" };
const CAMPO = { garantia_ate: "Garantia", licenca_ate: "Licença", troca_bateria: "Troca de bateria" };
const HD_ST = { novo: "Novo", aberto: "Em atendimento", em_espera: "Aguardando colaborador", pausado: "Pausado" };
const FC_ST = { aguardando_aprovacao: "Aguardando aprovação", aprovada: "Aprovada", comprada: "Comprada", comprovante_enviado: "Comprovante a conferir" };
const OC_ST = { solicitada: "Aguardando aprovação", enviada: "Aguardando aprovação", aprovada: "Aprovada", comprada: "Comprada" };
const ONB_ST = { solicitado: "Solicitado", em_analise: "Em análise", aguardando_equipamentos: "Aguardando equipamentos", em_preparacao: "Em preparação", pronto: "Pronto para entrega" };

// tema: segue o sistema, com escolha guardada
(function () { const t = lsGet("hub_tema") || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"); document.documentElement.dataset.theme = t; })();

// ---------- login (mesmo acesso do Helpdesk) ----------
function gateHTML() {
  const cab = `<div style="display:flex;gap:12px;align-items:center"><div class="logo"><img src="img/logo-128.png" alt=""></div><div><b style="color:var(--heading);font-size:18px">Hub de TI</b><br><small class="muted">Grupo Zerbini</small></div></div>`;
  if (L.etapa === "codigo") return `<div class="gate"><form class="card" id="fCodigo">${cab}
    <h2>Digite o código</h2><p>Enviamos um código para <b>${esc(L.email)}</b>. Ele vale por alguns minutos.</p>
    <input id="lCodigo" class="code" inputmode="numeric" autocomplete="one-time-code" maxlength="10" required aria-label="Código recebido por e-mail">
    ${L.msg ? `<div class="err">${esc(L.msg)}</div>` : ""}
    <button class="btn">Entrar</button>
    <button type="button" class="linkbtn" data-act="lvoltar">Usar outro e-mail ou reenviar o código</button></form></div>`;
  return `<div class="gate"><form class="card" id="fEmail">${cab}
    <h2>Entrar</h2><p>Use seu e-mail corporativo. É o mesmo acesso do Helpdesk.</p>
    <input id="lEmail" type="email" autocomplete="email" placeholder="nome@grupozerbini.com.br" required value="${esc(L.email)}" aria-label="E-mail">
    ${L.senha ? `<input id="lSenha" type="password" autocomplete="current-password" placeholder="Senha" required aria-label="Senha">` : ""}
    ${L.msg ? `<div class="err">${esc(L.msg)}</div>` : ""}
    <button class="btn">${L.senha ? "Entrar com senha" : "Receber código por e-mail"}</button>
    <button type="button" class="linkbtn" data-act="lsenha">${L.senha ? "Entrar com código por e-mail" : "Tenho senha cadastrada"}</button></form></div>`;
}
async function loginEmail(f) {
  const email = $("lEmail").value.trim().toLowerCase(), btn = f.querySelector(".btn"); L.email = email; lsSet("hub_email", email); L.msg = "";
  if (!/@grupozerbini\.com\.br$/i.test(email)) { L.msg = "Use seu e-mail @grupozerbini.com.br."; render(); return; }
  btn.disabled = true;
  if (L.senha) {
    const { error } = await sb.auth.signInWithPassword({ email, password: $("lSenha").value });
    if (error) { L.msg = /Invalid login/i.test(error.message) ? "E-mail ou senha incorretos." : error.message; btn.disabled = false; render(); }
    return;
  }
  const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
  if (error) { L.msg = /rate|seconds/i.test(error.message) ? "Aguarde um minuto antes de pedir outro código." : /signups not allowed|not found/i.test(error.message) ? "Este e-mail ainda não tem acesso." : error.message; btn.disabled = false; render(); return; }
  L.etapa = "codigo"; render(); setTimeout(() => $("lCodigo") && $("lCodigo").focus(), 50);
}
async function loginCodigo(f) {
  const token = $("lCodigo").value.replace(/\D/g, ""), btn = f.querySelector(".btn"); btn.disabled = true; L.msg = "";
  const { error } = await sb.auth.verifyOtp({ email: L.email, token, type: "email" });
  if (error) { L.msg = "Código inválido ou vencido."; btn.disabled = false; render(); }
}

// ---------- dados ----------
async function carregar(silencioso) {
  if (S.carregando) return; S.carregando = true;
  const b = $("bRef"); if (b) b.classList.add("spin");
  try {
    const { data, error } = await sb.rpc("hub_resumo");
    if (error) { if (/Sem acesso/i.test(error.message)) { S.semAcesso = true; S.d = null; } else throw error; }
    else { S.d = data; S.semAcesso = false; S.erro = ""; S.ultima = Date.now(); }
  } catch (e) { console.error(e); S.erro = "Não foi possível atualizar agora. Tentando de novo em instantes."; if (!silencioso) setTimeout(() => carregar(true), 15000); }
  S.carregando = false; render();
}
let canal = null, rtTimer = null, relogio = null;
function ouvir() {
  if (canal) return;
  canal = sb.channel("hub");
  ["hd_chamados", "hd_tarefas", "onboarding_compras", "onboardings", "fc_solicitacoes", "ativos"].forEach(t =>
    canal.on("postgres_changes", { event: "*", schema: "public", table: t }, () => { clearTimeout(rtTimer); rtTimer = setTimeout(() => carregar(true), 1500); }));
  canal.subscribe();
  clearInterval(relogio);
  relogio = setInterval(() => { if (document.visibilityState === "visible") carregar(true); }, 120000);
}
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && S.user && S.ultima && Date.now() - S.ultima > 60000) carregar(true); });
setInterval(() => { const u = $("upd"); if (u && S.ultima) u.textContent = "Atualizado há " + rel(new Date(S.ultima).toISOString()); }, 30000);

// ---------- o que precisa de atenção ----------
function atencao(d) {
  const it = []; const agora = Date.now();
  // peso: 0 = vencido/urgente, 1 = hoje, 2 = pendente, 3 = acompanhar
  (d.helpdesk.lista || []).forEach(c => {
    const pausa = c.status === "em_espera" || c.status === "pausado";
    const venc = c.prazo_sla && !pausa && c.aprovacao !== "pendente" ? new Date(c.prazo_sla).getTime() - agora : null;
    let w, cls, peso;
    if (venc != null && venc < 0) { w = "SLA vencido há " + tempo(venc); cls = "bad"; peso = 0; }
    else if (!c.lido_agente) { w = "Não lido"; cls = "warn"; peso = 1; }
    else if (venc != null && venc < 8 * 3600e3) { w = "Vence em " + tempo(venc); cls = "warn"; peso = 1; }
    else if (c.aprovacao === "pendente") { w = "Aguarda aprovação"; cls = "soft"; peso = 3; }
    else if (pausa) { w = HD_ST[c.status]; cls = "soft"; peso = 3; }
    else { w = venc != null ? "Vence em " + tempo(venc) : "Aberto há " + rel(c.criado_em); cls = "soft"; peso = 2; }
    it.push({ s: "helpdesk", t: `${cod(c.id)} · ${c.titulo}`, m: [c.solicitante, c.setor, HD_ST[c.status]].filter(Boolean).join(" · "), w, cls, peso, href: link.chamado(c.id) });
  });
  (d.tarefas.lista || []).filter(t => t.prazo && diasAte(t.prazo) < 0).forEach(t => {
    it.push({ s: "helpdesk", t: "Tarefa: " + t.texto, m: t.chamado_id ? "Chamado " + cod(t.chamado_id) : "Tarefa avulsa", w: "Atrasada " + plural(-diasAte(t.prazo), "dia", "dias"), cls: "bad", peso: 0, href: t.chamado_id ? link.chamado(t.chamado_id) : link.hd("hoje") });
  });
  (d.ativos.compras_lista || []).forEach(c => {
    const aprovar = c.status === "solicitada" || c.status === "enviada";
    it.push({ s: "ativos", t: `Compra: ${c.quantidade}× ${c.item}`, m: [OC_ST[c.status], { onboarding: "Onboarding", reposicao: "Reposição de estoque", infra: "Infraestrutura", chamado: "Chamado", avulsa: "Compra avulsa" }[c.origem], c.valor_unit ? brl(c.valor_unit * c.quantidade) : ""].filter(Boolean).join(" · "), w: aprovar ? "Há " + rel(c.criado_em) : OC_ST[c.status], cls: aprovar ? "warn" : "soft", peso: aprovar ? 2 : 3, href: link.aprov() });
  });
  (d.ativos.vencimentos || []).forEach(v => {
    const n = diasAte(v.data);
    it.push({ s: "ativos", t: `${CAMPO[v.campo] || v.campo} · ${v.dispositivo}`, m: (TIPO[v.tipo] || v.tipo) + " · " + (n < 0 ? "venceu em " : "vence em ") + fDia(v.data), w: n < 0 ? "Vencida há " + plural(-n, "dia", "dias") : n === 0 ? "Vence hoje" : "Em " + plural(n, "dia", "dias"), cls: n <= 0 ? "bad" : n <= 15 ? "warn" : "soft", peso: n <= 0 ? 0 : n <= 15 ? 2 : 3, href: link.ativo(v.dispositivo) });
  });
  (d.ativos.estoque_baixo || []).forEach(e => {
    it.push({ s: "ativos", t: `Estoque baixo: ${e.subtipo || TIPO[e.tipo_ativo] || e.tipo_ativo}`, m: `${e.disponiveis} disponível(is), mínimo ${e.minimo}`, w: e.disponiveis === 0 ? "Zerado" : "Abaixo do mínimo", cls: e.disponiveis === 0 ? "bad" : "warn", peso: e.disponiveis === 0 ? 1 : 2, href: link.ga() });
  });
  (d.ativos.onb_lista || []).forEach(o => {
    const n = o.data_admissao ? diasAte(o.data_admissao) : null;
    it.push({ s: "ativos", t: `Onboarding #${o.numero} · ${o.nome}`, m: [o.departamento, ONB_ST[o.status] || o.status].filter(Boolean).join(" · "), w: n == null ? "Sem data" : n < 0 ? "Admissão passou" : n === 0 ? "Admissão hoje" : "Admissão em " + plural(n, "dia", "dias"), cls: n != null && n <= 2 ? "bad" : n != null && n <= 7 ? "warn" : "soft", peso: n != null && n <= 2 ? 1 : 2, href: link.onb(o.numero) });
  });
  (d.compras.lista || []).forEach(s => {
    const prazo = s.necessario_ate ? diasAte(s.necessario_ate) : null;
    const peso = s.urgente ? 1 : s.status === "aguardando_aprovacao" || s.status === "comprovante_enviado" ? 2 : 3;
    it.push({ s: "compras", t: `${cod(s.id)} · ${s.titulo}`, m: [s.solicitante, FC_ST[s.status], s.valor_estimado ? brl(s.valor_estimado) : ""].filter(Boolean).join(" · "), w: s.urgente ? "Urgente" : prazo != null ? (prazo < 0 ? "Prazo passou" : "Até " + fDia(s.necessario_ate)) : "Há " + rel(s.criado_em), cls: s.urgente || (prazo != null && prazo < 0) ? "bad" : peso === 2 ? "warn" : "soft", peso, href: link.sol(s.id) });
  });
  return it.sort((a, b) => a.peso - b.peso);
}

// ---------- tela ----------
function saudacao() { const h = new Date().getHours(); return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite"; }
function primeiroNome(d) { const n = (d.nome || "").trim().split(/\s+/)[0]; return n || d.eu.split("@")[0].split(".")[0].replace(/^./, c => c.toUpperCase()); }
function resumoFrase(d) {
  const p = [];
  if (num(d.helpdesk.sla_vencido)) p.push(`<b>${plural(num(d.helpdesk.sla_vencido), "chamado", "chamados")}</b> com SLA vencido`);
  if (num(d.helpdesk.nao_lidos)) p.push(`<b>${plural(num(d.helpdesk.nao_lidos), "chamado não lido", "chamados não lidos")}</b>`);
  if (num(d.tarefas.atrasadas)) p.push(`<b>${plural(num(d.tarefas.atrasadas), "tarefa atrasada", "tarefas atrasadas")}</b>`);
  const aprov = num(d.ativos.compras_aprovar) + num(d.compras.aprovar);
  if (aprov) p.push(`<b>${plural(aprov, "compra", "compras")}</b> aguardando aprovação`);
  if (num(d.compras.conferir)) p.push(`<b>${plural(num(d.compras.conferir), "comprovante", "comprovantes")}</b> para conferir`);
  if (!p.length) return "Nada urgente agora. Tudo em dia nos três sistemas.";
  const ult = p.pop(); return (p.length ? p.join(", ") + " e " + ult : ult) + ".";
}
function met(label, n, href, nivel) {
  const v = num(n); const cls = v === 0 ? "zero" : nivel || "";
  return `<li><a href="${esc(href)}" target="_blank" rel="noopener"><span class="lbl">${esc(label)}</span><span class="n ${cls}">${v}</span>${ICON("chev").replace('class="i"', 'class="i chev"')}</a></li>`;
}
function cardSistema(s, nome, dominio, icone, big, bigLbl, mets, extra, foot) {
  return `<section class="card sc" data-s="${s}" aria-label="${esc(nome)}"><div class="stripe"></div>
    <div class="sch"><div class="sico">${ICON(icone)}</div><div><b>${esc(nome)}</b><small>${esc(dominio)}</small></div>
      <a class="open" href="${esc(URL_[s])}" target="_blank" rel="noopener">Abrir ${ICON("ext")}</a></div>
    <div class="big"><strong>${num(big)}</strong><span>${esc(bigLbl)}</span></div>
    ${extra || ""}
    <ul class="mets">${mets.join("")}</ul>
    ${foot ? `<div class="foot">${foot}</div>` : ""}</section>`;
}
function cardsHTML(d) {
  const h = d.helpdesk, a = d.ativos, c = d.compras;
  const ps = a.por_status || {}, tot = Object.values(ps).reduce((x, y) => x + num(y), 0) || 1;
  const cores = { "Em uso": "var(--azul)", "Disponível": "var(--turq)", "Reservado": "#8b5cf6", "Manutenção": "var(--warn)", "Descartado": "var(--faint)" };
  const ordem = ["Em uso", "Disponível", "Reservado", "Manutenção", "Descartado"].filter(k => num(ps[k]));
  const split = `<div class="split" role="img" aria-label="${esc(ordem.map(k => `${k}: ${ps[k]}`).join(", "))}">${ordem.map(k => `<i style="width:${(num(ps[k]) / tot * 100).toFixed(2)}%;background:${cores[k]}"></i>`).join("")}</div>
    <div class="legend">${ordem.map(k => `<span><em style="background:${cores[k]}"></em>${esc(k)} ${num(ps[k])}</span>`).join("")}</div>`;
  const vencem = (a.vencimentos || []).length;
  const abertoFc = num(c.aprovar) + num(c.para_comprar) + num(c.aguardando_comprovante) + num(c.conferir);
  return `<div class="sys">
    ${cardSistema("helpdesk", "Helpdesk", "chamados.grupozerbini.com.br", "help", h.abertos, "chamados em aberto", [
      met("SLA vencido", h.sla_vencido, link.hd("painel"), "bad"),
      met("Novos ou não lidos", Math.max(num(h.novos), num(h.nao_lidos)), link.hd("painel"), "warn"),
      met("Vencem hoje", h.sla_hoje, link.hd("painel"), "warn"),
      met("Aguardando colaborador", h.aguardando, link.hd("painel")),
      met("Aguardando aprovação da gerência", h.aprovacao, link.hd("painel")),
      met("Minhas tarefas atrasadas", d.tarefas.atrasadas, link.hd("hoje"), "bad"),
    ], "", `Últimos 7 dias: <b>${num(h.abertos_7d)}</b> abertos · <b>${num(h.resolvidos_7d)}</b> resolvidos`)}
    ${cardSistema("ativos", "Gestão de Ativos", "ativos.grupozerbini.com.br", "box", a.total, "ativos no inventário", [
      met("Compras para aprovar", a.compras_aprovar, link.aprov(), "warn"),
      met("Compras em andamento", a.compras_andamento, link.aprov()),
      met("Onboardings em aberto", a.onboardings, link.ga(), "warn"),
      met("Garantias e licenças a vencer", vencem, link.ga(), "warn"),
      met("Itens abaixo do estoque mínimo", (a.estoque_baixo || []).length, link.ga(), "bad"),
    ], split, "")}
    ${cardSistema("compras", "Solicitações de Compra", "compras.grupozerbini.com.br", "cart", abertoFc, "solicitações em andamento", [
      met("Aguardando aprovação", c.aprovar, link.fc("aprovacoes"), "warn"),
      met("Para comprar", c.para_comprar, link.fc("andamento"), "warn"),
      met("Aguardando comprovante", c.aguardando_comprovante, link.fc("todas")),
      met("Comprovantes para conferir", c.conferir, link.fc("conferencia"), "warn"),
      met("Assinaturas ativas", c.assinaturas, link.fc("assinaturas"), "ok"),
    ], "", num(c.valor_aberto) ? `Valor estimado em aberto: <b>${esc(brl(c.valor_aberto))}</b>` : "Nenhum valor em aberto")}
  </div>`;
}
function atencaoHTML(d) {
  const todos = atencao(d);
  const cont = { tudo: todos.length, helpdesk: 0, ativos: 0, compras: 0 }; todos.forEach(i => cont[i.s]++);
  const lista = S.filtro === "tudo" ? todos : todos.filter(i => i.s === S.filtro);
  const chip = (k, l) => `<button class="chip ${S.filtro === k ? "on" : ""}" data-act="filtro" data-v="${k}" aria-pressed="${S.filtro === k}">${l} ${cont[k]}</button>`;
  return `<section class="card panel" aria-label="Precisa de você">
    <div class="ph"><h2>Precisa de você</h2><span class="cnt">mais urgente primeiro</span></div>
    <div class="filt">${chip("tudo", "Tudo")}${chip("helpdesk", "Helpdesk")}${chip("ativos", "Ativos")}${chip("compras", "Compras")}</div>
    ${lista.length ? `<ul class="att">${lista.slice(0, 14).map(i => `<li><a href="${esc(i.href)}" target="_blank" rel="noopener">
      <span class="tag ${i.s}">${{ helpdesk: "Helpdesk", ativos: "Ativos", compras: "Compras" }[i.s]}</span>
      <span class="t" title="${esc(i.t)}">${esc(i.t)}</span>
      <span class="w ${i.cls}">${esc(i.w)}</span>
      <span class="m">${esc(i.m)}</span></a></li>`).join("")}</ul>
      ${lista.length > 14 ? `<p class="faint" style="margin:8px 6px 0;font-size:13px">E mais ${lista.length - 14}. Abra o sistema para ver tudo.</p>` : ""}`
      : `<div class="empty"><b>Tudo em dia</b>Nada pendente ${S.filtro === "tudo" ? "nos três sistemas" : "aqui"}.</div>`}
  </section>`;
}
function tarefasHTML(d) {
  const t = d.tarefas, l = t.lista || [];
  return `<section class="card panel" aria-label="Minhas tarefas">
    <div class="ph"><h2>Minhas tarefas</h2><span class="cnt">${num(t.atrasadas) ? `${num(t.atrasadas)} atrasada(s)` : ""}${num(t.atrasadas) && num(t.hoje) ? " · " : ""}${num(t.hoje) ? `${num(t.hoje)} para hoje` : ""}</span>
      <a class="more" href="${esc(link.hd("hoje"))}" target="_blank" rel="noopener">Abrir Hoje</a></div>
    ${l.length ? `<ul class="tk">${l.map(x => { const n = x.prazo ? diasAte(x.prazo) : null; const cls = n != null && n < 0 ? "bad" : n === 0 ? "warn" : "";
      return `<li><span class="dot ${cls}"></span><a href="${esc(x.chamado_id ? link.chamado(x.chamado_id) : link.hd("hoje"))}" target="_blank" rel="noopener"><span class="tx" title="${esc(x.texto)}">${esc(x.texto)}</span>
        <small>${n == null ? "Sem prazo" : n < 0 ? `Atrasada desde ${fDia(x.prazo)}` : n === 0 ? `Hoje${x.prazo_hora ? " às " + esc(String(x.prazo_hora).slice(0, 5)) : ""}` : `${fDia(x.prazo)}`}${x.chamado_id ? " · Chamado " + cod(x.chamado_id) : ""}</small></a></li>`; }).join("")}</ul>`
      : `<div class="empty"><b>Sem tarefas</b>Nenhuma tarefa sua para os próximos 7 dias.</div>`}
  </section>`;
}
function graficoHTML(d) {
  const s = d.helpdesk.serie || []; if (!s.length) return "";
  const W = 380, H = 150, padL = 22, padB = 20, padT = 8, n = s.length;
  const max = Math.max(4, ...s.map(x => Math.max(num(x.abertos), num(x.resolvidos))));
  const passo = Math.ceil(max / 4); const topo = passo * 4;
  const gw = (W - padL) / n, bw = Math.max(3, Math.min(9, gw / 2 - 2));
  const y = v => padT + (H - padT - padB) * (1 - v / topo);
  let g = "";
  for (let k = 0; k <= 4; k++) { const v = passo * k, yy = y(v).toFixed(1); g += `<line x1="${padL}" x2="${W}" y1="${yy}" y2="${yy}" stroke="var(--grid)"/><text x="${padL - 6}" y="${(+yy + 4)}" text-anchor="end">${v}</text>`; }
  s.forEach((x, i) => {
    const cx = padL + gw * i + gw / 2, a = num(x.abertos), r = num(x.resolvidos);
    const dia = String(x.dia).slice(8, 10) + "/" + String(x.dia).slice(5, 7);
    g += `<g><title>${dia}: ${a} aberto(s), ${r} resolvido(s)</title>
      <rect x="${(cx - bw - 1).toFixed(1)}" y="${y(a).toFixed(1)}" width="${bw}" height="${(y(0) - y(a)).toFixed(1)}" rx="2" fill="var(--s1)"/>
      <rect x="${(cx + 1).toFixed(1)}" y="${y(r).toFixed(1)}" width="${bw}" height="${(y(0) - y(r)).toFixed(1)}" rx="2" fill="var(--s2)"/></g>`;
    if (i % 2 === (n - 1) % 2) g += `<text x="${cx.toFixed(1)}" y="${H - 5}" text-anchor="middle">${dia.slice(0, 2)}</text>`;
  });
  const ta = s.reduce((x, v) => x + num(v.abertos), 0), tr = s.reduce((x, v) => x + num(v.resolvidos), 0);
  return `<section class="card panel chart" aria-label="Chamados nos últimos 14 dias">
    <div class="ph"><h2>Chamados · 14 dias</h2><a class="more" href="${esc(link.hd("indicadores"))}" target="_blank" rel="noopener">Indicadores</a></div>
    <div class="kpis"><div><b>${ta}</b>abertos</div><div><b>${tr}</b>resolvidos</div><div><b>${ta - tr > 0 ? "+" : ""}${ta - tr}</b>saldo da fila</div></div>
    <div class="ck"><span><em style="background:var(--s1)"></em>Abertos</span><span><em style="background:var(--s2)"></em>Resolvidos</span></div>
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Chamados abertos e resolvidos por dia nos últimos 14 dias">${g}</svg>
  </section>`;
}
function topoHTML() {
  return `<header class="top"><div class="bar3"></div><div class="topin">
    <div class="brand"><div class="logo"><img src="img/logo-128.png" alt=""></div><div><b>Hub de TI</b><small>Grupo Zerbini</small></div></div>
    <span class="upd" id="upd">${S.ultima ? "Atualizado há " + rel(new Date(S.ultima).toISOString()) : ""}</span>
    <button class="ib" id="bRef" data-act="atualizar" title="Atualizar agora" aria-label="Atualizar agora">${ICON("ref")}</button>
    <button class="ib" data-act="tema" title="Tema claro/escuro" aria-label="Alternar tema">${ICON("moon")}</button>
    <button class="ib" data-act="sair" title="Sair" aria-label="Sair">${ICON("out")}</button>
  </div></header>`;
}
function render() {
  const root = $("root");
  if (!S.user) { root.innerHTML = gateHTML(); return; }
  if (S.semAcesso) {
    root.innerHTML = `<div class="gate"><div class="card"><div style="display:flex;gap:12px;align-items:center"><div class="logo"><img src="img/logo-128.png" alt=""></div><b style="color:var(--heading);font-size:18px">Hub de TI</b></div>
      <h2>Sem acesso</h2><p>A conta <b>${esc(S.user.email)}</b> não está liberada para o Hub de TI.</p><button class="btn" data-act="sair">Sair</button></div></div>`;
    return;
  }
  const d = S.d;
  if (!d) {
    root.innerHTML = topoHTML() + `<main>${S.erro ? `<div class="err">${esc(S.erro)}</div>` : ""}<div class="sys">${'<div class="card sk" style="height:300px"></div>'.repeat(3)}</div></main>`;
    return;
  }
  const dataTxt = new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
  root.innerHTML = topoHTML() + `<main>
    ${S.erro ? `<div class="err" style="margin-bottom:12px">${esc(S.erro)}</div>` : ""}
    <div class="hello"><h1>${saudacao()}, ${esc(primeiroNome(d))}.</h1><p><span class="faint">${esc(dataTxt.charAt(0).toUpperCase() + dataTxt.slice(1))} ·</span> ${resumoFrase(d)}</p></div>
    ${cardsHTML(d)}
    <div class="grid2">${atencaoHTML(d)}<div class="side">${tarefasHTML(d)}${graficoHTML(d)}</div></div>
  </main>`;
}

// ---------- eventos ----------
document.addEventListener("submit", e => {
  e.preventDefault();
  if (e.target.id === "fEmail") loginEmail(e.target);
  if (e.target.id === "fCodigo") loginCodigo(e.target);
});
document.addEventListener("click", async e => {
  const el = e.target.closest("[data-act]"); if (!el) return;
  const a = el.dataset.act;
  if (a === "lsenha") { L.senha = !L.senha; L.msg = ""; render(); }
  else if (a === "lvoltar") { L.etapa = "email"; L.msg = ""; render(); }
  else if (a === "filtro") { S.filtro = el.dataset.v; render(); }
  else if (a === "atualizar") carregar();
  else if (a === "tema") { const t = document.documentElement.dataset.theme === "dark" ? "light" : "dark"; document.documentElement.dataset.theme = t; lsSet("hub_tema", t); }
  else if (a === "sair") { if (canal) { sb.removeChannel(canal); canal = null; } clearInterval(relogio); await sb.auth.signOut(); S.user = null; S.d = null; S.semAcesso = false; L.etapa = "email"; render(); }
});

// ---------- início ----------
sb.auth.onAuthStateChange((ev, sess) => {
  const u = sess && sess.user;
  if (u && (!S.user || S.user.id !== u.id)) { S.user = u; S.d = null; render(); setTimeout(() => carregar().then(() => { if (!S.semAcesso) ouvir(); }), 0); }
  else if (!u && S.user) { S.user = null; S.d = null; render(); }
});
sb.auth.getSession().then(({ data }) => { if (!data.session) render(); });
