# State of the Art (SOTA) - Desenvolvimento Assistido por IA

Este guia descreve os fundamentos do desenvolvimento de software assistido por Inteligência Artificial (AI-Assisted Development), detalhando como as ferramentas modernas (Windsurf, Cursor, OpenCode, Claude Code, GitHub Copilot) leem, entendem e agem sobre o seu projeto.

O objetivo é que você entenda a anatomia desse ecossistema para criar repositórios "Agent-Ready" — onde a IA trabalha de forma previsível, segura e barata (em consumo de tokens).

**Estrutura Canônica do Harness:**
```
.agents/                    # Fonte de verdade canônica
├── AGENTS.md               # Política global (sempre carregada)
├── USER.md                 # Preferências do usuário (cross-projeto)
├── project/                # Contexto específico do projeto
│   ├── context.md          # Stack, repo, constraints
│   ├── context-design.md   # Design system específico (UI/frontend)
│   └── MEMORY.md           # Fatos emergentes da sessão
├── skills/                 # Habilidades técnicas (carregamento sob demanda)
├── subagents/              # Personas especializadas por fase
└── workflows/              # Procedimentos sequenciais
```

---

## 1. O Ponto de Partida: Como a IA "Lê" o Projeto

Quando você abre um projeto em uma IDE com IA ou executa um agente CLI, a IA não tem um conhecimento inato sobre as regras de negócio da sua empresa. Ela precisa de contexto.

O estado da arte exige que o contexto seja **Progressivo** (carregado apenas quando necessário) e **Estruturado**. Para isso, as ferramentas buscam arquivos padrão na raiz do repositório.

### O Arquivo Canônico: `AGENTS.md`
O `AGENTS.md` na raiz atua como a "Constituição" do seu repositório. Assim que a sessão da IA é iniciada, ela procura por esse arquivo (ou equivalentes legados como `.cursorrules` ou `CLAUDE.md`). **Nota importante:** Este arquivo **não utiliza Frontmatter**. Como ele é de carregamento obrigatório e contínuo (Always On), a IA não precisa tomar uma decisão de roteamento para lê-lo; ele é injetado diretamente no System Prompt.

**Por que ele existe?**
Para definir as regras globais inegociáveis. Se a IA não souber que o projeto usa uma arquitetura específica ou exige a escrita de testes antes do código, ela vai "alucinar" o padrão comum da internet.

**Como funciona o Discovery (Descoberta):**
1. O agente procura na raiz do workspace atual.
2. Se não encontrar, ele sobe nas pastas até a raiz do `.git`.
3. Se não encontrar, ele busca nas configurações globais do usuário (`~/.config/opencode`, `~/.codex`, etc.).

---

## 2. A Hierarquia do Contexto (Top-Down)

Para evitar que a IA consuma todos os tokens disponíveis apenas lendo regras (o que custa dinheiro e degrada a performance), dividimos o contexto em camadas:

### Nível 1: Global Rules (`AGENTS.md`)
- **O que é:** Regras universais de comportamento.
- **O que colocar aqui:** "Sempre priorize legibilidade sobre esperteza", "Nunca assuma requisitos ausentes", "Siga o protocolo de Spec-Gap em caso de dúvida".
- **Carregamento:** Sempre ativo (Always On). Não requer Frontmatter.

### Nível 2: Project Context (`.agents/project/`)
- **O que é:** O DNA específico do projeto atual.
- **Arquivos:**
  - `context.md`: Stack tecnológica, arquitetura, SLOs de negócio
  - `context-design.md`: Design system específico (apenas em tasks de UI/frontend)
  - `MEMORY.md`: Fatos emergentes da sessão, decisões, workarounds (mantido pelo agente)
- **Carregamento:** Injetado manualmente ou incluído nas instruções de inicialização de tarefas.
- **Regra:** Carregar apenas arquivos relevantes para evitar custo de contexto desnecessário.

### Nível 3: Subagentes (Personas)
- **O que é:** Perfis especializados. A IA assume um papel específico dependendo da fase do desenvolvimento.
- **Exemplos:**
  - `spec-analyst.md`: Refinamento de spec e eliminação de ambiguidades
  - `planner.md`: Arquitetura, quebra de tarefas e contratos
  - `builder.md`: Codificação de UI, API e domínios
  - `reviewer.md`: Code review, QA, segurança, performance e identificação de código morto
  - `devops.md`: Infra, CI/CD, deploy e operação
- **Como a IA escolhe?** Através de Roteamento Dinâmico (veja o item 3).

---

## 3. Roteamento Dinâmico (O "Cérebro" da IA)

