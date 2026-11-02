# 💜 Vio Finanças

Aplicação web para organizar receitas, despesas, movimentações, categorias e metas, com visual responsivo, relatórios e autenticação.

## ✨ Funcionalidades

- Visão geral financeira, com indicadores e gráficos.
- Cadastro e acompanhamento de receitas, despesas e movimentações.
- Gestão de categorias e metas financeiras.
- Relatórios com exportação para PDF.
- Tema claro/escuro e interface responsiva.
- Autenticação e armazenamento de dados usando Supabase.

## 🛠️ Tecnologias

**HTML5, CSS3, JavaScript, React, esbuild, Supabase e jsPDF.** A aplicação principal utiliza JavaScript no navegador; componentes de interface em React são compilados durante o build.

## 🚀 Executar localmente

Pré-requisito: **Node.js 20+** e npm.

```bash
npm ci
npm run build
```

Depois, abra o conteúdo de `dist/` por um servidor HTTP local, por exemplo:

```bash
npx serve dist
```

O comando `npm test` executa os testes das regras financeiras.

## 🗄️ Configurar o Supabase

1. Crie ou utilize um projeto Supabase com autenticação por e-mail.
2. Execute `banco.sql` no SQL Editor do Supabase.
3. Execute `banco-v2.sql` para aplicar as atualizações do banco.
4. Configure em `config.js` a URL do projeto e a **chave publicável** (`sb_publishable_...` ou `anon`).
5. Revise e mantenha ativas as políticas RLS (Row Level Security) antes de usar dados reais.

> **Segurança:** nunca adicione chaves secretas (`service_role`, `sb_secret_...`) a `config.js`, arquivos versionados ou código executado no navegador. A chave publicável do Supabase não substitui as políticas RLS.

## ☁️ Publicação na Vercel

1. Envie os arquivos do projeto para um repositório GitHub.
2. Na Vercel, selecione **Add New → Project** e importe o repositório.
3. Use o framework **Other**, se a detecção não selecionar um framework apropriado.
4. O arquivo `vercel.json` já define os comandos de build e o diretório de saída (`dist`).
5. Publique. Novos commits na branch de produção poderão gerar deploys automáticos após a integração Git.

## 📂 Estrutura

```text
├── index.html                 # Página principal
├── app.js                     # Lógica da aplicação
├── finance-core.js            # Regras financeiras
├── config.js                  # Configuração publicável do Supabase
├── visual.css / v2.css        # Estilos
├── ui/                        # Componentes React
├── reports/                   # Implementação de PDF
├── assets/                    # Arquivos estáticos/compilados
├── scripts/                   # Build e preparação da distribuição
├── tests/                     # Testes automatizados
├── banco.sql / banco-v2.sql   # Estrutura e migração do banco
└── vercel.json                # Configuração de deploy
```

## 👨‍💻 Autor

Desenvolvido por **Marcio Andrey** como projeto de desenvolvimento web e organização financeira.
