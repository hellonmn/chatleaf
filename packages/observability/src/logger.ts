/**
 * Tiny structured logger. Zero dependencies. JSON lines in production (so a log
 * drain can parse them), pretty single-line in dev. Level gated by LOG_LEVEL
 * (debug < info < warn < error; default "info").
 */
export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogFields = Record<string, unknown>;

const ORDER: LogLevel[] = ["debug", "info", "warn", "error"];
const MIN: LogLevel = (process.env.LOG_LEVEL as LogLevel) || "info";

function enabled(level: LogLevel): boolean {
  return ORDER.indexOf(level) >= ORDER.indexOf(MIN);
}

function emit(level: LogLevel, msg: string, fields?: LogFields): void {
  if (!enabled(level)) return;
  const record = { level, msg, time: new Date().toISOString(), ...fields };
  const line =
    process.env.NODE_ENV === "production"
      ? JSON.stringify(record)
      : `[${level}] ${msg}${fields && Object.keys(fields).length ? " " + JSON.stringify(fields) : ""}`;
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (msg: string, fields?: LogFields) => emit("debug", msg, fields),
  info: (msg: string, fields?: LogFields) => emit("info", msg, fields),
  warn: (msg: string, fields?: LogFields) => emit("warn", msg, fields),
  error: (msg: string, fields?: LogFields) => emit("error", msg, fields),
};
