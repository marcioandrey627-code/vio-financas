const $ = (id) => document.getElementById(id);
const F = window.VioFinance;

const categorias = {
  outros: "Outros",
  salario: "Salário",
  moradia: "Moradia",
  alimentacao: "Alimentação",
  transporte: "Transporte",
  lazer: "Lazer",
  saude: "Saúde"
};

const cores = [
  "#8b5cf6",
  "#c4b5fd",
  "#6d28d9",
  "#a78bfa",
  "#4c1d95",
  "#ddd6fe",
  "#7c3aed"
];

let db = null;
let usuario = null;
let transacoes = [];
let categoriasPersonalizadas = [];
let transacaoEdicao = null;
let transacaoConfirmacao = null;
let categoriaEdicao = null;
let recorteAtual = [];
let historicoFiltrado = [];
let periodoAtual = null;
let resumoAtual = null;
let graficoSelecionado = "saldo";
let meta = 0;
let revisao = 0;
let versaoAuth = 0;
let modoAuth = "login";
let geracaoSessao = 0;

const APP_URL = new URL("index.html", location.href).href;

function criar(tag, texto = "", classe = "") {
  const item = document.createElement(tag);
  item.textContent = texto;
  item.className = classe;
  return item;
}

function moeda(centavos) {
  return (centavos / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

function hoje() {
  const data = new Date();

  return [
    data.getFullYear(),
    String(data.getMonth() + 1).padStart(2, "0"),
    String(data.getDate()).padStart(2, "0")
  ].join("-");
}

function formatarData(data) {
  if (!data) {
    return "Sem data";
  }

  return new Date(data + "T12:00:00").toLocaleDateString("pt-BR");
}

function agendada(item) {
  return F.paymentState(item, hoje()) === "agendado";
}

function lerCentavos(campo, allowZero = false) {
  return F.parseMoney(campo.value, { allowZero });
}

function somar(itens) {
  const total = itens.reduce(function (soma, item) {
    return soma + Number(item.valor_centavos);
  }, 0);

  if (!Number.isSafeInteger(total)) {
    throw new Error("O total ultrapassou o limite de cálculo do painel.");
  }

  return total;
}

function mensagem(texto, erro = false) {
  const destino = document.querySelector("dialog[open] [data-modal-status]") ||
    ($("app-view").hidden ? $("auth-status") : $("app-status"));

  destino.textContent = texto;
  destino.classList.toggle("erro", erro);
}

function textoErro(erro) {
  const mensagens = {
    invalid_credentials: "E-mail ou senha incorretos.",
    email_not_confirmed: "Confirme seu e-mail antes de entrar.",
    user_already_exists: "Este e-mail já possui uma conta.",
    weak_password: "Escolha uma senha mais forte.",
    over_email_send_rate_limit:
      "Aguarde um pouco antes de solicitar outro e-mail.",
    PGRST205:
      "O banco de dados ainda não foi atualizado para esta versão do Vio.",
    PGRST204: "O banco de dados ainda não foi atualizado para esta versão do Vio.",
    "23503": "A categoria está em uso ou não pertence à sua conta.",
    "23505": "Já existe um registro com esse nome ou identificação."
  };

  return mensagens[erro.code] ||
    erro.message ||
    "Não foi possível concluir a operação.";
}

async function executar(botao, tarefa) {
  if (botao.disabled) {
    return;
  }

  const dono = usuario?.id;
  const geracao = geracaoSessao;

  botao.disabled = true;
  botao.setAttribute("aria-busy", "true");

  try {
    await tarefa();
  } catch (erro) {
    if (!dono || sessaoAtual(dono, geracao)) {
      mensagem(textoErro(erro), true);
    }
  } finally {
    botao.disabled = false;
    botao.removeAttribute("aria-busy");
  }
}

function sessaoAtual(uid, geracao) {
  return usuario?.id === uid && geracaoSessao === geracao;
}

/* Temas */

function atualizarBotoesTema() {
  const claro = document.documentElement.dataset.theme === "light";

  document.querySelectorAll("[data-theme-toggle]").forEach(function (botao) {
    botao.textContent = claro ? "☾ Tema escuro" : "☀ Tema claro";

    botao.setAttribute(
      "aria-label",
      claro ? "Ativar tema escuro" : "Ativar tema claro"
    );
  });
}

document.querySelectorAll("[data-theme-toggle]").forEach(function (botao) {
  botao.addEventListener("click", function () {
    const atual = document.documentElement.dataset.theme;
    const proximo = atual === "light" ? "dark" : "light";

    document.documentElement.dataset.theme = proximo;

    try {
      localStorage.setItem("vio-tema", proximo);
    } catch {}

    atualizarBotoesTema();
    if (usuario) renderizarSeguro();
  });
});

atualizarBotoesTema();

/* Login e cadastro */

function definirModoAuth(modo) {
  modoAuth = modo;

  const cadastro = modo === "cadastro";

  $("auth-title").textContent = cadastro
    ? "Seu próximo capítulo começa aqui."
    : "Bem-vindo de volta.";

  $("auth-description").textContent = cadastro
    ? "Crie sua conta para organizar suas finanças."
    : "Entre para acompanhar suas finanças.";

  $("auth-submit").textContent = cadastro
    ? "Criar minha conta ↗"
    : "Entrar na minha conta ↗";

  $("auth-password").minLength = cadastro ? 8 : 1;

  $("auth-password").autocomplete = cadastro
    ? "new-password"
    : "current-password";

  document.querySelectorAll("[data-auth-mode]").forEach(function (botao) {
    const ativo = botao.dataset.authMode === modo;

    botao.classList.toggle("ativo", ativo);
    botao.setAttribute("aria-pressed", String(ativo));
  });

  $("auth-status").textContent = "";
}

document.querySelectorAll("[data-auth-mode]").forEach(function (botao) {
  botao.addEventListener("click", function () {
    definirModoAuth(botao.dataset.authMode);
  });
});

$("revelar-senha").addEventListener("click", function () {
  const campo = $("auth-password");
  const mostrar = campo.type === "password";

  campo.type = mostrar ? "text" : "password";

  $("revelar-senha").textContent = mostrar ? "Ocultar" : "Mostrar";
  $("revelar-senha").setAttribute("aria-pressed", String(mostrar));

  $("revelar-senha").setAttribute(
    "aria-label",
    mostrar ? "Ocultar senha" : "Mostrar senha"
  );
});

$("auth-form").addEventListener("submit", function (evento) {
  evento.preventDefault();

  executar($("auth-submit"), async function () {
    if (!db) {
      throw new Error("A conexão com o Supabase não foi iniciada.");
    }

    mensagem("");

    const email = $("auth-email").value.trim();
    const password = $("auth-password").value;

    if (modoAuth === "cadastro") {
      const { data, error } = await db.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: APP_URL
        }
      });

      if (error) {
        throw error;
      }

      $("auth-password").value = "";

      if (!data.session) {
        mensagem(
          "Confira seu e-mail para confirmar o cadastro. " +
          "Se já tiver uma conta, use a opção Entrar."
        );
      }
    } else {
      const { error } = await db.auth.signInWithPassword({
        email,
        password
      });

      if (error) {
        throw error;
      }

      $("auth-password").value = "";
    }
  });
});

