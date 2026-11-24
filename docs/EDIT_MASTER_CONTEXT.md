# Edit Master — Contexto de desenvolvimento

> Documento de continuidade do projeto. Atualize este arquivo quando decisões, escopo, estado técnico ou prioridades mudarem.
>
> **Regra importante:** este documento é um resumo operacional, não substitui o código, os testes, os commits nem a verificação do GitHub Actions. Antes de continuar uma tarefa, confira o estado atual da branch e os arquivos relevantes.

## Repositório e branch de trabalho

- Repositório: https://github.com/Kbytetheprogrammer/Edit_Master
- Branch ativa de desenvolvimento 1.0: `v1.0-development`
- Aplicativo: Edit Master
- Versão de trabalho configurada no projeto: 1.0.0
- Tecnologias principais: Tauri 2, React, JavaScript, Rust, FFmpeg/FFprobe, Whisper.cpp e GitHub Actions.
- Alvo inicial de distribuição: Windows, instalador NSIS em um único `.exe`.

## Como trabalhar com o responsável pelo projeto

- O responsável quer receber **um único candidato integrado da versão 1.0** para testar, não instaladores intermediários a cada pequena alteração.
- Implementar e integrar as funcionalidades em commits menores é aceitável; não solicitar que ele instale e teste cada build intermediário.
- Antes de chamar uma versão de estável/oficial, executar testes automatizados, revisar o código, validar o pipeline e verificar o instalador tanto quanto o ambiente permitir.
- Ser transparente: CI verde não equivale a teste manual da interface e do aplicativo no Windows. Não afirmar que o app foi aberto ou testado manualmente se isso não aconteceu.
- O responsável pretende testar o candidato 1.0 integrado uma vez. Corrigir os problemas encontrados antes de publicar a versão oficial estável.
- Conversa em português brasileiro, tom direto e informal. Não exagerar promessas nem declarar recursos prontos sem evidência.

## Objetivo da versão 1.0

Entregar uma versão Windows integrada, utilizável e confiável, priorizando o funcionamento correto das funções essenciais em vez de uma lista extensa de recursos apenas aparentes.

Escopo planejado para 1.0:

1. Edição de vídeo e timeline, importação de mídia, edição básica e exportação MP4 com FFmpeg.
2. FFmpeg e FFprobe incluídos no instalador Windows para exportação e validação do arquivo.
3. Legendas locais com Whisper.cpp e um modelo multilíngue pequeno incluído para uso inicial; modelos maiores podem ser opcionais.
4. Stock Media/Media Hub com integrações para Pexels, Pixabay e Freesound, respeitando termos, licenças e credenciais dos provedores.
5. Publicação no YouTube, sujeita à configuração OAuth e à API do Google pelo usuário.
6. Interface traduzida para português, inglês e espanhol.
7. Temas visuais consistentes em toda a interface.
8. Central de ajuda.
9. Atualizações automáticas via GitHub **somente na versão oficial 1.0**; builds de desenvolvimento/beta não devem oferecer atualização automática como se fossem releases oficiais.
10. Armazenamento de mídia em outra unidade/pasta (por exemplo, aplicativo no SSD e arquivos de vídeo no HD), preservando os originais.
11. Instalação e desinstalação Windows confiáveis, com instalador NSIS único.
12. Revisão de estabilidade, segurança, desempenho, licenças e empacotamento.

## Fora do escopo imediato — versão 1.1

Não antecipar estes itens para a 1.0 sem nova decisão explícita:

- Seleção entre Vulkan e OpenGL.
- Limitador rígido de RAM.
- Otimizações mais agressivas.
- Personalização avançada, incluindo escolha da fonte padrão e papel de parede.
- Reformulação das configurações em categorias independentes, inspirada em ambientes Linux.

### Ideia aprovada para as configurações da 1.1

O responsável gostou da proposta de uma tela de configurações organizada como em ambientes Linux, com barra lateral de categorias, busca, páginas independentes, prévia ao vivo, salvamento automático e restauração dos padrões.

Categorias sugeridas:
- Aparência: temas, cores, modo claro/escuro.
- Personalização: fontes, papel de parede, transparência.
- Editor: timeline, pré-visualização e comportamento.
- Desempenho: memória e opções gráficas.
- Armazenamento: pastas, cache e mídia.
- Áudio e vídeo: dispositivos e qualidade.
- Idioma.
- Atualizações.
- Privacidade.
- Sobre.

Isso é planejamento para 1.1, não funcionalidade já implementada.

## Implementações e decisões técnicas registradas

