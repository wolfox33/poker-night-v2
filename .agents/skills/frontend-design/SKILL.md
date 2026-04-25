---
name: frontend-design
description: Skill generalista de design frontend. Padrões de layout, motion, acessibilidade, responsividade e anti-patterns. Usa Google Design.md como formato padrão para documentação de design systems. Design system específico do projeto deve estar em `.agents/project/context-design.md`.
metadata:
  model: inherit
  version: 1.0.0
  author: Custom Stack
  category: development
  complexity: 5
  tags: [frontend, design, ui, ux, tailwind, shadcn, accessibility, responsive]
  compatible_with: [antigravity, windsurf, opencode]
---

# Frontend Design — Generalista

Skill generalista de design frontend. Define padrões de layout, motion, acessibilidade, responsividade e componentes com Tailwind CSS v4, shadcn/ui e Next.js 16. Design system específico do projeto deve ser definido em `.agents/project/context-design.md`.

## 🎯 Objetivo

Garantir que toda interface gerada:
- Siga o design system do projeto (se definido em context-design.md)
- Use **Tailwind CSS v4** com CSS variables e design tokens
- Aproveite **shadcn/ui** como base de componentes
- Seja **acessível** (WCAG AA mínimo)
- Seja **responsiva** (mobile-first: 375px → 768px → 1024px → 1440px)
- Tenha **personalidade visual** — evite parecer genérico/AI slop

## Use this skill when

- Criando qualquer componente, página ou layout
- Definindo padrões visuais para um projeto
- Documentando design system em formato DESIGN.md
- Validando tokens de design via CLI
- Revisando ou melhorando UI existente
- Implementando landing pages, dashboards, formulários

## Do not use this skill when

- Trabalhando exclusivamente no backend/API
- Configurando infraestrutura ou deploy
- Implementando lógica de negócio sem UI

## Instructions

1. **Consultar context-design.md** se disponível para design system específico
2. **Usar padrões generalistas** abaixo se não houver design system específico
3. **Usar Tailwind v4 CSS variables** — nunca hardcodar cores
4. **Estender shadcn/ui** — customizar, não recriar do zero
5. **Validar acessibilidade** — contraste, focus states, aria labels
6. **Testar responsividade** — mobile-first, breakpoints definidos
7. **Verificar checklist** antes de entregar qualquer componente

## Safety

- **NUNCA** usar cores fora da paleta do projeto sem justificativa
- **NUNCA** remover focus states ou indicadores de acessibilidade
- **NUNCA** usar `dangerouslySetInnerHTML` sem sanitização
- **SEMPRE** respeitar `prefers-reduced-motion` em animações
- **SEMPRE** manter contraste mínimo 4.5:1 para texto
- **SEMPRE** usar `cursor-pointer` em elementos clicáveis

---

## 📋 Google Design.md — Formato Padrão

### O que é

Formato estruturado que combina tokens legíveis por máquina (YAML frontmatter) com rationale legível por humanos (markdown). Útil para:
- Documentação de design systems compartilháveis entre agentes
- Validação automática via CLI (`npx @google/design.md lint`)
- Exportação para outros formatos (Tailwind, tokens.json, Figma)
- Controle de versão de mudanças de design

### Quando usar

**Criar DESIGN.md quando:**
- Projeto tem design system definido e precisa ser documentado
- Precisa validar tokens automaticamente (contrast-ratio, referências quebradas)
- Precisa exportar para outras ferramentas (Figma, Tailwind theme)
- Precisa versionar mudanças de design com diff

**Não criar DESIGN.md quando:**
- Projeto não tem design system definido
- Design é ad-hoc/evolutivo sem tokens estruturados
- Prefere documentação informal

### Estrutura do DESIGN.md

```yaml
---
version: alpha
name: [Nome do Design System]
description: [Descrição]
colors:
  primary: "#HEX"
  secondary: "#HEX"
  [outros tokens]
typography:
  h1:
    fontFamily: [Font]
    fontSize: [Tamanho]
    [outras propriedades]
rounded:
  sm: 4px
  md: 8px
spacing:
  xs: 4px
  sm: 8px
components:
  [component-name]:
    backgroundColor: "{colors.primary}"
    [outras propriedades]
---

## Overview
[Rationale do design system]

## Colors
[Explicação das cores e quando usar]

## Typography
[Explicação da tipografia]
```