No passado, você precisava dizer "Aja como um Arquiteto". Hoje, as ferramentas usam **Tool Calling** e metadados para saber quando usar qual contexto.

**Como funciona:**
1. A IA lê a sua requisição inicial ("Construa a tela de login").
2. O sistema avalia as opções disponíveis (Subagentes, Skills).
3. A IA invoca um *Subagente* (`builder.md`) que possui as diretrizes de codificação.
4. Se o `builder` precisar de conhecimento específico de frontend, ele chama uma *Skill* de Frontend.

Isso garante que o agente use as regras de banco de dados *apenas* quando estiver mexendo com dados.

---

## 4. O Coração do Ecossistema: Skills

As **Skills** (habilidades) são o avanço mais importante no SOTA atual. Elas permitem encapsular conhecimento técnico de forma modular e carregamento progressivo.

### A Estrutura de uma Skill
Uma Skill vive dentro da pasta `.agents/skills/<nome-da-skill>/` e deve conter um arquivo obrigatório: `SKILL.md`.

**Anatomia do `SKILL.md`:**
```markdown
---
name: stripe-integration
description: Padrões de implementação e webhook handling para Stripe.
metadata:
  model: inherit
  version: 1.0.0
  author: Custom Stack
  category: development
  complexity: 5
  tags: [stripe, payments, webhooks, saas]
  compatible_with: [windsurf, opencode, antigravity]
---
# Conteúdo da Skill...
```

### Carregamento em 3 Níveis (Progressive Disclosure)
Para otimizar custo de contexto, skills são carregadas em 3 níveis:

1. **Nível 1 (Avaliação):** Apenas `name` + `description` do frontmatter
   - A IA avalia se a skill é relevante para a tarefa
   - Se a description for específica e "pushy", evita under-triggering

2. **Nível 2 (Necessário):** `SKILL.md` completo
   - Carregado apenas quando a skill for realmente necessária
   - Inclui instruções, procedimentos, pitfalls e verification

3. **Nível 3 (Aprofundamento):** Resources e scripts
   - Arquivos em `resources/` (documentação, scripts)
   - Carregados apenas quando a tarefa exigir

### Skills Generalistas vs Específicas
- **Generalistas:** Não carregam informações de projetos passados (ex: `frontend-design`, `vertical-slice-modular-monolith`)
- **Específicas:** Encapsulam conhecimento técnico de uma tecnologia específica (ex: `stripe-integration`, `langgraph-agent-patterns`)

**Regra:** Skills devem ser agnósticas - definem padrões para TIPOS de projetos, não para projetos específicos. Informações específicas do projeto ficam em `.agents/project/context.md` e `.agents/project/context-design.md`.

---

## 5. Design Systems e Google Design.md

Para projetos com design systems definidos, o harness suporta o formato **Google Design.md** como padrão estruturado para documentação de design systems.

### Formato DESIGN.md
- Combina tokens legíveis por máquina (YAML frontmatter) com rationale legível por humanos (markdown)
- Permite validação automática via CLI (`npx @google/design.md lint`)
- Suporta exportação para outros formatos (Tailwind, tokens.json, Figma)
- Permite controle de versão de mudanças de design com diff

### context-design.md
Arquivo em `.agents/project/context-design.md` para design system específico do projeto:
- Caminho do arquivo DESIGN.md (se utilizado)
- Framework (Tailwind CSS v4, CSS Modules, etc)
- Component Library (shadcn/ui, Radix UI, etc)
- Branding (name, domain, personality, style)
- Active Design Tokens
- Custom Components
- Design Decisions
- Known Constraints

**Carregamento:** Apenas em tasks de UI/frontend, para evitar custo de contexto desnecessário.

---

## 6. Workflows (A Esteira de Montagem)

Enquanto as Skills ensinam *como* fazer (ex: "Como usar o Stripe"), os **Workflows** ensinam *o que* fazer em sequência (ex: "Como lançar uma nova release").

**Como funcionam:**
- Ficam em `.windsurf/workflows` ou `.agents/workflows/`.
- São arquivos Markdown com listas numeradas.
- O agente pode executa-los passo a passo, inclusive rodando comandos de terminal em passos marcados (ex: com a anotação `// turbo`).

**Diferença Prática:**
- **Skill:** "Use Drizzle ORM assim..."
- **Workflow:** "1. Crie a branch. 2. Rode o linter. 3. Gere a migration. 4. Faça o push."

---

## 7. Compatibilidade Multi-plataforma

O harness `.agents/` é a fonte de verdade canônica. Para compatibilidade com diferentes plataformas de IA (Windsurf, Cursor, Claude, OpenCode, etc), existe um script de materialização:

