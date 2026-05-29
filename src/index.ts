// tcg-core.ts
// ─────────────────────────────────────────────
// TCG CORE ENGINE — v0.1 — "make it work first"
// ─────────────────────────────────────────────

// ══════════════════════════════════════════════
// TYPES DE BASE
// ══════════════════════════════════════════════

export interface Card {
  id: string;
  name: string;
  cost: number;        // ce qui limite quand on peut jouer la carte
  attack: number;
  defense: number;
  type: string;        // libre : "creature", "spell", "leader", ce que tu veux
  tags: string[];      // libre : ["lumiere", "leader", "co-leader", etc.]
  effects: Effect[];   // liste d'effets attachés à la carte
  meta: Record<string, unknown>; // tout le reste : ego, rareté, faction, etc.
}

export interface Effect {
  trigger: EffectTrigger;   // quand l'effet se déclenche
  execute: EffectFn;         // ce qu'il fait
}

export type EffectTrigger =
  | 'on_play'
  | 'on_attack'
  | 'on_defend'
  | 'on_destroy'
  | 'on_turn_start'
  | 'on_turn_end'
  | string; // extensible librement

export type EffectFn = (ctx: GameContext) => GameContext;

// ══════════════════════════════════════════════
// CONFIG — tout ce qui est paramétrable
// ══════════════════════════════════════════════

export interface GameConfig {
  deckMinSize: number;          // 40 pour Versus, 60 pour MTG, 20 pour Hearthstone
  startingHandSize: number;     // 5, 7, 3... selon le jeu
  maxHandSize: number;          // plafond de main
  playerHP: number;             // 20 PC, 30 HP, etc.
  maxCopiesPerCard: number;     // 3 pour Versus, 4 pour MTG, 2 pour certains
  phases: string[];             // ordre des phases du tour
  turnCostMode: 'mana' | 'turn_number' | 'energy' | 'custom'; // système de ressource
  maxFieldSize: number;         // nb max de cartes sur le terrain
  allowFirstTurnAttack: boolean;
  turnTimer: number;            // en secondes, 0 = pas de timer
  responseTimer: number;
  winConditions: WinConditionFn[];
  [key: string]: unknown;       // extensible librement
}

export type WinConditionFn = (state: GameState) => 'player1' | 'player2' | null;

// Config par défaut — remplaçable entièrement
export const DEFAULT_CONFIG: GameConfig = {
  deckMinSize: 40,
  startingHandSize: 5,
  maxHandSize: 10,
  playerHP: 20,
  maxCopiesPerCard: 3,
  phases: ['draw', 'play', 'attack', 'response', 'end'],
  turnCostMode: 'turn_number',
  maxFieldSize: 8,
  allowFirstTurnAttack: false,
  turnTimer: 30,
  responseTimer: 15,
  winConditions: [defaultWinCondition],
};

// ══════════════════════════════════════════════
// ÉTAT DU JEU
// ══════════════════════════════════════════════

export interface PlayerState {
  id: 'player1' | 'player2';
  hp: number;
  hand: CardInstance[];
  deck: CardInstance[];
  field: CardInstance[];
  mana?: number;          // optionnel selon config
  meta: Record<string, unknown>; // tout ce qui est spécifique au jeu
}

export interface CardInstance extends Card {
  instanceId: string;     // id unique de CETTE instance en jeu
  exhausted: boolean;
  justPlayed: boolean;
  counters: Record<string, number>; // ego, poison, boost... tout
  owner: 'player1' | 'player2';
}

export interface GameState {
  config: GameConfig;
  turn: number;
  activePlayer: 'player1' | 'player2';
  phase: string;
  player1: PlayerState;
  player2: PlayerState;
  pendingAction: PendingAction | null;
  log: string[];
  winner: 'player1' | 'player2' | null;
  meta: Record<string, unknown>; // données globales custom
}

export interface PendingAction {
  type: 'attack' | 'response' | 'choice' | string;
  data: Record<string, unknown>;
}

// ══════════════════════════════════════════════
// CONTEXTE — passé à chaque effet
// ══════════════════════════════════════════════

export interface GameContext {
  state: GameState;
  card?: CardInstance;
  target?: CardInstance | 'player1' | 'player2';
}

// ══════════════════════════════════════════════
// UTILITAIRES DECK
// ══════════════════════════════════════════════

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function draw(deck: CardInstance[], count: number): {
  drawn: CardInstance[];
  remaining: CardInstance[];
} {
  return {
    drawn: deck.slice(0, count),
    remaining: deck.slice(count),
  };
}