### Ferramentas CLI

```bash
# Instalar
npm install @google/design.md

# Lint — validar DESIGN.md
npx @google/design.md lint DESIGN.md

# Diff — comparar versões
npx @google/design.md diff DESIGN.md DESIGN-v2.md

# Export — converter para Tailwind/tokens.json
npx @google/design.md export --format tailwind DESIGN.md > tailwind.theme.json

# Spec — output da especificação
npx @google/design.md spec
```

---

## 🎨 Padrões Generalistas

### Cores

Defina paleta de cores em DESIGN.md ou context-design.md. Padrões gerais:
- Usar escala de cores com primary, secondary, accent, neutral
- Garantir contraste WCAG AA mínimo (4.5:1 para texto)
- Definir semantic aliases: background, foreground, muted, border, destructive, success, warning

### Tipografia

Defina fontes em DESIGN.md ou context-design.md. Padrões gerais:
- Font heading para títulos (h1-h6)
- Font body para texto corrido
- Escala tipográfica consistente (ex: 12px, 14px, 16px, 18px, 24px, 30px, 36px, 48px)
- Line height apropriado (1.2-1.6 para legibilidade)

### Espaçamento

Usar escala de 4px (Tailwind default):
- `gap-1` / `p-1`: 4px — espaço mínimo
- `gap-2` / `p-2`: 8px — padding compacto
- `gap-3` / `p-3`: 12px — inputs compactos
- `gap-4` / `p-4`: 16px — padrão
- `gap-6` / `p-6`: 24px — seções internas
- `gap-8` / `p-8`: 32px — entre seções
- `gap-12` / `p-12`: 48px — blocos maiores
- `gap-16` / `p-16`: 64px — hero sections

### Border Radius

| Uso | Valor padrão |
|-----|-------------|
| **Botões** | 8px (`rounded-lg`) |
| **Cards** | 12px (`rounded-xl`) |
| **Inputs** | 8px (`rounded-lg`) |
| **Modals** | 16px (`rounded-2xl`) |
| **Avatares** | full (`rounded-full`) |
| **Badges** | full (`rounded-full`) |

### Sombras

```css
/* Exemplo de escala de sombras */
--shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
--shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.07);
--shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.08);
```

---

## 🧩 Componentes — Padrões shadcn/ui

### Princípio

Usar shadcn/ui como base e **customizar via CSS variables** do Tailwind v4. Nunca recriar componentes que o shadcn já oferece.

### Botão Primário (CTA)

```tsx
<Button className="bg-primary text-primary-foreground hover:bg-primary/90 transition-colors duration-200 cursor-pointer rounded-lg px-6 py-3 font-heading font-bold">
  CTA Principal
</Button>
```

### Botão Secundário

```tsx
<Button variant="outline" className="border-border text-foreground hover:bg-muted transition-colors duration-200 cursor-pointer rounded-lg">
  CTA Secundário
</Button>
```

### Card

```tsx
<Card className="bg-muted/50 border-border rounded-xl shadow-sm hover:shadow-md transition-shadow duration-200">
  <CardHeader>
    <CardTitle className="font-heading font-bold text-foreground">
      Título
    </CardTitle>
    <CardDescription className="text-muted-foreground">
      Descrição do card
    </CardDescription>
  </CardHeader>
  <CardContent>
    {/* conteúdo */}
  </CardContent>
</Card>
```

### Input

```tsx
<Input
  className="border-border bg-background text-foreground placeholder:text-muted-foreground/60 focus:ring-ring focus:border-ring rounded-lg"
  placeholder="Digite aqui..."
/>
```

### Badge

```tsx
<Badge className="bg-muted text-foreground font-body text-xs rounded-full px-3 py-1">
  Badge
</Badge>
```

### Hierarquia de componentes shadcn recomendados

| Componente | Quando usar |
|------------|-------------|
| `Button` | Ações primárias e secundárias |
| `Card` | Containers de conteúdo |
| `Dialog` | Modais de confirmação, formulários |
| `Sheet` | Painéis laterais (mobile nav, filtros) |
| `Tabs` | Navegação entre seções relacionadas |
| `Table` | Dados tabulares |
| `Form` + `Input` | Formulários com validação |
| `Toast` / `Sonner` | Notificações e feedback |
| `Skeleton` | Loading states |
| `Avatar` | Fotos de perfil |
| `DropdownMenu` | Menus contextuais |
| `Command` | Paleta de comandos / search |
| `Tooltip` | Informações adicionais on hover |