$("sair").addEventListener("click", function () {
  executar($("sair"), async function () {
    const { error } = await db.auth.signOut({
      scope: "local"
    });

    if (error) {
      throw error;
    }

    mostrarSessao(null);
  });
});

/* Sessão */

function mostrarSessao(sessao) {
  const proximoUsuario = sessao?.user || null;
  const mudou = usuario?.id !== proximoUsuario?.id;

  if (mudou || !proximoUsuario) {
    geracaoSessao++;
    revisao++;
    transacoes = [];
    categoriasPersonalizadas = [];
    transacaoEdicao = null;
    transacaoConfirmacao = null;
    categoriaEdicao = null;
    meta = 0;

    document.querySelectorAll("dialog[open]").forEach(dialog => dialog.close());

    $("form-transacao").reset();
    $("form-confirmacao").reset();
    $("form-categoria").reset();
    $("busca").value = "";
    $("filtro-tipo").value = "todos";
    $("filtro-status").value = "todos";
    $("periodo").value = "todos";
    $("meta-valor").value = "";
    $("app-status").textContent = "";
    if ($("modal-status")) $("modal-status").textContent = "";
  }

  usuario = proximoUsuario;

  $("carregamento").hidden = true;
  $("auth-view").hidden = Boolean(usuario);
  $("app-view").hidden = !usuario;

  if (!usuario) {
    $("conta-email").textContent = "";
    $("auth-form").reset();
    $("auth-password").type = "password";
    $("revelar-senha").textContent = "Mostrar";
    $("revelar-senha").setAttribute("aria-pressed", "false");
    $("revelar-senha").setAttribute("aria-label", "Mostrar senha");
    $("importar").hidden = true;
    renderizarSeguro();
    definirModoAuth("login");
    return;
  }

  $("conta-email").textContent = usuario.email || "";
  renderizarSeguro();

  if (mudou) {
    carregarDados();
  }
}

/* Leitura do banco */

async function buscarTransacoes(uid, geracao) {
  return buscarRegistros("fin_transacoes", uid, geracao);
}

async function buscarRegistros(tabela, uid, geracao) {
  const resultado = [];
  let inicio = 0;
  let total = Infinity;

  while (inicio < total) {
    if (!sessaoAtual(uid, geracao)) {
      return [];
    }

    const { data, error, count } = await db
      .from(tabela)
      .select("*", { count: "exact" })
      .eq("user_id", uid)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(inicio, inicio + 499);

    if (error) {
      throw error;
    }

    if (!data.length) {
      break;
    }

    resultado.push(...data);
    inicio += data.length;
    total = count ?? inicio;
  }

  return resultado;
}

async function carregarDados() {
  if (!usuario) {
    return;
  }

  const uid = usuario.id;
  const geracao = geracaoSessao;
  const pedido = ++revisao;

  $("conexao").textContent = "Sincronizando...";
  mensagem("");

  try {
    const [registros, categoriasProprias, respostaMeta] = await Promise.all([
      buscarTransacoes(uid, geracao),
      buscarRegistros("fin_categorias", uid, geracao),

      db
        .from("fin_metas")
        .select("alvo_centavos")
        .eq("user_id", uid)
        .maybeSingle()
    ]);

    if (!sessaoAtual(uid, geracao) || pedido !== revisao) {
      return false;
    }

    if (respostaMeta.error) {
      throw respostaMeta.error;
    }

    transacoes = registros;
    categoriasPersonalizadas = categoriasProprias;
    meta = Number(respostaMeta.data?.alvo_centavos || 0);

    renderizarTela();

    $("conexao").textContent = "Sincronizado com sua conta";
    $("importar").hidden = lerLegadas().length === 0;
    return true;
  } catch (erro) {
    if (sessaoAtual(uid, geracao) && pedido === revisao) {
      $("conexao").textContent = "Não foi possível sincronizar";
      mensagem(textoErro(erro), true);
    }
    return false;
  }
}

$("sincronizar").addEventListener("click", function () {
  executar($("sincronizar"), carregarDados);
});

/* Resumo e filtros */

function renderizarSeguro() {
  try {
    renderizarTela();
  } catch (erro) {
    mensagem(textoErro(erro), true);
  }
}


function lerPeriodo() {
  return F.resolvePeriod({mode: $('periodo').value, month: $('periodo-mes').value,
    year: $('periodo-ano').value, start: $('periodo-inicio').value,
    end: $('periodo-fim').value}, hoje());
}

function nomeCategoria(item) {
  return categoriasPersonalizadas.find(c => c.id === item.categoria_id)?.nome ||
    categorias[item.categoria] || 'Outros';
}
function chaveCategoria(item) { return item.categoria_id ? 'custom:' + item.categoria_id : item.categoria || 'outros'; }
function corCategoria(item) {
  const cor = categoriasPersonalizadas.find(c => c.id === item.categoria_id)?.cor;
  return /^#[a-f\d]{6}$/i.test(cor || '') ? cor : cores[Math.max(0, Object.keys(categorias).indexOf(item.categoria)) % cores.length];
}