**setup-links.ps1** (ou equivalente):
- Materializa links físicos/simbólicos para formatos nativos de cada plataforma
- Gera `.windsurf/`, `.claude/`, `.opencode/` a partir de `.agents/`
- Suporta manifestos leves para outras plataformas (Antigravity, Goose, Hermes, pi)
- Remove `.git` é opcional (via `RemoveGitWhenBootstrappingTemplate`)

**Fluxo:**
```
.agents/ (fonte canônica)
    ↓ setup-links.ps1
.windsurf/ (compatibilidade Windsurf)
.claude/ (compatibilidade Claude)
.opencode/ (compatibilidade OpenCode)
.agents-runtime/ (manifestos leves)
```

---

## 8. Rules (As Heranças do Passado, Ainda Úteis)

Embora o sistema de Skills e Subagentes resolva a maioria dos problemas, as antigas **Rules** (`.cursorrules`, `.windsurf/rules/`) ainda existem.

**Onde as Rules entram hoje?**
- As ferramentas (como Windsurf e Cursor) usam as Rules como gatilhos rápidos (Glob patterns). 
- Exemplo: "Sempre que abrir um arquivo `*.ts`, aplique a regra X".
- Elas ainda são úteis para preferências estilísticas muito granulares que não justificam uma Skill inteira (ex: "sempre use aspas simples no Typescript").

*Nota: Em repositórios SOTA, a tendência é migrar as regras complexas para Skills e manter apenas regras sintáticas simples no sistema de Rules nativo da IDE.*

---

## 9. O Fluxo de Vida (End-to-End)

Quando você pede para a IA "Criar a API de Pagamento":

1. **Discovery Inicial:** A IA lê o `AGENTS.md` (Aprende que não deve inventar requisitos e deve ler o contexto).
2. **Roteamento:** A IA percebe que é uma tarefa de arquitetura inicial. Aciona o subagente `spec-analyst.md` ou `planner.md`.
3. **Planejamento:** O subagente lê `.agents/project/context.md` para ver as diretrizes da stack e elabora os boundaries.
4. **Construção:** O roteamento troca o agente para o `builder.md`.
5. **Invocação de Skills:** O `builder` vê que a tarefa envolve pagamentos. Ele busca em `.agents/skills/` e encontra a skill `stripe-integration`. Ele lê a skill (nível 2) e injeta o conhecimento.
6. **Revisão:** A IA troca para o `reviewer.md` para checar vulnerabilidades, regressões e identificar código morto/deprecado.
7. **Finalização:** A IA sugere o *Commit* usando um *Workflow* predefinido.

---

## 10. Princípios do Harness

O harness `.agents/` segue estes princípios fundamentais:

### Simplicidade > Complexidade
- Se parecer overengineering → está errado
- Criar abstrações só quando necessário
- Código legível > código "enterprise"

### Generalista > Específico
- Skills são agnósticas - definem padrões para TIPOS de projetos
- Informações específicas do projeto ficam em `.agents/project/context.md` e `.agents/project/context-design.md`
- Harness funciona para qualquer projeto, não carrega informações de projetos passados

### Cost Efficiency
- Carregamento progressivo em 3 níveis para skills
- Carregar apenas arquivos relevantes
- Evitar contexto redundante

### Surgical Changes
- Não "melhorar" código adjacente sem motivo
- Cada linha alterada deve rastrear diretamente para o request do usuário
- Quando mudanças criam órfãos, remover apenas o que SUAS mudanças tornaram unused

### Goal-Driven Execution
- Transformar instruções imperativas em objetivos verificáveis
- Definir critérios de sucesso claros
- Critérios frakes exigem clarificação constante

---

## Conclusão: Princípios para Recriar a Estrutura

Para recriar uma estrutura SOTA no seu projeto, siga este roteiro:
1. **Tenha um `AGENTS.md` na raiz** para as leis inegociáveis.
2. **Use `.agents/` como fonte de verdade canônica** - materialize compatibilidade via script.
3. **Divida personas** (spec-analyst, planner, builder, reviewer, devops) de forma simples e pragmática.
4. **Isole conhecimento em Skills** (`.agents/skills/`). Se o conhecimento for longo e específico de uma tecnologia, transforme-o em uma skill com Frontmatter.
5. **Use metadados precisos** (`description` de Skills e Subagentes) para que a IA faça o roteamento correto sem precisar ler o conteúdo todo de antemão.
6. **Mantenha skills generalistas** - informações específicas do projeto ficam em `.agents/project/`.
7. **Use `MEMORY.md`** para fatos emergentes da sessão mantidos pelo agente.