### Exportação e sincronização de velocidade

Foram feitos commits para:
- Criar uma cadeia FFmpeg `atempo` válida para velocidades entre 0,25x e 2,0x.
- Separar duração original da mídia e duração resultante após aplicar velocidade.
- Ajustar trim, áudio, fades e duração final para acompanhar a velocidade.
- Corrigir associação de faixas de áudio quando existem clipes silenciados.

Commits registrados:
- `722cdd96d0d625b234b1495bdfd7ef41383b560a` — Fix export playback speed and audio synchronization
- `7bfb43ac3c29b063a68d127d1c3f97331d0f4863` — Correct source trimming for speed-adjusted audio tracks

**Atenção:** revisar o código atual em `src-tauri/src/lib.rs` e executar testes antes de considerar a sincronização validada.

### Integridade de exportação

Foi adicionada verificação posterior com FFprobe para conferir metadados e duração do MP4, rejeitando divergências superiores à tolerância definida no código (2% ou 0,5 s, conforme o maior limite).

Commit registrado:
- `b2faa2dae8e3fc6948f93d3802c9dbe50bf07a92` — Verify rendered MP4 integrity and duration with FFprobe

Isso valida aspectos do arquivo exportado, mas não garante que todos os elementos visuais/sonoros do projeto sejam reproduzidos fielmente.

### Validação dos limites de corte

Foram adicionadas validações para impedir início negativo e fim além da duração da mídia, além de testes dos limites válidos.

Commits registrados:
- `51727683518533d72b1ee5db59979a0d6600daf5` — Validate export source trim boundaries
- `ed14ceee649353bfa3b97faa69ef47d90b089d3c` — Test invalid export trim ranges

O estado desses workflows precisa ser consultado no GitHub Actions; não presumir que estão verdes.

### Guardrails de exportação

Em `src/exportModel.js`, `src/App.jsx` e `src/exportModel.test.js`, foram adicionadas verificações para impedir exportações silenciosamente incorretas quando o projeto usa recursos que o renderizador ainda não reproduz, como certos textos/legendas, transformações, keyframes e efeitos.

Commits:
- `f37a5b0bdadaacea2545698c75ff8340f25578aa`
- `984c4db2c86e7814a4d51df0f58135ee140eb5db`
- `de9aac72774753c0c1cecaabc31fe056ff34e085`

**Importante:** esses guardrails não implementam esses recursos no renderizador. Eles apenas bloqueiam exportações que poderiam sair diferentes da prévia. A paridade entre prévia e renderização continua sendo uma prioridade.

### Traduções

Foi ampliada a cobertura de inglês e espanhol em `src/i18n.js`, com testes em `src/i18n.test.js`.

Commits:
- `d7004e5d45d27cc1777f5c74be11af39b4a6d406`
- `395a8ce121c4834cf17fc9720966fe14a6f63c06`

Ainda é necessário auditar a cobertura real de textos dinâmicos e JSX, e verificar as três línguas visualmente em toda a interface.

### Armazenamento externo de mídia

Foi implementado um fluxo para copiar mídia para uma pasta escolhida, inclusive em outra unidade, mantendo os arquivos originais. Novas importações e downloads do Stock Hub podem usar a pasta configurada; também há fluxo para copiar mídia já importada e atualizar referências do projeto.

Commits relacionados registrados:
- `355b2335f65c2544e2c83eeb53f5265299ad2ca8`
- `9beb56a3b2a6b4cb10bafc9122b0402b13b20a97`

Pontos ainda a revisar:
- Semântica do `defaultPath` no diálogo de salvar projeto.
- Consistência entre todos os caminhos de importação.
- Estado/URLs após copiar mídia já importada.
- Recuperação/relocalização quando a unidade externa estiver desconectada ou a letra mudar.
- Nunca apagar os originais automaticamente.

### Tela preta / regressão anterior

Uma build beta abriu com tela preta. Foi encontrada uma possível causa em `LocalizedTree`, no arquivo `src/i18n.js`, que podia remover props React ao clonar elementos. Foi feita uma correção para preservar props.

Commit:
- `1fdd277a5f33b5150f297188965307738d0006ec`

A correção passou no CI, mas o responsável relatou que a beta continuou preta. Depois, ele removeu a beta e reinstalou uma Alpha Stable 1.0 que abriu normalmente.

**Não declarar a tela preta resolvida.** Comparar as alterações posteriores com essa baseline conhecida como funcional e testar o arranque real no Windows.

## Limitações conhecidas do renderizador que exigem atenção

