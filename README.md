# Backend do painel de comentários

Worker do Cloudflare que guarda os comentários num banco D1 e avisa um webhook do n8n (que grava no Google Sheets) a cada novo comentário. Guia do zero — você disse que ainda não tem conta no Cloudflare nem repositório no GitHub, então está tudo aqui, passo a passo.

## O que você vai ter no final

- Uma API (`https://algo.workers.dev/api/comments`) que o painel do Elementor vai chamar.
- Um banco de dados (D1) guardando todos os comentários.
- Deploy automático: toda vez que você der `git push`, o Worker se atualiza sozinho.
- Cada comentário novo dispara um webhook pro seu n8n, que grava a linha no Google Sheets.

## Passo 1 — Criar conta no Cloudflare

1. Acesse https://dash.cloudflare.com/sign-up e crie uma conta (pode ser com o e-mail que preferir).
2. Confirme o e-mail. Não precisa comprar domínio nem adicionar site nenhum — só a conta mesmo.

## Passo 2 — Criar o repositório no GitHub

1. Acesse https://github.com/new
2. Nome sugerido: `anh-comments-backend`. Pode ser privado.
3. Crie vazio (sem README, sem .gitignore).
4. No seu computador, dentro da pasta `comments-backend` que te entreguei:
   ```
   git init
   git add .
   git commit -m "primeiro commit"
   git branch -M main
   git remote add origin https://github.com/SEU-USUARIO/anh-comments-backend.git
   git push -u origin main
   ```

## Passo 3 — Instalar o Wrangler (CLI do Cloudflare)

Precisa de Node.js instalado (baixe em https://nodejs.org se não tiver). Depois, dentro da pasta `comments-backend`:

```
npm install
npx wrangler login
```

Isso abre o navegador pra você autorizar o Wrangler a mexer na sua conta Cloudflare.

## Passo 4 — Criar o banco D1

```
npx wrangler d1 create anh-comments-db
```

O comando devolve um `database_id`. Copie esse ID e cole no arquivo `wrangler.toml`, na linha:

```
database_id = "COLOQUE_AQUI_O_ID_DO_BANCO"
```

## Passo 5 — Criar a tabela no banco

```
npx wrangler d1 execute anh-comments-db --remote --file=./schema.sql
```

## Passo 6 — Configurar as variáveis

Abra `wrangler.toml` e troque:

```
ALLOWED_ORIGIN = "https://SEU-DOMINIO-WORDPRESS.com.br"
```

pelo domínio real do seu site (onde a página do Elementor vai ficar). Isso é o que libera o navegador do visitante a falar com a API — sem isso, o navegador bloqueia a chamada por segurança (CORS).

Depois, defina o segredo do webhook do n8n (veja o Passo 9 pra pegar essa URL):

```
npx wrangler secret put N8N_WEBHOOK_URL
```

Cole a URL do webhook quando o terminal pedir.

## Passo 7 — Primeiro deploy (manual)

```
npx wrangler deploy
```

O terminal mostra a URL final, algo como `https://anh-comments-backend.SEU-SUBDOMINIO.workers.dev`. Guarde essa URL — você vai usar no frontend.

## Passo 8 — Deploy automático via GitHub

Já deixei o arquivo `.github/workflows/deploy.yml` pronto. Só falta cadastrar dois segredos no GitHub:

1. No Cloudflare: vá em **Meu Perfil > API Tokens > Create Token**, use o template "Edit Cloudflare Workers", copie o token gerado.
2. No Cloudflare dashboard, copie também o **Account ID** (aparece no canto direito da tela inicial, ou em Workers & Pages > Overview).
3. No GitHub, vá até o repositório > **Settings > Secrets and variables > Actions > New repository secret** e crie:
   - `CLOUDFLARE_API_TOKEN` = o token do passo 1
   - `CLOUDFLARE_ACCOUNT_ID` = o Account ID do passo 2

A partir daqui, todo `git push` na branch `main` publica automaticamente.

## Passo 9 — Webhook no n8n até o Google Sheets

1. No n8n, crie um novo workflow.
2. Adicione um node **Webhook** (método POST). Copie a URL de produção que ele gera — é essa que vai no `N8N_WEBHOOK_URL` do Passo 6.
3. O corpo que o Worker envia pro webhook tem este formato:
   ```json
   {
     "id": "c_abc123",
     "name": "Fernanda L.",
     "text": "boa tarde, tudo bem?",
     "ts": 1751980000000,
     "dataHora": "2026-07-09T14:20:00.000Z"
   }
   ```
4. Adicione um node **Google Sheets** (ação "Append Row"), conecte sua conta Google, escolha a planilha e a aba, e mapeie as colunas: Nome → `{{$json.name}}`, Comentário → `{{$json.text}}`, Data/Hora → `{{$json.dataHora}}`.
5. Ative o workflow (toggle "Active" no topo).

## Passo 10 — Atualizar o frontend

No arquivo `chat-ao-vivo-preview.html`, dentro do `<script>`, troque:

```js
apiBaseUrl: "https://SEU-WORKER.SEU-SUBDOMINIO.workers.dev",
```

pela URL real que você guardou no Passo 7. Depois é só colar o conteúdo entre os comentários `INICIO/FIM DO CODIGO PARA O ELEMENTOR` dentro de um widget **HTML** do Elementor.

## Checklist final

- [ ] Conta Cloudflare criada
- [ ] Repositório GitHub criado e código enviado (`git push`)
- [ ] `database_id` colado no `wrangler.toml`
- [ ] Tabela criada (`wrangler d1 execute ... schema.sql`)
- [ ] `ALLOWED_ORIGIN` com o domínio real do site
- [ ] `N8N_WEBHOOK_URL` configurado como secret
- [ ] Primeiro `wrangler deploy` funcionando (testar `GET .../api/comments` no navegador — deve devolver `[]`)
- [ ] Secrets `CLOUDFLARE_API_TOKEN` e `CLOUDFLARE_ACCOUNT_ID` no GitHub
- [ ] Webhook n8n ativo e ligado ao Google Sheets
- [ ] `apiBaseUrl` atualizado no frontend
- [ ] Widget colado no Elementor e testado ao vivo

## Se algo travar

- **A API responde 404 em tudo**: confira se a rota é `/api/comments` (com `/api/`).
- **Erro de CORS no console do navegador**: o `ALLOWED_ORIGIN` no `wrangler.toml` não bate com o domínio real do site — refaça o deploy depois de corrigir.
- **Comentário não aparece na planilha**: teste o node Webhook do n8n sozinho primeiro (aba "Test URL"), depois confirme que o workflow está **Active**, não só salvo.
