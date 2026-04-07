# Dashboard de Estudos (Template Sem Dados)

Template executável com `frontend + backend`, sem dados pessoais, pronto para organizar estudos e simulados.

## Onboarding (primeiro uso)
1. Defina o edital que você quer atacar.
2. Ajuste `plano-estudos-checklist.md` para refletir esse edital.
3. Envie seu primeiro simulado para iniciar a análise histórica.

Sem edital definido, os relatórios de foco ficam genéricos.

## Workflow do projeto
Para cada novo simulado, o usuário deve fornecer:
- Prova do simulado (bruto)
- Gabarito oficial do simulado
- Respostas marcadas pelo usuário

Com isso, o agente deve:
1. Corrigir o resultado e atualizar `backend/data.json`.
2. Atualizar os `.md` de acompanhamento:
   - `diario-estudos-23-03-a-26-04.md`
   - `padroes-erro-vicios.md`
   - `respostas-minha.md`
   - `roteiro-estudo-etapas.md`
   - `plano-estudos-checklist.md` (quando houver consolidação)
3. Gerar foco de estudo da semana com base nos erros recorrentes.

## Regra importante
Quanto mais simulados registrados, melhor a detecção de:
- padrões de erro
- vícios de prova
- oscilação de desempenho
- tópicos de maior retorno para estudo

## Rodar localmente
1. Backend
   - `cd backend`
   - `npm install`
   - `npm run dev`
2. Frontend
   - abrir `http://localhost:1455`

## Estrutura zerada
- `backend/data.json` inicia vazio
- `simulados/brutos/` inicia sem provas
- `.md` iniciam em modo template

## Agente
Use `.agent/AGENTE_INSTRUCOES.md` como base para instruir o agente na orquestração dos arquivos.