export function makeInstance(
  card: Card,
  owner: 'player1' | 'player2',
  index: number
): CardInstance {
  return {
    ...card,
    instanceId: `${card.id}-${owner}-${index}-${Math.random().toString(36).slice(2)}`,
    exhausted: false,
    justPlayed: false,
    counters: {},
    owner,
  };
}

export function buildDeck(cards: Card[], owner: 'player1' | 'player2'): CardInstance[] {
  return shuffle(cards.map((c, i) => makeInstance(c, owner, i)));
}

// ══════════════════════════════════════════════
// INIT
// ══════════════════════════════════════════════

export function initPlayer(
  id: 'player1' | 'player2',
  cards: Card[],
  config: GameConfig
): PlayerState {
  const deck = buildDeck(cards, id);
  const { drawn, remaining } = draw(deck, config.startingHandSize);
  return {
    id,
    hp: config.playerHP,
    hand: drawn,
    deck: remaining,
    field: [],
    meta: {},
  };
}

export function initGame(
  p1Cards: Card[],
  p2Cards: Card[],
  config: Partial<GameConfig> = {}
): GameState {
  const cfg: GameConfig = { ...DEFAULT_CONFIG, ...config };
  return {
    config: cfg,
    turn: 1,
    activePlayer: 'player1',
    phase: cfg.phases[0],
    player1: initPlayer('player1', p1Cards, cfg),
    player2: initPlayer('player2', p2Cards, cfg),
    pendingAction: null,
    log: ['Game started'],
    winner: null,
    meta: {},
  };
}

// ══════════════════════════════════════════════
// ACTIONS DE BASE
// ══════════════════════════════════════════════

export function drawCard(state: GameState, player: 'player1' | 'player2'): GameState {
  const p = state[player];
  if (p.deck.length === 0) return addLog(state, `${player} deck empty`);
  const { drawn, remaining } = draw(p.deck, 1);
  if (state.config.maxHandSize && p.hand.length >= state.config.maxHandSize) {
    return addLog(state, `${player} hand full — card burned`);
  }
  return {
    ...state,
    [player]: { ...p, hand: [...p.hand, ...drawn], deck: remaining },
  };
}

export function playCard(
  state: GameState,
  player: 'player1' | 'player2',
  instanceId: string
): GameState {
  const p = state[player];
  const card = p.hand.find(c => c.instanceId === instanceId);
  if (!card) return state;

  const newHand = p.hand.filter(c => c.instanceId !== instanceId);
  const playedCard: CardInstance = { ...card, justPlayed: true, exhausted: false };
  const newField = [...p.field, playedCard];

  let newState: GameState = {
    ...state,
    [player]: { ...p, hand: newHand, field: newField },
  };
  newState = addLog(newState, `${player} plays ${card.name}`);

  // Déclencher les effets on_play
  newState = triggerEffects(newState, playedCard, 'on_play');

  return newState;
}

export function attack(
  state: GameState,
  attackerInstanceId: string,
  target: CardInstance | 'player1' | 'player2'
): GameState {
  const ap = state.activePlayer;
  const p = state[ap];
  const attacker = p.field.find(c => c.instanceId === attackerInstanceId);
  if (!attacker || attacker.exhausted || attacker.justPlayed) return state;

  const exhaustedAttacker = { ...attacker, exhausted: true };
  const newField = p.field.map(c => c.instanceId === attackerInstanceId ? exhaustedAttacker : c);
  const targetLabel = typeof target === 'string' ? `${target} directly` : target.name;

  return {
    ...state,
    [ap]: { ...p, field: newField },
    pendingAction: { type: 'attack', data: { attacker: exhaustedAttacker, target } },
    phase: 'response',
    log: [...state.log, `${ap}: ${attacker.name} attacks ${targetLabel}`],
  };
}

