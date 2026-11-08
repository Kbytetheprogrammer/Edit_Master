import React from 'react';

const lessons = [
  {
    title: '01 · Conhecendo o Edit Master',
    level: 'Iniciante',
    steps: [
      'A tela inicial permite criar um projeto novo ou abrir um projeto salvo.',
      'No editor, a Biblioteca reúne os arquivos importados; o Monitor mostra a prévia; a Timeline organiza os segmentos; o Inspetor apresenta os ajustes do item selecionado.',
      'A barra superior reúne AI Hub, Media Hub, publicação no YouTube, Ajuda e exportação.',
      'Salve o projeto com frequência. A edição é não destrutiva: os arquivos originais permanecem no local de origem.'
    ]
  },
  {
    title: '02 · Criar, abrir e organizar projetos',
    level: 'Iniciante',
    steps: [
      'Na tela inicial, escolha Novo projeto para começar uma montagem.',
      'Use Abrir projeto para selecionar um arquivo .emproj criado pelo Edit Master.',
      'Use Salvar projeto + mídia para salvar o projeto e copiar os arquivos de mídia para a pasta do projeto, facilitando transportar ou restaurar o trabalho.',
      'Mantenha a pasta do projeto completa. Não apague a pasta de mídia enquanto o projeto depender desses arquivos.'
    ]
  },
  {
    title: '03 · Importar vídeos, imagens e áudios',
    level: 'Iniciante',
    steps: [
      'Clique em Importar arquivos e escolha vídeos, imagens ou áudios compatíveis no seletor do Windows.',
      'A importação pelo seletor nativo registra caminhos permanentes e é a opção recomendada para projetos que serão exportados.',
      'Também é possível arrastar arquivos para a janela para uma importação rápida; para exportar, prefira reimportar pelo seletor nativo se o arquivo não tiver caminho permanente.',
      'Selecione um item na Biblioteca para visualizar e adicionar à Timeline.'
    ]
  },
  {
    title: '04 · Montar a Timeline',
    level: 'Iniciante',
    steps: [
      'Arraste itens da Biblioteca para a Timeline ou use o comando de adicionar clipe.',
      'A faixa visual recebe vídeos e imagens; a faixa de áudio recebe músicas, narrações e efeitos sonoros.',
      'Selecione um clipe para ver suas propriedades no Inspetor.',
      'A ordem dos clipes visuais define a sequência básica da montagem nesta versão.'
    ]
  },
  {
    title: '05 · Cortar, dividir e ajustar clipes',
    level: 'Intermediário',
    steps: [
      'Posicione o indicador de reprodução no ponto em que deseja dividir.',
      'Use a ferramenta de tesoura ou o atalho S para separar o clipe no ponto atual.',
      'Ajuste os pontos inicial e final do segmento no Inspetor quando esses controles estiverem disponíveis.',
      'Use Desfazer e Refazer para voltar ou restaurar alterações recentes da Timeline.'
    ]
  },
  {
    title: '06 · Trabalhar com áudio',
    level: 'Iniciante',
    steps: [
      'Importe arquivos de áudio pela mesma opção Importar arquivos e coloque-os na faixa de áudio.',
      'Selecione o clipe de áudio para abrir os controles correspondentes no Inspetor.',
      'Ajuste o ganho/volume e, quando disponíveis, os fades de entrada e saída.',
      'A exportação atual mistura faixas de áudio em uma montagem básica. Confira o resultado e o sincronismo antes de publicar.',
      'Use o botão **Extrair áudio de mídia** na Biblioteca. Escolha a origem, selecione MP3, WAV, FLAC, AAC ou OGG e indique onde salvar. O FFmpeg precisa estar configurado. Se a origem não tiver faixa de áudio, o aplicativo mostrará a falha sem substituir o original.'
    ]
  },
  {
    title: '07 · Imagens, sobreposições e animação',
    level: 'Intermediário',
    steps: [
      'Adicione uma imagem à Timeline para usá-la na composição.',
      'Selecione o item e abra os controles de sobreposição no Inspetor.',
      'Ajuste posição, escala, rotação e opacidade para compor a prévia.',
      'Os quadros-chave permitem registrar valores em instantes diferentes e interpolar o movimento na prévia.',
      'Importante: a renderização MP4 atual ainda não incorpora todas as sobreposições e animações da prévia.'
    ]
  },
  {
    title: '08 · Legendas e arquivos SRT',
    level: 'Intermediário',
    steps: [
      'Abra o AI Hub e selecione a mídia que deseja transcrever.',
      'É possível importar legendas SRT existentes e aplicar os trechos ao projeto.',
      'Os horários definem quando cada legenda aparece e desaparece.',
      'A transcrição local exige whisper-cli.exe, um modelo Whisper .bin e FFmpeg acessível. Nesta versão esses componentes ainda precisam ser selecionados/configurados pelo usuário.',
      'Revise nomes, pontuação, sincronização e tradução antes de usar as legendas.'
    ]
  },
  {
    title: '09 · AI Hub e serviços de IA',
    level: 'Intermediário',
    steps: [
      'Abra AI Hub pela barra superior.',
      'Os provedores online exigem uma chave de API própria. O aplicativo guarda as chaves no Cofre de Credenciais do Windows.',
      'Nunca compartilhe sua chave de API nem a publique em capturas de tela, arquivos ou no repositório.',
      'Os serviços online podem ter limites, custos e termos próprios. Verifique as condições do provedor antes de usar.'
    ]
  },
  {
    title: '10 · Media Hub: imagens, vídeos e sons',
    level: 'Intermediário',
    steps: [
      'Abra Media Hub e escolha Pexels, Pixabay ou Freesound.',
      'Pexels e Pixabay oferecem pesquisa de imagens e vídeos; Freesound oferece pesquisa de áudio.',
      'Cada provedor exige que o usuário configure sua própria chave de API. As chaves são armazenadas no Cofre de Credenciais do Windows.',
      'Digite um termo, escolha o tipo de mídia e clique em Buscar.',
      'Confira autor, página de origem e licença antes de baixar e publicar. A disponibilidade depende das APIs e dos limites de cada serviço.'
    ]
  },
  {
    title: '11 · Exportar MP4 em Full HD a 60 FPS',
    level: 'Intermediário',
    steps: [
      'Antes de exportar, confirme que a Timeline contém pelo menos um vídeo ou uma imagem e que os arquivos de origem continuam acessíveis.',
      'Abra Exportar MP4 e selecione um ffmpeg.exe confiável. FFmpeg e FFprobe precisam estar disponíveis; nesta versão o instalador ainda não os inclui automaticamente.',
      'A predefinição de destino é Full HD 1920 × 1080 a 60 FPS, com vídeo H.264 e áudio AAC.',
      'Escolha um destino com extensão .mp4 e aguarde a conclusão.',
      'A renderização atual concatena os segmentos visuais em sequência e mistura áudio de forma básica. Ela ainda não reproduz integralmente todas as camadas, transições e títulos da prévia.'
    ]
  },
  {
    title: '12 · Publicar no YouTube',
    level: 'Intermediário',
    steps: [
      'Exporte o vídeo MP4 primeiro e confira o arquivo final.',
      'Abra YouTube na barra superior e siga o fluxo de conexão da conta.',
      'Preencha título, descrição e demais informações solicitadas.',
      'Confira o vídeo e as configurações antes de confirmar o envio. A publicação depende da autorização da conta e das regras do YouTube.'
    ]
  },
  {
    title: '13 · Preferências e desempenho',
    level: 'Intermediário',
    steps: [
      'Abra Configurações para ajustar as preferências disponíveis.',
      'O modo econômico reduz algumas atualizações visuais para ajudar em computadores modestos.',
      'O orçamento de cache controla a preferência de memória/cache quando a opção estiver disponível.',
      'Se a prévia ficar lenta, feche outros aplicativos pesados e reduza a carga de mídia simultânea.'
    ]
  },
  {
    title: '14 · Solução de problemas e boas práticas',
    level: 'Todos os níveis',
    steps: [
      'Se um arquivo não abrir, confirme se o formato é compatível e tente importá-lo novamente pelo seletor nativo.',
      'Se a exportação falhar, verifique o caminho do FFmpeg, a presença do FFprobe, os caminhos dos arquivos originais e o espaço livre em disco.',
      'Se o Media Hub não buscar resultados, confira a chave de API, a conexão e os limites do provedor.',
      'Se a transcrição local falhar, confirme os caminhos do whisper-cli.exe, do modelo .bin e do FFmpeg.',
      'Salve cópias de segurança dos projetos importantes e teste o MP4 antes de apagar ou mover os arquivos originais.',
      'Relate falhas com a versão do Edit Master, a mensagem de erro e os passos para reproduzi-la. Nunca inclua chaves de API ou dados privados.'
    ]
  }
];

