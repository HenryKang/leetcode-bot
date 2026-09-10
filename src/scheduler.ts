// Self-healing scheduler. Called on every poll so periodic jobs fire even when the
// external scheduler (GitHub Actions) drops or delays their exact-time trigger.
//
// Each job records the "period" it last handled in job_state. A job runs when its
// current due-period differs from the recorded one — so it fires at most once per
// period, as soon as any poll happens after that period becomes due.

import { getJobState, setJobState } from "./db.js";
import { runDailySummary } from "./daily.js";
import { runReminders } from "./reminders.js";
import { runWeeklySummary } from "./summary.js";
import {
  currentWeekKey,
  etWeekdayHour,
  previousEtDayRange,
  previousWeekKey,
  weekLabel,
} from "./week.js";
import type { Env } from "./types.js";

const REMIND_HOUR_ET = 12; // Sunday: send once we're at/after noon ET

export interface SchedulerResult {
  daily?: string;
  weekly?: string;
  remind?: string;
}

export async function runDueJobs(env: Env): Promise<SchedulerResult> {
  const out: SchedulerResult = {};

  // --- Daily recap: for the ET day that has fully ended. ---
  try {
    const day = previousEtDayRange();
    const dayKey = `${day.startTs}`;
    if ((await getJobState(env.DB, "daily")) !== dayKey) {
      await runDailySummary(env, day);
      await setJobState(env.DB, "daily", dayKey);
      out.daily = day.label;
    }
  } catch (e) {
    console.log(`scheduler daily failed: ${e}`);
  }

  // --- Weekly recap: for the ISO week that has fully ended (fires early in the new week). ---
  try {
    const prevWeek = previousWeekKey();
    if ((await getJobState(env.DB, "weekly")) !== prevWeek) {
      await runWeeklySummary(env, prevWeek);
      await setJobState(env.DB, "weekly", prevWeek);
      out.weekly = weekLabel(prevWeek);
    }
  } catch (e) {
    console.log(`scheduler weekly failed: ${e}`);
  }

  // --- Sunday reminder: once, on Sunday at/after noon ET, for the current week. ---
  try {
    const { weekday, hour } = etWeekdayHour();
    if (weekday === 0 && hour >= REMIND_HOUR_ET) {
      const wk = currentWeekKey();
      if ((await getJobState(env.DB, "remind")) !== wk) {
        await runReminders(env);
        await setJobState(env.DB, "remind", wk);
        out.remind = wk;
      }
    }
  } catch (e) {
    console.log(`scheduler remind failed: ${e}`);
  }

  return out;
}