export function resolveCombat(
  state: GameState,
  defender?: CardInstance
): GameState {
  const { pendingAction } = state;
  if (!pendingAction || pendingAction.type !== 'attack') return state;

  const { attacker, target } = pendingAction.data as {
    attacker: CardInstance;
    target: CardInstance | 'player1' | 'player2';
  };

  const ap = state.activePlayer;
  const op: 'player1' | 'player2' = ap === 'player1' ? 'player2' : 'player1';

  // Attaque directe sur un joueur
  if (!defender || typeof target === 'string') {
    const targetPlayer = typeof target === 'string' ? target : op;
    const p = state[targetPlayer];
    const newHp = Math.max(0, p.hp - attacker.attack);
    const newState = {
      ...state,
      [targetPlayer]: { ...p, hp: newHp },
      pendingAction: null,
      phase: 'attack',
      log: [...state.log, `${targetPlayer} takes ${attacker.attack} damage → ${newHp} HP`],
    };
    return checkWinConditions(newState);
  }

  // Combat entre cartes
  const defenderLoses = attacker.attack >= defender.defense;
  const attackerLoses = defenderLoses && defender.attack > attacker.defense;
  const log = [...state.log];

  let apState = state[ap];
  let opState = state[op];

  if (defenderLoses) {
    opState = { ...opState, field: opState.field.filter(c => c.instanceId !== defender.instanceId) };
    log.push(`${defender.name} destroyed`);
  }
  if (attackerLoses) {
    apState = { ...apState, field: apState.field.filter(c => c.instanceId !== attacker.instanceId) };
    log.push(`${attacker.name} destroyed`);
  }
  if (!defenderLoses && !attackerLoses) log.push('Attack blocked');

  return {
    ...state,
    [ap]: apState,
    [op]: opState,
    pendingAction: null,
    phase: 'attack',
    log,
  };
}

export function endTurn(state: GameState): GameState {
  const ap = state.activePlayer;
  const op: 'player1' | 'player2' = ap === 'player1' ? 'player2' : 'player1';
  const nextTurn = op === 'player1' ? state.turn + 1 : state.turn;
  const p = state[op];

  // Redresser les cartes du prochain joueur
  const freshField = p.field.map(c => ({ ...c, exhausted: false, justPlayed: false }));

  let newState: GameState = {
    ...state,
    [op]: { ...p, field: freshField },
    turn: nextTurn,
    activePlayer: op,
    phase: state.config.phases[0],
    log: [...state.log, `── Turn ${nextTurn} — ${op} ──`],
  };

  // Déclencher les effets on_turn_start
  newState = triggerFieldEffects(newState, op, 'on_turn_start');

  return newState;
}

// ══════════════════════════════════════════════
// SYSTÈME D'EFFETS
// ══════════════════════════════════════════════

export function triggerEffects(
  state: GameState,
  card: CardInstance,
  trigger: EffectTrigger
): GameState {
  let s = state;
  for (const effect of card.effects) {
    if (effect.trigger === trigger) {
      const ctx = effect.execute({ state: s, card });
      s = ctx.state;
    }
  }
  return s;
}

export function triggerFieldEffects(
  state: GameState,
  player: 'player1' | 'player2',
  trigger: EffectTrigger
): GameState {
  let s = state;
  for (const card of state[player].field) {
    s = triggerEffects(s, card, trigger);
  }
  return s;
}

// ══════════════════════════════════════════════
// CONDITIONS DE VICTOIRE
// ══════════════════════════════════════════════

function defaultWinCondition(state: GameState): 'player1' | 'player2' | null {
  if (state.player1.hp <= 0) return 'player2';
  if (state.player2.hp <= 0) return 'player1';
  return null;
}

export function checkWinConditions(state: GameState): GameState {
  for (const fn of state.config.winConditions) {
    const winner = fn(state);
    if (winner) {
      return {
        ...state,
        winner,
        log: [...state.log, `🏆 ${winner} wins!`],
      };
    }
  }
  return state;
}

// ══════════════════════════════════════════════
// UTILITAIRES
// ══════════════════════════════════════════════

export function addLog(state: GameState, msg: string): GameState {
  return { ...state, log: [...state.log, msg] };
}

export function nextPhase(state: GameState): GameState {
  const phases = state.config.phases;
  const idx = phases.indexOf(state.phase);
  const next = phases[Math.min(idx + 1, phases.length - 1)];
  return { ...state, phase: next };
}

export function getOpponent(p: 'player1' | 'player2'): 'player1' | 'player2' {
  return p === 'player1' ? 'player2' : 'player1';
}

export function getPlayableCards(
  hand: CardInstance[],
  budget: number
): CardInstance[] {
  return hand.filter(c => c.cost <= budget);
}

export function addCounter(card: CardInstance, key: string, amount = 1): CardInstance {
  return { ...card, counters: { ...card.counters, [key]: (card.counters[key] ?? 0) + amount } };
}

export function getCounter(card: CardInstance, key: string): number {
  return card.counters[key] ?? 0;
}