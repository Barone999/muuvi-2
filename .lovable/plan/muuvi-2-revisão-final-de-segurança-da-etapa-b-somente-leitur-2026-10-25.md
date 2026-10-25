# Muuvi 2 — Revisão final de segurança da Etapa B (somente leitura)

Nada foi executado. Este documento só responde à revisão e define o que será feito depois que você autorizar.

## 1. Correspondência entre o SQL e o arquivo salvo

| Pergunta | Resposta | Nível de certeza |
|---|---|---|
| O SQL do card de aprovação é o mesmo enviado ao Supabase? | Sim, a ferramenta recebe um único texto SQL (`query`), e é esse texto que aparece no card e que é executado. | Documentado na descrição da ferramenta; não consigo inspecionar o funcionamento interno |
| O arquivo em `supabase/migrations/` tem exatamente esse SQL? | Deve ter, porque a ferramenta "cria arquivos de forma assíncrona" a partir do mesmo texto. Não há garantia byte a byte. | Suposição. Será conferido depois com um `diff` entre o arquivo e o SQL aprovado |
| A gravação do arquivo e a aplicação no banco são operações separadas? | Sim. O arquivo é gravado de forma assíncrona e a execução remota retorna seu próprio resultado. A documentação não diz o que acontece se só uma das duas falhar. | Limitação declarada |
| Existe como confirmar o destino antes de aprovar, só lendo? | Sim: `supabase--read_query` com `select current_database()` e a verificação do ref `ykdholccgewybufjubsc`, como na Etapa A. A ferramenta de migração não permite escolher o projeto; ela usa sempre o projeto conectado. | Confirmado (Etapa A) |

Como cobrir os riscos: (a) consulta de leitura antes da execução; (b) depois da execução, ler o arquivo gerado e compará-lo com o SQL aprovado; (c) se o arquivo não existir ou for diferente, parar e informar, sem recriar nada por conta própria.

## 2. Atomicidade e recuperação de falhas

- **Transação única:** as migrações do Supabase normalmente rodam em transação, e o DDL do Postgres é transacional. Não consigo confirmar que o mecanismo do Lovable envolve tudo numa transação. Por isso o script terá `BEGIN; … COMMIT;` explícitos, desde que a ferramenta aceite isso. Se recusar, envio sem esses comandos e registro a limitação.
- **Aplicação parcial:** dentro de uma transação, não há aplicação parcial. A criação do bucket é feita por outra ferramenta e fica **fora** dessa transação, então pode existir o bucket sem as tabelas, ou o contrário. Por isso ela vem em um passo separado e verificado.
- **`IF NOT EXISTS` e `CREATE OR REPLACE` podem esconder diferenças:** sim. `CREATE TABLE IF NOT EXISTS` mantém em silêncio uma tabela já existente que esteja diferente. `CREATE OR REPLACE FUNCTION` sobrescreve uma função existente. Como o banco está vazio (Etapa A), a recomendação é usar **comandos `CREATE` simples, sem `IF NOT EXISTS`**: se algo inesperado já existir, a migração falha por inteiro em vez de mascarar a diferença. Imediatamente antes, a consulta de leitura confirma de novo que o banco continua vazio.
- **Validação estrutural, além de contar objetos:** consultas de leitura em `information_schema.columns` (nome, tipo, se aceita nulo, valor padrão por coluna), `pg_constraint` (definição via `pg_get_constraintdef`), `pg_indexes`, `pg_policies` (comando, papéis, expressões `qual` e `with_check`), `pg_trigger` com `pg_get_triggerdef`, `pg_proc` (`prosecdef`, `proconfig`) e `information_schema.role_table_grants`. O resultado é comparado com uma tabela de referência montada a partir das 4 migrações locais.
- **Recuperação, sem mexer nas tabelas internas do Supabase:**
  - Se a migração falhar, a transação é desfeita; corrijo e reenvio.
  - Se ela for aplicada mas a validação divergir, faço uma nova migração corretiva (só para frente). Nunca edito o histórico.
  - Em último caso, uma migração de reversão com `DROP` dos objetos criados. Esses `DROP` exigem a sua aprovação.