---

## 🎭 Design Thinking

Antes de implementar qualquer interface, responder:

1. **Propósito**: Que problema esta interface resolve? Quem usa?
2. **Tom**: Definido no design system do projeto (context-design.md)
3. **Diferencial**: O que torna esta tela memorável? Qual é o elemento que o usuário vai lembrar?
4. **Restrições**: Performance, acessibilidade, responsividade

### Direção Estética

Consulte context-design.md para direção estética específica do projeto. Padrões gerais:
- **Estilo**: Consistente com identidade do projeto
- **Layout**: Limpo, generoso em whitespace, hierarquia clara
- **Atmosfera**: Definida pelo branding do projeto
- **Movimento**: Sutil e funcional — transições suaves, sem exagero
- **Ícones**: Lucide React (consistente, clean) — nunca emojis como ícones
- **Imagens**: Consistentes com tom e estilo do projeto

---

## 📐 Layout Patterns

### Container padrão

```tsx
<div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
  {children}
</div>
```

### Grid responsivo

```tsx
{/* 1 col mobile → 2 cols tablet → 3 cols desktop */}
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
  {items.map(item => <Card key={item.id} />)}
</div>
```

### Hero Section

```tsx
<section className="bg-background py-16 lg:py-24">
  <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
    <div className="max-w-3xl">
      <h1 className="text-4xl lg:text-5xl font-heading font-bold text-foreground leading-tight">
        Título principal do hero
      </h1>
      <p className="mt-6 text-lg text-muted-foreground leading-relaxed">
        Descrição clara e direta do valor entregue.
      </p>
      <div className="mt-8 flex flex-col sm:flex-row gap-4">
        <Button className="bg-primary text-primary-foreground hover:bg-primary/90">
          CTA Primário
        </Button>
        <Button variant="outline" className="border-border text-foreground hover:bg-muted">
          CTA Secundário
        </Button>
      </div>
    </div>
  </div>
</section>
```

### Dashboard Layout

```tsx
<div className="flex h-screen bg-background">
  {/* Sidebar */}
  <aside className="hidden lg:flex w-64 flex-col border-r border-border bg-muted/30">
    <nav className="flex-1 p-4 space-y-1">
      {/* nav items */}
    </nav>
  </aside>

  {/* Main content */}
  <main className="flex-1 overflow-y-auto">
    <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm border-b border-border px-6 py-4">
      {/* top bar */}
    </header>
    <div className="p-6">
      {children}
    </div>
  </main>
</div>
```

### Seção com fundo diferenciado

```tsx
<section className="bg-muted/40 py-12 lg:py-16">
  <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
    {/* conteúdo com fundo diferenciado */}
  </div>
</section>
```

---

## ✨ Motion & Interactions

### Princípios

- **Funcional**: Animações devem comunicar estado, não decorar
- **Sutil**: Transições de 150-300ms, easing natural
- **Respeitosa**: Sempre respeitar `prefers-reduced-motion`

### Transições padrão

```css
/* Aplicar globalmente via Tailwind */
.transition-default {
  @apply transition-all duration-200 ease-in-out;
}
```

| Interação | Duração | Propriedade |
|-----------|---------|-------------|
| **Hover em botão** | 200ms | `background-color`, `color` |
| **Hover em card** | 200ms | `box-shadow`, `transform` |
| **Focus em input** | 150ms | `border-color`, `ring` |
| **Abertura de modal** | 300ms | `opacity`, `transform` |
| **Toast/notification** | 200ms | `opacity`, `translateY` |

### Card hover com elevação

```tsx
<Card className="shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
```

### Staggered reveal (page load)

```tsx
// Usar com framer-motion ou CSS animation-delay
<div className="space-y-4">
  {items.map((item, i) => (
    <div
      key={item.id}
      className="animate-fade-in-up"
      style={{ animationDelay: `${i * 100}ms` }}
    >
      {/* content */}
    </div>
  ))}
</div>
```

