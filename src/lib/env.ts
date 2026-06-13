export function getEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export function getNumberEnv(name: string, fallback: number): number {
  const v = process.env[name];
  return v ? Number(v) : fallback;
}
