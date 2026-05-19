import { EventEmitter } from "node:events";

const queueSignal = new EventEmitter();
queueSignal.setMaxListeners(50);

export default queueSignal;