function HelpCenter({ onClose }) {
  return (
    <div className="help-body help-course">
      <div className="help-course-intro">
        <b>Curso completo · Do primeiro projeto à publicação</b>
        <p>14 aulas organizadas por nível. Abra cada aula e siga os passos na ordem. Os avisos identificam recursos que ainda estão em desenvolvimento para que o tutorial não prometa funções que esta versão ainda não entrega.</p>
      </div>
      <div className="help-course-lessons">
        {lessons.map((lesson, index) => (
          <details className="help-lesson" key={lesson.title} open={index === 0}>
            <summary><span>{lesson.title}</span><small>{lesson.level} · {lesson.steps.length} etapas</small></summary>
            <ol>{lesson.steps.map((step, stepIndex) => <li key={stepIndex}>{step}</li>)}</ol>
          </details>
        ))}
      </div>
      <div className="help-course-note">
        <b>Nota sobre a versão 1.0</b>
        <p>Este curso descreve o comportamento atualmente implementado. Extração de áudio como ferramenta independente, FFmpeg/FFprobe e Whisper pré-instalados, renderização completa de camadas e instalação sem configuração ainda precisam ser concluídos e testados antes de anunciar a versão 1.0 final.</p>
      </div>
      <button className="export-button" onClick={onClose}>Concluir curso</button>
    </div>
  );
}

export default withLocalization(HelpCenter);
