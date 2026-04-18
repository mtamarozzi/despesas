# Prompt: Aplicar efeito Glassmorphism em projeto web

Aplique o efeito **Glassmorphism moderno** (estilo iOS/Apple) neste projeto, com fundo de orbs coloridos borrados e cards translúcidos com backdrop-blur.

---

## FASE 0 — Análise obrigatória antes de qualquer edição

**NÃO EDITE NENHUM ARQUIVO AINDA.** Primeiro, faça essa análise e me apresente um relatório. Só começa a editar depois da minha aprovação explícita.

### Verifique e me reporte:

1. **Framework**: leia o `package.json` e identifique se é Next.js, Vite, Remix, Astro, CRA, SvelteKit, ou outro. Informe a versão.

2. **Tailwind CSS**: confirme se o projeto usa Tailwind. Se sim, qual versão (v2, v3, v4)? Se **não usa Tailwind**, pare aqui e me informe — este prompt não se aplica direto.

3. **Dark mode**: detecte se há dark mode implementado. Procure por:
   - Classe `.dark` sendo aplicada condicionalmente (no `<html>`, `<body>` ou wrapper).
   - Uso do `next-themes`, `@vueuse/core` `useDark`, ou similar.
   - `data-theme` como atributo.
   - Configuração `darkMode: 'class'` no `tailwind.config`.
   - Se **não tem dark mode**, me avise e pergunte se devo aplicar só no light.

4. **Estrutura**: liste os principais diretórios (`components`, `app`, `pages`, `src`) e identifique o **arquivo de layout raiz** (normalmente `app/layout.tsx`, `pages/_app.tsx`, `src/App.tsx`, `src/routes/+layout.svelte`, etc).

5. **Componentes a alterar**: escaneie os arquivos principais e liste quais componentes receberão o efeito glass:
   - Cards (stats, painéis de dashboard)
   - Modais / dialogs / popups
   - Header / Navbar
   - Sidebar (se houver)
   - Inputs de busca
   - Containers de listas ou kanban
   - Outros wrappers visuais relevantes

6. **Paleta atual**: abra o CSS principal ou `tailwind.config` e identifique as cores dominantes do projeto (primary, accent). Isso vai determinar se os orbs padrão (ciano/âmbar/rosa/violeta) combinam ou se precisam de ajuste.

### 🚨 Red flags — PARE e me consulte se detectar qualquer um:

- ❌ **Projeto não usa Tailwind** (usa CSS Modules, styled-components, Emotion, CSS puro, SCSS). Pergunte se quer que eu adapte a abordagem com CSS equivalente ou se deve parar.
- ❌ **Tailwind v2** (não tem `backdrop-blur-*` por padrão). Diga que precisa upgrade para v3+ ou uma configuração adicional.
- ❌ **Não tem dark mode implementado**. Pergunte se deve aplicar só no light mode, ou se o usuário quer que eu implemente dark mode antes.
- ❌ **Projeto tem identidade visual forte com paleta específica** (ex: fintech azul corporativo, marca com cores definidas). Pergunte se devo adaptar as 4 cores dos orbs à paleta existente antes de aplicar.
- ❌ **Projeto já tem background complexo** (gradientes, imagens, padrões, animações de background). Pergunte se devo remover o existente ou integrar com ele.
- ❌ **Biblioteca de componentes fechada** (Material UI, Chakra UI, Ant Design, Mantine, shadcn/ui com theming próprio). Esses frameworks têm estilos internos que podem conflitar com classes Tailwind de glass. Pergunte como proceder: posso sobrescrever, só aplicar nos wrappers externos, ou vou pular esses componentes?
- ❌ **Mais de 30 componentes a alterar**. Pergunte se devo aplicar em todos ou só nos principais (me sugira top 10-15 e peça priorização).
- ❌ **Projeto usa CSS-in-JS com tokens de tema** (ex: `theme.colors.background`). Pergunte se devo criar novos tokens ou aplicar classes Tailwind em paralelo.
- ❌ **Projeto já tem efeito glassmorphism parcial** em algum componente. Pergunte se devo uniformizar com a paleta padrão do prompt ou manter o estilo existente.

### Formato do relatório esperado

Me entregue algo assim:

```
## Análise do projeto

**Framework**: Next.js 15 (App Router)
**Tailwind**: v4 ✅
**Dark mode**: ✅ (via class .dark aplicada no <html>)
**Arquivo de layout raiz**: app/layout.tsx
**Paleta atual**: neutra (zinc/gray) — orbs padrão devem combinar

**Componentes a alterar** (8):
1. components/Card.tsx
2. components/Modal.tsx
3. components/Navbar.tsx
4. components/SearchInput.tsx
5. ...

**Red flags detectadas**: nenhuma ✅

## Plano de execução

1. Adicionar orbs + wrapper em app/layout.tsx
2. Aplicar glass em Card, Modal, Navbar (nesta ordem)
3. Ajustar SearchInput e botões secundários
4. Validar sintaxe JSX no final

Posso prosseguir? (aguardando aprovação)
```

**NÃO COMECE A EDITAR SEM APROVAÇÃO EXPLÍCITA DO USUÁRIO.**

---

## FASE 1 — Background com orbs coloridos (após aprovação)

No wrapper raiz do app (o `<div>` mais externo do layout principal), adicione uma camada fixa com 4 orbs coloridos borrados:

```tsx
<div className="relative bg-zinc-100 dark:bg-[#1a1625] min-h-screen overflow-hidden">

  {/* --- Background Orbs (camada fixa, fica atrás de tudo) --- */}
  <div className="fixed inset-0 overflow-hidden pointer-events-none -z-0">
    {/* Orb 1 — ciano/teal, topo esquerdo */}
    <div
      className="absolute -top-40 -left-40 w-[600px] h-[600px] rounded-full opacity-60 dark:opacity-60"
      style={{
        background: 'radial-gradient(circle, rgba(34,211,238,0.6) 0%, rgba(34,211,238,0) 70%)',
        filter: 'blur(80px)',
      }}
    />
    {/* Orb 2 — âmbar, centro direito */}
    <div
      className="absolute top-1/3 -right-40 w-[700px] h-[700px] rounded-full opacity-50 dark:opacity-55"
      style={{
        background: 'radial-gradient(circle, rgba(251,146,60,0.55) 0%, rgba(251,146,60,0) 70%)',
        filter: 'blur(100px)',
      }}
    />
    {/* Orb 3 — rosa/magenta, inferior central */}
    <div
      className="absolute -bottom-40 left-1/3 w-[650px] h-[650px] rounded-full opacity-50 dark:opacity-55"
      style={{
        background: 'radial-gradient(circle, rgba(236,72,153,0.5) 0%, rgba(236,72,153,0) 70%)',
        filter: 'blur(90px)',
      }}
    />
    {/* Orb 4 — violeta, diagonal sutil */}
    <div
      className="absolute top-1/2 left-1/4 w-[500px] h-[500px] rounded-full opacity-45 dark:opacity-45"
      style={{
        background: 'radial-gradient(circle, rgba(139,92,246,0.4) 0%, rgba(139,92,246,0) 70%)',
        filter: 'blur(70px)',
      }}
    />
  </div>

  {/* Todo o conteúdo principal fica numa camada acima */}
  <div className="relative z-10">
    {/* ... header, main, etc ... */}
  </div>

</div>
```

**Regras importantes:**

- O wrapper raiz precisa de `relative overflow-hidden` para conter os orbs.
- Os orbs usam `filter: blur()` inline porque Tailwind não tem blurs arbitrários para filter (só para backdrop).
- Os tamanhos (`w-[600px] h-[600px]`) e posições negativas (`-top-40 -left-40`) fazem os orbs vazarem pelas bordas, criando efeito de luz ambiente.
- Todo conteúdo da página deve ficar em `<div className="relative z-10">` para ficar acima dos orbs.
- **NÃO use preto puro (`bg-black`, `#000`) no dark**: engole os orbs. Use `bg-[#1a1625]` (violeta escuro).
- Se o usuário pediu adaptação de paleta na Fase 0, substitua as cores RGB dos orbs mantendo as opacidades.

## FASE 2 — Transformar cards em vidro

Para cada **card, painel, modal, header, nav, input de busca**, substitua o background sólido por glass. A fórmula base é:

```
bg-white/60 dark:bg-white/10
border border-white/40 dark:border-white/15
backdrop-blur-xl
shadow-lg shadow-black/5 dark:shadow-black/40
```

**Valores por contexto:**