O renderizador FFmpeg atual não deve ser descrito como equivalente completo à prévia. As limitações registradas incluem:
- Composição de overlays e transformações.
- Textos e títulos.
- Legendas.
- Keyframes.
- Transições e certos efeitos.
- Posicionamento arbitrário de clipes de áudio e mixagem em camadas.

A lógica atual concatena clipes visuais em sequência. O áudio adicional tem limitações de posicionamento/mixagem, conforme comentários no código. Inspecionar o código atual antes de assumir que qualquer limitação foi resolvida.

## Instalador, dependências e segurança — revisão obrigatória

- Confirmar que FFmpeg, FFprobe, Whisper.cpp e o modelo pequeno são realmente empacotados no instalador.
- Auditar o fluxo NSIS, registro do desinstalador e remoção sem apagar projetos/arquivos pessoais do usuário.
- Verificar URLs e versões fixas dos binários baixados no CI; evitar dependência de releases mutáveis `latest` sem hashes/verificação.
- Auditar licenças do FFmpeg (incluindo build GPL), Whisper.cpp e modelo distribuído.
- Não prometer ausência de avisos do SmartScreen: não há assinatura Authenticode confirmada.
- Chaves privadas de assinatura devem ficar em GitHub Actions Secrets. Nunca pedir ao usuário para enviar uma chave privada no chat.
- Revisar armazenamento seguro de API keys e OAuth.
- Atualizador automático deve ser ativado apenas no release oficial, com verificação de integridade/assinatura apropriada.

## Próximas prioridades sugeridas

1. Consultar o estado dos workflows mais recentes na branch `v1.0-development` e corrigir falhas.
2. Revisar cuidadosamente o código de exportação Rust/FFmpeg, incluindo velocidade, trim, áudio, duração e erros.
3. Melhorar paridade entre prévia e renderização; implementar recursos essenciais ou bloquear claramente o que ainda não é suportado.
4. Auditar armazenamento externo e recuperação de mídia offline.
5. Auditar traduções, temas e Central de Ajuda.
6. Revisar instalação, desinstalação e empacotamento dos recursos.
7. Fazer auditoria de segurança, dependências e licenças.
8. Gerar um único candidato integrado 1.0 para o responsável testar.
9. Corrigir os problemas encontrados no teste do candidato.
10. Só então publicar como 1.0 oficial estável e habilitar o atualizador GitHub.

## Critério para declarar 1.0 oficial

Não publicar como estável apenas porque o CI passou. Exigir:
- Testes automatizados relevantes passando.
- Build de produção e build Tauri/NSIS validados.
- Recursos empacotados verificados.
- Instalação, inicialização, exportação e desinstalação verificadas em Windows real.
- Teste do candidato pelo responsável e correção dos problemas encontrados.
- Verificação das licenças, dependências e segurança.
- Atualizador oficial testado sem afetar builds de desenvolvimento.

---

**Última consolidação deste documento:** 2026-11-08.  
**Branch de referência:** `v1.0-development`.  
**Estado:** resumo de continuidade; conferir o repositório e o CI para o estado mais recente.


## Atualização de trabalho — 2026-11-08 (continuação)

- A execução GitHub Actions `42527067709` concluiu com sucesso: testes JS, testes Rust, build NSIS e upload do instalador. Essa execução antecede as alterações abaixo e não as valida.
- Commits posteriores:
  - `2ed96c769b72b16e541eb0e2f55e90f1d4cca745` — corrigiu orientação desatualizada sobre fades de áudio: o renderizador Rust já aplica fade-in/fade-out na exportação MP4; a prévia ainda não simula os fades.
  - `a63ff0e858cded88e48a65a61be905b1a82a659e` e `4f644825e9567d3fe21cf36b734c8a8508a1743a` — atualizam as traduções EN/ES da mensagem de fades.
  - `bcc53dd0308ced150537fb9c015fd4c44c9a6b56` — adiciona testes para as traduções atualizadas.
  - `979b18d8053866d94e310fbd98b4dd12d7d31272` — torna a detecção de áudio por FFprobe estrita: falhas ao iniciar/inspecionar a mídia agora interrompem a exportação com erro explícito, em vez de serem interpretadas silenciosamente como ausência de áudio. Foram adicionados testes unitários para saída com áudio, sem áudio e falha de inspeção.
- Essas alterações posteriores ainda precisam de uma execução CI concluída. O sucesso anterior não deve ser usado como validação delas.
- Permanecem pendentes a integração real de títulos/legendas no renderizador, composição de sobreposições, keyframes, e validação manual do instalador em Windows.
