---
description: Caminhos onde cada plataforma de AI agent salva workflows, skills e regras
---

# Caminhos de Workflows por Plataforma

Este workflow documenta onde cada plataforma de AI agent salva workflows, skills e regras.

## Windsurf / Codeium

**Workspace (projeto):**
- `.windsurf/workflows/*.md` - workflows do workspace atual
- `.windsurf/skills/*.md` - skills do workspace
- `.windsurf/rules/*.md` - regras do workspace

**Global (usuário):**
- `~/.codeium/windsurf/global_workflows/*.md` - workflows globais disponíveis em todos os workspaces
- `~/.codeium/windsurf/global_skills/*.md` - skills globais

**Slash Commands:**
- Workflows são invocados com `/[workflow-name]`

**Descoberta:**
- Windsurf busca workflows em `.windsurf/workflows/` no diretório atual, subdiretórios e diretórios parentes até a raiz do git
- Workflows globais estão disponíveis em todos os workspaces da máquina

## Codex (OpenAI)

**Workspace (projeto):**
- `AGENTS.md` - instruções do projeto (busca do git root até o diretório atual)
- `AGENTS.override.md` - override de instruções do projeto (tem precedência sobre AGENTS.md)
- `.agents/skills/<name>/SKILL.md` - skills do repositório (escaneado do diretório atual até o repo root)

**Global (usuário):**
- `~/.codex/AGENTS.md` - instruções globais (defaults para todos os repositórios)
- `~/.codex/AGENTS.override.md` - override global (tem precedência sobre AGENTS.md)
- `~/.codex/config.toml` - configuração principal (inclui [[skills.config]] para habilitar/desabilitar skills)
- `~/.agents/skills/` - skills do usuário

**Admin (sistema):**
- `/etc/codex/skills/` - skills administrativas

**Slash Commands:**
- CLI tem slash commands embutidos (invocados com `/command-name`)
- Skills habilitadas aparecem na lista de slash commands

**Descoberta:**
- Codex constrói uma cadeia de instruções na ordem: global → projeto (do root até o diretório atual)
- Usa apenas o primeiro arquivo não-vazio em cada nível (AGENTS.override.md tem precedência sobre AGENTS.md)
- Skills são lidas de múltiplas localizações: repo, user, admin, system
- Suporta symlinks para skill folders
- Skills habilitadas aparecem na lista de slash commands

## Claude

**Workspace (projeto):**
- `.claude/CLAUDE.md` - instruções do projeto (memória)
- `.claude/skills/<name>/SKILL.md` - skills específicas do projeto
- `.claude/commands/*.md` - comandos customizados (slash commands)
- `.claude/agents/*.md` - subagentes
- `.claude/rules/*.md` - regras
- `.claude/.mcp.json` - configuração MCP

**Global (usuário):**
- `~/.claude/` - configurações globais e dados da aplicação

**Slash Commands:**
- CLI tem slash commands embutidos (invocados com `/command-name`)
- Commands customizados em `.claude/commands/*.md` são invocados com `/command-name`

**Descoberta:**
- Claude lê `.claude/` no diretório do projeto
- Não tem conceito de "workflows" específico - usa skills, commands e agents
- Commands customizados em `.claude/commands/*.md` são invocados com `/command-name`

## OpenCode

**Workspace (projeto):**
- `AGENTS.md` na raiz - regras globais do projeto (equivalente a CLAUDE.md)
- `opencode.json` - configuração opcional para referenciar arquivos externos
- `.opencode/commands/*.md` - comandos customizados (slash commands)

**Slash Commands:**
- CLI tem slash commands embutidos (invocados com `/command-name`)
- Custom commands criados como arquivos Markdown em `.opencode/commands/*.md`
- Frontmatter define propriedades (description, agent, model, etc.)

**Descoberta:**
- Usa comando `/init` para criar/atualizar AGENTS.md automaticamente
- Lê AGENTS.md do diretório atual e diretórios parentes
- Custom commands permitem prompts reutilizáveis para tarefas repetitivas

## Antigravity

**Workspace (projeto):**
- `.antigravity/rules.md` - regras do projeto (comportamento do AI)
- `.agent/workflows/` - workflows reutilizáveis (templates de tarefas)

**Global (usuário):**
- `~/.gemini/GEMINI.md` - configuração global para preferências pessoais

**Descoberta:**
- Workflows são acionados com `/commands`
- `.antigravity/rules.md` é carregado automaticamente e sempre ativo

## Goose

**Workspace (projeto):**
- Goose usa "Recipes" em YAML configs para workflows
- Recipes são portáteis, compartilháveis e podem incluir instruções, extensões, parâmetros e subrecipes
- Local exato não especificado na documentação principal - verificar docs de recipes