| Elemento | Light bg | Dark bg | Border light | Border dark | Blur |
|---|---|---|---|---|---|
| Cards principais (stats, painéis) | `white/60` | `white/10` | `white/40` | `white/15` | `backdrop-blur-xl` |
| Header / nav fixa | `white/40` | `white/10` | `white/40` | `white/15` | `backdrop-blur-2xl` |
| Inputs (search, etc) | `white/40` | `white/10` | `white/40` | `white/15` | `backdrop-blur-md` |
| Cards interativos menores (lista, tarefa) | `white/70` | `white/15` | `white/40` | `white/20` | `backdrop-blur-xl` |
| Modais / overlays | `white/80` | `white/15` | `white/40` | `white/20` | `backdrop-blur-2xl` |
| Containers de agrupamento (colunas kanban) | `white/30` | `white/10` | `white/40` dashed | `white/15` dashed | `backdrop-blur-md` |

**Backdrop de modais (o fundo preto do overlay):**
- Antigo: `bg-black/40 backdrop-blur-sm`
- Novo: `bg-black/50 backdrop-blur-md`

## FASE 3 — Ajustes de texto e contraste

Quando o fundo de botões/abas ativas fica translúcido, o texto precisa ser revisto:

- Abas inativas: text `zinc-600 dark:zinc-300` (não `dark:zinc-400` — fica ilegível sobre vidro).
- Aba ativa (estado selecionado): `bg-white/80 dark:bg-white/20` para destacar.
- Texto dentro de cards: manter as cores originais do projeto (geralmente `zinc-900 dark:white`).

## FASE 4 — Regras Tailwind importantes

- **Opacidades válidas** no Tailwind: `/5`, `/10`, `/15`, `/20`, `/25`, `/30`, `/40`, `/50`, `/60`, `/70`, `/80`, `/90`. **Nunca use `/8`, `/12`, `/35`**, etc — não existem por padrão e não renderizam.
- **Não use `blur-*` do Tailwind em divs com `background`**: o Tailwind `blur-3xl` aplica em elemento filho, não em background. Use `filter: 'blur(80px)'` inline nos orbs.
- **`backdrop-blur-*` só funciona se o elemento tiver `background` translúcido**. Um `backdrop-blur-xl` sobre `bg-white` (opaco) não faz nada visível.
- **Tailwind v4 tem sintaxe ligeiramente diferente para dark mode**. Se for v4, confirme que `dark:` está funcionando no CSS do usuário.

## FASE 5 — Validação

Depois de aplicar tudo:

1. **Verifique sintaticamente** que todas as tags JSX estão fechadas (se você adicionou um `<div>` externo e uma camada `<div className="relative z-10">` interna, precisa fechar ambas).
2. **Conte os delimitadores** dos arquivos principais (`{}`, `()`, `[]`, `<div>/</div>`, `<AnimatePresence>/</AnimatePresence>`) — devem estar balanceados.
3. **Informe ao usuário** que ele deve testar em ambos os modos rodando `npm run dev`.
4. **Diga que se o dark ficar muito escuro**, aumente as opacidades dos cards (`white/10` → `white/15` ou `/20`) e dos orbs (+10-15%).
5. **Diga que se o light ficar com orbs fracos**, aumente as opacidades dos orbs light (regra: mantenha os orbs em ~45-60% em ambos os modos).

## O que NÃO fazer

- Não aplique glass em **botões pequenos** (editar, deletar, fechar) — fica visualmente confuso.
- Não remova as shadows dos cards — elas dão profundidade essencial.
- Não use glass em **ícones coloridos** (ex: badges de prioridade, status) — mantém cores sólidas neles.
- Não troque fonte, paleta de acentos, ou layout — o escopo é SÓ o efeito glass.
- Não use purple gradient on white background — é o cliché AI que estamos evitando.
- Não use preto puro no dark mode.
- Não edite sem antes me mostrar o relatório da Fase 0 e receber aprovação.

## Checklist de entrega

- [ ] Fase 0 (análise) apresentada e aprovada pelo usuário.
- [ ] Red flags resolvidas (ou ausência confirmada).
- [ ] Background do root com 4 orbs + `bg-zinc-100 dark:bg-[#1a1625]` + `relative overflow-hidden`.
- [ ] Wrapper `<div className="relative z-10">` envolvendo todo o conteúdo.
- [ ] Todos os cards/painéis convertidos para glass (conforme lista da Fase 0).
- [ ] Header/nav fixa com `backdrop-blur-2xl`.
- [ ] Modais com `backdrop-blur-2xl` e overlay `bg-black/50 backdrop-blur-md`.
- [ ] Inputs com glass leve.
- [ ] Texto em abas/botões revisado para contraste.
- [ ] Sintaxe JSX validada (tags balanceadas).
- [ ] Usuário orientado a testar em light e dark mode em tela cheia.