```css
@keyframes fade-in-up {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.animate-fade-in-up {
  animation: fade-in-up 0.4s ease-out forwards;
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .animate-fade-in-up {
    animation: none;
    opacity: 1;
  }
}
```

---

## ♿ Acessibilidade

### Requisitos mínimos (WCAG AA)

| Critério | Requisito | Status Bagual |
|----------|-----------|---------------|
| **Contraste texto** | 4.5:1 mínimo | ✅ Smoky Black/Floral White = 18.5:1 |
| **Contraste texto secundário** | 4.5:1 mínimo | ✅ Olive Drab/Floral White = 5.8:1 |
| **Focus visible** | Indicador visível em todos os interativos | Implementar |
| **Keyboard nav** | Tab order lógico, Enter/Space ativam | Implementar |
| **Screen reader** | Labels, roles, aria-* corretos | Implementar |
| **Reduced motion** | Respeitar preferência do sistema | Implementar |

### Focus ring padrão

```css
/* globals.css */
*:focus-visible {
  outline: 2px solid var(--color-olive-drab);
  outline-offset: 2px;
  border-radius: 4px;
}
```

### Checklist por componente

- [ ] `aria-label` em botões com apenas ícone
- [ ] `role` correto em elementos interativos customizados
- [ ] `aria-expanded` em accordions/dropdowns
- [ ] `aria-live="polite"` em regiões que atualizam dinamicamente
- [ ] Labels associados a todos os inputs (`htmlFor`)
- [ ] Alt text descritivo em imagens (nunca vazio exceto decorativas)

---

## 📱 Responsividade

### Breakpoints (Tailwind v4 default)

| Breakpoint | Largura | Dispositivo |
|------------|---------|-------------|
| **Default** | 0-639px | Mobile |
| **sm** | 640px+ | Mobile landscape |
| **md** | 768px+ | Tablet |
| **lg** | 1024px+ | Desktop |
| **xl** | 1280px+ | Desktop wide |
| **2xl** | 1536px+ | Desktop ultra-wide |

### Testar em

- **375px** — iPhone SE / mobile mínimo
- **768px** — iPad / tablet
- **1024px** — Desktop padrão
- **1440px** — Desktop wide

### Padrões responsivos

```tsx
{/* Texto responsivo */}
<h1 className="text-2xl sm:text-3xl lg:text-4xl xl:text-5xl font-heading font-bold">

{/* Grid responsivo */}
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 lg:gap-6">

{/* Padding responsivo */}
<section className="px-4 sm:px-6 lg:px-8 py-8 lg:py-16">

{/* Sidebar: hidden mobile, visible desktop */}
<aside className="hidden lg:block w-64">

{/* Mobile menu: visible mobile, hidden desktop */}
<Sheet>
  <SheetTrigger className="lg:hidden">
    <Menu className="h-6 w-6" />
  </SheetTrigger>
  <SheetContent side="left">
    {/* mobile nav */}
  </SheetContent>
</Sheet>
```

---

## 🚫 Anti-Patterns — O que NUNCA fazer

### Visual

- ❌ **Cores fora da paleta do projeto** sem justificativa documentada
- ❌ **Gradientes roxo/rosa AI** — clichê de "feito por AI"
- ❌ **Fontes genéricas** (system-ui, sans-serif) sem fallback definido
- ❌ **Emojis como ícones** — usar Lucide React (SVG)
- ❌ **Sombras exageradas** ou efeitos 3D desnecessários

### UX

- ❌ **Sem loading states** — sempre usar Skeleton ou Spinner
- ❌ **Sem error states** — sempre mostrar feedback de erro
- ❌ **Sem empty states** — sempre ter UI para "nenhum resultado"
- ❌ **Botões sem hover/focus** — todo interativo precisa de feedback
- ❌ **Formulários sem validação visual** — mostrar erros inline
- ❌ **Scroll infinito sem indicador** — mostrar "carregando mais..."
- ❌ **Modais sem forma de fechar** — sempre ter X ou Esc

### Código

- ❌ **Inline styles** — usar classes Tailwind
- ❌ **Cores hardcoded** — usar CSS variables/tokens
- ❌ **`!important`** — resolver especificidade corretamente
- ❌ **Divs clicáveis** sem `role="button"` e `tabIndex={0}`
- ❌ **Imagens sem dimensões** — sempre definir width/height ou aspect-ratio
- ❌ **Fontes sem `display: swap`** — evitar FOIT