## 3. Permissões do bucket `post-images`

- **Links assinados:** `createSignedUrls` (em `comunidade.tsx`, linha 27) exige permissão de leitura (SELECT) em `storage.objects` para quem gera o link. A política "qualquer usuária autenticada lê o bucket" é compatível com isso.
- **Privacidade:** com essa política, qualquer conta logada pode gerar links para **qualquer** foto do bucket, inclusive de posts excluídos (que viram arquivos órfãos) e de caminhos que ela consiga adivinhar. Visitantes não logados não têm acesso. Para um feed comunitário em que todas veem todos os posts, isso já é o comportamento esperado; o risco real são os arquivos órfãos e, no futuro, os posts ocultos pela moderação.
- **Política mínima recomendada para agora:** leitura para usuárias autenticadas (como já está em `0000`), mais envio (INSERT) e exclusão (DELETE) só na própria pasta (`foldername[1] = auth.uid()::text`). Sem permissão de alteração (UPDATE). Na etapa de moderação, a leitura deve passar a ser "a imagem pertence a um post visível", com um join em `posts.image_path`.
- **Limites do bucket:** a ferramenta de criação de bucket aceita `public=false` e `file_size_limit="5MB"`, mas **não tem parâmetro para tipos de arquivo permitidos (MIME)**. A lista `image/jpeg, image/png, image/webp, image/gif` não pode ser aplicada por ela. Alternativa: uma política de envio que também confira a extensão (`storage.extension(name) in (...)`). A limitação será declarada ao executar.

## 4. Resultado

**Confirmado com evidência:** o destino `ykdholccgewybufjubsc` está vazio (Etapa A); as migrações locais não criam o bucket; o front-end gera links assinados; os 3 posts fictícios estão num único bloco INSERT em `0000`.

**Suposições ou pontos não verificáveis:** que o arquivo gerado seja idêntico byte a byte ao SQL aplicado; como o Lovable trata a transação; o que acontece se só a gravação do arquivo ou só a aplicação falhar; o nome do projeto exibido no painel do Supabase.

**Riscos restantes:** o bucket fica fora da transação; não é possível impor os tipos MIME no próprio bucket; usuárias logadas podem ler qualquer foto; arquivos órfãos; `post_reports` sem leitura para ninguém (fica para a moderação); o `config.toml` ainda aponta para o projeto antigo (sem efeito no app).

**Sequência após a autorização:**
1. Consulta de leitura: confirmar o ref e que o banco segue vazio.
2. Migração única (0000 a 0003 consolidadas, sem o INSERT dos posts fictícios, com `CREATE` simples e `BEGIN/COMMIT`) mais a política de exclusão na própria pasta do storage.
3. Criar o bucket `post-images` privado, com limite de 5 MB.
4. Consultas de leitura para validar a estrutura contra a tabela de referência.
5. Comparar o arquivo em `supabase/migrations/` com o SQL aprovado.
6. Conferir que `types.ts` foi regenerado com as 9 tabelas.
7. Rodar `bunx vitest run`, `bunx tsc --noEmit` (meta: 0 erros) e `bun run build`.

**Checklist de aprovação:**
- [ ] Destino `ykdholccgewybufjubsc` confirmado
- [ ] Sem posts fictícios
- [ ] `CREATE` simples (falha se algo já existir)
- [ ] Bucket privado de 5 MB, aceitando a limitação de MIME (ou a política por extensão)
- [ ] Leitura por usuárias autenticadas aceita até a etapa de moderação
- [ ] Exclusão na própria pasta incluída agora, alteração (UPDATE) não
- [ ] Lovable como único mecanismo; nunca `drizzle-kit migrate`
- [ ] Moderação fora desta etapa
