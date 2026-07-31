/**
 * Minimal fledge-v1 plugin host protocol (JSON lines on stdio).
 * Compatible with fledge-plugin-memory protocol helpers.
 */

import { createInterface } from "node:readline";

const rl = createInterface({ input: process.stdin, terminal: false });
const lines: string[] = [];
let resolver: ((line: string) => void) | null = null;

rl.on("line", (line) => {
  if (resolver) {
    const r = resolver;
    resolver = null;
    r(line);
  } else {
    lines.push(line);
  }
});

export function send(msg: Record<string, unknown>): void {
  process.stdout.write(`${JSON.stringify(msg)}\n`);
}

export function recv(): Promise<string> {
  const buffered = lines.shift();
  if (buffered !== undefined) {
    return Promise.resolve(buffered);
  }
  return new Promise((resolve) => {
    resolver = resolve;
  });
}

export async function recvJson<T = Record<string, unknown>>(): Promise<T> {
  const line = await recv();
  return JSON.parse(line) as T;
}

export function sendOutput(text: string): void {
  const body = text.endsWith("\n") ? text : `${text}\n`;
  send({ type: "output", text: body });
}

export function sendError(msg: string): void {
  send({ type: "log", level: "error", message: msg });
}

export type InitMessage = {
  type: "init";
  protocol: string;
  args: string[];
  project: {
    name: string;
    root: string;
    language: string;
    git: Record<string, unknown>;
  };
  plugin: { name: string; version: string; dir: string };
  fledge: { version: string };
  capabilities: { exec: boolean; store: boolean; metadata: boolean };
};
