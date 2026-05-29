# Devalito67_TGC-Core

Universal TCG engine in TypeScript.
Plug your cards, your rules, your UI.

## Install
```bash
npm install devalito67_tgc-core
```

## Quickstart
```ts
import { initGame, drawCard, endTurn } from 'devalito67_tgc-core';

const state = initGame(myDeck1, myDeck2, {
  startingHandSize: 5,
  playerHP: 20,
  phases: ['draw', 'play', 'attack', 'end'],
});
```
