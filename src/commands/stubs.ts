export function runNotImplemented(command: string): number {
  process.stderr.write(`drive-health ${command} is scaffolded but not implemented in this slice.\n`);
  return 2;
}

