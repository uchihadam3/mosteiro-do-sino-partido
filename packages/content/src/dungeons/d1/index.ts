/**
 * DUNGEON 1 — MOSTEIRO DO SINO PARTIDO — MODO BÁSICO.
 * Sources: Regra Mestra Pass 14 §35, §44 (exact compositions), §30–§31 (loot/gold), §61 (Básico transitions),
 * Livro da Dungeon 1 V2 v0.3 (narrative + Campos de Batalha). v0.3 exploration mechanics (Investigar, Pressão,
 * Busca Profunda, POIs) belong to the Advanced Mode and are NOT used here (§61.5).
 */
import type { CampaignState, DungeonDef, EncounterDef, ExploreOption, LocationDef, SectorKey } from '@mosteiro/core';
import { enterBase } from '@mosteiro/core';

const P = 'penitente',
  CAO = 'cao',
  BES = 'besteiro',
  ESC = 'escudeiro',
  ACO = 'acolito',
  TUR = 'turiferario',
  CAR = 'carcereiro',
  CRR = 'carrasco',
  REL = 'relicario',
  CAN = 'cantor',
  CAV = 'cavaleiro',
  VIG = 'vigia',
  SEV = 'severin';

const k = (...s: string[]) => s as SectorKey[];
const w = (n: number, ...e: string[]) => [{ atEndOfCycle: n, enemies: e }];

export const D1_LOCATIONS: LocationDef[] = [
  { id: 'POR', code: 'POR', name: 'Pórtico das Cinzas', public: true, map: { x: 50, y: 93 }, scene: 'portico', ambience: 'amb_cloister_wind', source: 'D1 L01',
    arrival: 'O vento empurra cinza contra a pedra do pórtico. Não há inimigos. A estátua de um monge sem olhos segura uma chave esculpida, e uma bacia rasa contém cinzas antigas. A porta interna está fechada, mas não trancada.' },
  { id: 'GAL', code: 'GAL', name: 'Galeria dos Peregrinos', public: true, map: { x: 50, y: 78 }, scene: 'galeria', ambience: 'amb_torches_fire', source: 'D1 L02',
    arrival: 'Cinco figuras ajoelhadas bloqueiam a galeria. Quando a porta fecha atrás da party, elas erguem a cabeça ao mesmo tempo.' },
  { id: 'CLA', code: 'CLA', name: 'Claustro Partido', public: true, map: { x: 50, y: 61 }, scene: 'claustro', ambience: 'amb_cloister_wind', source: 'D1 L03', revisit: 'O Claustro é o ponto de convergência. Daqui partem as passagens que vocês já conhecem — e talvez outras.',
    arrival: 'O jardim central morreu há muito tempo. Quatro caminhos permanecem abertos, e pela primeira vez a party pode escolher como atravessar o Mosteiro. Não há inimigos visíveis.' },
  { id: 'SCR', code: 'SCR', name: 'Scriptorium das Sete Linhas', public: true, map: { x: 79, y: 47 }, scene: 'scriptorium', ambience: 'amb_scriptorium', source: 'D1 L04',
    arrival: 'A porta se abre para o cheiro de couro úmido e tinta velha. Entre as estantes há movimento imediato: os guardiões do arquivo já estavam esperando.' },
  { id: 'CAN', code: 'CAN', name: 'Canil da Vigília', public: true, map: { x: 21, y: 51 }, scene: 'canil', ambience: 'amb_kennel', source: 'D1 L05',
    arrival: 'O canil parece vazio. Correntes balançam dentro de duas grades cobertas por panos grossos. Do outro lado, algo respira — e então as grades cedem.' },
  { id: 'CAR', code: 'CAR', name: 'Cárceres do Contrapeso', public: true, map: { x: 18, y: 34 }, scene: 'carceres', ambience: 'amb_chains_creak', source: 'D1 L06',
    arrival: 'O Carcereiro está diante do mecanismo central. Atrás dele, correntes tensas atravessam o teto. Não há chance de examinar o lugar antes da luta.' },
  { id: 'CAP', code: 'CAP', name: 'Capela do Último Ofício', public: true, map: { x: 50, y: 44 }, scene: 'capela', ambience: 'amb_chapel_drone', source: 'D1 L07',
    arrival: 'Uma voz canta sozinha no interior da capela. O Cantor percebe a party antes que qualquer coisa possa ser examinada.' },
  { id: 'REL', code: 'REL', name: 'Relicário do Primeiro Caminho', public: false, map: { x: 91, y: 31 }, scene: 'relicario', ambience: 'amb_chapel_drone', source: 'D1 L08',
    arrival: 'A passagem termina numa sala pequena demais para justificar a arquitetura ao redor. No centro há um único baú de madeira escura. A tampa se abre um dedo e então mostra dentes.' },
  { id: 'CRI', code: 'CRI', name: 'Cripta das Três Vigílias', public: false, map: { x: 30, y: 19 }, scene: 'cripta', ambience: 'amb_chapel_drone', source: '§61.4 B-VIG-01',
    arrival: 'A combinação das marcas revela uma passagem que não constava no percurso conhecido. Três velas apagadas cercam um vulto que não respira — e conta as horas.' },
  { id: 'SAL', code: 'SAL', name: 'Salão da Vigília Quebrada', public: true, map: { x: 50, y: 26 }, scene: 'salao', ambience: 'amb_torches_fire', source: 'D1 L09',
    arrival: 'O Cavaleiro espera imóvel no centro do salão, escudo fechado diante do corpo.' },
  { id: 'CAM', code: 'CAM', name: 'Campanário Partido', public: true, map: { x: 50, y: 8 }, scene: 'campanario', ambience: 'amb_belltower', source: 'D1 L10',
    arrival: 'Severin está sob o sino quebrado. A rachadura vibra sem que ninguém o toque. Não há Exploração antes do confronto final.' },
];

