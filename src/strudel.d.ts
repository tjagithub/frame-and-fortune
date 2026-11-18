/** The slice of @strudel/web used by music.ts (the package ships no types). */
declare module "@strudel/web" {
  export type Repl = { setCps: (cps: number) => void; stop: () => void };
  export function initStrudel(options?: Record<string, unknown>): Promise<Repl>;
  export function evaluate(code: string, autoplay?: boolean): Promise<unknown>;
  export function hush(): void;
  export function superdough(value: Record<string, unknown>, t: number, duration: number): Promise<void>;
  export function getAudioContext(): AudioContext;
}
