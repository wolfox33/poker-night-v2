# .agents (Canonical)

Estrutura modular canônica para uso com ferramentas agenticas.

## Estrutura
- `skills/`: skills canônicas (`<skill-name>/SKILL.md`)
- `subagents/`: agentes especializados
- `workflows/`: workflows reutilizáveis
- `project/context.md`: contexto específico do projeto

## Política
- Fonte primária de orquestração: `AGENTS.md` na raiz.
- Fonte canônica modular: `.agents/`.
- `.agents/agents.md` não faz parte do núcleo obrigatório desta arquitetura.
- Para o Windsurf, a descoberta oficial de Skills/Rules/Workflows continua em `.windsurf/`.
- O script `tools/materialize-agent-compat.ps1` materializa compatibilidade a partir de `AGENTS.md` + `.agents/`.