const ENC: EncounterDef[] = [
  {
    id: 'GAL-E01', code: 'GAL-E01', name: 'Os Ajoelhados', locationId: 'GAL', kind: 'obrigatorio', music: 'music_combat', source: '§44 Galeria',
    compositions: [[P, P], [P, P, P], [P, P, P], [P, P, P, P], [P, P, P, P, ACO]],
    reinforcements: [[], [], w(2, ACO), w(2, ACO), w(2, BES)],
    cover: k('H:R1', 'H:R5', 'E:R1', 'E:R5'), entries: k('E:R2', 'E:R4'),
    rewards: { consumivel: 1, gold: [2, 3, 4, 5, 6] },
    intro: 'Os peregrinos ajoelhados erguem a cabeça. Não há rosto sob o capuz — só cinza que respira.',
    outro: 'Os corpos desabam sem qualquer última palavra.',
  },
  {
    id: 'SCR-E01', code: 'SCR-E01', name: 'Guardiões do Arquivo', locationId: 'SCR', kind: 'rota', music: 'music_combat', source: '§44 Scriptorium / §61.1',
    compositions: [[BES, P], [BES, ESC], [BES, ESC, P], [BES, BES, ESC, P], [BES, BES, ESC, ESC, P]],
    reinforcements: [[], [], w(2, BES), w(2, ESC), w(2, ACO)],
    cover: k('H:R2', 'H:R4', 'E:R2', 'E:R4'), entries: k('E:R5'),
    objectives: ['setelinhas'],
    rewards: { comum: 1, consumivel: 1, gold: [2, 3, 4, 5, 6] },
    intro: 'Na parede do fundo, sete linhas gravadas na pedra convergem para um único traço vertical.',
    outro: 'O arquivo silencia. Tinta velha escorre das estantes tombadas.',
  },
  {
    id: 'CAN-E01', code: 'CAN-E01', name: 'Cães da Vigília', locationId: 'CAN', kind: 'rota', music: 'music_combat', source: '§44 Canil',
    compositions: [[CAO, CAO], [CAO, CAO, CAO], [CAO, CAO, CAO, P], [CAO, CAO, CAO, CAO, P], [CAO, CAO, CAO, CAO, P, P]],
    reinforcements: [[], [], w(2, CAO), w(2, CAO), w(2, CAO)],
    cover: k('H:R1', 'H:R5', 'E:R2', 'E:R4'), entries: k('E:R3', 'E:R2', 'E:R4'),
    rewards: { gold: [1, 1, 2, 2, 3] },
    intro: 'Cinza com dentes. Os cães da Vigília ainda caçam peregrinos perdidos.',
    outro: 'O último cão tomba. A barra da porta dos Cárceres cede.',
  },
  {
    id: 'CAR-E01', code: 'CAR-E01', name: 'Carcereiro das Correntes', locationId: 'CAR', kind: 'rota', music: 'music_combat', source: '§44 Cárceres',
    compositions: [[CAR], [CAR, P], [CAR, P, CAO], [CAR, ESC, P, CAO], [CAR, ESC, P, P, CAO]],
    reinforcements: [w(2, P), w(2, P), w(2, P), w(2, P), w(2, P)],
    cover: k('H:R2', 'H:R4'), entries: k('E:R3', 'E:R2', 'E:R4'),
    rewards: { comum: 1, consumivel: 1, gold: [1, 2, 2, 3, 3], states: ['manivela'] },
    intro: 'As correntes do teto se tensionam. O Carcereiro gira a chave de uma cela que não tem mais porta.',
    outro: 'O mecanismo central range. Com cuidado, a manivela se solta inteira — e a porta de serviço se abre.',
  },
  {
    id: 'CAP-E01', code: 'CAP-E01', name: 'Último Ofício', locationId: 'CAP', kind: 'opcional', music: 'music_miniboss', source: '§44 Capela / §61.3',
    compositions: [[CAN], [CAN, ACO], [CAN, ACO, ESC], [CAN, ACO, ESC, P], [CAN, ACO, ESC, P, P]],
    cover: k('H:R1', 'H:R2', 'H:R4', 'H:R5', 'E:R1', 'E:R2', 'E:R4', 'E:R5'), entries: k('E:R3'),
    rewards: { consumivel: 1, gold: [1, 1, 1, 2, 2], states: ['silencio', 'marcaSilencio'] },
    intro: 'A voz sobe uma nota a cada respiração. Quando chegar ao fim, algo no Campanário vai responder.',
    outro: 'A Ressonância cessa, mas a Corda do Coro ainda vibra. Vocês a cortam — e o silêncio pesa como pedra.',
  },
  {
    id: 'RARO-L', code: 'RARO-L', name: 'Arquivo do Incenso Morto', locationId: 'SCR', kind: 'raro', music: 'music_combat', source: '§44 Raro Leste / §61.2',
    compositions: [[TUR, P], [TUR, BES], [TUR, BES, P], [TUR, ESC, BES, P], [TUR, ESC, BES, BES, P]],
    cover: k('H:R2', 'H:R4', 'E:R2', 'E:R4'), entries: k('E:R5'),
    rewards: { comum: 1, gold: [1, 1, 2, 2, 2], states: ['marcaPalavra'] },
    intro: 'Atrás do Scriptorium, um arquivo selado exala incenso que ninguém acende há décadas. Um turíbulo balança sozinho.',
    outro: 'Entre as cinzas do turíbulo, um selo de cera com uma única palavra gravada.',
  },
  {
    id: 'RARO-O', code: 'RARO-O', name: 'Cela do Contrapeso', locationId: 'CAR', kind: 'raro', music: 'music_combat', source: '§44 Raro Oeste / §61.2',
    compositions: [[CRR], [CRR, P], [CRR, ACO], [CRR, ACO, P], [CRR, ACO, ESC, P]],
    cover: k('H:R2', 'H:R4'), entries: k('E:R3'),
    rewards: { comum: 1, gold: [1, 1, 2, 2, 2], states: ['marcaPeso'] },
    intro: 'No fundo dos Cárceres, uma cela pesa mais que as outras. Lá dentro, o Carrasco ainda mede pescoços.',
    outro: 'O contrapeso do Carrasco cai no chão e se parte. Dentro, um selo de chumbo.',
  },
  {
    id: 'REL-E01', code: 'REL-E01', name: 'Relicário Faminto', locationId: 'REL', kind: 'secreto', music: 'music_miniboss', source: '§44 Relicário / §61.1',
    compositions: [[REL], [REL, REL], [REL, REL], [REL, REL, ESC], [REL, REL, ESC, P]],
    cover: [], entries: k('E:R3'),
    rewards: { gold: [0, 0, 0, 0, 0], epic: ['manto_primeiro_caminho'] },
    intro: 'A tampa se abre um dedo e então mostra dentes.',
    outro: 'Do fundo do baú destruído, um manto cinzento que não acumula pó.',
  },
  {
    id: 'CRI-E01', code: 'CRI-E01', name: 'Vigia das Três Vigílias', locationId: 'CRI', kind: 'secreto', music: 'music_miniboss', source: '§44 Cripta / §61.4',
    compositions: [[VIG], [VIG], [VIG], [VIG], [VIG]],
    cover: [], entries: k('E:R3'),
    placements: [[k('E:F3')[0]], [k('E:F3')[0]], [k('E:F3')[0]], [k('E:F3')[0]], [k('E:F3')[0]]],
    rewards: { raro: 1, gold: [1, 2, 2, 2, 3] },
    intro: 'Rápido. Tático. Pesado. O Vigia conhece a hora que vocês escolhem — e espera exatamente por ela.',
    outro: 'A terceira vela se apaga. Pela primeira vez em séculos, ninguém vigia a Cripta.',
  },
  {
    id: 'SAL-E01', code: 'SAL-E01', name: 'Cavaleiro da Vigília Quebrada', locationId: 'SAL', kind: 'miniboss', music: 'music_miniboss', source: '§44 Salão',
    compositions: [[CAV], [CAV, P], [CAV, P, ESC], [CAV, ESC, ESC, BES], [CAV, ESC, ESC, BES, BES, ACO]],
    cover: k('E:R1', 'E:R5', 'H:R2', 'H:R4'), entries: k('E:R3'),
    rewards: { raro: 1, gold: [2, 2, 3, 3, 4] },
    intro: 'Ele não guardava Severin. Guardava o caminho contra ele. Agora não guarda mais nada.',
    outro: 'O Cavaleiro ajoelha sobre o escudo partido. O caminho ao Campanário está livre.',
  },
  {
    id: 'CAM-E01', code: 'CAM-E01', name: 'Abade Severin', locationId: 'CAM', kind: 'boss', music: 'music_boss', source: '§44 Campanário / §43 Severin',
    compositions: [[SEV], [SEV], [SEV, P], [SEV, P, ACO, ESC], [SEV, P, P, ACO, ESC]],
    placements: [[k('E:F3')[0]], [k('E:F3')[0]], [k('E:F3')[0]], [k('E:F3')[0]], [k('E:F3')[0]]],
    cover: [], entries: k('E:R2', 'E:R4', 'E:R3'),
    objectives: ['contrapesos'],
    enemyCap: 10,
    // §30 main route budget: 2 Commons, 1 Rare, 2 Consumables + gold 8/11/14/17/20 → Severin closes it with 1 Common and 2/3/3/4/4 gold.
    rewards: { comum: 1, gold: [2, 3, 3, 4, 4] },
    intro: 'Severin ergue o martelo litúrgico. O sino partido responde de dentro da própria rachadura.',
    outro: 'O Abade cai de joelhos sob o sino. A última vibração morre antes de se tornar badalada.',
  },
];

