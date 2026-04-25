# Workflows

Esta pasta contém workflows reutilizáveis do projeto.

## Papel na arquitetura
- `AGENTS.md` na raiz define a orquestração global.
- `.agents/workflows/` contém sequências operacionais reutilizáveis carregadas sob demanda.
- Cada plataforma de AI agent tem seus próprios caminhos para workflows/skills/regras - veja `platform-workflow-paths.md`.

## Diretrizes
- Cada workflow deve ser um arquivo Markdown.
- Workflows devem descrever sequência operacional, não política global.
- Conhecimento técnico especializado deve permanecer em `skills/`, não em workflows.
- Workflows devem ser curtos, executáveis e focados em um objetivo claro.
