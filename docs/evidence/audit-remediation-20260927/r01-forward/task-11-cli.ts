import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
const out = resolve(process.argv[2]);
if (!out.startsWith(resolve(".superpowers/sdd/r01-forward-schema-plan-20261001/task-11-cli-"))) throw Error("Owned CLI output required");
await mkdir(out, { recursive: true });
const receipt: Record<string, unknown> = { at: new Date().toISOString(), commands: [] };
for (const [name, args] of [["version", ["bun", "x", "supabase@2.118.0", "--version"]], ["help", ["bun", "x", "supabase@2.118.0", "migration", "new", "--help"]], ["creation", ["bun", "x", "supabase@2.118.0", "migration", "new", "r01_finance_callback_forward"]]] as const) {
  await writeFile(resolve(out, name + "-invocation.json"), JSON.stringify({ command: args, at: new Date().toISOString() }, null, 2) + "\n", { flag: "wx" });
  const p = Bun.spawn([...args], { stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, exit] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
  await writeFile(resolve(out, name + ".stdout.log"), stdout);
  await writeFile(resolve(out, name + ".stderr.log"), stderr);
  (receipt.commands as unknown[]).push({ name, args, exit, stdout, stderr });
  await writeFile(resolve(out, "receipt.json"), JSON.stringify(receipt, null, 2) + "\n");
  console.log(JSON.stringify({ name, exit, stdout }));
  if (exit) process.exit(exit);
}
