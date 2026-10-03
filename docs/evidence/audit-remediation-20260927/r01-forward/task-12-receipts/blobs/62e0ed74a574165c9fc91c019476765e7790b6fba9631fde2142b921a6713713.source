/** Hosted/modern entry point for the single Task12 live capture producer. */
import {runCapture} from "./task-12-capture-producer";
const mode=process.argv[2];
if(mode!=="hosted"&&mode!=="modern")throw Error("Exact hosted/modern capture mode required");
await runCapture(mode,process.argv[3]);