const ARCHIVE = {
  'B-SCR-01': {
    code: 'B-SCR-01',
    title: 'Arquivo Oculto · B-SCR-01',
    text: 'As sete linhas não formam uma frase. Formam uma dobradiça.\n\nSe o encontro do Scriptorium ainda estiver em andamento, registre Passagem Decifrada. Quando o encontro terminar, uma estante inteira gira para dentro da parede: revele o Relicário do Primeiro Caminho como encontro secreto opcional, disponível antes de entrar no Salão.',
    source: '§61.1',
  },
  'B-VIG-01': {
    code: 'B-VIG-01',
    title: 'Arquivo Oculto · B-VIG-01',
    text: 'A combinação das marcas revela uma passagem que não constava no percurso conhecido.\n\nRevele a Cripta das Três Vigílias. Revele então o encontro: Vigia das Três Vigílias. A Cripta torna-se encontro secreto opcional disponível antes do Salão. Depois de resolvê-la, retome o fluxo normal para o Salão.',
    source: '§61.4',
  },
  'CAM-610': { code: 'CAM-610', title: 'Epílogo · O Silêncio', text: 'O sino não responde. Pela primeira vez em décadas, o Mosteiro parece apenas pedra.\n\nConclusão especial: O Coro Calou.', source: 'D1 CAM-610' },
  'CAM-620': { code: 'CAM-620', title: 'Epílogo · A Última Vibração', text: 'A rachadura vibra uma única vez sob os dedos. O som morre antes de se tornar badalada.\n\nConclusão: Sino Partido.', source: 'D1 CAM-620' },
};

