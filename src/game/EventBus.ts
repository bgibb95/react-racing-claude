// React <-> Phaser bridge (official Phaser React template pattern). Used for
// discrete signals like the scene announcing it is ready. Continuous state flows
// through the Zustand store and the net-layer session, not through here.

import Phaser from 'phaser';

export const EventBus = new Phaser.Events.EventEmitter();
