---
name: skill-creator
description: Criar novas skills, modificar e melhorar skills existentes. Use quando o usuário quiser criar uma skill do zero, editar ou otimizar uma skill existente, ou quando precisar iterar em uma skill baseado em feedback.
metadata:
  model: inherit
  version: 1.0.0
  author: Custom Stack
  category: workflow
  complexity: 5
  tags: [skills, creation, iteration]
  compatible_with: [windsurf, opencode, antigravity]
---

# Skill Creator

Skill para criar e iterar em skills do harness `.agents/`.

## Use this skill when

- Usuário pedir para criar uma nova skill
- Usuário quiser modificar ou melhorar uma skill existente
- Precisar iterar em uma skill baseado em feedback ou testes
- Usuário mencionar "skill", "criar skill", "melhorar skill"

## Do not use this skill when

- Tarefa for apenas usar uma skill existente (não criar/modificar)
- For simplesmente executar código sem envolver skills
- Usuário estiver pedindo ajuda com outro tipo de arquivo que não seja skill

## Procedure

### 1. Entender a intenção

Primeiro entenda o que o usuário quer:

- **O que a skill deve fazer?**
- **Quando deve ser acionada?** (quais frases/contexts do usuário)
- **Qual o formato de saída esperado?**
- **Precisa de testes?** Skills com outputs verificáveis (transformações de arquivo, extração de dados, geração de código) beneficiam de testes. Skills com outputs subjetivos (estilo de escrita, design) geralmente não precisam.

Se o usuário já tem um rascunho ou workflow na conversa, extraia os passos, ferramentas usadas, correções feitas e formatos de entrada/saída observados.

### 2. Entrevistar e pesquisar (se necessário)

Pergunte sobre casos de borda, formatos de entrada/saída, arquivos de exemplo, critérios de sucesso e dependências. Não escreva testes até ter isso definido.

Se útil, use MCPs para pesquisa (documentação, skills similares, best practices).

### 3. Escrever o SKILL.md

Baseado na entrevista, preencha:

- **name**: Identificador da skill (kebab-case)
- **description**: Quando acionar + o que faz. Seja específico e inclua contextos de uso. Seja um pouco "pushy" para evitar under-triggering
- **metadata**: Preencha conforme necessário
- **Corpo da skill**: Instruções em markdown

#### Estrutura recomendada do SKILL.md

```markdown
---
name: skill-name
description: Uma linha descrevendo o que esta skill faz e quando usar. Seja específico.
metadata:
  model: inherit
  version: 1.0.0
  author: Custom Stack
  category: # ex: infrastructure / backend / frontend / data / testing / workflow
  complexity: # 1-10
  tags: []
  compatible_with: [windsurf, opencode, antigravity]
---

# SKILL: [Título da Skill]

## Objetivo

O que esta skill resolve e por que existe.

## Use this skill when

- [situação concreta que justifica carregar esta skill]
- [outra situação]

## Do not use this skill when

- [caso que parece similar mas não é — evita carregamento desnecessário]

## Procedure

Passos para executar a skill com sucesso.

### 1. [Passo]

...

### 2. [Passo]

...

## Pitfalls

- [armadilha conhecida e como evitar]
- [variação descoberta durante uso real]

## Verification

Como confirmar que a skill foi aplicada corretamente.

---

> **Skill log** — atualize esta seção sempre que descobrir algo novo durante o uso.
> Não remova entradas antigas; adicione a data.

<!-- ex:
- [2026-04-13] Descoberto que X não funciona com Y — usar Z no lugar
- [2026-04-13] Passo 2 pode ser omitido quando condição W
-->
```

#### Padrões de escrita

- Use forma imperativa nas instruções
- Explique o **porquê** em vez de usar MUST/NEVER em caps lock
- Seja geral e não super-específico para exemplos
- Mantenha SKILL.md sob 500 linhas se possível
- Para arquivos de referência grandes (>300 linhas), inclua índice

### 4. Criar estrutura da skill

Crie a pasta da skill em `.agents/skills/<skill-name>/`:

```
skill-name/
├── SKILL.md (obrigatório)
└── Recursos opcionais
    ├── scripts/    - Código executável para tarefas determinísticas
    ├── references/ - Docs carregados conforme necessário
    └── assets/     - Arquivos usados na saída (templates, etc.)
```

### 5. Testar (se aplicável)

Se a skill tiver outputs objetivamente verificáveis:

- Crie 2-3 casos de teste realistas
- Execute a skill com cada caso
- Verifique se os outputs estão corretos
- Peça feedback do usuário

Se a skill tiver outputs subjetivos, pule testes formais e peça feedback direto do usuário.

### 6. Iterar baseado em feedback

Após testar e receber feedback:

- **Generalize do feedback**: Não faça mudanças overfitted apenas para os exemplos de teste. Pense em como aplicar a lição de forma geral.
- **Mantenha o prompt lean**: Remova partes que não estão agregando valor.
- **Explique o porquê**: Transmita o entendimento do "porquê" nas instruções.
- **Procure trabalho repetido**: Se todos os casos de teste resultaram em scripts similares, considere incluir esse script em `scripts/`.

Repita até:
- Usuário estar satisfeito
- Feedback ser todo positivo
- Não estar fazendo progresso significativo

## Pitfalls

- **Overfitting**: Não faça a skill funcionar apenas para os exemplos de teste. Ela deve ser geral.
- **MUST/NEVER excessivo**: Prefira explicar o raciocínio em vez de ser super-rígido.
- **Descrição fraca**: Seja específico e "pushy" na description para evitar under-triggering.
- **SKILL.md muito longo**: Se passar de 500 linhas, considere mover conteúdo para `references/`.

## Verification

- Skill está em `.agents/skills/<skill-name>/SKILL.md`
- Frontmatter tem name e description preenchidos
- Description explica quando usar + o que faz
- Instruções são claras e imperativas
- Se aplicável, testes foram executados e passaram

---

> **Skill log**
> - [2026-04-24] Skill criada baseada em skill-creator original, simplificada para harness .agents/
