/**
 * Date Helper - Dynamic date generation for E2E tests
 *
 * This helper generates dates relative to the current date to avoid issues
 * where hardcoded historical dates cause unexpected behavior (e.g., system
 * defaulting to "Avslått" for periods too far in the past).
 *
 * All dates are formatted as DD.MM.YYYY (Norwegian format) for use in Melosys.
 */

/**
 * Format a Date object to Norwegian date format (DD.MM.YYYY)
 */
export function formatDateNorwegian(date: Date): string {
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();
  return `${day}.${month}.${year}`;
}

/**
 * Format a Date object to ISO date format (YYYY-MM-DD)
 */
export function formatDateISO(date: Date): string {
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();
  return `${year}-${month}-${day}`;
}

/**
 * Get a date that is a specified number of months ago from today
 */
export function getDateMonthsAgo(months: number): Date {
  const date = new Date();
  date.setMonth(date.getMonth() - months);
  return date;
}

/**
 * Get a date that is a specified number of months in the future from today
 */
export function getDateMonthsFromNow(months: number): Date {
  const date = new Date();
  date.setMonth(date.getMonth() + months);
  return date;
}

/**
 * Get the first day of a month, X months ago
 */
export function getFirstOfMonthAgo(monthsAgo: number): Date {
  const date = new Date();
  date.setMonth(date.getMonth() - monthsAgo);
  date.setDate(1);
  return date;
}

/**
 * Get the first day of a month, X months from now
 */
export function getFirstOfMonthFromNow(monthsFromNow: number): Date {
  const date = new Date();
  date.setMonth(date.getMonth() + monthsFromNow);
  date.setDate(1);
  return date;
}

/**
 * Standard test periods that are relative to today.
 *
 * These periods are designed to:
 * 1. Be within the current or recent year (to avoid "Avslått" defaults)
 * 2. Have reasonable durations for testing (3-6 months)
 * 3. Support various test scenarios
 */
export const TestPeriods = {
  /**
   * A 6-month period starting 3 months ago
   * Useful for standard membership tests where the period spans past to future
   */
  get standardPeriod(): { start: string; end: string } {
    const start = getFirstOfMonthAgo(3);
    const end = getFirstOfMonthFromNow(3);
    return {
      start: formatDateNorwegian(start),
      end: formatDateNorwegian(end),
    };
  },

  /**
   * A 6-month period entirely in the recent past (within current year if possible)
   * Start: 9 months ago, End: 3 months ago
   */
  get recentPastPeriod(): { start: string; end: string } {
    const start = getFirstOfMonthAgo(9);
    const end = getFirstOfMonthAgo(3);
    return {
      start: formatDateNorwegian(start),
      end: formatDateNorwegian(end),
    };
  },

  /**
   * A 6-month period entirely in the future
   * Start: 1 month from now, End: 7 months from now
   */
  get futurePeriod(): { start: string; end: string } {
    const start = getFirstOfMonthFromNow(1);
    const end = getFirstOfMonthFromNow(7);
    return {
      start: formatDateNorwegian(start),
      end: formatDateNorwegian(end),
    };
  },

  /**
   * A short 2-week period in the current month
   * Useful for quick tests
   */
  get shortCurrentPeriod(): { start: string; end: string } {
    const start = new Date();
    start.setDate(1); // First of current month
    const end = new Date();
    end.setDate(14); // 14th of current month
    return {
      start: formatDateNorwegian(start),
      end: formatDateNorwegian(end),
    };
  },

  /**
   * A period spanning the previous year boundary (for årsavregning tests)
   * Start: 6 months into previous year, End: 6 months into current year
   */
  get yearBoundaryPeriod(): { start: string; end: string } {
    const currentYear = new Date().getFullYear();
    const start = new Date(currentYear - 1, 6, 1); // July 1st last year
    const end = new Date(currentYear, 5, 30); // June 30th this year
    return {
      start: formatDateNorwegian(start),
      end: formatDateNorwegian(end),
    };
  },

  /**
   * Previous year period (entire previous year)
   * Useful for årsavregning tests that need a full year in the past
   */
  get previousYearPeriod(): { start: string; end: string } {
    const previousYear = new Date().getFullYear() - 1;
    return {
      start: `01.01.${previousYear}`,
      end: `31.12.${previousYear}`,
    };
  },

  /**
   * Current year period (from Jan 1st to 6 months from now)
   */
  get currentYearPeriod(): { start: string; end: string } {
    const currentYear = new Date().getFullYear();
    const end = getFirstOfMonthFromNow(6);
    return {
      start: `01.01.${currentYear}`,
      end: formatDateNorwegian(end),
    };
  },
};

/**
 * Get ISO formatted dates for API calls
 */
export const TestPeriodsISO = {
  get previousYearPeriod(): { start: string; end: string } {
    const previousYear = new Date().getFullYear() - 1;
    return {
      start: `${previousYear}-01-01`,
      end: `${previousYear}-12-31`,
    };
  },

  get currentYearPeriod(): { start: string; end: string } {
    const currentYear = new Date().getFullYear();
    const end = getFirstOfMonthFromNow(6);
    return {
      start: `${currentYear}-01-01`,
      end: formatDateISO(end),
    };
  },
};

/**
 * Helper to create a custom period with specified months offset
 */
export function createPeriod(
  startMonthsAgo: number,
  endMonthsFromStart: number
): { start: string; end: string } {
  const start = getFirstOfMonthAgo(startMonthsAgo);
  const end = new Date(start);
  end.setMonth(end.getMonth() + endMonthsFromStart);
  return {
    start: formatDateNorwegian(start),
    end: formatDateNorwegian(end),
  };
}

/**
 * Helper to create a custom period with ISO dates for API calls
 */
export function createPeriodISO(
  startMonthsAgo: number,
  endMonthsFromStart: number
): { start: string; end: string } {
  const start = getFirstOfMonthAgo(startMonthsAgo);
  const end = new Date(start);
  end.setMonth(end.getMonth() + endMonthsFromStart);
  return {
    start: formatDateISO(start),
    end: formatDateISO(end),
  };
}
