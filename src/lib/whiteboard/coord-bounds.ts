/**
 * Canonical coordinate bounds — single source of truth (SEC-006).
 *
 * Every file that needs coordinate limits should import from here
 * rather than defining its own constants.
 */
export const COORD_MIN = -10_000;
export const COORD_MAX = 10_000;
export const DIMENSION_MIN = 1;
export const DIMENSION_MAX = 10_000;
