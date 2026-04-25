import { Player, TournamentConfig } from '@/types/tournament';

export function getPlayerRebuyCounts(player: Pick<Player, 'rebuys' | 'rebuySingleCount' | 'rebuyDoubleCount'>) {
  if (player.rebuySingleCount !== undefined || player.rebuyDoubleCount !== undefined) {
    return {
      single: player.rebuySingleCount ?? 0,
      double: player.rebuyDoubleCount ?? 0,
    };
  }

  return player.rebuys > 1
    ? { single: 0, double: player.rebuys - 1 }
    : { single: player.rebuys, double: 0 };
}

export function calculatePlayerCost(
  player: Pick<Player, 'buyins' | 'rebuys' | 'rebuySingleCount' | 'rebuyDoubleCount' | 'addon'>,
  config: Pick<TournamentConfig, 'buyIn' | 'rebuySingle' | 'rebuyDouble' | 'addon'>
) {
  const rebuyCounts = getPlayerRebuyCounts(player);
  return (
    player.buyins * config.buyIn +
    rebuyCounts.single * config.rebuySingle +
    rebuyCounts.double * config.rebuyDouble +
    (player.addon ? config.addon : 0)
  );
}
