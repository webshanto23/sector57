import { createInterface, type Interface } from 'node:readline';
import { Writable } from 'node:stream';

let muted = false;
let rl: Interface | undefined;
const lines: string[] = [];
const waiting: ((line: string) => void)[] = [];

// One reader for the whole run, so piped input (one answer per line) works as well as typing.
function reader(): Interface {
  if (rl) return rl;
  const output = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      if (!muted) process.stdout.write(chunk);
      callback();
    },
  });
  rl = createInterface({ input: process.stdin, output, terminal: process.stdin.isTTY === true });
  rl.on('line', (line) => {
    const next = waiting.shift();
    if (next) next(line);
    else lines.push(line);
  });
  rl.on('close', () => {
    for (const next of waiting.splice(0)) next('');
  });
  return rl;
}

/** Asks one question on the terminal. With `hidden`, typed characters are not echoed (passwords). */
export async function ask(question: string, { hidden = false } = {}): Promise<string> {
  reader();
  process.stdout.write(question);
  muted = hidden;
  const answer = lines.length > 0 ? lines.shift()! : await new Promise<string>((resolve) => waiting.push(resolve));
  muted = false;
  if (hidden) process.stdout.write('\n');
  return answer;
}

/** Stops reading so the process can exit. */
export function closePrompt(): void {
  rl?.close();
}

export function fail(message: string): never {
  console.error(`\n✖ ${message}`);
  process.exit(1);
}