const STATE_CARDS = {
  manivela: { name: 'Manivela Conservada', icon: 'manivela', text: 'Uma vez por Combate contra Severin: reduza em 1 AP o custo de um Contrapeso e adicione D6 ao Teste (máximo 3 dados).' },
  silencio: { name: 'Silêncio do Coro', icon: 'canto', text: 'Contra Severin: pode impedir uma subida de Ressonância, uma vez.' },
  marcaSilencio: { name: 'Marca do Silêncio', icon: 'selo_silencio', text: 'Selo de cera negra, sem inscrição.', secretLine: 'Se também possuir a Marca da Palavra ou do Peso, leia B-VIG-01.' },
  marcaPalavra: { name: 'Marca da Palavra', icon: 'selo_palavra', text: 'Selo de cera com uma única palavra gravada.', secretLine: 'Se também possuir a Marca do Silêncio, leia B-VIG-01.' },
  marcaPeso: { name: 'Marca do Peso', icon: 'selo_peso', text: 'Selo de chumbo, frio e pesado demais para o tamanho.', secretLine: 'Se também possuir a Marca do Silêncio, leia B-VIG-01.' },
  seteLinhas: { name: 'Sete Linhas', icon: 'sete_linhas', text: 'Sete riscos convergindo para um único traço vertical.' },
};