function renderizarTela() {
  periodoAtual = lerPeriodo();
  recorteAtual = transacoes.filter(item => F.matchesPeriod(item, periodoAtual));
  const realizadas = recorteAtual.filter(F.isConfirmed);
  const pagamentos = realizadas.filter(item => item.tipo === 'despesa');
  resumoAtual = F.summarize(recorteAtual, hoje());
  const r = resumoAtual;
  $('saldo').textContent = moeda(r.saldoDisponivel);
  $('receitas').textContent = moeda(r.receitas);
  $('despesas').textContent = moeda(r.despesas);
  $('economia').textContent = moeda(r.guardado);
  $('receitas-contagem').textContent = realizadas.filter(item => item.tipo === 'receita').length + ' recebimentos';
  $('despesas-contagem').textContent = pagamentos.length + ' pagamentos';
  $('economia-taxa').textContent = (r.receitas > 0 ? r.guardado / r.receitas * 100 : 0).toFixed(0) + '% das receitas reservado';
  $('grafico-total').textContent = moeda(r.saldoDisponivel);
  $('periodo-descricao').textContent = periodoAtual.label + '. Confirmadas pela data efetiva; pendentes pelo vencimento.';
  $('resumo-pendencias').textContent = 'A receber: ' + moeda(r.pendentesReceitas) + ' · A pagar: ' + moeda(r.pendentesDespesas) + ' · ' + r.atrasadas + ' em atraso';
  const legados = transacoes.filter(item => item.legado_sem_confirmacao && !F.isConfirmed(item)).length;
  $('aviso-legados').hidden = !legados;
  $('aviso-legados').textContent = legados + ' registros antigos aguardam revisão. Confirme apenas os valores efetivamente recebidos ou pagos.';
  mostrarHistorico(recorteAtual);
  mostrarGrafico(realizadas);
  mostrarMiniGraficos(realizadas);
  mostrarCategorias(pagamentos, r.despesas);
  mostrarPagamentos(recorteAtual);
  mostrarMeta(r.guardado);
  mostrarGerenciamentoCategorias();
  window.VioReportsUI?.render({rows: recorteAtual, periodo: periodoAtual, resumo: r, categoryName: nomeCategoria, categoryColor: corCategoria});
}

function camposPeriodo() {
  const modo = $('periodo').value;
  $('campo-periodo-mes').hidden = modo !== 'mes-especifico';
  $('campo-periodo-ano').hidden = modo !== 'ano';
  $('campo-periodo-intervalo').hidden = modo !== 'personalizado';
}
$('periodo-mes').value = hoje().slice(0, 7);
$('periodo-ano').value = hoje().slice(0, 4);
$('periodo-inicio').value = hoje().slice(0, 7) + '-01';
$('periodo-fim').value = hoje();
$('periodo').addEventListener('change', () => { camposPeriodo(); renderizarSeguro(); });
['periodo-mes','periodo-ano','periodo-inicio','periodo-fim','filtro-tipo','filtro-status'].forEach(id => $(id).addEventListener('change', renderizarSeguro));
$('busca').addEventListener('input', renderizarSeguro);

function mostrarHistorico(itens) {
  const lista = $('lista-transacoes');
  const busca = $('busca').value.trim().toLocaleLowerCase('pt-BR');
  const tipo = $('filtro-tipo').value;
  const status = $('filtro-status').value;
  historicoFiltrado = itens.filter(item => {
    const estado = F.paymentState(item, hoje());
    const correspondeStatus = status === 'todos' || (status === 'pendente' ? !F.isConfirmed(item) :
      status === 'guardado' ? F.isConfirmed(item) && Number(item.guardado_centavos) > 0 : estado === status);
    return (item.descricao + ' ' + nomeCategoria(item)).toLocaleLowerCase('pt-BR').includes(busca) &&
      (tipo === 'todos' || item.tipo === tipo) && correspondeStatus;
  });
  lista.replaceChildren();
  [...historicoFiltrado].reverse().forEach(item => {
    const linha = criar('tr');
    const nome = criar('td', item.descricao);
    nome.append(criar('small', nomeCategoria(item), 'detalhe-transacao'));
    const valor = criar('td', (item.tipo === 'receita' ? '+ ' : '− ') + moeda(Number(item.valor_centavos)));
    if (Number(item.guardado_centavos)) valor.append(criar('small', moeda(Number(item.guardado_centavos)) + ' guardado', 'detalhe-transacao'));
    const data = criar('td', formatarData(F.financialDate(item)));
    data.title = 'Prevista: ' + formatarData(item.data) + ' · Efetiva: ' + formatarData(item.data_efetiva);
    const estado = F.paymentState(item, hoje());
    const celulaStatus = criar('td');
    celulaStatus.append(criar('span', F.statusLabel(item, hoje()), 'etiqueta estado-' + estado));
    const acoes = criar('td', '', 'acoes-transacao');
    const editar = criar('button', 'Editar', 'excluir');
    editar.type = 'button'; editar.setAttribute('aria-label', 'Editar ' + item.descricao);
    editar.addEventListener('click', () => abrirFormulario(item));
    acoes.append(editar);
    if (!F.isConfirmed(item)) {
      const confirmar = criar('button', item.tipo === 'receita' ? 'Receber' : 'Pagar', 'excluir confirmar');
      confirmar.type = 'button'; confirmar.addEventListener('click', () => abrirConfirmacao(item));
      acoes.append(confirmar);
    }
    const excluir = criar('button', 'Excluir', 'excluir');
    excluir.type = 'button'; excluir.setAttribute('aria-label', 'Excluir ' + item.descricao);
    excluir.addEventListener('click', () => {
      if (!confirm('Excluir a movimentação "' + item.descricao + '"?')) return;
      executar(excluir, async () => {
        const uid = usuario?.id, geracao = geracaoSessao;
        if (!uid) return;
        const {data: apagadas, error} = await db.from('fin_transacoes').delete().eq('id', item.id).eq('user_id', uid).eq('versao', item.versao).select('id');
        if (error) throw error;
        if (!sessaoAtual(uid, geracao)) return;
        await carregarDados();
        if (!apagadas?.length) throw new Error('Esta movimentação mudou em outra sessão. Revise a versão atual antes de excluir.');
      });
    });
    acoes.append(excluir);
    linha.append(nome, valor, data, celulaStatus, acoes);
    lista.append(linha);
  });
  $('historico-vazio').hidden = historicoFiltrado.length > 0;
  $('total-registros').textContent = historicoFiltrado.length + ' registros';
}


