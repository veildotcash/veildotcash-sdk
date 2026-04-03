/**
 * Shared CLI output helpers.
 */

const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

export interface JsonOutputOption {
  json?: boolean;
}

export function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

export function printLine(value = ''): void {
  console.log(value);
}

export function printHeader(title: string): void {
  console.log();
  console.log(`${BOLD}${title}${RESET}`);
  console.log(`${DIM}${'─'.repeat(40)}${RESET}`);
}

export function printSection(title: string): void {
  console.log();
  console.log(`${BOLD}${title}${RESET}`);
}

export function printDivider(): void {
  console.log();
  console.log(`${DIM}${'─'.repeat(40)}${RESET}`);
}

export function printFields(fields: Array<{ label: string; value: unknown }>): void {
  const visibleFields = fields.filter((field) => field.value !== undefined);
  const width = visibleFields.reduce((max, field) => Math.max(max, field.label.length), 0);

  for (const field of visibleFields) {
    const label = `${DIM}${field.label.padEnd(width)}${RESET}`;
    console.log(`  ${label}  ${formatValue(field.value)}`);
  }
}

export function printList(items: string[]): void {
  if (items.length === 0) {
    console.log(`  ${DIM}(none)${RESET}`);
    return;
  }

  for (const item of items) {
    console.log(`  ${item}`);
  }
}

export function maskValue(value: string, start = 10, end = 8): string {
  if (value.length <= start + end + 3) {
    return value;
  }

  return `${value.slice(0, start)}...${value.slice(-end)}`;
}

export function txUrl(hash: string): string {
  return `https://basescan.org/tx/${hash}`;
}

export function clearProgress(): void {
  process.stderr.write('\r\x1b[K');
}

export function createProgressReporter(): (stage: string, detail?: string) => void {
  return (stage: string, detail?: string) => {
    const message = detail ? `${stage}: ${detail}` : stage;
    process.stderr.write(`\r\x1b[K${message}`);
  };
}

function formatValue(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
