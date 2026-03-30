export const DEFAULT_CASTCREW_DISPLAY_CONFIG = {
  fullDayColor: '#5265E0',
  briefColor: '#C7D0FF',
  nightOnlyColor: '#6E4450',
  notNeededColor: '#94A3B8',
  dayHeaderBgColor: '#5265E0',
}

export function normalizeCastCrewDisplayConfig(config = {}) {
  return {
    fullDayColor: typeof config.fullDayColor === 'string' && config.fullDayColor ? config.fullDayColor : DEFAULT_CASTCREW_DISPLAY_CONFIG.fullDayColor,
    briefColor: typeof config.briefColor === 'string' && config.briefColor ? config.briefColor : DEFAULT_CASTCREW_DISPLAY_CONFIG.briefColor,
    nightOnlyColor: typeof config.nightOnlyColor === 'string' && config.nightOnlyColor ? config.nightOnlyColor : DEFAULT_CASTCREW_DISPLAY_CONFIG.nightOnlyColor,
    notNeededColor: typeof config.notNeededColor === 'string' && config.notNeededColor ? config.notNeededColor : DEFAULT_CASTCREW_DISPLAY_CONFIG.notNeededColor,
    dayHeaderBgColor: typeof config.dayHeaderBgColor === 'string' && config.dayHeaderBgColor ? config.dayHeaderBgColor : DEFAULT_CASTCREW_DISPLAY_CONFIG.dayHeaderBgColor,
  }
}