function mostrarGrafico(itens) {
  const grafico = $("grafico");
  const metricas = {
    saldo: {
      titulo: "Fluxo de caixa",
      legenda: "Saldo disponível acumulado",
      total: resumoAtual.saldoDisponivel,
      movimento: item => item.tipo === "receita" ? Number(item.valor_centavos) - Number(item.guardado_centavos || 0) : -Number(item.valor_centavos)
    },
    receitas: {
      titulo: "Evolução das receitas",
      legenda: "Receitas confirmadas acumuladas",
      total: resumoAtual.receitas,
      movimento: item => item.tipo === "receita" ? Number(item.valor_centavos) : 0
    },
    despesas: {
      titulo: "Evolução das despesas",
      legenda: "Despesas pagas acumuladas",
      total: resumoAtual.despesas,
      movimento: item => item.tipo === "despesa" ? Number(item.valor_centavos) : 0
    },
    guardado: {
      titulo: "Economia reservada",
      legenda: "Reservas acumuladas",
      total: resumoAtual.guardado,
      movimento: item => Number(item.guardado_centavos || 0)
    }
  };
  const metrica = metricas[graficoSelecionado] || metricas.saldo;
  const tabs = [...document.querySelectorAll("[data-chart]")];
  const indiceAtual = Math.max(0, tabs.findIndex(tab => tab.dataset.chart === graficoSelecionado));
  $("chart-title").textContent = metrica.titulo;
  $("chart-legend-label").textContent = metrica.legenda;
  $("grafico-total").textContent = moeda(metrica.total);
  $("chart-position").textContent = `${indiceAtual + 1} / ${tabs.length}`;
  $("chart-hint").textContent = itens.length
    ? "Passe o cursor para destacar. Use as setas para navegar e dê duplo clique para ampliar."
    : "Este painel acompanha seus dados reais. Adicione uma movimentação para iniciar o gráfico.";
  tabs.forEach(tab => tab.setAttribute("aria-pressed", String(tab.dataset.chart === graficoSelecionado)));
  grafico.setAttribute("aria-label", `${metrica.legenda} por movimentação`);
  const largura = Math.max(260, Math.round(grafico.getBoundingClientRect().width) || 700);
  const esquerda = 66;
  const direita = largura - 18;
  grafico.setAttribute("viewBox", `0 0 ${largura} 220`);

  if (!itens.length) {
    $('chart-empty-state').hidden = false;
    grafico.innerHTML = `
      <defs>
        <linearGradient id="empty-chart-line" x1="0" x2="1">
          <stop offset="0%" stop-color="var(--primary)" stop-opacity=".35" />
          <stop offset="100%" stop-color="var(--accent)" stop-opacity=".8" />
        </linearGradient>
      </defs>
      ${[20, 70, 120, 170].map(y => `<line x1="${esquerda}" y1="${y}" x2="${direita}" y2="${y}" stroke="var(--border)" stroke-dasharray="3 7" />`).join('')}
      <text x="0" y="174" fill="var(--muted)" font-size="11">R$ 0</text>
      <polyline points="${esquerda},120 ${esquerda + (direita - esquerda) * .22},116 ${esquerda + (direita - esquerda) * .46},123 ${esquerda + (direita - esquerda) * .68},114 ${direita},118"
        fill="none" stroke="url(#empty-chart-line)" stroke-width="2" stroke-dasharray="5 7" stroke-linecap="round" />
    `;
    return;
  }

  $('chart-empty-state').hidden = true;
  const ordenadas = [...itens].sort(function (a, b) {
    return (F.financialDate(a) || "").localeCompare(F.financialDate(b) || "");
  });

  const valores = [0];

  ordenadas.forEach(function (item) {
    const anterior = valores[valores.length - 1];
    valores.push(anterior + metrica.movimento(item));
  });

  let minimo = 0;
  let maximo = 0;
  for (const valor of valores) {
    minimo = Math.min(minimo, valor);
    maximo = Math.max(maximo, valor);
  }
  if (minimo === maximo) maximo = minimo + 1;

  const x = (indice) =>
    esquerda + indice * (direita - esquerda) / (valores.length - 1);

  const y = (valor) =>
    20 + (maximo - valor) * 150 / (maximo - minimo);

  const passo = Math.max(1, Math.ceil((valores.length - 1) / 240));
  const pontosSelecionados = [];
  for (let indice = 0; indice < valores.length; indice++) {
    if (indice % passo === 0 || indice === valores.length - 1) {
      pontosSelecionados.push(`${x(indice)},${y(valores[indice])}`);
    }
  }
  const pontos = pontosSelecionados.join(" ");

  let linhas = "";

  for (let indice = 0; indice < 4; indice++) {
    const altura = 20 + indice * 50;
    const valor = maximo - (maximo - minimo) * indice / 3;

    const rotulo = (valor / 100).toLocaleString("pt-BR", {
      notation: "compact",
      maximumFractionDigits: 1
    });

    linhas += `
      <line x1="${esquerda}" y1="${altura}" x2="${direita}" y2="${altura}"
        stroke="var(--border)" />

      <text x="0" y="${altura + 4}"
        fill="var(--muted)" font-size="12">
        R$ ${rotulo}
      </text>
    `;
  }

  const base = y(0);
  const ultimoX = x(valores.length - 1);

  grafico.innerHTML = `
    <defs>
      <linearGradient id="linha-roxa">
        <stop offset="0%" stop-color="var(--primary)" />
        <stop offset="100%" stop-color="var(--accent)" />
      </linearGradient>
    </defs>

    ${linhas}

    <polygon
      points="${esquerda},${base} ${pontos} ${ultimoX},${base}"
      fill="var(--soft)"
    />

    <polyline
      points="${pontos}"
      fill="none"
      stroke="url(#linha-roxa)"
      stroke-width="2.5"
      stroke-linejoin="round"
      vector-effect="non-scaling-stroke"
    />

    <text x="${esquerda}" y="210"
      fill="var(--muted)" font-size="12">
      Início
    </text>

    <text x="${direita}" y="210" text-anchor="end"
      fill="var(--muted)" font-size="12">
      Última movimentação
    </text>
  `;
}