function has(s: CampaignState, st: string) {
  return !!s.flags[`state:${st}`];
}
function f(s: CampaignState, k2: string) {
  return !!s.flags[k2];
}

export const D1: DungeonDef = {
  id: 'd1',
  number: 1,
  name: 'Mosteiro do Sino Partido',
  subtitle: 'Dungeon 1 · Modo Básico',
  canonical: true,
  modes: ['basico'],
  locations: D1_LOCATIONS,
  encounters: ENC,
  archive: ARCHIVE,
  startNode: 'POR',
  links: [
    ['POR', 'GAL'],
    ['GAL', 'CLA'],
    ['CLA', 'SCR'],
    ['CLA', 'CAN'],
    ['CAN', 'CAR'],
    ['CLA', 'CAP'],
    ['SCR', 'SAL'],
    ['CAR', 'SAL'],
    ['SAL', 'CAM'],
    ['SCR', 'REL'],
    ['CLA', 'CRI'],
  ],
  stateCards: STATE_CARDS,

  options(s) {
    const o: ExploreOption[] = [];
    const node = s.node;
    if (node === 'POR') o.push({ id: 'go_gal', label: 'Abrir a Porta do Mosteiro', detail: 'A porta abre com um gemido longo.', kind: 'combat', locationId: 'GAL', encounterId: 'GAL-E01', icon: 'loc_galeria' });
    if (node === 'CAN') o.push({ id: 'go_car', label: 'Descer aos Cárceres do Contrapeso', detail: 'Rota Oeste · parte 2', kind: 'combat', locationId: 'CAR', encounterId: 'CAR-E01', icon: 'loc_carceres' });
    if (node === 'SAL') o.push({ id: 'go_cam', label: 'Subir ao Campanário Partido', detail: 'Confronto final', kind: 'combat', locationId: 'CAM', encounterId: 'CAM-E01', icon: 'loc_campanario' });
    if (node === 'CLA') {
      const salaoOpen = !f(s, 'salaoStarted');
      if (!s.flags['route']) {
        o.push({ id: 'go_scr', label: 'Arcada Leste — Scriptorium das Sete Linhas', detail: 'Rota Leste · mais curta', kind: 'combat', locationId: 'SCR', encounterId: 'SCR-E01', icon: 'loc_scriptorium' });
        o.push({ id: 'go_can', label: 'Arcada Oeste — Canil da Vigília', detail: 'Rota Oeste · mais longa (Canil → Cárceres)', kind: 'combat', locationId: 'CAN', encounterId: 'CAN-E01', icon: 'loc_canil' });
      }
      if (salaoOpen && !f(s, 'capelaDone')) o.push({ id: 'go_cap', label: 'Escadaria Norte — Capela do Último Ofício', detail: 'Opcional · antes do Salão', kind: 'combat', locationId: 'CAP', encounterId: 'CAP-E01', icon: 'loc_capela' });
      if (salaoOpen && f(s, 'routeDone') && f(s, 'rareOffered') && !f(s, 'rareDone')) {
        const east = s.flags['route'] === 'leste';
        o.push({ id: 'go_rare', secret: true, label: east ? 'Arquivo do Incenso Morto' : 'Cela do Contrapeso', detail: 'Encontro Raro · opcional e mais perigoso', kind: 'combat', locationId: east ? 'SCR' : 'CAR', encounterId: east ? 'RARO-L' : 'RARO-O', icon: 'act_objective' });
      }
      if (salaoOpen && f(s, 'relRevealed') && !f(s, 'relDone')) o.push({ id: 'go_rel', secret: true, label: 'Passagem do Primeiro Caminho', detail: 'Encontro secreto · opcional', kind: 'combat', locationId: 'REL', encounterId: 'REL-E01', icon: 'loc_relicario' });
      if (salaoOpen && f(s, 'criptaRevealed') && !f(s, 'criptaDone')) o.push({ id: 'go_cri', secret: true, label: 'Cripta das Três Vigílias', detail: 'Encontro secreto · opcional', kind: 'combat', locationId: 'CRI', encounterId: 'CRI-E01', icon: 'loc_cripta' });
      if (f(s, 'routeDone')) {
        const remaining = o.filter((x) => x.id !== 'go_sal').length;
        o.push({
          id: 'go_sal',
          label: s.flags['route'] === 'oeste' ? 'Rota de Serviço — Salão da Vigília Quebrada' : 'Saída Norte — Salão da Vigília Quebrada',
          detail: 'Encontro obrigatório',
          kind: 'combat',
          locationId: 'SAL',
          encounterId: 'SAL-E01',
          icon: 'loc_salao',
          warning: remaining ? 'Iniciar o Salão encerra as oportunidades opcionais anteriores.' : undefined,
        });
      }
    }
    return o;
  },

  choose(s, id) {
    const visit = (loc: string) => {
      if (!s.visited.includes(loc)) s.visited.push(loc);
    };
    switch (id) {
      case 'go_gal':
        visit('GAL');
        return { encounterId: 'GAL-E01' };
      case 'go_scr':
        s.flags['route'] = 'leste';
        visit('SCR');
        return { encounterId: 'SCR-E01' };
      case 'go_can':
        s.flags['route'] = 'oeste';
        visit('CAN');
        return { encounterId: 'CAN-E01' };
      case 'go_car':
        visit('CAR');
        return { encounterId: 'CAR-E01' };
      case 'go_cap':
        visit('CAP');
        return { encounterId: 'CAP-E01' };
      case 'go_rare':
        return { encounterId: s.flags['route'] === 'leste' ? 'RARO-L' : 'RARO-O' };
      case 'go_rel':
        visit('REL');
        return { encounterId: 'REL-E01' };
      case 'go_cri':
        visit('CRI');
        return { encounterId: 'CRI-E01' };
      case 'go_sal':
        // §61: starting the Salão closes earlier optional opportunities
        s.flags['salaoStarted'] = true;
        visit('SAL');
        return { encounterId: 'SAL-E01' };
      case 'go_cam':
        visit('CAM');
        return { encounterId: 'CAM-E01' };
    }
  },

  combatContext(s, enc) {
    return {
      hasManivela: has(s, 'manivela'),
      hasSilencio: has(s, 'silencio'),
      // §35 / D1 SAL-020: entering through the Cárceres the Knight starts in Guarda Aberta
      guardaInicial: enc.id === 'SAL-E01' && s.flags['route'] === 'oeste' ? 'aberta' : 'fechada',
    };
  },

  onVictory(s, enc, combat) {
    if (enc.id === 'SCR-E01' && combat.flags['passagemDecifrada']) {
      s.flags['state:seteLinhas'] = true;
      s.flags['relRevealed'] = true;
      if (!s.revealed.includes('REL')) s.revealed.push('REL');
    }
  },

  afterRewards(s, enc) {
    switch (enc.id) {
      case 'GAL-E01':
        s.node = 'CLA';
        if (!s.visited.includes('CLA')) s.visited.push('CLA');
        s.narrative = D1_LOCATIONS.find((l) => l.id === 'CLA')!.arrival;
        break;
      case 'SCR-E01':
        s.flags['routeDone'] = true;
        s.flags['rareOffered'] = true;
        s.node = 'CLA';
        break;
      case 'CAN-E01':
        s.node = 'CAN';
        break;
      case 'CAR-E01':
        s.flags['routeDone'] = true;
        s.flags['rareOffered'] = true;
        s.node = 'CLA';
        break;
      case 'CAP-E01':
        s.flags['capelaDone'] = true;
        s.node = 'CLA';
        break;
      case 'RARO-L':
      case 'RARO-O':
        s.flags['rareDone'] = true;
        s.node = 'CLA';
        break;
      case 'REL-E01':
        s.flags['relDone'] = true;
        s.node = 'CLA';
        break;
      case 'CRI-E01':
        s.flags['criptaDone'] = true;
        s.node = 'CLA';
        break;
      case 'SAL-E01':
        s.node = 'SAL';
        break;
      case 'CAM-E01': {
        s.epilogue = this.epilogue(s);
        s.phase = 'epilogue';
        return;
      }
    }
    // §61.4: the Marks check themselves — Silêncio + (Palavra OR Peso) → B-VIG-01.
    if (!f(s, 'criptaRevealed') && has(s, 'marcaSilencio') && (has(s, 'marcaPalavra') || has(s, 'marcaPeso'))) {
      s.flags['criptaRevealed'] = true;
      if (!s.revealed.includes('CRI')) s.revealed.push('CRI');
      s.pendingArchive = 'B-VIG-01';
      if (!s.archiveRead.includes('B-VIG-01')) s.archiveRead.push('B-VIG-01');
    }
  },

  epilogue(s) {
    const e = has(s, 'silencio') ? ARCHIVE['CAM-610'] : ARCHIVE['CAM-620'];
    return { code: e.code, title: e.title, text: e.text };
  },
};

/** Finish the epilogue → return to Base (§28). */
export function finishDungeon(s: CampaignState) {
  s.flags['d1Complete'] = has(s, 'silencio') ? 'O Coro Calou' : 'Sino Partido';
  enterBase(s);
}
