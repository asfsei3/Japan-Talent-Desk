import { config } from "../config/index.js";

export function nowIso() {
  return new Date().toISOString();
}

/** Business day boundaries follow JST because the audience and desk are Japan-based. */
export function todayInTimezone(timezone = config.timezone, date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function timeInTimezone(timezone = config.timezone, date = new Date()) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

export function addDays(dateish, days) {
  const date = new Date(dateish);
  date.setUTCDate(date.getUTCDate() + days);
  return date;
}

export function isoDaysAgo(days, from = new Date()) {
  return addDays(from, -days).toISOString();
}

export function dateDaysAgo(days, from = new Date()) {
  return addDays(from, -days).toISOString().slice(0, 10);
}

export function daysBetween(a, b) {
  const start = new Date(a).getTime();
  const end = new Date(b).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return (end - start) / 86_400_000;
}

export function parseDateLoose(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  return null;
}

export function monthsUntil(dateish, from = new Date()) {
  const target = new Date(dateish);
  if (Number.isNaN(target.getTime())) return null;
  return (target.getTime() - from.getTime()) / (86_400_000 * 30.44);
}

/** Exponential decay used by the transfer signal so old reports fade out. */
export function decayFactor(ageDays, halfLifeDays) {
  if (!Number.isFinite(ageDays) || ageDays < 0) return 1;
  return Math.pow(0.5, ageDays / halfLifeDays);
}

export function formatDate(value, timezone = config.timezone) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

export default { nowIso, todayInTimezone, addDays, isoDaysAgo, dateDaysAgo, daysBetween, decayFactor };
