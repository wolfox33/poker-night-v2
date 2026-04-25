import { TournamentConfig } from '@/types/tournament';

const POSITIVE_CONFIG_NUMBER_FIELDS: (keyof Omit<TournamentConfig, 'buyIn' | 'prizeCount'>)[] = [
  'rebuySingle',
  'rebuyDouble',
  'addon',
  'levelDuration',
  'roundingStep',
];

export function validateConfigPatch(config: Partial<TournamentConfig>): string | null {
  if (config.buyIn !== undefined && (!Number.isFinite(config.buyIn) || config.buyIn < 0)) {
    return 'buyIn must be zero or a positive number';
  }

  for (const field of POSITIVE_CONFIG_NUMBER_FIELDS) {
    const value = config[field];
    if (value !== undefined && (!Number.isFinite(value) || value <= 0)) {
      return `${field} must be a positive number`;
    }
  }

  if (
    config.prizeCount !== undefined &&
    (!Number.isInteger(config.prizeCount) || config.prizeCount < 3 || config.prizeCount > 5)
  ) {
    return 'Prize count must be between 3 and 5';
  }

  return null;
}