function mostrarMiniGraficos(itens) {
  const series = [
    { id: 'trend-saldo', value: item => item.tipo === 'receita' ? Number(item.valor_centavos) - Number(item.guardado_centavos || 0) : -Number(item.valor_centavos) },
    { id: 'trend-receitas', value: item => item.tipo === 'receita' ? Number(item.valor_centavos) : 0 },
    { id: 'trend-despesas', value: item => item.tipo === 'despesa' ? Number(item.valor_centavos) : 0 },
    { id: 'trend-economia', value: item => Number(item.guardado_centavos || 0) }
  ];
  const ordenadas = [...itens].sort((a, b) => (F.financialDate(a) || '').localeCompare(F.financialDate(b) || ''));
  const values = series.map(() => [0]);

  ordenadas.forEach(item => {
    series.forEach((metric, index) => {
      values[index].push(values[index][values[index].length - 1] + metric.value(item));
    });
  });

  series.forEach((metric, index) => {
    const grafico = $(metric.id);
    if (!ordenadas.length) {
      grafico.innerHTML = '<line x1="3" y1="30" x2="177" y2="30" stroke="var(--border)" stroke-width="1" stroke-dasharray="3 5" /><circle cx="177" cy="30" r="2" fill="var(--muted)" />';
      return;
    }

    const todos = values[index];
    const passo = Math.max(1, Math.ceil((todos.length - 1) / 28));
    const selecionados = todos.filter((_, ponto) => ponto % passo === 0 || ponto === todos.length - 1);
    let minimo = Math.min(...selecionados);
    let maximo = Math.max(...selecionados);
    if (minimo === maximo) {
      const margem = Math.max(1, Math.abs(minimo) * 0.1);
      minimo -= margem;
      maximo += margem;
    }
    const pontos = selecionados.map((valor, ponto) => {
      const x = 2 + ponto * 176 / Math.max(1, selecionados.length - 1);
      const y = 4 + (maximo - valor) * 30 / (maximo - minimo);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    const ultimo = pontos[pontos.length - 1].split(',');
    grafico.innerHTML = `
      <polygon points="2,38 ${pontos.join(' ')} ${ultimo[0]},38" />
      <polyline points="${pontos.join(' ')}" />
      <circle cx="${ultimo[0]}" cy="${ultimo[1]}" r="2.5" />
    `;
  });
}

/* Despesas por categoria */

function mostrarCategorias(itens, total) {
  const totais = {};

  itens.forEach(function (item) {
    const categoria = chaveCategoria(item);

    totais[categoria] =
      (totais[categoria] || 0) + Number(item.valor_centavos);
  });

  const grupos = Object.entries(totais).sort(function (a, b) {
    return b[1] - a[1];
  });

  const lista = $("categorias-lista");
  lista.replaceChildren();

  $("donut-total").textContent = moeda(total);

  const circulo = 2 * Math.PI * 60;
  let deslocamento = 0;

  let desenho = `
    <circle cx="80" cy="80" r="60"
      fill="none" stroke="var(--raised)" stroke-width="15" />
  `;

  grupos.forEach(function ([categoria, valor], indice) {
    const exemplo = itens.find(item => chaveCategoria(item) === categoria);
    const cor = corCategoria(exemplo);
    const tamanho = valor / total * circulo;

    desenho += `
      <circle
        cx="80" cy="80" r="60"
        fill="none"
        stroke="${cor}"
        stroke-width="15"
        stroke-dasharray="${tamanho} ${circulo - tamanho}"
        stroke-dashoffset="${-deslocamento}"
        transform="rotate(-90 80 80)"
      />
    `;

    deslocamento += tamanho;

    const linha = criar("div", "", "categoria");
    const nome = criar("span", nomeCategoria(exemplo));
    const ponto = criar("i", "", "ponto");

    ponto.style.backgroundColor = cor;
    nome.prepend(ponto);

    linha.append(nome, criar("strong", moeda(valor)));
    lista.append(linha);
  });

  $("donut").innerHTML = desenho;

  if (!grupos.length) {
    desenho = `
      <circle cx="80" cy="80" r="60" fill="none" stroke="var(--raised)" stroke-width="15" />
      <circle cx="80" cy="80" r="60" fill="none" stroke="var(--border)" stroke-width="1" stroke-dasharray="2 6" />
    `;
    $("donut").innerHTML = desenho;
    lista.append(criar("p", "As despesas por categoria aparecerão após confirmar pagamentos.", "vazio"));
  }
}

/* Agendamentos e meta */


function mostrarPagamentos(itens) {
  const lista = $('pagamentos-lista');
  lista.replaceChildren();
  const pendentes = itens.filter(item => item.tipo === 'despesa' && !F.isConfirmed(item))
    .sort((a,b) => (a.data || '9999').localeCompare(b.data || '9999')).slice(0,5);
  pendentes.forEach(item => {
    const linha = criar('div', '', 'pagamento');
    const info = criar('div');
    info.append(criar('p', item.descricao), criar('small', F.statusLabel(item, hoje()) + ' · ' + formatarData(item.data)));
    const confirmar = criar('button', 'Pagar', 'excluir confirmar');
    confirmar.type = 'button'; confirmar.addEventListener('click', () => abrirConfirmacao(item));
    linha.append(info, criar('strong', moeda(Number(item.valor_centavos))), confirmar);
    lista.append(linha);
  });
  if (!pendentes.length) lista.append(criar('p', 'Nenhum pagamento a confirmar no período.', 'vazio'));
}


function mostrarMeta(economia) {
  const percentual = meta > 0
    ? Math.min(100, economia / meta * 100)
    : 0;

  $("meta-percentual").textContent = percentual.toFixed(0) + "%";
  $("meta-progresso").value = percentual;

  $("meta-texto").textContent = meta > 0
    ? moeda(economia) + " de " + moeda(meta)
    : "Defina seu próximo objetivo.";

  if (document.activeElement !== $("meta-valor")) {
    $("meta-valor").value = meta > 0
      ? F.formatInput(meta)
      : "";
  }
}

/* Nova movimentação */

function atualizarCamposTransacao() {
  const confirmado = $('status').value === 'confirmado';
  const reserva = confirmado && $('tipo').value === 'receita';
  $('campo-data-efetiva').hidden = !confirmado;
  $('data-efetiva').required = confirmado;
  $('data-efetiva').max = hoje();
  if (confirmado && !$('data-efetiva').value) $('data-efetiva').value = hoje();
  $('campo-guardado').hidden = !reserva;
}

function preencherCategorias(valor = 'outros') {
  const lista = $('categoria');
  lista.replaceChildren();
  Object.entries(categorias).forEach(([id,nome]) => {
    const opcao = criar('option', nome); opcao.value = id; lista.append(opcao);
  });
  categoriasPersonalizadas.forEach(c => {
    const opcao = criar('option', c.nome); opcao.value = 'custom:' + c.id; lista.append(opcao);
  });
  lista.value = valor;
  if (!lista.value) lista.value = 'outros';
}

function abrirFormulario(item = null) {
  if (!usuario) return;
  transacaoEdicao = item ? {...item} : null;
  $('form-transacao').reset();
  $('modal-status').textContent = '';
  $('transaction-title').textContent = item ? 'Editar movimentação' : 'Nova movimentação';
  $('salvar-transacao').textContent = item ? 'Salvar alterações' : 'Adicionar movimentação';
  $('descricao').value = item?.descricao || '';
  $('valor').value = item ? F.formatInput(Number(item.valor_centavos)) : '';
  $('tipo').value = item?.tipo || 'receita';
  preencherCategorias(item ? chaveCategoria(item) : 'outros');
  $('data').value = item ? item.data || '' : hoje();
  $('data').required = !item || Boolean(item.data);
  $('status').value = item && F.isConfirmed(item) ? 'confirmado' : 'pendente';
  $('data-efetiva').value = item?.data_efetiva || hoje();
  $('guardado').value = F.formatInput(Number(item?.guardado_centavos || 0));
  atualizarCamposTransacao();
  $('modal-transacao').showModal();
}

$('nova-transacao').addEventListener('click', () => abrirFormulario());
$('fechar-modal').addEventListener('click', () => $('modal-transacao').close());
document.querySelectorAll('[data-fechar-dialog]').forEach(botao => botao.addEventListener('click', () => botao.closest('dialog').close()));
$('status').addEventListener('change', atualizarCamposTransacao);
$('tipo').addEventListener('change', atualizarCamposTransacao);

async function atualizarTransacao(item, campos, uid, geracao) {
  const {data, error} = await db.from('fin_transacoes').update(campos)
    .eq('id', item.id).eq('user_id', uid).eq('versao', item.versao).select('*').maybeSingle();
  if (error) throw error;
  if (!sessaoAtual(uid, geracao)) return false;
  if (!data) {
    await carregarDados();
    throw new Error('Esta movimentação mudou em outra sessão. Feche e abra a edição novamente para revisar a versão atual.');
  }
  return true;
}

$('form-transacao').addEventListener('submit', evento => {
  evento.preventDefault();
  executar($('salvar-transacao'), async () => {
    const uid = usuario?.id, geracao = geracaoSessao;
    const edicao = transacaoEdicao;
    if (!uid) throw new Error('Entre na sua conta para continuar.');
    const descricao = $('descricao').value.trim();
    if (!descricao || descricao.length > 100) throw new Error('Informe uma descrição com até 100 caracteres.');
    const valor = lerCentavos($('valor'));
    const confirmado = $('status').value === 'confirmado';
    const tipo = $('tipo').value;
    const guardado = confirmado && tipo === 'receita' ? lerCentavos($('guardado'), true) : 0;
    if (guardado > valor) throw new Error('O valor guardado não pode superar a receita.');
    const data = $('data').value || null;
    const efetiva = confirmado ? $('data-efetiva').value : null;
    if (data && !F.validDate(data)) throw new Error('Informe uma data prevista válida.');
    if (confirmado && (!F.validDate(efetiva) || efetiva > hoje())) throw new Error('A data efetiva deve ser válida e não pode estar no futuro.');
    const categoria = $('categoria').value;
    const categoriaId = categoria.startsWith('custom:') ? categoria.slice(7) : null;
    const registro = {descricao, valor_centavos: valor, tipo, categoria: categoriaId ? 'outros' : categoria,
      categoria_id: categoriaId, data, status: confirmado ? 'confirmado' : 'pendente',
      data_efetiva: efetiva, guardado_centavos: guardado};
    if (edicao) {
      if (!await atualizarTransacao(edicao, registro, uid, geracao)) return;
    } else {
      const {error} = await db.from('fin_transacoes').insert({...registro, user_id: uid});
      if (error) throw error;
    }
    if (!sessaoAtual(uid, geracao)) return;
    $('modal-transacao').close();
    transacaoEdicao = null;
    await carregarDados();
  });
});

function abrirConfirmacao(item) {
  if (!usuario || F.isConfirmed(item)) return;
  transacaoConfirmacao = {...item};
  $('confirmation-title').textContent = item.tipo === 'receita' ? 'Confirmar recebimento' : 'Confirmar pagamento';
  $('confirmacao-resumo').textContent = item.descricao + ' · ' + moeda(Number(item.valor_centavos)) + '. Confirme somente se o dinheiro já foi ' + (item.tipo === 'receita' ? 'recebido.' : 'pago.');
  $('confirmacao-status').textContent = '';
  $('confirmacao-data').value = hoje();
  $('confirmacao-data').max = hoje();
  $('confirmar-movimentacao').textContent = item.tipo === 'receita' ? 'Confirmar recebimento' : 'Confirmar pagamento';
  $('modal-confirmacao').showModal();
}
$('form-confirmacao').addEventListener('submit', evento => {
  evento.preventDefault();
  executar($('confirmar-movimentacao'), async () => {
    const uid = usuario?.id, geracao = geracaoSessao, item = transacaoConfirmacao;
    if (!uid || !item) return;
    const data = $('confirmacao-data').value;
    if (!F.validDate(data) || data > hoje()) throw new Error('Informe a data em que o dinheiro foi efetivamente movimentado.');
    if (!await atualizarTransacao(item, {status: 'confirmado', data_efetiva: data}, uid, geracao)) return;
    $('modal-confirmacao').close(); transacaoConfirmacao = null;
    await carregarDados();
  });
});
$('ver-pendentes').addEventListener('click', () => {
  $('filtro-tipo').value = 'despesa'; $('filtro-status').value = 'pendente'; $('busca').value = '';
  renderizarSeguro(); $('historico').scrollIntoView({block:'start'});
});

document.querySelectorAll('[data-moeda]').forEach(campo => campo.addEventListener('blur', () => {
  if (!campo.value.trim()) return;
  try { campo.value = F.formatInput(lerCentavos(campo, campo.id === 'guardado')); } catch { /* A validação do envio explica o formato. */ }
}));

$('form-meta').addEventListener('submit', evento => {
  evento.preventDefault();
  executar($('salvar-meta'), async () => {
    const uid = usuario?.id, geracao = geracaoSessao;
    if (!uid) return;
    const {error} = await db.from('fin_metas').upsert({user_id: uid, alvo_centavos: lerCentavos($('meta-valor'))}, {onConflict: 'user_id'});
    if (error) throw error;
    if (sessaoAtual(uid, geracao)) await carregarDados();
  });
});

function abrirCategoria(item = null) {
  if (!usuario) return;
  categoriaEdicao = item ? {...item} : null;
  $('form-categoria').reset(); $('categoria-status').textContent = '';
  $('category-title').textContent = item ? 'Editar categoria' : 'Nova categoria';
  $('categoria-nome').value = item?.nome || '';
  $('categoria-cor').value = item?.cor || '#a855f7';
  $('modal-categoria').showModal();
}
$('nova-categoria').addEventListener('click', () => abrirCategoria());
$('form-categoria').addEventListener('submit', evento => {
  evento.preventDefault();
  executar($('salvar-categoria'), async () => {
    const uid = usuario?.id, geracao = geracaoSessao, item = categoriaEdicao;
    if (!uid) return;
    const nome = $('categoria-nome').value.trim(), cor = $('categoria-cor').value;
    if (!nome || nome.length > 50 || !/^#[a-f\d]{6}$/i.test(cor)) throw new Error('Informe um nome com até 50 caracteres e uma cor válida.');
    const consulta = item ? db.from('fin_categorias').update({nome, cor}).eq('id', item.id).eq('user_id', uid).select('id').maybeSingle() :
      db.from('fin_categorias').insert({user_id: uid, nome, cor});
    const {data, error} = await consulta;
    if (error) throw error;
    if (!sessaoAtual(uid, geracao)) return;
    if (item && !data) throw new Error('Esta categoria não existe mais. Sincronize e tente novamente.');
    $('modal-categoria').close(); categoriaEdicao = null; await carregarDados();
  });
});

function mostrarGerenciamentoCategorias() {
  const lista = $('gerenciar-categorias'); lista.replaceChildren();
  const itens = [...Object.entries(categorias).map(([id,nome]) => ({id,nome,cor:corCategoria({categoria:id}),padrao:true})), ...categoriasPersonalizadas];
  itens.forEach(item => {
    const cartao = criar('div', '', 'categoria-gerenciada');
    const ponto = criar('i', '', 'ponto'); ponto.style.backgroundColor = item.cor;
    const nome = criar('strong', item.nome); nome.prepend(ponto);
    const usadas = transacoes.filter(t => item.padrao ? !t.categoria_id && t.categoria === item.id : t.categoria_id === item.id).length;
    cartao.append(nome, criar('small', item.padrao ? 'Padrão · ' + usadas + ' registros' : usadas + ' registros'));
    if (!item.padrao) {
      const acoes = criar('div', '', 'categoria-acoes');
      const editar = criar('button', 'Editar', 'excluir'); editar.type='button'; editar.addEventListener('click', () => abrirCategoria(item));
      const apagar = criar('button', 'Excluir', 'excluir'); apagar.type='button'; apagar.disabled = usadas > 0;
      apagar.title = usadas ? 'Altere a categoria das movimentações antes de excluir.' : 'Excluir categoria';
      apagar.addEventListener('click', () => {
        if (!confirm('Excluir a categoria "' + item.nome + '"?')) return;
        executar(apagar, async () => {
          const uid = usuario?.id, geracao = geracaoSessao;
          if (!uid) return;
          const {error} = await db.from('fin_categorias').delete().eq('id', item.id).eq('user_id', uid);
          if (error) throw error;
          if (sessaoAtual(uid, geracao)) await carregarDados();
        });
      });
      acoes.append(editar, apagar); cartao.append(acoes);
    }
    lista.append(cartao);
  });
}

function baixarCSV(itens, nome) {
  if (!usuario) return;
  const conteudo = F.csv(itens, {categoryName: nomeCategoria, today: hoje()});
  const url = URL.createObjectURL(new Blob([conteudo], {type:'text/csv;charset=utf-8'}));
  const link = criar('a'); link.href=url; link.download=nome; document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$('exportar-historico').addEventListener('click', () => executar($('exportar-historico'), async () => { renderizarTela(); baixarCSV(historicoFiltrado, 'vio-movimentacoes.csv'); }));
$('exportar-csv').addEventListener('click', () => executar($('exportar-csv'), async () => { renderizarTela(); baixarCSV(recorteAtual, 'vio-relatorio.csv'); }));
$('exportar-pdf').addEventListener('click', () => executar($('exportar-pdf'), async () => {
  const uid = usuario?.id, geracao = geracaoSessao;
  if (!uid) return;
  renderizarTela();
  const snapshot = {titulo:'Relatório financeiro Vio', periodo:periodoAtual.label, geradoEm:new Date().toLocaleString('pt-BR'), resumo:{...resumoAtual},
    meses:F.monthlyReport(recorteAtual, hoje()), transacoes:recorteAtual.map(item => ({...item, categoria:nomeCategoria(item), status:F.statusLabel(item, hoje())}))};
  await import('./assets/vio-pdf.js');
  if (sessaoAtual(uid, geracao)) await window.VioExportPDF(snapshot, {canDownload: () => sessaoAtual(uid, geracao)});
}));

document.querySelector("[data-chart='saldo']").setAttribute("aria-pressed", "true");
document.querySelectorAll("[data-chart]").forEach(botao => {
  botao.addEventListener("click", () => {
    graficoSelecionado = botao.dataset.chart;
    mostrarGrafico(recorteAtual.filter(F.isConfirmed));
  });
});
function selecionarGrafico(indice) {
  const tabs = [...document.querySelectorAll("[data-chart]")];
  const proximo = (indice + tabs.length) % tabs.length;
  graficoSelecionado = tabs[proximo].dataset.chart;
  mostrarGrafico(recorteAtual.filter(F.isConfirmed));
  tabs[proximo].focus();
}
$("chart-prev").addEventListener("click", () => {
  const indice = [...document.querySelectorAll("[data-chart]")].findIndex(tab => tab.dataset.chart === graficoSelecionado);
  selecionarGrafico(indice - 1);
});
$("chart-next").addEventListener("click", () => {
  const indice = [...document.querySelectorAll("[data-chart]")].findIndex(tab => tab.dataset.chart === graficoSelecionado);
  selecionarGrafico(indice + 1);
});
$("grafico").addEventListener("keydown", evento => {
  if (evento.key === "ArrowLeft" || evento.key === "ArrowRight") {
    evento.preventDefault();
    const indice = [...document.querySelectorAll("[data-chart]")].findIndex(tab => tab.dataset.chart === graficoSelecionado);
    selecionarGrafico(indice + (evento.key === "ArrowRight" ? 1 : -1));
  } else if (evento.key === "Enter" || evento.key === " ") {
    evento.preventDefault();
    $("chart-expand").click();
  }
});
let chartPointerStart = null;
$("grafico").addEventListener("pointerdown", evento => { chartPointerStart = evento.clientX; });
$("grafico").addEventListener("pointerup", evento => {
  if (chartPointerStart === null) return;
  const deslocamento = evento.clientX - chartPointerStart;
  chartPointerStart = null;
  if (Math.abs(deslocamento) < 48) return;
  const indice = [...document.querySelectorAll("[data-chart]")].findIndex(tab => tab.dataset.chart === graficoSelecionado);
  selecionarGrafico(indice + (deslocamento < 0 ? 1 : -1));
});
$("grafico").addEventListener("pointercancel", () => { chartPointerStart = null; });
function abrirGraficoAmpliado() {
  const dialogo = $("chart-dialog");
  const original = $("grafico");
  const ampliado = $("grafico-ampliado");
  $("chart-dialog-title").textContent = $("chart-title").textContent;
  ampliado.setAttribute("viewBox", original.getAttribute("viewBox"));
  ampliado.setAttribute("aria-label", original.getAttribute("aria-label"));
  ampliado.innerHTML = original.innerHTML;
  if (!dialogo.open) dialogo.showModal();
}
$("chart-expand").addEventListener("click", abrirGraficoAmpliado);
$("grafico").addEventListener("dblclick", abrirGraficoAmpliado);
$("chart-dialog-close").addEventListener("click", () => $("chart-dialog").close());
$("chart-dialog").addEventListener("click", evento => {
  if (evento.target === $("chart-dialog")) $("chart-dialog").close();
});
$('chart-empty-action').addEventListener('click', () => $('nova-transacao').click());

function lerLegadas() {
  try {
    const dados = JSON.parse(
      localStorage.getItem("minhas-financas") || "[]"
    );

    return Array.isArray(dados) ? dados : [];
  } catch {
    return [];
  }
}

$("importar").addEventListener("click", function () {
  executar($("importar"), async function () {
    const uid = usuario?.id;
    const geracao = geracaoSessao;

    if (!uid) {
      return;
    }

    const registros = lerLegadas()
      .map(function (item, indice) {
        if (!item || typeof item !== "object") {
          return null;
        }

        const valor = Math.round(Number(item.valor) * 100);
        const descricao = String(item.descricao || "").trim();

        if (
          !descricao ||
          !Number.isSafeInteger(valor) ||
          valor <= 0 ||
          valor > 99999999999 ||
          !["receita", "despesa"].includes(item.tipo)
        ) {
          return null;
        }

        return {
          user_id: uid,
          descricao: descricao.slice(0, 100),
          valor_centavos: valor,
          tipo: item.tipo,
          categoria: categorias[item.categoria]
            ? item.categoria
            : "outros",
          data: /^\d{4}-\d{2}-\d{2}$/.test(item.data || "")
            ? item.data
            : null,
          origem_local: "navegador:" + (item.id || "indice-" + indice)
        };
      })
      .filter(Boolean);

    if (!registros.length) {
      mensagem("Não há lançamentos antigos válidos para importar.");
      return;
    }

    const confirmar = confirm(
      "Importar " + registros.length +
      " lançamentos para a conta " + usuario.email + "?"
    );

    if (!confirmar) {
      return;
    }

    let atualizado = false;
    try {
      for (let inicio = 0; inicio < registros.length; inicio += 200) {
        if (!sessaoAtual(uid, geracao)) {
          return;
        }

        const { error } = await db
          .from("fin_transacoes")
          .upsert(registros.slice(inicio, inicio + 200), {
            onConflict: "user_id,origem_local",
            ignoreDuplicates: true
          });

        if (error) {
          throw error;
        }
      }
    } finally {
      if (sessaoAtual(uid, geracao)) {
        atualizado = await carregarDados();
      }
    }

    if (sessaoAtual(uid, geracao) && atualizado) {
      mensagem("Importação concluída. Registros já importados foram ignorados.");
    }
  });
});

/* Inicialização */

function iniciarSupabase() {
  if (!window.supabase || !window.CONFIG_SUPABASE) {
    mostrarSessao(null);

    mensagem(
      "Não foi possível carregar o Supabase. Confira a internet e o config.js.",
      true
    );

    return;
  }

  if (!["http:", "https:"].includes(location.protocol)) {
    mostrarSessao(null);

    mensagem(
      "Abra pelo servidor local: http://127.0.0.1:5500/index.html",
      true
    );

    return;
  }

  db = window.supabase.createClient(
    window.CONFIG_SUPABASE.url,
    window.CONFIG_SUPABASE.chave,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: "implicit"
      }
    }
  );

  db.auth.onAuthStateChange(function (evento, sessao) {
    const versao = ++versaoAuth;

    setTimeout(function () {
      if (versao === versaoAuth) {
        mostrarSessao(sessao);
      }
    }, 0);
  });

  $("auth-submit").disabled = false;
}

window.addEventListener("focus", function () {
  if (usuario) {
    carregarDados();
  }
});

let ajusteLayout;
window.addEventListener("resize", function () {
  clearTimeout(ajusteLayout);
  ajusteLayout = setTimeout(function () {
    if (usuario) renderizarSeguro();
  }, 180);
});

definirModoAuth("login");
iniciarSupabase();