**Slash Commands:**
- CLI tem slash commands embutidos (invocados com `/command-name`)
- Custom slash commands podem ser criados para executar recipes
- Slash commands suportam tab completion

**Descoberta:**
- Recipes permitem capturar workflows como configs YAML
- Podem ser compartilhados com a equipe e executados em CI
- Slash commands suportam tab completion

## Hermes

**Global (usuário):**
- `~/.hermes/skills/` - skills criadas pelo agente (gerenciadas via tool skill_manage)
- `~/.hermes/config.yaml` - configuração principal
- `~/.hermes/.env` - API keys e segredos
- `~/.hermes/SOUL.md` - identidade primária do agente
- `~/.hermes/memories/` - memória persistente (MEMORY.md, USER.md)
- `~/.hermes/cron/` - jobs agendados

**Slash Commands:**
- Skills instaladas são expostas automaticamente como slash commands dinâmicos
- Built-in commands são case-insensitive
- Quick commands podem ser definidos em `config.yaml` para executar comandos shell instantaneamente
- Type `/` para abrir menu de autocomplete

**Descoberta:**
- Não tem conceito de "workflows" específico - usa skills
- Skills são gerenciadas automaticamente pelo agente
- Skills instaladas se tornam slash commands automaticamente
- Context files como SOUL.md e AGENTS.md são carregados quando presentes

## pi

**Workspace (projeto):**
- `AGENTS.md` - instruções do projeto carregadas do diretório atual e parentes
- `SYSTEM.md` - customiza ou anexa ao system prompt padrão por projeto
- `.omp/commands/*.md` - comandos customizados do projeto (Markdown)
- `.omp/commands/<name>/index.ts` - comandos customizados do projeto (TypeScript)
- `.omp/skills/*/SKILL.md` - skills do projeto
- `.omp/hooks/pre/*.ts`, `.omp/hooks/post/*.ts` - hooks do projeto
- `.omp/tools/*/index.ts` - custom tools do projeto

**Global (usuário):**
- `~/.pi/agent/` - AGENTS.md carregado de parent directories
- `~/.omp/agent/commands/*.md` - comandos customizados globais (Markdown)
- `~/.omp/agent/commands/<name>/index.ts` - comandos customizados globais (TypeScript)
- `~/.omp/agent/skills/*/SKILL.md` - skills globais
- `~/.omp/agent/hooks/pre/*.ts`, `~/.omp/agent/hooks/post/*.ts` - hooks globais
- `~/.omp/agent/tools/*/index.ts` - custom tools globais
- `~/.omp/agent/themes/*.json` - temas customizados
- `~/.omp/agent/config.yml` - configuração principal

**Slash Commands:**
- Custom commands definidos como arquivos Markdown ou TypeScript
- Global: `~/.omp/agent/commands/*.md` ou `~/.omp/agent/commands/<name>/index.ts`
- Projeto: `.omp/commands/*.md` ou `.omp/commands/<name>/index.ts`
- Filename (sem .md) torna-se o nome do comando
- Argument placeholders: $1, $2, ..., $@, $ARGUMENTS
- Skills de outras plataformas são suportadas: `~/.claude/skills/*/`, `~/.codex/skills/*/`

**Descoberta:**
- AGENTS.md é carregado de `~/.pi/agent/`, diretórios parentes e diretório atual
- Usa prompt templates como arquivos Markdown reutilizáveis
- Extensões TypeScript podem injetar contexto dinâmico
- Skills são carregadas on-demand de múltiplas localizações
- Hooks TypeScript podem subscrever eventos de lifecycle

## Resumo Comparativo

| Plataforma | Workflows | Skills | Regras | Global |
|-----------|-----------|--------|--------|--------|
| Windsurf/Codeium | `.windsurf/workflows/*.md` | `.windsurf/skills/*.md` | `.windsurf/rules/*.md` | `~/.codeium/windsurf/` |
| Codex (OpenAI) | N/A | `.agents/skills/*/SKILL.md` | `AGENTS.md`, `AGENTS.override.md` | `~/.codex/` |
| Claude | N/A (usa commands/agents) | `.claude/skills/*/SKILL.md` | `.claude/rules/*.md` | `~/.claude/` |
| OpenCode | N/A | N/A | `AGENTS.md` | N/A |
| Antigravity | `.agent/workflows/` | N/A | `.antigravity/rules.md` | `~/.gemini/GEMINI.md` |
| Goose | Recipes YAML | N/A | N/A | N/A |
| Hermes | N/A (usa skills) | `~/.hermes/skills/` | N/A | `~/.hermes/` |
| pi | N/A (usa templates) | Extensões | `AGENTS.md`, `SYSTEM.md` | `~/.pi/agent/` |