---

## ✅ Pre-Delivery Checklist

Antes de entregar qualquer componente ou página, verificar:

### Visual
- [ ] Cores seguem a paleta do projeto (definida em context-design.md)
- [ ] Tipografia usa fontes definidas no design system
- [ ] Espaçamento segue escala de 4px do Tailwind
- [ ] Border radius consistente
- [ ] Sombras usam tokens definidos (sm, md, lg)

### Interação
- [ ] `cursor-pointer` em todos os elementos clicáveis
- [ ] Hover states com transição suave (150-300ms)
- [ ] Focus states visíveis para navegação por teclado
- [ ] `prefers-reduced-motion` respeitado em animações

### Acessibilidade
- [ ] Contraste de texto ≥ 4.5:1
- [ ] Todos os inputs têm labels associados
- [ ] Botões com ícone têm `aria-label`
- [ ] Imagens têm alt text descritivo
- [ ] Tab order lógico e funcional

### Responsividade
- [ ] Funciona em 375px (mobile mínimo)
- [ ] Funciona em 768px (tablet)
- [ ] Funciona em 1024px (desktop)
- [ ] Funciona em 1440px (desktop wide)
- [ ] Texto não transborda em nenhum breakpoint

### Performance
- [ ] Fontes carregadas via `next/font` (não CDN externo em produção)
- [ ] Imagens usando `next/image` com dimensões definidas
- [ ] Sem CSS não utilizado
- [ ] Componentes pesados com `dynamic()` ou lazy loading

### Código
- [ ] Sem emojis como ícones (usar Lucide React SVG)
- [ ] Sem cores hardcoded (usar tokens Tailwind ou do design system)
- [ ] Sem inline styles
- [ ] Componentes seguem padrão shadcn/ui

---

## 🗂️ Estrutura de Arquivos

```
src/
├── app/
│   ├── globals.css              # @theme com tokens Bagual
│   ├── layout.tsx               # Fonts (Ubuntu, Open Sans), body classes
│   └── (pages)/
├── components/
│   ├── ui/                      # shadcn/ui components (gerados via CLI)
│   │   ├── button.tsx
│   │   ├── card.tsx
│   │   ├── input.tsx
│   │   └── ...
│   ├── layout/
│   │   ├── Header.tsx
│   │   ├── Sidebar.tsx
│   │   ├── Footer.tsx
│   │   └── Container.tsx
│   └── shared/
│       ├── Logo.tsx
│       ├── EmptyState.tsx
│       ├── LoadingSkeleton.tsx
│       └── ErrorBoundary.tsx
└── features/
    └── [feature]/
        └── components/          # Componentes específicos da feature
```

---

## 📖 Resources

- [Google Design.md GitHub](https://github.com/google-labs-code/design.md)
- [Google Design.md Docs](https://stitch.withgoogle.com/docs/design-md/overview)
- [Design Token Community Group Spec](https://www.designtokens.org/tr/2025.10/format/)
- [Tailwind CSS v4 Docs](https://tailwindcss.com/docs)
- [shadcn/ui Components](https://ui.shadcn.com)
- [Lucide Icons](https://lucide.dev)
- [WCAG 2.1 AA Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
- [WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/)

## Example Interactions

- "Criar landing page seguindo o design system do projeto"
- "Documentar design system em formato DESIGN.md"
- "Validar DESIGN.md via CLI"
- "Implementar dashboard com sidebar e cards"
- "Criar formulário de login seguindo o design system"
- "Adicionar dark mode ao design system"
- "Revisar acessibilidade deste componente"
- "Criar componente de pricing table"
- "Implementar empty state para lista sem itens"
- "Criar hero section com CTA"

## Behavioral Traits

- Consulta context-design.md antes de qualquer decisão visual
- Prioriza legibilidade e hierarquia visual clara
- Usa shadcn/ui como base, customiza via tokens — nunca recria
- Prefere simplicidade refinada a complexidade decorativa
- Valida acessibilidade em toda entrega
- Sugere melhorias visuais quando identifica anti-patterns
- Mantém consistência entre páginas e componentes
