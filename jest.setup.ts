import "@testing-library/jest-dom";
import { TextEncoder } from "node:util";

// jsdom has no TextEncoder, and the browser build of qrcode (which jest picks in jsdom) needs one.
// Node and the real server have it.
if (typeof globalThis.TextEncoder === "undefined") Object.assign(globalThis, { TextEncoder });
